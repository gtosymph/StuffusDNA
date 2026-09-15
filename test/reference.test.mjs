/**
 * Stuff de reference tire d'une simulation gardee.
 *
 * Le stuff porte en jeu se garde d'ordinaire comme une simulation avant d'en
 * essayer d'autres. Le reprendre comme reference demandait alors de le
 * remettre en place, de le figer, puis de revenir a l'essai en cours : trois
 * pas, et la perte du build courant, pour une seule intention.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { referenceDepuisSimulation } from '../web/reference.mjs';

const QUAND = new Date('2026-09-15T18:00:00.000Z');

test('referenceDepuisSimulation', async (t) => {
  await t.test('garde les identifiants des pieces, dans l\'ordre', () => {
    const vue = referenceDepuisSimulation({
      pieces: [{ cle: 'coiffe:0', id: 12 }, { cle: 'cape:0', id: 34 }],
    }, QUAND);

    assert.deepEqual(vue.itemIds, [12, 34]);
    assert.equal(vue.date, QUAND.toISOString());
  });

  await t.test('une simulation sans piece ne fige rien', () => {
    // Figer une reference vide rendrait le panneau des achats muet, sans
    // rien dire au joueur : mieux vaut refuser et le lui expliquer.
    for (const brut of [null, undefined, {}, { pieces: [] }, { pieces: 'non' }]) {
      assert.equal(referenceDepuisSimulation(brut, QUAND), null);
    }
  });

  await t.test('une piece sans identifiant lisible se laisse de cote', () => {
    const vue = referenceDepuisSimulation({
      pieces: [{ cle: 'coiffe:0', id: 12 }, { cle: 'cape:0' }, { cle: 'anneau:0', id: null }],
    }, QUAND);

    assert.deepEqual(vue.itemIds, [12]);
  });
});
