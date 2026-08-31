import test from 'node:test';
import assert from 'node:assert/strict';

import { loadCatalog } from '../src/data/catalog-node.mjs';
import { computeBuild } from '../src/engine/build.mjs';
import { buildPools, decode, EMPTY, randomGenome, repair } from '../src/solver/genome.mjs';
import { createIncrementalBuild } from '../src/solver/incremental.mjs';
import { createEvaluator, createRandom } from '../src/solver/genetic.mjs';
import { buildRankings, improve, indexerPanoplies } from '../src/solver/local-search.mjs';
import { normalizePassives } from '../src/data/passives.mjs';
import { configPassifsDefaut } from '../src/data/passives-defaults.mjs';
import { STAT_KEYS } from '../src/data/stats.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

const NIVEAU = 190;
const catalogue = await loadCatalog();
const { passives } = normalizePassives(configPassifsDefaut(), new Set(STAT_KEYS));
const { layout, pools } = buildPools(catalogue.items, { level: NIVEAU });

const SORT_TEST = {
  name: 'Test Feu', apCost: 4, castsPerTurn: 1, baseCrit: 10,
  lines: [{ element: 'feu', min: 30, max: 34, critMin: 36, critMax: 40, source: 'sort', range: 'melee' }],
};

/** Compare deux porteurs de statistiques, cle par cle, zeros compris. */
function memesStats(a, b, message) {
  const cles = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const cle of cles) {
    assert.equal(a[cle] ?? 0, b[cle] ?? 0, `${message} : ecart sur "${cle}"`);
  }
}

/** Change une case au hasard puis repare le genome. */
function muterUneCase(genome, random) {
  const essai = [...genome];
  const cellule = Math.floor(random() * essai.length);
  const pool = pools[cellule];
  if (pool.length === 0) return essai;
  essai[cellule] = random() < 0.12 ? EMPTY : Math.floor(random() * pool.length);
  repair(essai, layout, pools, null);
  return essai;
}

test('calcul incremental : equivalence stricte avec le calcul complet', () => {
  const random = createRandom(7);
  const porteur = { allocation: { intelligence: 150, agilite: 100 } };
  const base = {
    level: NIVEAU,
    scrolls: { sagesse: true, intelligence: true },
    passives,
    profile: { classe: 5, sexe: 0 },
  };
  const incremental = createIncrementalBuild({
    pools, setById: catalogue.setById, porteur, ...base,
  });

  for (let serie = 0; serie < 12; serie += 1) {
    let genome = randomGenome(layout, pools, random);
    incremental.rebaser(genome);

    for (let pas = 0; pas < 25; pas += 1) {
      genome = muterUneCase(genome, random);

      const rapide = incremental.calculer(genome);
      const complet = computeBuild(
        { items: decode(genome, pools), allocation: porteur.allocation, ...base },
        catalogue.setById,
      );

      memesStats(rapide.raw, complet.raw, `serie ${serie} pas ${pas} (brutes)`);
      memesStats(rapide.stats, complet.stats, `serie ${serie} pas ${pas} (derivees)`);
      assert.deepEqual(
        rapide.invalid.map((i) => i.id).sort(),
        complet.invalid.map((i) => i.id).sort(),
        `serie ${serie} pas ${pas} : items non equipables`,
      );

      // Un pas sur cinq est adopte : la base accumule les deltas.
      if (pas % 5 === 4) incremental.rebaser(genome);
    }
  }
});

test('calcul incremental : calculer ne corrompt pas la base', () => {
  const random = createRandom(11);
  const porteur = { allocation: {} };
  const incremental = createIncrementalBuild({
    pools, setById: catalogue.setById, level: NIVEAU,
    porteur, scrolls: {}, passives, profile: {},
  });

  const genomeBase = randomGenome(layout, pools, random);
  incremental.rebaser(genomeBase);
  const avant = incremental.calculer(genomeBase);

  for (let i = 0; i < 30; i += 1) incremental.calculer(muterUneCase(genomeBase, random));

  const apres = incremental.calculer(genomeBase);
  memesStats(avant.raw, apres.raw, 'base corrompue');
});

test('descente locale : le chemin incremental rend le meme resultat', () => {
  const random = createRandom(21);
  const objective = {
    mode: SEARCH_MODES.DAMAGE,
    conditions: [{ stat: 'pa', target: 11, weight: 500, max: 12 }],
    spells: [SORT_TEST],
  };
  const contexte = {
    pools, setById: catalogue.setById, level: NIVEAU,
    porteur: { allocation: {} }, scrolls: {}, passives,
    profile: { classe: 5, sexe: 0 }, objective,
  };
  const evaluate = createEvaluator(contexte);
  const rankings = buildRankings(pools, objective);
  const panoplies = indexerPanoplies(pools);
  const commun = { layout, pools, rankings, evaluate, panoplies, locks: null };
  const options = { maxPasses: 2, candidatesPerSlot: 15 };

  const depart = randomGenome(layout, pools, random);
  const complet = improve(depart, commun, options);
  const rapide = improve(depart, { ...commun, evaluateur: evaluate.incremental() }, options);

  assert.equal(rapide.score, complet.score);
  assert.deepEqual(rapide.genome, complet.genome);
});

test('cache d\'evaluation', async (t) => {
  const porteur = { allocation: {} };
  const contexte = {
    pools, setById: catalogue.setById, level: NIVEAU,
    porteur, scrolls: {}, passives, profile: { classe: 5, sexe: 0 },
    objective: {
      // La condition vise l'intelligence : une nouvelle repartition des
      // points doit changer le score, le test du cache s'appuie dessus.
      mode: SEARCH_MODES.DAMAGE,
      conditions: [{ stat: 'intelligence', target: 5000, weight: 1 }],
      spells: [SORT_TEST],
    },
  };
  const evaluate = createEvaluator(contexte);
  const random = createRandom(31);
  const genome = randomGenome(layout, pools, random);

  await t.test('deux appels rendent le meme score', () => {
    assert.equal(evaluate(genome).score, evaluate(genome).score);
  });

  await t.test('invalidate applique la nouvelle repartition des points', () => {
    const avant = evaluate(genome).score;
    porteur.allocation = { intelligence: 400 };
    evaluate.invalidate();
    const apres = evaluate(genome).score;
    assert.notEqual(apres, avant);
    porteur.allocation = {};
    evaluate.invalidate();
    assert.equal(evaluate(genome).score, avant);
  });
});
