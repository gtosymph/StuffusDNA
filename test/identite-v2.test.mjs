/**
 * Le niveau du personnage.
 *
 * Un champ de niveau se borne, sinon le moteur recoit un niveau 0 ou 900 et
 * calcule des points de caracteristique qui n'existent pas. Mais il se borne
 * a la SAISIE, pas a l'enregistrement : un champ vide en cours de frappe ne
 * doit pas ecrire « niveau 1 » dans l'etat, sans quoi effacer pour retaper
 * ramene le personnage au niveau 1 sous les doigts du joueur.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { NIVEAU_MAX, NIVEAU_MIN, niveauValide } from '../web/v2/identite.mjs';

test('niveau saisi', async (t) => {
  await t.test('un niveau normal passe tel quel', () => {
    assert.equal(niveauValide('190'), 190);
    assert.equal(niveauValide(1), 1);
    assert.equal(niveauValide(200), 200);
  });

  await t.test('un niveau hors bornes se ramene dans les bornes', () => {
    assert.equal(niveauValide('0'), NIVEAU_MIN);
    assert.equal(niveauValide('-40'), NIVEAU_MIN);
    assert.equal(niveauValide('900'), NIVEAU_MAX);
  });

  await t.test('un champ vide ne vaut pas niveau 1', () => {
    assert.equal(niveauValide(''), null);
    assert.equal(niveauValide('   '), null);
    assert.equal(niveauValide(null), null);
    assert.equal(niveauValide(undefined), null);
  });

  await t.test('une saisie qui n\'est pas un nombre ne change rien', () => {
    assert.equal(niveauValide('abc'), null);
    assert.equal(niveauValide('12a'), null);
  });

  await t.test('un niveau decimal se tronque', () => {
    assert.equal(niveauValide('190.7'), 190);
  });
});
