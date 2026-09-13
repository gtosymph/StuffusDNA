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
  assert.equal(lignes[0].gainDegats, -200);
  assert.equal(lignes[0].ecartEndurance, 500);
  assert.equal(lignes[0].ecartPdv, 500);
  assert.equal(lignes[2].gainDegats, 200);
  assert.equal(lignes[2].ecartEndurance, -1000);
  assert.equal(lignes[1].gainDegats, null);
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
  assert.ok(lignes.every((l) => !l.porte && l.gainDegats === null));
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
