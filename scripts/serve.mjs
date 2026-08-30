/**
 * Serveur statique local pour l'interface.
 * Il sert la racine du projet, afin que la page atteigne web/ et data/.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';

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
    if (!info.isFile()) {
      response.writeHead(404).end('Fichier absent.');
      return;
    }

    response.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'content-length': info.size,
    });
    createReadStream(target).pipe(response);
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
