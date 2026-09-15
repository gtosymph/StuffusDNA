/**
 * Trace de la courbe « degats ou survie ».
 *
 * La liste des paliers dit chaque compromis, mais pas leur FORME. Un joueur
 * qui lit dix lignes ne voit pas ou la courbe casse — l'endroit ou lacher
 * cent points de vie cesse de rapporter des degats. Le trace le montre d'un
 * coup d'oeil, et la liste garde le detail des pieces sous lui.
 *
 * Le calcul des points vit ici, hors du canvas : c'est lui qui peut se tromper.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { bornesDe, pointLePlusProche, pointsDeCourbe } from '../web/courbe-survie.mjs';
import { AXE_ENDURANCE, AXE_DEGATS } from '../src/solver/survie.mjs';

const LIGNES = [
  { palier: { endurance: 5989, damage: 4011 }, porte: false },
  { palier: { endurance: 4800, damage: 4300 }, porte: true },
  { palier: { endurance: 3692, damage: 4722 }, porte: false },
];

test('pointsDeCourbe', async (t) => {
  await t.test('range les points dans le sens de l\'axe tranche', () => {
    // L'axe horizontal porte ce que la courbe tranche : il se lit de gauche
    // a droite, du plus petit au plus grand.
    const points = pointsDeCourbe(LIGNES, AXE_ENDURANCE);
    assert.deepEqual(points.map((p) => p.x), [3692, 4800, 5989]);
    assert.deepEqual(points.map((p) => p.y), [4722, 4300, 4011]);
  });

  await t.test('garde le rang de chaque ligne', () => {
    // Le rang relie un point a sa ligne : cliquer le point doit mener au
    // stuff, qui ne vit que dans la liste.
    const points = pointsDeCourbe(LIGNES, AXE_ENDURANCE);
    assert.deepEqual(points.map((p) => p.rang), [2, 1, 0]);
  });

  await t.test('marque le build porte', () => {
    const points = pointsDeCourbe(LIGNES, AXE_ENDURANCE);
    assert.deepEqual(points.map((p) => p.porte), [false, true, false]);
  });

  await t.test('suit l\'autre axe quand le mode l\'inverse', () => {
    const points = pointsDeCourbe(LIGNES, AXE_DEGATS);
    assert.deepEqual(points.map((p) => p.x), [4011, 4300, 4722]);
    assert.deepEqual(points.map((p) => p.y), [5989, 4800, 3692]);
  });

  await t.test('ecarte une ligne sans chiffre lisible', () => {
    const abimees = [
      ...LIGNES,
      { palier: { endurance: NaN, damage: 100 } },
      { palier: {} },
      { palier: null },
    ];
    assert.equal(pointsDeCourbe(abimees, AXE_ENDURANCE).length, 3);
  });

  await t.test('une liste vide rend une liste vide', () => {
    assert.deepEqual(pointsDeCourbe([], AXE_ENDURANCE), []);
  });
});

test('bornesDe', async (t) => {
  await t.test('encadre tous les points', () => {
    const b = bornesDe(pointsDeCourbe(LIGNES, AXE_ENDURANCE));
    assert.ok(b.xMin <= 3692 && b.xMax >= 5989);
    assert.ok(b.yMin <= 4011 && b.yMax >= 4722);
  });

  await t.test('laisse une marge : un point ne colle pas au bord', () => {
    const b = bornesDe(pointsDeCourbe(LIGNES, AXE_ENDURANCE));
    assert.ok(b.xMin < 3692, 'le point le plus a gauche touche le bord');
    assert.ok(b.xMax > 5989, 'le point le plus a droite touche le bord');
  });

  await t.test('un point unique garde une etendue non nulle', () => {
    // Sans cela, la division par l'etendue rend l'infini et le trace disparait.
    const b = bornesDe([{ x: 4000, y: 3000 }]);
    assert.ok(b.xMax > b.xMin);
    assert.ok(b.yMax > b.yMin);
  });

  await t.test('aucun point rend des bornes utilisables', () => {
    const b = bornesDe([]);
    assert.ok(Number.isFinite(b.xMin) && Number.isFinite(b.xMax));
    assert.ok(b.xMax > b.xMin && b.yMax > b.yMin);
  });
});

test('pointLePlusProche', async (t) => {
  const traces = [
    { px: 10, py: 100, rang: 0 },
    { px: 60, py: 60, rang: 1 },
    { px: 110, py: 20, rang: 2 },
  ];

  await t.test('trouve le point sous le curseur', () => {
    assert.equal(pointLePlusProche(traces, 62, 58, 20)?.rang, 1);
  });

  await t.test('rend null au-dela du seuil', () => {
    // Sans seuil, survoler un coin vide surlignerait un point lointain.
    assert.equal(pointLePlusProche(traces, 400, 400, 20), null);
  });

  await t.test('departage par la distance, pas par l\'ordre', () => {
    assert.equal(pointLePlusProche(traces, 100, 30, 40)?.rang, 2);
  });

  await t.test('une liste vide rend null', () => {
    assert.equal(pointLePlusProche([], 10, 10, 20), null);
  });
});
