/**
 * Aller-retour entre l'etat et une simulation.
 *
 * Une simulation remise en place doit rendre le meme personnage, anneaux a
 * leur case, et ne rien casser quand le catalogue a change entre-temps.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { instantane, patchDepuisSimulation } from '../web/instantane.mjs';
import { etatInitial } from '../web/reglages.mjs';

const ANNEAU_A = { id: 1, slot: 'anneau', fr: 'A' };
const ANNEAU_B = { id: 2, slot: 'anneau', fr: 'B' };
const ITEM_BY_ID = new Map([[1, ANNEAU_A], [2, ANNEAU_B]]);

function etatPose() {
  const etat = etatInitial();
  etat.niveau = 200;
  etat.equipped.set('anneau:1', ANNEAU_A);
  etat.equipped.set('anneau:0', ANNEAU_B);
  etat.posees.add('anneau:1');
  etat.bannis.add(50);
  etat.verrous.add(1);
  return etat;
}

test('l\'instantane porte les pieces avec leur case et les reglages', () => {
  const etat = etatPose();
  const releve = instantane(etat, { stats: { pa: 12 } }, { score: 1500, satisfied: true, unmet: [] });

  assert.equal(releve.niveau, 200);
  assert.equal(releve.score, 1500);
  assert.equal(releve.tenu, true);
  assert.equal(releve.manquantes, 0);
  assert.deepEqual(releve.pieces, [{ cle: 'anneau:1', id: 1 }, { cle: 'anneau:0', id: 2 }]);
  assert.deepEqual(releve.stats, { pa: 12 });
  assert.notEqual(releve.stats, etat.stats, 'les statistiques sont recopiees');
  assert.deepEqual(releve.bannis, [50]);
  assert.deepEqual(releve.verrous, [1]);
});

test('la remise en place rend le meme personnage', () => {
  const etat = etatPose();
  const releve = instantane(etat, { stats: {} }, { score: 0, satisfied: false, unmet: [{ stat: 'pa' }] });
  assert.equal(releve.manquantes, 1);

  const { patch, manquantes } = patchDepuisSimulation(etatInitial(), releve, ITEM_BY_ID);
  assert.equal(manquantes, 0);
  assert.equal(patch.niveau, 200);
  assert.equal(patch.equipped.get('anneau:1'), ANNEAU_A);
  assert.equal(patch.equipped.get('anneau:0'), ANNEAU_B);
  // Aucune piece n'est posee a la main : elles viennent d'un instantane.
  assert.equal(patch.posees.size, 0);
  assert.ok(patch.bannis.has(50));
  assert.ok(patch.verrous.has(1));
  assert.deepEqual(patch.candidats, []);
});

test('une piece que le catalogue ne connait plus se compte sans casser le reste', () => {
  const simulation = { pieces: [{ cle: 'anneau:0', id: 1 }, { cle: 'anneau:1', id: 999 }] };
  const { patch, manquantes } = patchDepuisSimulation(etatInitial(), simulation, ITEM_BY_ID);
  assert.equal(manquantes, 1);
  assert.equal(patch.equipped.size, 1);
});

test('une simulation partielle garde les reglages courants', () => {
  const etat = { ...etatInitial(), niveau: 180 };
  const { patch } = patchDepuisSimulation(etat, { pieces: [], options: { arme: true } }, ITEM_BY_ID);
  assert.equal(patch.niveau, 180);
  assert.equal(patch.conditions, etat.conditions);
  assert.equal(patch.options.arme, true);
  assert.equal(patch.options.passifs, true);
  assert.equal(patch.classe, etat.classe, 'une classe absente retombe sur une classe connue');
});
