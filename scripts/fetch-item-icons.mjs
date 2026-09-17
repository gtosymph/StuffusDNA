/**
 * Copie les icones d'objets chez nous.
 *
 * Elles venaient jusqu'ici de `api.dofusdb.fr`, chargees directement par le
 * navigateur du joueur. Tant que l'outil tournait sur un poste, cela ne
 * concernait personne. Publie, chaque visiteur serait alle chercher plusieurs
 * centaines d'images chez un tiers qui n'a jamais accepte de servir nos
 * visiteurs, et qui peut couper du jour au lendemain.
 *
 * Les icones sont reduites a 96 pixels de cote. La source en fait 128 ; l'ecran
 * n'en montre jamais plus de 38 points, soit 76 pixels sur un ecran a double
 * densite. Garder 128 pesait un tiers de plus sans rien ajouter de visible.
 *
 * Le script se reprend : une icone deja copiee n'est pas retelechargee. Le
 * relancer apres une coupure reseau reprend ou il s'etait arrete.
 *
 *   node scripts/fetch-item-icons.mjs
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { ecrirePng, lirePng, reduire } from './lib/png.mjs';

/** Source des icones, telle que le catalogue la donne. */
const SOURCE = 'https://api.dofusdb.fr/img/items/';

/** Ou les icones vivent chez nous. */
const CIBLE = new URL('../web/assets/items/', import.meta.url);

/** Catalogue d'ou viennent les numeros d'icone. */
const CATALOGUE = new URL('../data/items.json', import.meta.url);

/** Cote de l'icone rendue, en pixels. */
const COTE = 96;

/**
 * Telechargements menes de front.
 *
 * Huit tient le reseau occupe sans ressembler a une attaque : le serveur d'en
 * face est un site de fans, pas une infrastructure.
 */
const DE_FRONT = 8;

/** Essais par icone, avant d'abandonner celle-la. */
const ESSAIS = 3;

/** Attente avant un nouvel essai, qui double a chaque fois. */
const ATTENTE_MS = 500;

const dormir = (ms) => new Promise((suite) => { setTimeout(suite, ms); });

/**
 * Telecharge une icone, avec quelques essais.
 *
 * @param {number} icone
 * @returns {Promise<Buffer>}
 */
async function telecharger(icone) {
  let derniere = null;

  for (let essai = 0; essai < ESSAIS; essai += 1) {
    if (essai > 0) await dormir(ATTENTE_MS * 2 ** (essai - 1));
    try {
      const reponse = await fetch(`${SOURCE}${icone}.png`);
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return Buffer.from(await reponse.arrayBuffer());
    } catch (erreur) {
      derniere = erreur;
    }
  }
  throw new Error(`icone ${icone} : ${derniere.message}`);
}

/** Copie une icone, reduite. */
async function copier(icone) {
  const image = lirePng(await telecharger(icone));
  await writeFile(new URL(`${icone}.png`, CIBLE), ecrirePng(reduire(image, COTE)));
}

/**
 * Mene plusieurs copies de front, en gardant la trace des echecs.
 *
 * @param {number[]} icones
 * @returns {Promise<{faites: number, echecs: string[]}>}
 */
async function copierToutes(icones) {
  let prochaine = 0;
  let faites = 0;
  const echecs = [];

  const ouvrier = async () => {
    while (prochaine < icones.length) {
      const icone = icones[prochaine];
      prochaine += 1;
      try {
        await copier(icone);
        faites += 1;
        if (faites % 200 === 0) process.stdout.write(`  ${faites}/${icones.length}\n`);
      } catch (erreur) {
        echecs.push(erreur.message);
      }
    }
  };

  await Promise.all(Array.from({ length: DE_FRONT }, ouvrier));
  return { faites, echecs };
}

async function main() {
  await mkdir(CIBLE, { recursive: true });

  const items = JSON.parse(await readFile(CATALOGUE, 'utf8'));
  // Plusieurs objets partagent une meme icone : un numero suffit une fois.
  const voulues = [...new Set(items.map((item) => item.iconId).filter(Number.isFinite))];

  const deja = new Set((await readdir(CIBLE))
    .filter((nom) => nom.endsWith('.png'))
    .map((nom) => Number(nom.slice(0, -4))));
  const restantes = voulues.filter((icone) => !deja.has(icone));

  console.log(`${voulues.length} icones voulues, ${deja.size} deja la, ${restantes.length} a copier.`);
  if (restantes.length === 0) return;

  const { faites, echecs } = await copierToutes(restantes);
  console.log(`${faites} copiees en ${COTE} px.`);

  if (echecs.length > 0) {
    console.error(`${echecs.length} echec(s) :`);
    for (const echec of echecs.slice(0, 20)) console.error(`  ${echec}`);
    // Une icone manquante laisse un objet sans image a l'ecran : l'echec doit
    // se voir, et le script se relance pour reprendre celles qui manquent.
    process.exitCode = 1;
  }
}

await main();
