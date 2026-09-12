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
const arme = (id, apCost, usesPerTurn, reste = {}) => ({
  id, fr: `Arme ${id}`, slot: 'arme', level: 1, apCost, usesPerTurn,
  weapon: [{ element: 'feu', min: 10, max: 12 }],
  ...reste,
});

/** Lignes de degats d'une arme, un element par entree. */
const lignes = (...elements) => elements.map((element) => ({ element, min: 10, max: 12 }));

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

test('un cout minimal ecarte les armes trop petites', async (t) => {
  // Les PA reserves a l'arme sont perdus pour les sorts : un joueur qui les
  // lui accorde veut qu'elle s'en serve.
  await t.test('le plancher ecarte ce qui coute moins', () => {
    assert.deepEqual(armesRetenues({ paMin: 4 }), [2, 3, 5]);
    assert.deepEqual(armesRetenues({ paMin: 5 }), [3, 5]);
    assert.deepEqual(armesRetenues({ paMin: 7 }), []);
  });

  await t.test('zero ne filtre rien', () => {
    assert.deepEqual(armesRetenues({ paMin: 0 }), [1, 2, 3, 4, 5]);
  });

  await t.test('plancher et plafond cadrent une fourchette', () => {
    assert.deepEqual(armesRetenues({ paMin: 3, paMax: 4 }), [1, 2]);
    assert.deepEqual(armesRetenues({ paMin: 4, paMax: 4 }), [2], 'un cout exact se demande ainsi');
    assert.deepEqual(armesRetenues({ paMin: 5, paMax: 3 }), [], 'une fourchette vide ne rend rien');
  });
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
  assert.deepEqual(armesRetenues({ paMin: 3, lancersMin: 2 }), [1, 5]);
});

test('une portee demandee ecarte l\'autre moitie du choix', async (t) => {
  // Le jeu ne declare pas la portee : elle se lit dans le nombre de cases.
  // Une case, c'est le corps a corps ; au-dela, c'est le tir.
  const catalogue = [
    arme(1, 3, 1, { range: 1 }),
    arme(2, 3, 1, { range: 2 }),
    arme(3, 3, 1, { range: 6 }),
    arme(4, 3, 1),
    anneau(10),
  ];
  const retenues = (contraintes) => buildPools(catalogue, { level: 200, armeContraintes: contraintes })
    .pool.filter((item) => item.slot === 'arme').map((item) => item.id).sort((a, b) => a - b);

  await t.test('le corps a corps ne garde que les armes d\'une case', () => {
    // Une arme sans portee declaree frappe au contact, comme dans le calcul.
    assert.deepEqual(retenues({ portee: 'melee' }), [1, 4]);
  });

  await t.test('la distance ne garde que les armes qui portent plus loin', () => {
    assert.deepEqual(retenues({ portee: 'distance' }), [2, 3]);
  });

  await t.test('une portee vide ou inconnue ne filtre rien', () => {
    for (const portee of ['', null, undefined, 'peu importe']) {
      assert.deepEqual(retenues({ portee }), [1, 2, 3, 4], `portee ${String(portee)}`);
    }
  });
});

test('une portee minimale ecarte les armes qui n\'atteignent pas', async (t) => {
  // Le corps a corps et la distance ne suffisent pas : entre une baguette a
  // deux cases et un arc a huit, le joueur qui veut frapper a trois cases doit
  // pouvoir le demander en chiffres.
  const catalogue = [
    arme(1, 3, 1, { range: 1 }),
    arme(2, 3, 1, { range: 2 }),
    arme(3, 3, 1, { range: 3 }),
    arme(4, 3, 1, { range: 8 }),
    // Une arme sans portee declaree frappe au contact, comme dans le calcul.
    arme(5, 3, 1),
    anneau(10),
  ];
  const retenues = (contraintes) => buildPools(catalogue, { level: 200, armeContraintes: contraintes })
    .pool.filter((item) => item.slot === 'arme').map((item) => item.id).sort((a, b) => a - b);

  await t.test('trois cases ne gardent que les armes qui portent assez loin', () => {
    assert.deepEqual(retenues({ porteeMin: 3 }), [3, 4]);
  });

  await t.test('une case garde tout le catalogue', () => {
    assert.deepEqual(retenues({ porteeMin: 1 }), [1, 2, 3, 4, 5]);
  });

  await t.test('zero ne filtre rien', () => {
    assert.deepEqual(retenues({ porteeMin: 0 }), [1, 2, 3, 4, 5]);
  });

  await t.test('une portee hors de portee du catalogue ne rend rien', () => {
    assert.deepEqual(retenues({ porteeMin: 12 }), []);
  });

  await t.test('la portee chiffree se cumule avec le corps a corps ou la distance', () => {
    // Aucune arme de contact n'atteint deux cases : la demande est vide.
    assert.deepEqual(retenues({ portee: 'melee', porteeMin: 2 }), []);
    assert.deepEqual(retenues({ portee: 'distance', porteeMin: 3 }), [3, 4]);
  });
});

