/**
 * La comparaison de plusieurs stuffs.
 *
 * Elle repose sur une seule regle : ce qui ne change pas n'aide pas a choisir.
 * Deux pieges la guettent. Masquer sans compter laisse le joueur incapable de
 * savoir s'il regarde un extrait ou le tout ; et lire un minimum en ecart
 * repond a la mauvaise question — ce qui compte d'un minimum est s'il est
 * tenu, pas s'il a monte de trois.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { lignesComparaison, nomDeColonne } from '../web/v2/comparaison.mjs';

const MESURES = [
  { cle: 'pa', libelle: 'PA' },
  { cle: 'pm', libelle: 'PM' },
  { cle: 'force', libelle: 'Force' },
  { cle: 'sagesse', libelle: 'Sagesse' },
];

const COLONNES = [
  { nom: 'Porte', stats: { pa: 12, pm: 6, force: 900, sagesse: 300 } },
  { nom: 'Trouve 1', stats: { pa: 12, pm: 6, force: 980, sagesse: 300 } },
  { nom: 'Trouvé 2', stats: { pa: 11, pm: 6, force: 940, sagesse: 300 } },
];

const cles = (r) => r.lignes.map((l) => l.cle);

test('masquage des lignes identiques', async (t) => {
  await t.test('une mesure identique partout disparait', () => {
    const r = lignesComparaison(MESURES, COLONNES);
    assert.deepEqual(cles(r), ['pa', 'force']);
  });

  await t.test('le compte des masquees est dit', () => {
    assert.equal(lignesComparaison(MESURES, COLONNES).masquees, 2);
  });

  await t.test('on peut tout rappeler', () => {
    const r = lignesComparaison(MESURES, COLONNES, { masquerIdentiques: false });
    assert.deepEqual(cles(r), ['pa', 'pm', 'force', 'sagesse']);
    assert.equal(r.masquees, 0);
  });

  await t.test('une seule colonne ne fait varier personne', () => {
    const r = lignesComparaison(MESURES, [COLONNES[0]]);
    assert.deepEqual(cles(r), []);
    assert.equal(r.masquees, 4);
  });

  await t.test('aucune colonne ne casse rien', () => {
    assert.deepEqual(lignesComparaison(MESURES, []), { lignes: [], masquees: 0 });
  });
});

test('les deux lectures', async (t) => {
  await t.test('une mesure ordinaire se lit en ecart face au stuff porte', () => {
    const force = lignesComparaison(MESURES, COLONNES).lignes.find((l) => l.cle === 'force');
    assert.deepEqual(force.cellules.map((c) => c.ecart), [null, 80, 40]);
    assert.equal(force.absolue, false);
  });

  await t.test('un minimum se lit en valeur absolue, jamais en ecart', () => {
    const r = lignesComparaison(MESURES, COLONNES, { minimums: new Set(['pa']) });
    const pa = r.lignes.find((l) => l.cle === 'pa');
    assert.equal(pa.absolue, true);
    assert.deepEqual(pa.cellules.map((c) => c.ecart), [null, null, null]);
    assert.deepEqual(pa.cellules.map((c) => c.valeur), [12, 12, 11]);
  });

  await t.test('la colonne de reference n\'a pas d\'ecart avec elle-meme', () => {
    const force = lignesComparaison(MESURES, COLONNES).lignes.find((l) => l.cle === 'force');
    assert.equal(force.cellules[0].ecart, null);
  });

  await t.test('une mesure absente d\'un stuff vaut zero, pas undefined', () => {
    const r = lignesComparaison([{ cle: 'soins', libelle: 'Soins' }],
      [COLONNES[0], { nom: 'x', stats: { soins: 20 } }], { masquerIdentiques: false });
    assert.deepEqual(r.lignes[0].cellules.map((c) => c.valeur), [0, 20]);
    assert.equal(r.lignes[0].cellules[1].ecart, 20);
  });
});

test('nom de colonne', () => {
  assert.equal(nomDeColonne(0), 'Porte');
  assert.equal(nomDeColonne(2), 'Trouvé 2');
});
