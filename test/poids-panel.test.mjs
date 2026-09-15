/**
 * Reglage de la part des degats, en mode mixte.
 *
 * Un curseur muet ne dit rien : « 65 % » ne se traduit pas tout seul en
 * decision de jeu. Le panneau nomme donc chaque zone du curseur, et dit ce
 * que le reglage echange — combien de pour cent d'endurance paie un pour cent
 * de degats laches.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { echangeLisible, REPERES, vueDePart } from '../web/poids-panel.mjs';

test('REPERES', async (t) => {
  await t.test('vont des pdv effectifs purs aux degats purs', () => {
    assert.equal(REPERES[0].part, 0);
    assert.equal(REPERES[REPERES.length - 1].part, 1);
  });

  await t.test('sont ranges dans l\'ordre', () => {
    const parts = REPERES.map((r) => r.part);
    assert.deepEqual(parts, [...parts].sort((a, b) => a - b));
  });

  await t.test('portent tous un nom', () => {
    for (const repere of REPERES) {
      assert.ok(repere.nom.length > 0, `repere sans nom a ${repere.part}`);
    }
  });
});

test('vueDePart', async (t) => {
  await t.test('rend la part et son pourcentage', () => {
    const vue = vueDePart(0.65);
    assert.equal(vue.part, 0.65);
    assert.equal(vue.pourcent, 65);
  });

  await t.test('nomme la zone la plus proche', () => {
    assert.equal(vueDePart(0).nom, REPERES[0].nom);
    assert.equal(vueDePart(1).nom, REPERES[REPERES.length - 1].nom);
    assert.equal(vueDePart(0.5).nom, 'Equilibre');
  });

  await t.test('un reglage entre deux reperes prend le plus proche', () => {
    assert.equal(vueDePart(0.52).nom, 'Equilibre');
  });

  await t.test('une part fausse retombe sur l\'equilibre', () => {
    for (const brut of [null, undefined, NaN, 'x']) {
      assert.equal(vueDePart(brut).part, 0.5);
    }
  });

  await t.test('une part hors bornes se borne', () => {
    assert.equal(vueDePart(4).part, 1);
    assert.equal(vueDePart(-1).part, 0);
  });

  await t.test('porte le taux d\'echange', () => {
    assert.ok(Math.abs(vueDePart(0.65).taux - (0.65 / 0.35)) < 1e-9);
  });
});

test('echangeLisible', async (t) => {
  await t.test('a l\'equilibre, un pour cent contre un pour cent', () => {
    assert.match(echangeLisible(0.5), /1 % de degats/);
    assert.match(echangeLisible(0.5), /1 % de pdv effectifs/);
  });

  await t.test('montre le taux avec une decimale', () => {
    // A 65 %, lacher 1 % de degats demande 1,857 % de pdv effectifs.
    assert.match(echangeLisible(0.65), /1,9 % de pdv effectifs/);
  });

  await t.test('aux bornes, le mode est pur : rien ne s\'echange', () => {
    assert.match(echangeLisible(1), /degats seuls/i);
    assert.match(echangeLisible(0), /pdv effectifs seuls/i);
  });
});
