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
import { PRES_DES_DEGATS, PRES_DES_PDV, rangerOptions } from '../web/v2/options.mjs';

const toutes = () => optionsAffichees(etatInitial().options);

test('rangement des options', async (t) => {
  await t.test('chaque option nommee existe vraiment', () => {
    const connues = new Set(toutes().map((o) => o.cle));
    for (const cle of [...PRES_DES_DEGATS, ...PRES_DES_PDV]) {
      assert.ok(connues.has(cle), `option inconnue : ${cle}`);
    }
  });

  await t.test('aucune option ne se perd', () => {
    const { degats, pdv, reglages } = rangerOptions(toutes());
    assert.equal(degats.length + pdv.length + reglages.length, toutes().length);
  });

  await t.test('aucune option n\'est rangee deux fois', () => {
    const { degats, pdv, reglages } = rangerOptions(toutes());
    const cles = [...degats, ...pdv, ...reglages].map((o) => o.cle);
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

  await t.test('une liste vide ne casse rien', () => {
    assert.deepEqual(rangerOptions([]), { degats: [], pdv: [], reglages: [] });
    assert.deepEqual(rangerOptions(null), { degats: [], pdv: [], reglages: [] });
  });

  await t.test('les options gardent leur etat courant', () => {
    const etat = etatInitial();
    const { degats } = rangerOptions(optionsAffichees({ ...etat.options, distance: true }));
    assert.equal(degats.find((o) => o.cle === 'distance').actif, true);
  });
});
