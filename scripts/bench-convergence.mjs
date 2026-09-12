/**
 * Banc de mesure de la convergence du solveur.
 *
 * Le banc rejoue la boucle par vagues du navigateur : chaque vague enchaine
 * 40 generations, puis la suivante repart des meilleurs genomes. Il mesure le
 * meilleur score atteint apres un nombre fixe de generations, sur plusieurs
 * graines, avec l'objectif reel de l'utilisateur (Xelor niveau 190).
 *
 * Lancement : node scripts/bench-convergence.mjs [generations] [graines] [fils]
 *   - fils = 1 (defaut) : boucle mono-fil, scores deterministes par graine ;
 *   - fils > 1 : vraie recherche parallele (workers + migrants), comme l'app.
 *
 * Avec l'arme : node scripts/bench-convergence.mjs --arme [...]
 *   Compte les degats de l'arme equipee, comme l'option de l'interface.
 *   Chaque evaluation coute alors bien plus cher : un reglage bon sans arme
 *   ne l'est pas forcement avec.
 *
 * Budget de temps : node scripts/bench-convergence.mjs --temps=10 [graines]
 *   Le banc enchaine les vagues jusqu'a epuisement du budget, au lieu d'un
 *   nombre fixe de generations. C'est la mesure fidele a l'usage : le joueur
 *   laisse tourner un temps donne, il ne compte pas les generations. Les
 *   reglages dont la descente locale est plus chere se comparent ainsi
 *   honnetement.
 *
 * Essais de reglage : REGLAGES='{"localSearchEvery":10}' node scripts/...
 *   Le JSON surcharge les options du solveur, pour comparer deux reglages
 *   sans toucher au code. Le mode --gate ignore la surcharge.
 *
 * Garde-fou : node scripts/bench-convergence.mjs --gate
 *   Parametres figes (600 generations x 4 graines, mono-fil). La commande
 *   echoue (code 1) si la moyenne passe sous SEUIL_GATE : une regression de
 *   convergence se voit avant le commit, meme quand les tests restent verts.
 */
import { readFile } from 'node:fs/promises';
import { loadCatalog } from '../src/data/catalog-node.mjs';
import { normalizePassives } from '../src/data/passives.mjs';
import { configPassifsDefaut } from '../src/data/passives-defaults.mjs';
import { STAT_KEYS } from '../src/data/stats.mjs';
import { preparerRecherche, solve } from '../src/solver/genetic.mjs';
import { solveParallel } from '../src/solver/parallel.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

const NIVEAU = 190;
const SORTS_IDS = [13294, 13257, 13281, 13299, 13261, 13292];
const GENERATIONS_PAR_VAGUE = 40;

/**
 * Seuil du garde-fou : moyenne minimale attendue sur les parametres figes.
 * Valeur mesuree le 2026-08-31 : 2868 (deterministe, graines 101 a 404),
 * apres le reglage de la descente locale ; elle valait 2488 avant.
 * La marge absorbe les evolutions legitimes du moteur ; relevez le seuil
 * quand une amelioration mesuree releve durablement la moyenne.
 */
const SEUIL_GATE = 2700;
const GATE = process.argv.includes('--gate');

const AVEC_ARME = process.argv.includes('--arme');
const args = process.argv.slice(2)
  .filter((a) => a !== '--gate' && a !== '--arme' && !a.startsWith('--temps='));
const totalGenerations = GATE ? 600 : Number(args[0] ?? 600);
const nbGraines = GATE ? 4 : Number(args[1] ?? 4);
const nbFils = GATE ? 1 : Math.max(1, Number(args[2] ?? 1));

/** Budget de temps par graine, en secondes ; 0 = budget en generations. */
const argTemps = process.argv.find((a) => a.startsWith('--temps='));
const budgetSecondes = GATE || !argTemps ? 0 : Number(argTemps.slice('--temps='.length));

/** Surcharge des options du solveur, pour comparer deux reglages. */
const REGLAGES = GATE || !process.env.REGLAGES ? {} : JSON.parse(process.env.REGLAGES);
if (Object.keys(REGLAGES).length > 0) console.log(`Reglages : ${JSON.stringify(REGLAGES)}`);

const catalogue = await loadCatalog();
const spellsData = JSON.parse(await readFile(new URL('../data/spells.json', import.meta.url), 'utf8'));
const { passives } = normalizePassives(configPassifsDefaut(), new Set(STAT_KEYS));

const xelor = spellsData.find((c) => /x.lor/i.test(c.fr));
const spells = SORTS_IDS.map((id) => {
  const s = xelor.spells.find((x) => x.id === id);
  const v = s.variants.filter((va) => va.level <= NIVEAU).at(-1);
  return {
    id: s.id, name: s.fr, apCost: s.apCost, castsPerTurn: s.maxCast > 0 ? s.maxCast : 1,
    baseCrit: v.critRate, exclusiveGroup: s.exclusiveGroup ?? null,
    telefragCible: v.telefragCible ?? null,
    telefrag: { genere: s.generatesTelefrag, consomme: s.consumesTelefrag },
    lines: v.lines.filter((l) => !(l.differe > 0)).map((l) => ({ ...l, source: 'sort', range: null })),
  };
});

