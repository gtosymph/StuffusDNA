/**
 * Edition des lignes de degats d'un sort.
 *
 * Le joueur ajoute ses propres lignes : un sort mono-element devient
 * multi-element, ou frappe deux fois dans le meme element.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIGNE_VIDE, ajouterLigne, enleverLigne, modifierLigne, normaliserLigne,
} from '../src/data/spell-lines.mjs';
import { computeSpellDetail } from '../src/engine/damage.mjs';

/** Sort d'essai : une ligne de feu. */
function sortFeu() {
  return {
    id: 1, name: 'Essai', apCost: 4, castsPerTurn: 2, baseCrit: 0,
    lines: [{ element: 'feu', min: 20, max: 24, critMin: 24, critMax: 28, source: 'sort', range: null }],
  };
}

test('ajouterLigne copie la derniere ligne sans toucher au sort d\'origine', () => {
  const sort = sortFeu();
  const suivant = ajouterLigne(sort);

  assert.equal(sort.lines.length, 1, 'le sort d\'origine ne change pas');
  assert.equal(suivant.lines.length, 2);
  assert.deepEqual(suivant.lines[1], suivant.lines[0]);
  assert.notEqual(suivant.lines[1], sort.lines[0], 'la ligne ajoutee est une copie');
});

test('une ligne ajoutee frappe le tour meme, jamais en differe', () => {
  const sort = { ...sortFeu(), lines: [{ element: 'air', min: 10, max: 12, critMin: 12, critMax: 14, differe: 2 }] };
  const suivant = ajouterLigne(sort);

  assert.equal(suivant.lines[0].differe, 2, 'la ligne d\'origine garde son delai');
  assert.equal(suivant.lines[1].differe, undefined);
  assert.equal(suivant.lines[1].element, 'air');
});

test('ajouterLigne part d\'une ligne vide quand le sort n\'en porte aucune', () => {
  const suivant = ajouterLigne({ id: 2, name: 'Vide', lines: [] });

  assert.equal(suivant.lines.length, 1);
  assert.deepEqual(suivant.lines[0], { ...LIGNE_VIDE });
});

test('enleverLigne enleve la ligne demandee et garde les autres', () => {
  const sort = ajouterLigne(sortFeu());
  const modifie = modifierLigne(sort, 1, 'element', 'eau');

  const suivant = enleverLigne(modifie, 0);

  assert.equal(modifie.lines.length, 2, 'le sort d\'origine ne change pas');
  assert.equal(suivant.lines.length, 1);
  assert.equal(suivant.lines[0].element, 'eau');
});

test('enleverLigne garde toujours une ligne', () => {
  const sort = sortFeu();
  assert.equal(enleverLigne(sort, 0).lines.length, 1);
});

test('enleverLigne ignore un rang hors de la liste', () => {
  const sort = ajouterLigne(sortFeu());
  assert.equal(enleverLigne(sort, 7).lines.length, 2);
});

test('modifierLigne refuse un element inconnu et les valeurs negatives', () => {
  const sort = sortFeu();

  assert.equal(modifierLigne(sort, 0, 'element', 'lumiere').lines[0].element, 'feu');
  assert.equal(modifierLigne(sort, 0, 'element', 'eau').lines[0].element, 'eau');
  assert.equal(modifierLigne(sort, 0, 'min', -5).lines[0].min, 0);
  assert.equal(modifierLigne(sort, 0, 'max', 30.7).lines[0].max, 30);
  assert.equal(sort.lines[0].min, 20, 'le sort d\'origine ne change pas');
});

test('normaliserLigne complete les plages critiques absentes', () => {
  const ligne = normaliserLigne({ element: 'terre', min: 10, max: 14 });

  assert.equal(ligne.critMin, 10);
  assert.equal(ligne.critMax, 14);
  assert.equal(ligne.source, 'sort');
  assert.equal(ligne.range, null);
});

test('une ligne d\'un autre element compte avec sa propre caracteristique', () => {
  const stats = { intelligence: 500, agilite: 0, puissance: 0 };
  const feu = sortFeu();
  const deuxElements = modifierLigne(ajouterLigne(feu), 1, 'element', 'air');

  const detailFeu = computeSpellDetail(feu, stats);
  const detailDeux = computeSpellDetail(deuxElements, stats);

  // La ligne d'air n'est pas montee par l'intelligence : elle vaut sa base.
  assert.equal(detailDeux.parLigne.length, 2);
  assert.equal(detailDeux.parLigne[1].element, 'air');
  assert.equal(detailDeux.parLigne[1].normalMin, 20);
  assert.equal(detailDeux.normalMin, detailFeu.normalMin + 20);
});

test('deux lignes du meme element doublent les degats du sort', () => {
  const stats = { intelligence: 300 };
  const feu = sortFeu();
  const doublee = ajouterLigne(feu);

  assert.equal(computeSpellDetail(doublee, stats).average, computeSpellDetail(feu, stats).average * 2);
});
