/**
 * Importe les avatars de classe de Dofus 3.
 *
 * Les rendus precedents venaient du composeur de look d'Ankama
 * (static.ankama.com/dofus/renderer). Depuis Dofus 3 ce service rend le corps
 * sans la tete : seul le Xelor s'en sortait, son masque appartenant au corps.
 * L'encyclopedie du site officiel, elle, sert les avatars Unity a jour, mais
 * en une seule planche par classe : la femme a gauche, l'homme a droite.
 *
 * Le script telecharge la planche, la coupe en deux, recadre chaque
 * personnage sur son contenu et ecrit web/assets/avatars/<classe>-<sexe>.png,
 * ou le sexe suit l'application : 0 pour l'homme, 1 pour la femme.
 *
 * Lancement : node scripts/fetch-avatars.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { decouper, ecrirePng, lirePng } from './lib/png.mjs';

/** Planches de l'encyclopedie Unity, une par classe. */
const SOURCE = 'https://static.ankama.com/dofus/ng/modules/mmorpg'
  + '/encyclopedia/unity/breeds/assets/breeds';

/** Le CDN refuse toute requete portant un Referer etranger. */
const ENTETES = Object.freeze({
  'user-agent': 'Mozilla/5.0',
  referer: 'https://www.dofus.com/',
});

const CIBLE = new URL('../web/assets/avatars/', import.meta.url);

/**
 * Identifiants de classe du jeu. Le Forgelance porte 20, pas 19 : les
 * identifiants suivent l'ordre de sortie, avec un trou.
 */
const CLASSES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20]);

/** En dessous, un pixel appartient a l'ombre portee, pas au personnage. */
const SEUIL_ALPHA = 24;

/** Un vide plus court que cela separe deux morceaux du meme personnage. */
const VIDE_MINIMAL = 8;

/** Marge laissee autour du personnage, en pixels. */
const MARGE = 2;

/** Pause entre deux telechargements, par egard pour le serveur. */
const PAUSE_MS = 250;

/**
 * Coupe de la femme imposee a la main, en fraction de la largeur.
 *
 * L'aile de l'Eniripsa male passe devant la femme et la depasse largement a
 * gauche : aucune mesure ne separe les deux personnages sans lui prendre son
 * bras. La coupe de la femme tombe donc juste apres elle, et le nettoyage par
 * bloc enleve le morceau d'aile qui reste. Le male garde la coupe mesuree :
 * son aile en ressort tranchee, mais il n'herite pas de l'aile blanche de sa
 * voisine, qui tient a la sienne.
 */
const COUPE_FEMME = Object.freeze({ 7: 0.325 });

/**
 * Rend, pour chaque colonne, le nombre de pixels visibles.
 * @param {{largeur: number, hauteur: number, pixels: Buffer}} image
 */
function densiteColonnes({ largeur, hauteur, pixels }) {
  const densite = new Uint32Array(largeur);
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      if (pixels[(y * largeur + x) * 4 + 3] > SEUIL_ALPHA) densite[x] += 1;
    }
  }
  return densite;
}

/**
 * Coupe la planche en deux entre les deux personnages.
 *
 * Une ombre portee peut toucher le bord d'un personnage ; le couloir cherche
 * est donc le vide le plus large de la bande centrale, pas le premier venu.
 * Quelques classes n'ont aucun vide : une aile d'Eniripsa, une queue
 * d'Ouginak passent devant la voisine. La coupe tombe alors sur la colonne la
 * plus creuse, qui laisse au pire quelques pixels de l'autre personnage.
 *
 * @param {Uint32Array} densite
 * @returns {{x: number, propre: boolean}} Abscisse de la coupe, et si elle
 *   est tombee dans un vrai vide.
 */
function trouverCoupe(densite) {
  const debut = Math.floor(densite.length * 0.25);
  const fin = Math.ceil(densite.length * 0.75);

  let meilleur = { largeur: -1, milieu: Math.floor(densite.length / 2) };
  let courant = -1;

  for (let x = debut; x <= fin; x += 1) {
    const vide = x < fin && densite[x] === 0;
    if (vide && courant < 0) courant = x;
    if (!vide && courant >= 0) {
      const largeur = x - courant;
      if (largeur > meilleur.largeur) meilleur = { largeur, milieu: courant + Math.floor(largeur / 2) };
      courant = -1;
    }
  }

  if (meilleur.largeur >= VIDE_MINIMAL) return { x: meilleur.milieu, propre: true };

  let creux = { densite: Infinity, x: meilleur.milieu };
  for (let x = debut; x < fin; x += 1) {
    if (densite[x] < creux.densite) creux = { densite: densite[x], x };
  }
  return { x: creux.x, propre: false };
}

/**
 * Efface tout ce qui ne tient pas au personnage principal.
 *
 * Une coupe qui n'a pas trouve de couloir vide emporte un morceau du voisin :
 * l'aile de l'Eniripsa, la queue de l'Ouginak. Ces morceaux ne touchent pas
 * le personnage garde ; ne garder que le plus gros bloc d'un seul tenant les
 * enleve, au prix d'un accessoire volontairement detache s'il en existait un.
 *
 * @param {{largeur: number, hauteur: number, pixels: Buffer}} image
 */
