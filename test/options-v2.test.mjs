/**
 * Ou vit chaque option de calcul.
 *
 * Deux fautes guettent ce rangement, et elles sont silencieuses.
 *
 * La premiere : nommer une option qui n'existe pas. Elle ne s'afficherait
 * alors nulle part, et personne ne le verrait — le test la confronte donc a la
 * vraie liste des options.
 *
 * La seconde : perdre une option en chemin. Une option ajoutee plus tard dans
 * reglages.mjs doit se retrouver dans les reglages d'office, jamais tomber
 * entre les deux tas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { etatInitial, optionsAffichees } from '../web/reglages.mjs';
import {
  PRES_DES_DEGATS, PRES_DES_PDV, PRES_DES_SORTS, rangerOptions, resumeCombo,
} from '../web/v2/options.mjs';

const toutes = () => optionsAffichees(etatInitial().options);

test('rangement des options', async (t) => {
  await t.test('chaque option nommee existe vraiment', () => {
    const connues = new Set(toutes().map((o) => o.cle));
    for (const cle of [...PRES_DES_DEGATS, ...PRES_DES_PDV, ...PRES_DES_SORTS]) {
      assert.ok(connues.has(cle), `option inconnue : ${cle}`);
    }
  });

  await t.test('aucune option ne se perd', () => {
    const { degats, pdv, sorts, reglages } = rangerOptions(toutes());
    assert.equal(degats.length + pdv.length + sorts.length + reglages.length, toutes().length);
  });

  await t.test('aucune option n\'est rangee deux fois', () => {
    const { degats, pdv, sorts, reglages } = rangerOptions(toutes());
    const cles = [...degats, ...pdv, ...sorts, ...reglages].map((o) => o.cle);
    assert.equal(new Set(cles).size, cles.length);
  });

  await t.test('les options d\'un nombre se lisent a cote de lui', () => {
    const { degats, pdv } = rangerOptions(toutes());
    assert.deepEqual(degats.map((o) => o.cle), [...PRES_DES_DEGATS]);
    assert.deepEqual(pdv.map((o) => o.cle), [...PRES_DES_PDV]);
  });

  await t.test('une option nouvelle tombe dans les reglages, pas dans le vide', () => {
    const inventee = { cle: 'jamaisVue', libelle: 'Option de demain' };
    const { reglages } = rangerOptions([...toutes(), inventee]);
    assert.ok(reglages.some((o) => o.cle === 'jamaisVue'));
  });

  await t.test('l\'enchainement se lit contre la liste des sorts', () => {
    const { sorts, reglages } = rangerOptions(toutes());
    assert.deepEqual(sorts.map((o) => o.cle), [...PRES_DES_SORTS]);
    // Une option montree a deux endroits laisse croire a deux reglages.
    for (const cle of PRES_DES_SORTS) {
      assert.ok(!reglages.some((o) => o.cle === cle), `${cle} reste aussi dans les reglages`);
    }
  });

  await t.test('une liste vide ne casse rien', () => {
    const vide = { degats: [], pdv: [], sorts: [], reglages: [] };
    assert.deepEqual(rangerOptions([]), vide);
    assert.deepEqual(rangerOptions(null), vide);
  });

  await t.test('les options gardent leur etat courant', () => {
    const etat = etatInitial();
    const { degats } = rangerOptions(optionsAffichees({ ...etat.options, distance: true }));
    assert.equal(degats.find((o) => o.cle === 'distance').actif, true);
  });
});

/* ------------------------------------- Ce que le bouton dit sans s'ouvrir --- */

test('le resume de l\'enchainement', async (t) => {
  await t.test('sans enchainement, chaque sort compte une fois', () => {
    assert.equal(resumeCombo(etatInitial().options), 'Chaque sort une fois');
    assert.equal(resumeCombo({}), 'Chaque sort une fois');
    assert.equal(resumeCombo(null), 'Chaque sort une fois');
  });

  await t.test('l\'enchainement seul ne recite pas ses valeurs nulles', () => {
    assert.equal(
      resumeCombo({ combo: true, paReserves: 0, comboElements: 0, comboUnLancer: false }),
      'Meilleur enchainement');
  });

  await t.test('chaque restriction posee se lit sur le bouton', () => {
    assert.equal(
      resumeCombo({ combo: true, paReserves: 2, comboElements: 3, comboUnLancer: true }),
      'Meilleur enchainement · 2 PA gardes · 3 elements au moins · 1 lancer par sort');
  });

  await t.test('une valeur abimee ne fabrique pas un libelle abime', () => {
    assert.equal(resumeCombo({ combo: true, paReserves: -4 }), 'Meilleur enchainement');
    assert.equal(resumeCombo({ combo: true, comboElements: 'deux' }), 'Meilleur enchainement');
  });
});
