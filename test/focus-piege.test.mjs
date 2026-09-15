/**
 * Piege de focus des fenetres modales.
 *
 * Une fenetre qui se pose par-dessus la page doit garder le clavier a
 * l'interieur. Sans cela, la tabulation sort derriere la fenetre : le curseur
 * se promene dans une page que l'utilisateur ne voit plus, et il n'a aucun
 * moyen de revenir sans la souris.
 *
 * La boucle est la seule regle qui compte : apres le dernier element vient le
 * premier, et avant le premier vient le dernier.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { prochainFocus } from '../web/focus-piege.mjs';

const A = { nom: 'a' };
const B = { nom: 'b' };
const C = { nom: 'c' };

test('prochainFocus', async (t) => {
  await t.test('avance d\'un element', () => {
    assert.equal(prochainFocus([A, B, C], A, false), B);
    assert.equal(prochainFocus([A, B, C], B, false), C);
  });

  await t.test('boucle du dernier vers le premier', () => {
    assert.equal(prochainFocus([A, B, C], C, false), A);
  });

  await t.test('recule d\'un element', () => {
    assert.equal(prochainFocus([A, B, C], C, true), B);
    assert.equal(prochainFocus([A, B, C], B, true), A);
  });

  await t.test('boucle du premier vers le dernier', () => {
    assert.equal(prochainFocus([A, B, C], A, true), C);
  });

  await t.test('un element hors de la fenetre ramene au premier', () => {
    // Le focus vient d'ailleurs : la fenetre le reprend par son debut.
    assert.equal(prochainFocus([A, B, C], { nom: 'ailleurs' }, false), A);
    assert.equal(prochainFocus([A, B, C], null, false), A);
  });

  await t.test('en arriere, un element hors de la fenetre ramene au dernier', () => {
    assert.equal(prochainFocus([A, B, C], null, true), C);
  });

  await t.test('une fenetre sans element focalisable rend rien', () => {
    assert.equal(prochainFocus([], A, false), null);
    assert.equal(prochainFocus([], null, true), null);
  });

  await t.test('un seul element reste sur lui-meme', () => {
    assert.equal(prochainFocus([A], A, false), A);
    assert.equal(prochainFocus([A], A, true), A);
  });
});
