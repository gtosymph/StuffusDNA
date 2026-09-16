/**
 * Pont entre les modules de v1 et la coquille de v2.
 *
 * Les modules de v1 vont chercher des identifiants. Si l'un d'eux manque dans
 * la nouvelle coquille, `$('lancer').disabled = true` leve sur `undefined` et
 * la recherche s'arrete avant d'avoir commence — pas au moment du rendu, mais
 * au premier clic, donc loin de la cause. Le pont doit rendre un noeud dans
 * tous les cas.
 *
 * Deux regles seulement, mais elles portent tout : le noeud de v2 gagne
 * toujours sur le noeud fabrique, et un identifiant demande deux fois rend
 * deux fois le meme objet — sans quoi une valeur ecrite au lancement serait
 * perdue a la lecture suivante.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { creerPont } from '../web/v2/pont.mjs';

/** Element minimal : ce que les modules de v1 touchent reellement. */
const fabrique = (tag) => ({ tag, id: '', hidden: false, value: undefined });

/** Racine qui ne connait que les identifiants qu'on lui donne. */
const racineAvec = (ids) => ({
  getElementById: (id) => (ids[id] ?? null),
});

test('pont de v2', async (t) => {
  await t.test('un noeud de v2 est rendu tel quel', () => {
    const lancer = { tag: 'button', id: 'lancer' };
    const { $ } = creerPont({ racine: racineAvec({ lancer }), fabrique });
    assert.equal($('lancer'), lancer);
  });

  await t.test('un identifiant absent rend un noeud, jamais null', () => {
    const { $ } = creerPont({ racine: racineAvec({}), fabrique });
    const noeud = $('recommencer');
    assert.ok(noeud, 'le pont a rendu une valeur vide');
    assert.equal(noeud.id, 'recommencer');
    assert.equal(noeud.hidden, true);
  });

  await t.test('le meme identifiant rend toujours le meme noeud', () => {
    const { $ } = creerPont({ racine: racineAvec({}), fabrique });
    const premier = $('etat-fils');
    premier.marque = 'ecrit au lancement';
    assert.equal($('etat-fils').marque, 'ecrit au lancement');
  });

  await t.test('un champ cache porte sa valeur de depart', () => {
    const { $ } = creerPont({ racine: racineAvec({}), fabrique });
    assert.equal($('fils').tag, 'input');
    assert.equal($('fils').value, '4');
    assert.equal($('intensite').value, '1');
  });

  await t.test('un identifiant qui n\'est pas un champ n\'a pas de valeur', () => {
    const { $ } = creerPont({ racine: racineAvec({}), fabrique });
    assert.equal($('compteur-generations').tag, 'div');
    assert.equal($('compteur-generations').value, undefined);
  });

  await t.test('les defauts se remplacent sans toucher au pont', () => {
    const { $ } = creerPont({
      racine: racineAvec({}), fabrique, defauts: { fils: '8' },
    });
    assert.equal($('fils').value, '8');
    // « intensite » n'est plus un champ : il n'a plus de valeur de depart.
    assert.equal($('intensite').tag, 'div');
  });

  await t.test('les noeuds fabriques se listent, pour les poser hors de l\'ecran', () => {
    const { $, muets } = creerPont({ racine: racineAvec({}), fabrique });
    $('fils');
    $('arreter');
    assert.deepEqual([...muets.keys()], ['fils', 'arreter']);
  });
});
