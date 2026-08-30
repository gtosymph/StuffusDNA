/**
 * Comportement du champ "Max", etabli par essais controles.
 *
 * Deux essais sur une valeur reelle de 52, objectif 200, poids 1 :
 *   - max 30 sans mode absolu  -> score -148 ;
 *   - max 30 en mode absolu    -> score -148.
 *
 * Une condition sans maximum rend elle aussi -148. Le maximum n'entre donc
 * pas dans le score : il contraint la recherche.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { maxViolations, scoreBuild, SEARCH_MODES } from '../src/solver/score.mjs';
import { emptyStats } from '../src/data/stats.mjs';

const STATS = Object.freeze({ ...emptyStats(), dommagesNeutre: 47, dommages: 5, pa: 12 });
// Sans sort, le mode degats isole la penalite : les degats valent zero.
const opts = { mode: SEARCH_MODES.DAMAGE, spells: [] };

test('le maximum ne change pas le score', async (t) => {
  const attendu = -148;

  await t.test('sans maximum', () => {
    const r = scoreBuild(STATS, { conditions: [{ stat: 'dommagesNeutre', target: 200, weight: 1 }], ...opts });
    assert.equal(r.score, attendu);
  });

  await t.test('avec un maximum tronque', () => {
    const r = scoreBuild(STATS, {
      conditions: [{ stat: 'dommagesNeutre', target: 200, weight: 1, max: 30 }], ...opts,
    });
    assert.equal(r.score, attendu);
  });

  await t.test('avec un maximum absolu franchi', () => {
    const r = scoreBuild(STATS, {
      conditions: [{ stat: 'dommagesNeutre', target: 200, weight: 1, max: 30, absolute: true }], ...opts,
    });
    assert.equal(r.score, attendu);
    assert.ok(Number.isFinite(r.penalty));
  });
});

test('le maximum absolu remonte comme contrainte', async (t) => {
  await t.test('un depassement est signale', () => {
    const v = maxViolations([{ stat: 'dommagesNeutre', target: 200, weight: 1, max: 30, absolute: true }], STATS);
    assert.equal(v.length, 1);
    assert.equal(v[0].value, 52);
    assert.equal(v[0].max, 30);
  });

  await t.test('un maximum respecte ne signale rien', () => {
    const v = maxViolations([{ stat: 'dommagesNeutre', target: 200, weight: 1, max: 60, absolute: true }], STATS);
    assert.deepEqual(v, []);
  });

  await t.test('un maximum non absolu ne contraint pas', () => {
    const v = maxViolations([{ stat: 'dommagesNeutre', target: 200, weight: 1, max: 30 }], STATS);
    assert.deepEqual(v, []);
  });

  await t.test('la valeur sentinelle ne contraint pas', () => {
    const v = maxViolations([{ stat: 'pa', target: 12, weight: 1, max: 32767, absolute: true }], STATS);
    assert.deepEqual(v, []);
  });
});
