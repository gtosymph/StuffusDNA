/**
 * Lignes du panneau « degats ou survie ».
 *
 * L'axe est l'endurance : les points de vie une fois les resistances
 * comptees. Le build porte entre dans la courbe comme un palier : ce qui tient
 * moins longtemps ET frappe moins fort que lui tombe, le reste se lit face a
 * lui.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { lignesSurvie } from '../web/survie-panel.mjs';

const palier = (endurance, damage, pdv = endurance) => ({
  endurance, damage, pdv, tranche: Math.floor(endurance / 250), itemIds: [],
});

test('le build porte prend sa place dans la courbe, avec les ecarts', () => {
  const lignes = lignesSurvie([palier(4500, 500), palier(3000, 900)], { endurance: 4000, pdv: 4000, damage: 700 });

  assert.deepEqual(lignes.map((l) => [l.palier.endurance, l.porte]), [[4500, false], [4000, true], [3000, false]]);
  assert.equal(lignes[0].gain, -200);
  assert.equal(lignes[0].ecart, 500);
  assert.equal(lignes[0].ecartPdv, 500);
  assert.equal(lignes[2].gain, 200);
  assert.equal(lignes[2].ecart, -1000);
  assert.equal(lignes[1].gain, null);
});

test('un palier qui a moins de vie et moins de degats que le build porte tombe', () => {
  const lignes = lignesSurvie([palier(3500, 600), palier(3000, 900)], { endurance: 4000, pdv: 4000, damage: 700 });
  assert.deepEqual(lignes.map((l) => l.palier.endurance), [4000, 3000]);
});

test('un palier egal au build porte laisse la place a celui-ci', () => {
  const lignes = lignesSurvie([palier(4000, 700), palier(3000, 900)], { endurance: 4000, pdv: 4000, damage: 700 });
  assert.deepEqual(lignes.map((l) => [l.palier.endurance, l.porte]), [[4000, true], [3000, false]]);
});

test('sans build porte, la courbe se lit seule', () => {
  const lignes = lignesSurvie([palier(3000, 900), palier(4500, 500)], null);
  assert.deepEqual(lignes.map((l) => l.palier.endurance), [4500, 3000]);
  assert.ok(lignes.every((l) => !l.porte && l.gain === null));
});

test('la resistance deplace un build dans la courbe', () => {
  // Deux builds a trois mille points de vie : celui qui porte de la
  // resistance tient plus longtemps et se range plus haut.
  const sansRes = palier(3000, 900, 3000);
  const avecRes = palier(3750, 800, 3000);
  const lignes = lignesSurvie([sansRes, avecRes], null);

  assert.deepEqual(lignes.map((l) => l.palier.endurance), [3750, 3000]);
});

test('un build porte sans mesure ne casse rien', () => {
  const lignes = lignesSurvie([palier(3000, 900)], { endurance: NaN, pdv: NaN, damage: 100 });
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].porte, false);
});

test('sur l\'axe des degats, la courbe se lit a l\'envers', async () => {
  const { AXE_DEGATS } = await import('../src/solver/survie.mjs');
  const build = (damage, endurance) => ({ damage, endurance, pdv: endurance, itemIds: [] });

  const lignes = lignesSurvie(
    [build(4500, 3000), build(3500, 5000)],
    { damage: 4000, endurance: 4000, pdv: 4000 },
    AXE_DEGATS,
  );

  // Des degats les plus hauts aux plus bas ; le gain se compte en endurance.
  assert.deepEqual(lignes.map((l) => [l.palier.damage, l.porte]),
    [[4500, false], [4000, true], [3500, false]]);
  assert.equal(lignes[0].gain, -1000);
  assert.equal(lignes[0].ecart, 500);
  assert.equal(lignes[2].gain, 1000);
  assert.equal(lignes[2].ecart, -500);
});

/**
 * Point retenu par le mode mixte.
 *
 * La courbe montre deja tous les compromis tenables : le curseur de la part
 * des degats ne fait que choisir un point dessus. Le marquer repond d'un coup
 * d'oeil a « ou m'a mene mon reglage ? », et bouger le curseur montre le
 * marqueur glisser le long de la courbe.
 */
test('palierRetenu', async (t) => {
  const { palierRetenu } = await import('../web/survie-panel.mjs');

  const lignes = [
    { palier: { damage: 4011, endurance: 5989 } },
    { palier: { damage: 4300, endurance: 4800 } },
    { palier: { damage: 4722, endurance: 3692 } },
  ];

  await t.test('a part pleine, le plus fort gagne', () => {
    assert.equal(palierRetenu(lignes, 1), 2);
  });

  await t.test('a part nulle, le plus resistant gagne', () => {
    assert.equal(palierRetenu(lignes, 0), 0);
  });

  await t.test('a l\'equilibre, le meilleur produit gagne', () => {
    // 4011*5989 = 24 021 879 ; 4300*4800 = 20 640 000 ; 4722*3692 = 17 433 624.
    assert.equal(palierRetenu(lignes, 0.5), 0);
  });

  await t.test('un reglage intermediaire peut retenir un point du milieu', () => {
    const serrees = [
      { palier: { damage: 4000, endurance: 6000 } },
      { palier: { damage: 4600, endurance: 5200 } },
      { palier: { damage: 4900, endurance: 4000 } },
    ];
    assert.equal(palierRetenu(serrees, 0.6), 1);
  });

  await t.test('sans part, rien n\'est marque', () => {
    assert.equal(palierRetenu(lignes, null), null);
    assert.equal(palierRetenu(lignes, undefined), null);
  });

  await t.test('une liste vide ne marque rien', () => {
    assert.equal(palierRetenu([], 0.5), null);
  });
});
