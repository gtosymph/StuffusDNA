import test from 'node:test';
import assert from 'node:assert/strict';
import { cpus } from 'node:os';

import { MAX_THREADS, defaultThreadCount, solveParallel } from '../src/solver/parallel.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

test('nombre de fils par defaut', async (t) => {
  await t.test('la moitie des coeurs, sans depasser la borne', () => {
    const expected = Math.min(MAX_THREADS, Math.max(1, Math.floor(cpus().length / 2)));
    assert.equal(defaultThreadCount(), expected);
  });

  await t.test('au moins un fil est toujours retenu', () => {
    assert.ok(defaultThreadCount() >= 1);
  });
});

test('un objectif absent est refuse', async () => {
  await assert.rejects(() => solveParallel({ level: 190 }, {}), /Objectif absent/);
});

test('la recherche multi-fils renvoie le meilleur resultat', async (t) => {
  const result = await solveParallel(
    {
      level: 150,
      objective: {
        conditions: [{ stat: 'pa', target: 10, weight: 500 }],
        spells: [{ name: 'Essai', apCost: 3, lines: [{ element: 'air', min: 20, max: 24 }] }],
        mode: SEARCH_MODES.DAMAGE,
      },
    },
    { populationSize: 40, maxGenerations: 60, threadCount: 2, seed: 5 },
  );

  await t.test('chaque fil rend un resultat', () => {
    assert.equal(result.threads, 2);
    assert.equal(result.runs.length, 2);
  });

  await t.test('les fils utilisent des graines distinctes', () => {
    const seeds = new Set(result.runs.map((run) => run.seed));
    assert.equal(seeds.size, 2);
  });

  await t.test('le meilleur build est celui du plus haut score', () => {
    const top = Math.max(...result.runs.map((run) => run.score));
    assert.equal(result.best.score, top);
  });

  await t.test('le build retenu porte des items', () => {
    assert.ok(Array.isArray(result.best.itemIds));
    assert.ok(result.best.itemIds.length > 0);
  });
});