const objective = {
  mode: SEARCH_MODES.DAMAGE,
  useWeapon: AVEC_ARME,
  conditions: [
    { stat: 'pa', target: 12, weight: 1000, max: 12, absolute: true },
    { stat: 'pm', target: 5, weight: 500, max: 6, absolute: true },
    { stat: 'sagesse', target: 600, weight: 15 },
    { stat: 'po', target: 4, weight: 250, max: 6, absolute: true },
    { stat: 'vitalite', target: 3000, weight: 2 },
    { stat: 'fuite', target: 60, weight: 1 },
    { stat: 'retraitPa', target: 70, weight: 1 },
  ],
  spells,
};

const base = {
  items: catalogue.items,
  setById: catalogue.setById,
  level: NIVEAU,
  scrolls: {},
  passives,
  profile: { classe: 5, sexe: 0 },
  objective,
};

/** Rejoue la boucle du navigateur : vagues de 40 generations, graines transmises. */
function rejouerVagues(seed) {
  // Comme un fil du navigateur : la preparation ne se refait pas a chaque vague.
  const contexte = preparerRecherche(base);
  let graines = [];
  let meilleur = Number.NEGATIVE_INFINITY;
  // Sous budget de temps, la boucle s'arrete au chronometre : le nombre de
  // vagues depend alors du cout reel du reglage essaye.
  const vagues = budgetSecondes > 0
    ? Number.POSITIVE_INFINITY
    : Math.ceil(totalGenerations / GENERATIONS_PAR_VAGUE);
  const debut = performance.now();
  const courbe = [];

  for (let vague = 0; vague < vagues; vague += 1) {
    if (budgetSecondes > 0 && (performance.now() - debut) / 1000 >= budgetSecondes) break;
    const result = solve(
      { ...base, allocation: {}, seedGenomes: graines, contexte },
      {
        maxGenerations: GENERATIONS_PAR_VAGUE,
        stagnationLimit: Number.POSITIVE_INFINITY,
        optimiserPoints: true,
        seed: (seed + vague * 7919) >>> 0,
        ...REGLAGES,
      },
    );
    graines = result.topGenomes;
    if (result.score > meilleur) meilleur = result.score;
    courbe.push(Math.round(meilleur));
  }

  return { meilleur, courbe };
}

/**
 * Recherche parallele reelle : workers + migrants, comme dans le navigateur.
 * Les vagues et l'echange des meilleurs genomes sont geres par solveParallel.
 */
async function rejouerParallele(seed) {
  const { best } = await solveParallel(
    {
      level: NIVEAU,
      allocation: {},
      scrolls: {},
      passivesConfig: configPassifsDefaut(),
      objective,
    },
    {
      threadCount: nbFils,
      waves: Math.ceil(totalGenerations / GENERATIONS_PAR_VAGUE),
      maxGenerations: totalGenerations,
      stagnationLimit: Number.POSITIVE_INFINITY,
      optimiserPoints: true,
      seed,
      ...REGLAGES,
    },
  );
  return { meilleur: best.score, courbe: [Math.round(best.score)] };
}

console.log(`Banc : ${budgetSecondes > 0 ? `${budgetSecondes}s` : `${totalGenerations} generations`} x ${nbGraines} graines, vagues de ${GENERATIONS_PAR_VAGUE}, ${nbFils} fil(s)${AVEC_ARME ? ' [arme]' : ''}${GATE ? ' [gate]' : ''}.`);
const scores = [];
for (let g = 1; g <= nbGraines; g += 1) {
  const debut = performance.now();
  const { meilleur, courbe } = nbFils > 1
    ? await rejouerParallele(g * 101)
    : rejouerVagues(g * 101);
  const duree = ((performance.now() - debut) / 1000).toFixed(1);
  scores.push(meilleur);
  console.log(`graine ${g * 101} : ${Math.round(meilleur)} en ${duree}s — courbe ${courbe.filter((_, i) => i % 3 === 0).join(' ')}`);
}
const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length;
// L'ecart type dit si un ecart de moyenne entre deux essais est credible :
// une moyenne qui monte de 20 points avec un ecart type de 120 ne prouve rien.
const variance = scores.reduce((a, b) => a + (b - moyenne) ** 2, 0) / scores.length;
const tries = [...scores].sort((a, b) => a - b);
const mediane = tries.length % 2 === 1
  ? tries[(tries.length - 1) / 2]
  : (tries[tries.length / 2 - 1] + tries[tries.length / 2]) / 2;
console.log(`Moyenne : ${Math.round(moyenne)} | Mediane : ${Math.round(mediane)} | Ecart type : ${Math.round(Math.sqrt(variance))} | Max : ${Math.round(Math.max(...scores))} | Min : ${Math.round(Math.min(...scores))}`);

if (GATE) {
  if (moyenne < SEUIL_GATE) {
    console.error(`GATE EN ECHEC : moyenne ${Math.round(moyenne)} < seuil ${SEUIL_GATE}. La convergence a regresse.`);
    process.exitCode = 1;
  } else {
    console.log(`Gate tenu : moyenne ${Math.round(moyenne)} >= seuil ${SEUIL_GATE}.`);
  }
}
