/**
 * Nombre de lancers comptes dans les degats.
 *
 * Deux reglages tiennent la meme place et se confondaient : le nombre de
 * lancers qu'un sort peut faire dans un tour, et le nombre de lancers
 * reellement comptes dans le total. Le premier borne l'optimisateur de
 * combo ; le second, « repeats », fixe le total hors combo.
 *
 * Sans lui, un combo applique a la liste des sorts perdait ses lancers : le
 * score retombait a un lancer par sort.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSpell, computeSpellDetail, weaponAttack } from '../src/engine/damage.mjs';
import { damageValue } from '../src/solver/score.mjs';
import { emptyStats } from '../src/data/stats.mjs';

/** Statistiques vierges, completees par les valeurs donnees. */
function stats(valeurs = {}) {
  return { ...emptyStats(), ...valeurs };
}

/** Arme a deux lignes, deux utilisations par tour, trois PA. */
const ARME = Object.freeze({
  id: 23270,
  fr: 'Eventails de Shihan',
  slot: 'arme',
  apCost: 3,
  usesPerTurn: 2,
  critProbability: 10,
  critBonus: 5,
  range: 1,
  weapon: [
    { element: 'eau', min: 14, max: 17, steal: false },
    { element: 'air', min: 14, max: 17, steal: false },
  ],
});

/** Sort d'une ligne, sans critique, pour un total previsible. */
const SORT = Object.freeze({
  id: 1,
  name: 'Sort',
  apCost: 4,
  castsPerTurn: 3,
  baseCrit: 0,
  lines: [{ element: 'feu', min: 20, max: 20, critMin: 20, critMax: 20, source: 'sort' }],
});

test('un sort compte ses lancers dans le total', async (t) => {
  const s = stats({ intelligence: 0 });
  const moyenne = computeSpell(SORT, s).average;

  await t.test('sans reglage, un seul lancer compte', () => {
    assert.equal(damageValue([SORT], s).total, moyenne);
  });

  await t.test('trois lancers comptent trois fois', () => {
    const total = damageValue([{ ...SORT, repeats: 3 }], s).total;
    assert.equal(total, moyenne * 3);
  });

  await t.test('« lancers par tour » seul ne change rien au total', () => {
    // castsPerTurn borne l'optimisateur de combo, il ne compte pas les degats.
    assert.equal(damageValue([{ ...SORT, castsPerTurn: 3 }], s).total, moyenne);
  });

  await t.test('un nombre de lancers absurde retombe sur un lancer', () => {
    for (const repeats of [0, -2, Number.NaN, null]) {
      assert.equal(damageValue([{ ...SORT, repeats }], s).total, moyenne);
    }
  });
});

test('le detail montre ce que le score compte, pas ce que le tour permet', async (t) => {
  const s = stats({ intelligence: 100 });

  await t.test('sans reglage, un lancer compte', () => {
    const detail = computeSpellDetail(SORT, s);
    assert.equal(detail.casts, 3);
    assert.equal(detail.comptes, 1);
    assert.equal(detail.total, detail.average);
  });

  await t.test('deux lancers comptes donnent le double, la limite reste a trois', () => {
    const detail = computeSpellDetail({ ...SORT, repeats: 2 }, s);
    assert.equal(detail.casts, 3);
    assert.equal(detail.comptes, 2);
    assert.equal(detail.total, detail.average * 2);
  });

  await t.test('une arme compte ses utilisations par tour', () => {
    const detail = computeSpellDetail(weaponAttack(ARME), stats({ chance: 100 }));
    assert.equal(detail.comptes, 2);
    assert.equal(detail.total, detail.average * 2);
  });
});