test('le nombre d\'elements frappes borne le choix', async (t) => {
  const catalogue = [
    arme(1, 3, 1, { weapon: lignes('feu') }),
    arme(2, 3, 1, { weapon: lignes('feu', 'eau') }),
    arme(3, 3, 1, { weapon: lignes('feu', 'eau', 'air') }),
    arme(4, 3, 1, { weapon: lignes('terre', 'feu', 'eau', 'air') }),
    // Deux lignes du meme element ne font qu'un element.
    arme(5, 3, 1, { weapon: [...lignes('feu'), ...lignes('feu')] }),
    // Une ligne sans degat decrit un effet, pas un coup.
    arme(6, 3, 1, { weapon: [...lignes('feu'), { element: 'air', min: 0, max: 0 }] }),
  ];
  const retenues = (contraintes) => buildPools(catalogue, { level: 200, armeContraintes: contraintes })
    .pool.filter((item) => item.slot === 'arme').map((item) => item.id).sort((a, b) => a - b);

  await t.test('un minimum ecarte les armes trop pauvres', () => {
    assert.deepEqual(retenues({ elementsMin: 2 }), [2, 3, 4]);
    assert.deepEqual(retenues({ elementsMin: 3 }), [3, 4]);
    assert.deepEqual(retenues({ elementsMin: 5 }), []);
  });

  await t.test('un maximum ecarte les armes trop dispersees', () => {
    assert.deepEqual(retenues({ elementsMax: 1 }), [1, 5, 6]);
    assert.deepEqual(retenues({ elementsMax: 2 }), [1, 2, 5, 6]);
  });

  await t.test('les deux bornes cadrent une fourchette', () => {
    assert.deepEqual(retenues({ elementsMin: 2, elementsMax: 3 }), [2, 3]);
    assert.deepEqual(retenues({ elementsMin: 3, elementsMax: 2 }), [], 'une fourchette vide ne rend rien');
  });

  await t.test('zero ne filtre rien, des deux cotes', () => {
    assert.deepEqual(retenues({ elementsMin: 0, elementsMax: 0 }), [1, 2, 3, 4, 5, 6]);
  });
});

test('toutes les bornes se cumulent', () => {
  const catalogue = [
    arme(1, 3, 2, { range: 1, weapon: lignes('feu', 'eau') }),
    arme(2, 3, 2, { range: 6, weapon: lignes('feu', 'eau') }),
    arme(3, 6, 2, { range: 1, weapon: lignes('feu', 'eau') }),
    arme(4, 3, 1, { range: 1, weapon: lignes('feu', 'eau') }),
    arme(5, 3, 2, { range: 1, weapon: lignes('feu') }),
  ];
  const { pool } = buildPools(catalogue, {
    level: 200,
    armeContraintes: {
      paMin: 2, paMax: 4, lancersMin: 2, portee: 'melee', porteeMin: 1,
      elementsMin: 2, elementsMax: 3,
    },
  });

  assert.deepEqual(pool.filter((i) => i.slot === 'arme').map((i) => i.id), [1]);
});

test('les pieces qui ne sont pas des armes ne sont jamais touchees', () => {
  const { pool } = buildPools(CATALOGUE, {
    level: 200,
    armeContraintes: {
      paMin: 9, paMax: 1, lancersMin: 3, portee: 'distance', porteeMin: 20, elementsMin: 4,
    },
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

  const { pool: sousPlancher } = buildPools([...CATALOGUE, sansRien], {
    level: 200, armeContraintes: { paMin: 5 },
  });
  assert.ok(sousPlancher.some((item) => item.id === 9));
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
