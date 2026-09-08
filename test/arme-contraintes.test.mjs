/**
 * Contraintes sur les armes proposees par le solveur.
 *
 * Une arme ne se juge pas seulement a ses degats : elle prend des PA au tour
 * et frappe un nombre limite de fois. Un joueur qui garde ses PA pour ses
 * sorts ne veut pas qu'on lui propose un marteau a sept PA, meme s'il frappe
 * fort. Ces deux bornes ecartent donc les armes du choix, avant toute
 * evaluation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPools } from '../src/solver/genome.mjs';

/** Arme minimale, avec son cout et ses utilisations par tour. */
const arme = (id, apCost, usesPerTurn) => ({
  id, fr: `Arme ${id}`, slot: 'arme', level: 1, apCost, usesPerTurn,
  weapon: [{ element: 'feu', min: 10, max: 12 }],
});

/** Piece qui n'est pas une arme : aucune contrainte ne doit la toucher. */
const anneau = (id) => ({ id, fr: `Anneau ${id}`, slot: 'anneau', level: 1, stats: {} });

const CATALOGUE = Object.freeze([
  arme(1, 3, 2),
  arme(2, 4, 1),
  arme(3, 5, 1),
  arme(4, 2, 3),
  arme(5, 6, 2),
  anneau(10),
  anneau(11),
]);

/** Identifiants des armes retenues dans les pools. */
function armesRetenues(contraintes) {
  const { pool } = buildPools(CATALOGUE, { level: 200, armeContraintes: contraintes });
  return pool.filter((item) => item.slot === 'arme').map((item) => item.id).sort((a, b) => a - b);
}

test('sans contrainte, toutes les armes restent', () => {
  assert.deepEqual(armesRetenues(undefined), [1, 2, 3, 4, 5]);
  assert.deepEqual(armesRetenues({}), [1, 2, 3, 4, 5]);
  assert.deepEqual(armesRetenues({ paMax: 0, lancersMin: 0 }), [1, 2, 3, 4, 5]);
});

test('un cout maximal ecarte les armes trop cheres', () => {
  assert.deepEqual(armesRetenues({ paMax: 4 }), [1, 2, 4]);
  assert.deepEqual(armesRetenues({ paMax: 2 }), [4]);
  assert.deepEqual(armesRetenues({ paMax: 1 }), []);
});

test('un nombre de lancers minimal ecarte les armes trop lentes', () => {
  assert.deepEqual(armesRetenues({ lancersMin: 2 }), [1, 4, 5]);
  assert.deepEqual(armesRetenues({ lancersMin: 3 }), [4]);
  // Toutes les armes frappent au moins une fois : un minimum de 1 ne filtre rien.
  assert.deepEqual(armesRetenues({ lancersMin: 1 }), [1, 2, 3, 4, 5]);
});

test('les deux contraintes se cumulent', () => {
  assert.deepEqual(armesRetenues({ paMax: 4, lancersMin: 2 }), [1, 4]);
  assert.deepEqual(armesRetenues({ paMax: 3, lancersMin: 3 }), [4]);
});

test('les pieces qui ne sont pas des armes ne sont jamais touchees', () => {
  const { pool } = buildPools(CATALOGUE, {
    level: 200, armeContraintes: { paMax: 1, lancersMin: 3 },
  });
  const anneaux = pool.filter((item) => item.slot === 'anneau').map((item) => item.id);
  assert.deepEqual(anneaux, [10, 11]);
});

test('une arme sans cout ni utilisations declares reste proposable', () => {
  const sansRien = { id: 9, fr: 'Baton nu', slot: 'arme', level: 1, weapon: [] };
  const { pool } = buildPools([...CATALOGUE, sansRien], {
    level: 200, armeContraintes: { paMax: 4, lancersMin: 1 },
  });
  // Cout inconnu : l'arme n'est pas ecartee sur un chiffre qu'on n'a pas.
  assert.ok(pool.some((item) => item.id === 9));
});

test('la case des armes se vide sans casser les autres emplacements', () => {
  const { layout, pools } = buildPools(CATALOGUE, {
    level: 200, armeContraintes: { paMax: 1 },
  });
  const caseArme = layout.findIndex((cell) => cell.slotKey === 'arme');
  assert.ok(caseArme >= 0);
  assert.equal(pools[caseArme].length, 0);

  const caseAnneau = layout.findIndex((cell) => cell.slotKey === 'anneau');
  assert.equal(pools[caseAnneau].length, 2);
});
