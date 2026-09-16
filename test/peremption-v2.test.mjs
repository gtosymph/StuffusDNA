/**
 * Peremption des resultats a l'ecran.
 *
 * Le defaut vient d'une gene reelle : des stuffs trouves restaient affiches
 * avec des degats a zero, parce qu'ils avaient ete cherches AVANT qu'un sort
 * soit pose. L'ecran n'en disait rien.
 *
 * La regle a deux moities, et les deux comptent autant. Ce qui entre dans la
 * requete du solveur perime les resultats ; ce qui n'y entre pas ne doit
 * surtout pas les perimer — a commencer par le stuff porte, que la recherche
 * pose elle-meme a chaque amelioration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { etatInitial } from '../web/reglages.mjs';
import { reglagesChanges, signatureRecherche } from '../web/v2/peremption.mjs';

const base = () => etatInitial();
const change = (patch) => reglagesChanges(signatureRecherche(base()), { ...base(), ...patch });

test('ce qui perime les resultats', async (t) => {
  await t.test('poser un sort', () => {
    assert.equal(change({ sorts: [{ id: 42 }] }), true);
  });

  await t.test('changer d\'objectif', () => {
    assert.equal(change({ mode: 'endurance' }), true);
  });

  await t.test('deplacer le curseur du mode mixte', () => {
    assert.equal(change({ partDegats: 0.8 }), true);
  });

  await t.test('modifier un minimum', () => {
    const conditions = base().conditions.map((c, i) => (i === 0 ? { ...c, target: 11 } : c));
    assert.equal(change({ conditions }), true);
  });

  await t.test('interdire une piece', () => {
    assert.equal(change({ bannis: new Set([7]) }), true);
  });

  await t.test('garder une piece a coup sur', () => {
    assert.equal(change({ verrous: new Set([7]) }), true);
  });

  await t.test('dire qu\'on possede une piece', () => {
    assert.equal(change({ possedees: new Set([7]) }), true);
  });

  await t.test('changer une option de calcul', () => {
    assert.equal(change({ options: { ...base().options, distance: true } }), true);
  });

  await t.test('changer de classe ou de niveau', () => {
    assert.equal(change({ classe: 1 }), true);
    assert.equal(change({ niveau: 200 }), true);
  });

  await t.test('figer le stuff actuel', () => {
    assert.equal(change({ reference: { itemIds: [1, 2], date: 'x' } }), true);
  });
});

test('ce qui ne perime rien', async (t) => {
  await t.test('le stuff porte : la recherche le pose elle-meme', () => {
    assert.equal(change({ equipped: new Map([['arme:0', { id: 9 }]]) }), false);
    assert.equal(change({ posees: new Set(['arme:0']) }), false);
  });

  await t.test('les resultats de la recherche', () => {
    assert.equal(change({ candidats: [{ itemIds: [1] }], paliers: [1], survie: [2] }), false);
  });

  await t.test('chercher dans le catalogue', () => {
    assert.equal(change({ recherche: 'epee', filtrePk: true }), false);
  });

  await t.test('l\'ordre des sorts', () => {
    const avant = signatureRecherche({ ...base(), sorts: [{ id: 1 }, { id: 2 }] });
    const apres = signatureRecherche({ ...base(), sorts: [{ id: 2 }, { id: 1 }] });
    assert.equal(avant, apres);
  });

  await t.test('l\'ordre des pieces interdites', () => {
    const avant = signatureRecherche({ ...base(), bannis: new Set([3, 1]) });
    const apres = signatureRecherche({ ...base(), bannis: new Set([1, 3]) });
    assert.equal(avant, apres);
  });
});

test('avant toute recherche, rien n\'est perime', () => {
  // Sans lancement, il n'y a aucun resultat a l'ecran : annoncer « reglages
  // changes » sur un ecran vide n'aurait aucun sens.
  assert.equal(reglagesChanges(null, { ...base(), sorts: [{ id: 1 }] }), false);
});
