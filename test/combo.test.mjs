/**
 * Optimisateur de combo de sorts : sac a dos borne sous budget de PA.
 *
 * Les sorts de test ont min = max et aucun critique : la moyenne d'un lancer
 * vaut exactement la base, ce qui rend les totaux previsibles.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { optimiserCombo, PA_TELEFRAG } from '../src/solver/combo.mjs';
import { scoreBuild } from '../src/solver/score.mjs';

/** Construit un sort de test a degats constants. */
function sort({ id, nom, base, pa, max = 10, genereTf = false }) {
  return {
    id,
    name: nom,
    apCost: pa,
    castsPerTurn: max,
    telefrag: { genere: genereTf, consomme: false, bonusSousTelefrag: false },
    lines: [{ element: 'feu', min: base, max: base, critMin: base, critMax: base }],
  };
}

const STATS_NULLES = {};

test('le combo bat le choix glouton par ratio degats/PA', () => {
  // Glouton : A (25/PA) puis rien -> 100. Optimal : 2 x B -> 160.
  const a = sort({ id: 1, nom: 'A', base: 100, pa: 4 });
  const b = sort({ id: 2, nom: 'B', base: 80, pa: 3 });

  const combo = optimiserCombo([a, b], STATS_NULLES, { paBudget: 6 });

  assert.equal(combo.total, 160);
  assert.deepEqual(combo.lancers.map((l) => [l.name, l.lancers]), [['B', 2]]);
  assert.equal(combo.paUtilises, 6);
});

test('le nombre de lancers par tour borne chaque sort', () => {
  const a = sort({ id: 1, nom: 'A', base: 100, pa: 2, max: 2 });

  const combo = optimiserCombo([a], STATS_NULLES, { paBudget: 10 });

  assert.equal(combo.total, 200);
  assert.equal(combo.lancers[0].lancers, 2);
});

test('le premier lancer d\'un sort qui genere un telefrag rend 2 PA', () => {
  // Cout 4, rend 2 : un lancer tient dans 2 PA.
  const a = sort({ id: 1, nom: 'A', base: 100, pa: 4, genereTf: true });

  const combo = optimiserCombo([a], STATS_NULLES, { paBudget: 2 });

  assert.equal(PA_TELEFRAG, 2);
  assert.equal(combo.total, 100);
  assert.equal(combo.lancers[0].rend, 2);
});

test('le telefrag ne rend des PA qu\'une seule fois par sort', () => {
  // Deux lancers coutent 2 x 4 - 2 = 6 PA, pas 4.
  const a = sort({ id: 1, nom: 'A', base: 100, pa: 4, max: 2, genereTf: true });

  const dans6 = optimiserCombo([a], STATS_NULLES, { paBudget: 6 });
  const dans5 = optimiserCombo([a], STATS_NULLES, { paBudget: 5 });

  assert.equal(dans6.total, 200);
  assert.equal(dans5.total, 100);
});

test('un sort a 2 PA qui genere un telefrag offre son premier lancer', () => {
  const gelure = sort({ id: 1, nom: 'Gelure', base: 50, pa: 2, genereTf: true });

  const combo = optimiserCombo([gelure], STATS_NULLES, { paBudget: 0 });

  assert.equal(combo.total, 50);
  assert.equal(combo.paUtilises, 0);
});

test('sans telefrag actif, aucun PA ne revient', () => {
  const a = sort({ id: 1, nom: 'A', base: 100, pa: 4, genereTf: true });

  const combo = optimiserCombo([a], STATS_NULLES, { paBudget: 2, telefrag: false });

  assert.equal(combo.total, 0);
  assert.deepEqual(combo.lancers, []);
});

test('un sort sans cout en PA reste hors du combo', () => {
  const sansCout = { ...sort({ id: 1, nom: 'X', base: 100, pa: 4 }), apCost: null };

  const combo = optimiserCombo([sansCout], STATS_NULLES, { paBudget: 8 });

  assert.equal(combo.total, 0);
});

test('scoreBuild optimise le combo sous le budget PA moins la reserve', () => {
  const a = sort({ id: 1, nom: 'A', base: 100, pa: 4 });
  const b = sort({ id: 2, nom: 'B', base: 80, pa: 3 });
  const stats = { pa: 8 };

  // Budget 8 - 2 = 6 : l'optimal vaut 2 x B = 160.
  const avec = scoreBuild(stats, {
    conditions: [], spells: [a, b], combo: { actif: true, reserve: 2 },
  });
  // Sans combo : somme simple des sorts, 10 lancers de chaque.
  const sans = scoreBuild(stats, { conditions: [], spells: [a, b] });

  assert.equal(avec.score, 160);
  assert.equal(avec.combo.budget, 6);
  assert.equal(avec.combo.lancers.length, 1);
  assert.equal(sans.combo, undefined);
  assert.equal(sans.score, 180);
});
