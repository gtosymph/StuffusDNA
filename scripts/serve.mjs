/**
 * Serveur statique local pour l'interface.
 * Il sert la racine du projet, afin que la page atteigne web/ et data/.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { createGzip } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4173);
/** Interface d'ecoute. "0.0.0.0" ouvre l'acces aux autres machines du reseau. */
const HOST = process.env.HOST ?? '127.0.0.1';

/**
 * Repertoires publies. Tout le reste du projet reste hors de portee : le
 * serveur peut etre expose a un reseau, il ne doit pas livrer les sources
 * de travail ni les fichiers personnels.
 */
const PUBLIC_DIRS = ['web', 'src', 'data'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/**
 * Types compresses a la volee.
 *
 * Le catalogue pese 3,7 Mo de JSON, recharges a chaque ouverture de la page.
 * Sur un telephone en 4G, cela faisait plusieurs secondes d'attente blanche.
 * Gzip fait tomber du JSON d'environ 85 %.
 */
const COMPRESSIBLES = new Set(['.html', '.css', '.mjs', '.js', '.json', '.svg']);

/** En dessous, la compression coute plus qu'elle ne rapporte. */
const SEUIL_COMPRESSION = 1024;

/**
 * Marque de version d'un fichier : sa taille et sa date de modification.
 *
 * Elle sert la revalidation. Le navigateur renvoie la marque qu'il garde, et
 * le serveur repond « rien n'a change » sans renvoyer le corps. Le catalogue
 * ne repasse donc plus sur le reseau tant qu'il ne bouge pas, tout en restant
 * juste des qu'un script d'ingestion le reconstruit.
 */
function marque(info) {
  return `"${info.size.toString(36)}-${Math.round(info.mtimeMs).toString(36)}"`;
}

/**
 * Envoie un fichier : compresse quand le client l'accepte, revalidable
 * toujours.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {string} chemin
 * @param {import('node:fs').Stats} info
 */
function envoyer(request, response, chemin, info) {
  const etag = marque(info);

  // « no-cache » n'interdit pas le cache : il impose de demander avant de
  // servir. C'est ce qu'il faut ici, car les fichiers changent sous le
  // serveur pendant le developpement.
  const entetes = {
    'content-type': MIME[extname(chemin)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
    etag,
  };

  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, entetes).end();
    return;
  }

  const accepte = String(request.headers['accept-encoding'] ?? '').includes('gzip');
  const compresser = accepte
    && COMPRESSIBLES.has(extname(chemin))
    && info.size >= SEUIL_COMPRESSION;

  if (!compresser) {
    response.writeHead(200, { ...entetes, 'content-length': info.size });
    createReadStream(chemin).pipe(response);
    return;
  }

  // La taille compressee n'est pas connue a l'avance : la reponse part en
  // morceaux, sans content-length. « vary » evite qu'un cache partage serve
  // du gzip a un client qui ne le lit pas.
  response.writeHead(200, { ...entetes, 'content-encoding': 'gzip', vary: 'accept-encoding' });
  createReadStream(chemin).pipe(createGzip()).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${PORT}`);

    // La page vit dans web/. Une redirection garde les chemins relatifs justes :
    // servir le fichier depuis "/" ferait chercher les ressources a la racine.
    if (url.pathname === '/' || url.pathname === '/web' || url.pathname === '/web/') {
      response.writeHead(302, { location: '/web/index.html' }).end();
      return;
    }

    const raw = url.pathname;

    // La normalisation empeche de remonter au dessus de la racine.
    const clean = normalize(raw).replace(/^(\.\.[/\\])+/, '');
    const target = join(ROOT, clean);

    const segment = clean.replace(/^[/\\]+/, '').split(/[/\\]/)[0];
    if (!target.startsWith(ROOT) || !PUBLIC_DIRS.includes(segment)) {
      response.writeHead(403).end('Acces refuse.');
      return;
    }

    const info = await stat(target);

    // Un repertoire sert son index.html, comme tout serveur statique. Sans
    // cela, /web/maquettes rend 404 alors que la page existe. La barre finale
    // est obligatoire avant de servir l'index : sinon le navigateur resout
    // les chemins relatifs de la page depuis le repertoire parent.
    if (info.isDirectory()) {
      if (!raw.endsWith('/')) {
        response.writeHead(301, { location: `${raw}/${url.search}` }).end();
        return;
      }
      const index = join(target, 'index.html');
      const infoIndex = await stat(index).catch(() => null);
      if (!infoIndex?.isFile()) {
        response.writeHead(404).end('Fichier absent.');
        return;
      }
      return envoyer(request, response, index, infoIndex);
    }

    if (!info.isFile()) {
      response.writeHead(404).end('Fichier absent.');
      return;
    }

    envoyer(request, response, target, info);
  } catch {
    response.writeHead(404).end('Fichier absent.');
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Interface disponible sur http://localhost:${PORT}\n`);

  if (HOST === '127.0.0.1') {
    process.stdout.write('Acces limite a cette machine. Pour ouvrir au reseau : HOST=0.0.0.0 npm run serve\n');
    return;
  }

  // Les adresses utiles sont listees pour joindre le service depuis un mobile.
  for (const [nom, liste] of Object.entries(networkInterfaces())) {
    for (const adresse of liste ?? []) {
      if (adresse.family !== 'IPv4' || adresse.internal) continue;
      process.stdout.write(`  ${nom.padEnd(12)} http://${adresse.address}:${PORT}\n`);
    }
  }
});
