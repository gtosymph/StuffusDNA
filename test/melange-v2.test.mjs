/**
 * Le chemin de la courbe vers le curseur.
 *
 * `palierRetenu` va du curseur vers la courbe ; `partPourPalier` fait
 * l'inverse. Les deux doivent se repondre : la part rendue pour un palier doit
 * ramener EXACTEMENT ce palier quand on la repasse a `palierRetenu`. C'est la
 * seule propriete qui compte, et ce test la verifie sur chaque palier plutot
 * que de verifier des nombres ecrits a la main.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { palierRetenu } from '../web/survie-panel.mjs';
import { consequenceDe, partPourPalier } from '../web/v2/melange.mjs';

/** Une frontiere ordinaire : plus on encaisse, moins on frappe. */
const COURBE = [
  { palier: { damage: 1400, endurance: 3000 } },
  { palier: { damage: 1200, endurance: 4200 } },
  { palier: { damage: 950, endurance: 5600 } },
  { palier: { damage: 700, endurance: 7400 } },
];

test('aller et retour entre le curseur et la courbe', async (t) => {
  await t.test('chaque part rendue ramene son propre palier', () => {
    for (let rang = 0; rang < COURBE.length; rang += 1) {
      const part = partPourPalier(COURBE, rang);
      assert.notEqual(part, null, `le palier ${rang} ne gagne jamais`);
      assert.equal(palierRetenu(COURBE, part), rang,
        `la part ${part} ne ramene pas le palier ${rang}`);
    }
  });

  await t.test('la part reste dans ses bornes', () => {
    for (let rang = 0; rang < COURBE.length; rang += 1) {
      const part = partPourPalier(COURBE, rang);
      assert.ok(part >= 0 && part <= 1, `part hors bornes : ${part}`);
    }
  });

  await t.test('frapper fort demande plus de degats qu\'encaisser', () => {
    // Le palier le plus offensif doit demander la part la plus haute.
    const parts = COURBE.map((_, rang) => partPourPalier(COURBE, rang));
    for (let i = 1; i < parts.length; i += 1) {
      assert.ok(parts[i] < parts[i - 1],
        `la part devrait baisser du palier ${i - 1} au palier ${i}`);
    }
  });
});

test('paliers qui ne gagnent jamais', async (t) => {
  await t.test('un palier domine sur les deux mesures ne gagne jamais', () => {
    const avecDomine = [...COURBE, { palier: { damage: 300, endurance: 1000 } }];
    assert.equal(partPourPalier(avecDomine, 4), null);
  });

  await t.test('un palier sans degats ne gagne jamais', () => {
    // Le score mixte s'annule des qu'une mesure est nulle : un build qui ne
    // frappe pas ne vaut rien, quelle que soit sa resistance.
    assert.equal(partPourPalier([{ palier: { damage: 0, endurance: 9000 } }], 0), null);
  });

  await t.test('un palier sans endurance ne gagne jamais', () => {
    assert.equal(partPourPalier([{ palier: { damage: 9000, endurance: 0 } }], 0), null);
  });

  await t.test('un rang hors de la liste ne casse rien', () => {
    assert.equal(partPourPalier(COURBE, 9), null);
    assert.equal(partPourPalier([], 0), null);
    assert.equal(partPourPalier(null, 0), null);
  });

  await t.test('deux paliers identiques : le second ne gagne pas seul', () => {
    const jumeaux = [
      { palier: { damage: 1000, endurance: 4000 } },
      { palier: { damage: 1000, endurance: 4000 } },
    ];
    assert.equal(partPourPalier(jumeaux, 1), null);
  });
});

test('un seul palier gagne partout', () => {
  const seul = [{ palier: { damage: 1000, endurance: 4000 } }];
  const part = partPourPalier(seul, 0);
  assert.equal(part, 0.5);
  assert.equal(palierRetenu(seul, part), 0);
});

test('la consequence montree a cote du curseur', async (t) => {
  await t.test('elle porte les deux mesures du palier retenu', () => {
    assert.deepEqual(consequenceDe(COURBE, 2), { degats: 950, endurance: 5600 });
  });

  await t.test('sans palier retenu, elle ne montre rien', () => {
    assert.equal(consequenceDe(COURBE, null), null);
    assert.equal(consequenceDe([], 0), null);
  });
});
