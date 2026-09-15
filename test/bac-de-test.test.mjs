/**
 * Bac de test : un jeu de cles separe pour les essais.
 *
 * Le rangement du navigateur suit l'origine, pas l'onglet. Deux onglets
 * ouverts sur la meme adresse partagent donc « copyroxx_etat », et une
 * recherche lancee dans l'un remplace le build porte dans l'autre. Le fait
 * s'est produit deux fois, et restaurer la cle ne suffit pas : la page vivante
 * la reecrit par-dessus au premier enregistrement suivant.
 *
 * Le parametre « ?test » enleve le risque a la source : les deux onglets
 * n'ecrivent plus au meme endroit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { nomDeCle, suffixeDeBac } from '../web/stockage.mjs';

test('suffixeDeBac', async (t) => {
  await t.test('sans parametre, aucun suffixe', () => {
    assert.equal(suffixeDeBac(''), '');
    assert.equal(suffixeDeBac('?theme=forge'), '');
  });

  await t.test('« ?test » seul ouvre le bac ordinaire', () => {
    assert.equal(suffixeDeBac('?test'), '_test');
    assert.equal(suffixeDeBac('?test=1'), '_test');
    assert.equal(suffixeDeBac('?theme=forge&test=1'), '_test');
  });

  await t.test('un nom donne son propre bac', () => {
    // Deux essais en parallele ne doivent pas se marcher dessus non plus.
    assert.equal(suffixeDeBac('?test=mobile'), '_test_mobile');
    assert.equal(suffixeDeBac('?test=survie2'), '_test_survie2');
  });

  await t.test('un nom sale se nettoie au lieu de casser la cle', () => {
    assert.equal(suffixeDeBac('?test=a b/c'), '_test_abc');
    // Un nom sans rien de retenable retombe sur le bac ordinaire.
    assert.equal(suffixeDeBac('?test=***'), '_test');
  });

  await t.test('une recherche illisible ne fait pas tomber la page', () => {
    for (const brut of [null, undefined, 42, {}]) {
      assert.equal(suffixeDeBac(brut), '');
    }
  });
});

test('nomDeCle', async (t) => {
  await t.test('sans bac, la cle ne bouge pas', () => {
    // Les noms portent les sauvegardes deja posees : ils ne changent jamais.
    assert.equal(nomDeCle('copyroxx_etat', ''), 'copyroxx_etat');
  });

  await t.test('dans un bac, chaque cle porte le suffixe', () => {
    assert.equal(nomDeCle('copyroxx_etat', '?test=1'), 'copyroxx_etat_test');
    assert.equal(nomDeCle('copyroxx_simulations', '?test=mobile'),
      'copyroxx_simulations_test_mobile');
  });
});
