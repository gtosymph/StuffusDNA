/**
 * La part investie, a cote de chaque caracteristique de la fiche.
 *
 * Une Force a 520 ne dit pas d'ou elle vient. Le stuff en donne une part, les
 * parchemins une autre, et la repartition des points le reste — et c'est cette
 * derniere que le joueur choisit. Sans elle sous les yeux, il ne sait pas ce
 * que la recherche a depense pour lui, ni ce qu'il recupererait en changeant
 * d'avis.
 *
 * Ce qui se montre est la VALEUR gagnee, pas le cout en points : « +150 de
 * Force » se compare au 520 de la ligne, alors que les 300 points qu'elle
 * coute ne se comparent a rien de ce qui est ecrit la. Le cout reste dans
 * l'infobulle, pour qui veut le chiffre exact.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { lignesCompletes, lignesEssentielles } from '../web/v2/fiche.mjs';

const stats = {
  force: 520, vitalite: 3000, sagesse: 320, intelligence: 0,
  chance: 0, agilite: 0, pa: 12, pm: 6, pdv: 3000, pdvEffectifs: 4200,
  critique: 40, puissance: 100, initiative: 900,
};

/** Une repartition : la valeur VISEE par caracteristique, pas son cout. */
const allocation = { force: 150, vitalite: 400, sagesse: 20 };

const ligneDe = (lignes, cle) => lignes.find((l) => l.cle === cle);

test('une caracteristique portee par des points le dit', () => {
  const lignes = lignesCompletes(stats, new Set(), allocation);
  assert.equal(ligneDe(lignes, 'force').investi, 150);
  assert.equal(ligneDe(lignes, 'vitalite').investi, 400);
});

test('une caracteristique sans point n\'affiche rien', () => {
  const lignes = lignesCompletes(stats, new Set(), allocation);
  // Zero point investi n'est pas « (0) » : c'est l'absence de parenthese.
  assert.equal(ligneDe(lignes, 'intelligence').investi, null);
  assert.equal(ligneDe(lignes, 'chance').investi, null);
});

test('une mesure qui ne recoit jamais de point n\'en porte pas', () => {
  const lignes = lignesCompletes(stats, new Set(), allocation);
  // Les PA ne s'achetent pas avec des points de caracteristique.
  assert.equal(ligneDe(lignes, 'pa').investi, null);
  assert.equal(ligneDe(lignes, 'initiative').investi, null);
});

test('sans repartition connue, aucune ligne ne prétend en avoir une', () => {
  for (const lignes of [lignesCompletes(stats, new Set()),
                        lignesCompletes(stats, new Set(), null)]) {
    assert.equal(ligneDe(lignes, 'force').investi, null);
  }
});

test('l\'essentiel porte la meme part que la liste complete', () => {
  // Une exigence sur la force la fait remonter dans l'essentiel : elle doit y
  // dire la meme chose qu'en bas, sans quoi les deux listes se contredisent.
  const lignes = lignesEssentielles(stats, ['force'],
    { degats: 3000, pdvEffectifs: 4200 }, allocation);
  assert.equal(ligneDe(lignes, 'force').investi, 150);
});

test('le cout en points suit la valeur, sans la remplacer', () => {
  // La force coute deux points par unite au-dela de cent : cent cinquante
  // points de force ne coutent pas cent cinquante points.
  const lignes = lignesCompletes(stats, new Set(), allocation);
  const force = ligneDe(lignes, 'force');
  assert.equal(force.investi, 150);
  assert.ok(force.coutInvesti > force.investi,
    'le cout doit etre distinct de la valeur, sinon les deux chiffres se confondent');
  // La sagesse coute trois points par unite.
  assert.equal(ligneDe(lignes, 'sagesse').coutInvesti, 60);
});
