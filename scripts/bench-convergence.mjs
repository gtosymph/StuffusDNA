/**
 * Banc de mesure de la convergence du solveur.
 *
 * Le banc rejoue la boucle par vagues du navigateur : chaque vague enchaine
 * 40 generations, puis la suivante repart des meilleurs genomes. Il mesure le
 * meilleur score atteint apres un nombre fixe de generations, sur plusieurs
 * graines, avec l'objectif reel de l'utilisateur (Xelor niveau 190).
 *
 * Lancement : node scripts/bench-convergence.mjs [generations] [graines]
 */
import { readFile } from 'node:fs/promises';
import { loadCatalog } from '../src/data/catalog-node.mjs';
import { normalizePassives } from '../src/data/passives.mjs';
import { configPassifsDefaut } from '../src/data/passives-defaults.mjs';
import { STAT_KEYS } from '../src/data/stats.mjs';
import { solve } from '../src/solver/genetic.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

const NIVEAU = 190;
const SORTS_IDS = [13294, 13257, 13281, 13299, 13261, 13292];
const GENERATIONS_PAR_VAGUE = 40;

const totalGenerations = Number(process.argv[2] ?? 600);
const nbGraines = Number(process.argv[3] ?? 4);

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
  useWeapon: false,
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
  let graines = [];
  let meilleur = Number.NEGATIVE_INFINITY;
  const vagues = Math.ceil(totalGenerations / GENERATIONS_PAR_VAGUE);
  const courbe = [];

  for (let vague = 0; vague < vagues; vague += 1) {
    const result = solve(
      { ...base, allocation: {}, seedGenomes: graines },
      {
        maxGenerations: GENERATIONS_PAR_VAGUE,
        stagnationLimit: Number.POSITIVE_INFINITY,
        optimiserPoints: true,
        seed: (seed + vague * 7919) >>> 0,
      },
    );
    graines = result.topGenomes;
    if (result.score > meilleur) meilleur = result.score;
    courbe.push(Math.round(meilleur));
  }

  return { meilleur, courbe };
}

console.log(`Banc : ${totalGenerations} generations x ${nbGraines} graines, vagues de ${GENERATIONS_PAR_VAGUE}.`);
const scores = [];
for (let g = 1; g <= nbGraines; g += 1) {
  const debut = performance.now();
  const { meilleur, courbe } = rejouerVagues(g * 101);
  const duree = ((performance.now() - debut) / 1000).toFixed(1);
  scores.push(meilleur);
  console.log(`graine ${g * 101} : ${Math.round(meilleur)} en ${duree}s — courbe ${courbe.filter((_, i) => i % 3 === 0).join(' ')}`);
}
const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length;
console.log(`Moyenne : ${Math.round(moyenne)} | Max : ${Math.round(Math.max(...scores))} | Min : ${Math.round(Math.min(...scores))}`);