function garderLeBlocPrincipal(image) {
  const { largeur, hauteur, pixels } = image;
  const bloc = new Int32Array(largeur * hauteur).fill(-1);
  const tailles = [];
  const pile = [];

  for (let depart = 0; depart < bloc.length; depart += 1) {
    if (bloc[depart] >= 0 || pixels[depart * 4 + 3] <= SEUIL_ALPHA) continue;

    const numero = tailles.length;
    let taille = 0;
    bloc[depart] = numero;
    pile.push(depart);

    while (pile.length > 0) {
      const point = pile.pop();
      taille += 1;
      const x = point % largeur;
      const y = (point - x) / largeur;
      const voisins = [
        x > 0 ? point - 1 : -1,
        x < largeur - 1 ? point + 1 : -1,
        y > 0 ? point - largeur : -1,
        y < hauteur - 1 ? point + largeur : -1,
      ];
      for (const voisin of voisins) {
        if (voisin < 0 || bloc[voisin] >= 0 || pixels[voisin * 4 + 3] <= SEUIL_ALPHA) continue;
        bloc[voisin] = numero;
        pile.push(voisin);
      }
    }
    tailles.push(taille);
  }

  if (tailles.length <= 1) return image;
  const principal = tailles.indexOf(Math.max(...tailles));

  const propres = Buffer.from(pixels);
  for (let point = 0; point < bloc.length; point += 1) {
    if (bloc[point] !== principal) propres.fill(0, point * 4, point * 4 + 4);
  }
  return { largeur, hauteur, pixels: propres };
}

/**
 * Rend le cadre du contenu visible d'une image, marge comprise.
 * @param {{largeur: number, hauteur: number, pixels: Buffer}} image
 */
function cadreDuContenu(image) {
  const { largeur, hauteur, pixels } = image;
  let x0 = largeur;
  let y0 = hauteur;
  let x1 = -1;
  let y1 = -1;

  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      if (pixels[(y * largeur + x) * 4 + 3] <= SEUIL_ALPHA) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  if (x1 < 0) throw new Error('Moitie vide : la coupe est tombee a cote.');

  x0 = Math.max(0, x0 - MARGE);
  y0 = Math.max(0, y0 - MARGE);
  x1 = Math.min(largeur - 1, x1 + MARGE);
  y1 = Math.min(hauteur - 1, y1 + MARGE);
  return { x: x0, y: y0, largeur: x1 - x0 + 1, hauteur: y1 - y0 + 1 };
}

/** Telecharge la planche d'une classe. */
async function telecharger(classe) {
  const reponse = await fetch(`${SOURCE}/sprite${classe}.png`, { headers: ENTETES });
  if (!reponse.ok) throw new Error(`planche indisponible (HTTP ${reponse.status})`);
  return Buffer.from(await reponse.arrayBuffer());
}

/** Ecrit les deux avatars d'une classe et rend leurs tailles. */
async function importer(classe) {
  const planche = lirePng(await telecharger(classe));
  const coupe = trouverCoupe(densiteColonnes(planche));
  const traitFemme = COUPE_FEMME[classe]
    ? Math.round(planche.largeur * COUPE_FEMME[classe])
    : coupe.x;

  // La planche montre la femme a gauche et l'homme a droite ; l'application
  // numerote l'homme 0 et la femme 1.
  const moities = [
    { sexe: 1, cadre: { x: 0, y: 0, largeur: traitFemme, hauteur: planche.hauteur } },
    { sexe: 0, cadre: { x: coupe.x, y: 0, largeur: planche.largeur - coupe.x, hauteur: planche.hauteur } },
  ];

  const tailles = [];
  for (const { sexe, cadre } of moities) {
    const brute = decouper(planche, cadre);
    const moitie = coupe.propre && !COUPE_FEMME[classe] ? brute : garderLeBlocPrincipal(brute);
    const avatar = decouper(moitie, cadreDuContenu(moitie));
    await writeFile(new URL(`${classe}-${sexe}.png`, CIBLE), ecrirePng(avatar));
    tailles.push(`${sexe === 0 ? 'H' : 'F'} ${avatar.largeur}x${avatar.hauteur}`);
  }
  return tailles.join(', ');
}

async function main() {
  await mkdir(CIBLE, { recursive: true });
  let echecs = 0;

  for (const classe of CLASSES) {
    try {
      const tailles = await importer(classe);
      process.stdout.write(`classe ${String(classe).padStart(2)} : ${tailles}\n`);
    } catch (erreur) {
      echecs += 1;
      process.stdout.write(`classe ${String(classe).padStart(2)} : echec — ${erreur.message}\n`);
    }
    await new Promise((suite) => { setTimeout(suite, PAUSE_MS); });
  }

  process.stdout.write(`\n${CLASSES.length - echecs} / ${CLASSES.length} classes importees.\n`);
  if (echecs > 0) process.exitCode = 1;
}

await main();
