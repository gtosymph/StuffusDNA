/**
 * Panneau « A viser ».
 *
 * Deux mesures decident d'un build : ce qu'il envoie et ce qu'il encaisse. La
 * recherche en maximise une et borne l'autre ; le panneau doit dire laquelle
 * joue quel role, sans quoi le joueur pose une condition sur la mesure que la
 * recherche pousse deja au maximum.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { lignesObjectifs, MESURES_VISEES } from '../web/objectifs-panel.mjs';

const VALEURS = { degatsTotaux: 4722, pdvEffectifs: 3692 };

test('lignesObjectifs', async (t) => {
  await t.test('les deux mesures se montrent, degats d\'abord', () => {
    const lignes = lignesObjectifs(VALEURS, 'degats', []);
    assert.deepEqual(lignes.map((l) => l.stat), ['degatsTotaux', 'pdvEffectifs']);
    assert.deepEqual(lignes.map((l) => l.valeur), [4722, 3692]);
  });

  await t.test('le mode marque la mesure qu\'il maximise', () => {
    assert.deepEqual(lignesObjectifs(VALEURS, 'degats', []).map((l) => l.maximisee), [true, false]);
    assert.deepEqual(lignesObjectifs(VALEURS, 'endurance', []).map((l) => l.maximisee), [false, true]);
  });

  await t.test('le mode mixte maximise les deux', () => {
    // Le mixte compose les deux mesures : aucune n'est a borner par une
    // condition, elles montent ensemble dans la proportion reglee.
    assert.deepEqual(lignesObjectifs(VALEURS, 'mixte', []).map((l) => l.maximisee),
      [true, true]);
  });

  await t.test('le mode caracteristiques n\'en maximise aucune', () => {
    assert.deepEqual(lignesObjectifs(VALEURS, 'caracteristiques', []).map((l) => l.maximisee),
      [false, false]);
  });

  await t.test('une mesure deja sous condition se signale', () => {
    const lignes = lignesObjectifs(VALEURS, 'degats', ['pdvEffectifs', 'pa']);
    assert.deepEqual(lignes.map((l) => l.enCondition), [false, true]);
  });

  await t.test('les conditions se lisent aussi depuis un Set', () => {
    const lignes = lignesObjectifs(VALEURS, 'degats', new Set(['degatsTotaux']));
    assert.equal(lignes[0].enCondition, true);
  });

  await t.test('chaque ligne porte le mode qui la maximise', () => {
    assert.deepEqual(lignesObjectifs(VALEURS, 'degats', []).map((l) => l.mode),
      ['degats', 'endurance']);
  });

  await t.test('une valeur absente ou fausse vaut zero', () => {
    for (const valeurs of [null, undefined, {}, { degatsTotaux: NaN, pdvEffectifs: 'x' }]) {
      assert.deepEqual(lignesObjectifs(valeurs, 'degats', []).map((l) => l.valeur), [0, 0]);
    }
  });
});

test('chaque mesure visee correspond a un mode de recherche', async () => {
  const { SEARCH_MODES } = await import('../src/solver/score.mjs');
  const modes = new Set(Object.values(SEARCH_MODES));

  // Un renommage de mode cote solveur rendrait le bouton « Maximiser » muet :
  // ce test le fait tomber tout de suite.
  for (const mesure of MESURES_VISEES) {
    assert.ok(modes.has(mesure.mode), `mode inconnu : ${mesure.mode}`);
  }
});
