/**
 * Rangement de l'etat dans le navigateur.
 *
 * Un rechargement doit rendre exactement ce qui a ete regle, et un etat
 * range par une version passee doit se lire sans casser le reglage du
 * joueur. Un rangement en memoire tient la place de localStorage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

class Rangement {
  constructor() { this.donnees = new Map(); }

  getItem(cle) { return this.donnees.has(cle) ? this.donnees.get(cle) : null; }

  setItem(cle, valeur) { this.donnees.set(cle, String(valeur)); }

  removeItem(cle) { this.donnees.delete(cle); }
}

globalThis.localStorage = new Rangement();

const {
  echantillonner, lireResultat, migrerLimites, POINTS_GARDES, reprendreEtat,
  sauverEtat, sauverResultat, serialiserEtat, VERSION_LIMITES,
} = await import('../web/etat-stockage.mjs');
const { etatInitial } = await import('../web/reglages.mjs');
const { CLES } = await import('../web/stockage.mjs');

const EPEE = { id: 10, slot: 'arme', fr: 'Epee' };
const ANNEAU = { id: 1, slot: 'anneau', fr: 'Anneau' };
const CATALOGUE = { itemById: new Map([[EPEE.id, EPEE], [ANNEAU.id, ANNEAU]]) };

test.beforeEach(() => { globalThis.localStorage = new Rangement(); });

test('migrerLimites', async (t) => {
  await t.test('un etat au format courant passe tel quel', () => {
    const limites = { vitalite: 0, force: null, chance: 12 };
    assert.equal(migrerLimites({ limites, limitesVersion: VERSION_LIMITES }), limites);
  });

  await t.test('les zeros de la version 1 deviennent « aucune limite »', () => {
    // Zero voulait dire « illimite » : le garder fermerait la caracteristique.
    const migrees = migrerLimites({ limites: { vitalite: 0, force: 50, chance: '0' } });
    assert.deepEqual(migrees, { vitalite: null, force: 50, chance: null });
  });
});

test('l\'etat range se relit tel quel', () => {
  const etat = etatInitial();
  etat.niveau = 200;
  etat.equipped.set('arme:0', EPEE);
  etat.equipped.set('anneau:1', ANNEAU);
  etat.posees.add('arme:0');
  etat.bannis.add(77);
  etat.possedees.add(ANNEAU.id);
  etat.verrous.add(EPEE.id);
  etat.reference = { itemIds: [EPEE.id], date: '2026-01-01' };
  etat.changementsMax = 3;
  etat.limites = { ...etat.limites, vitalite: 0, force: 40 };

  sauverEtat(etat);
  const relu = reprendreEtat(etatInitial(), CATALOGUE);

  assert.equal(relu.niveau, 200);
  assert.equal(relu.equipped.get('arme:0'), EPEE);
  assert.equal(relu.equipped.get('anneau:1'), ANNEAU);
  assert.ok(relu.posees.has('arme:0'));
  assert.ok(relu.bannis.has(77));
  assert.ok(relu.possedees.has(ANNEAU.id));
  assert.ok(relu.verrous.has(EPEE.id));
  assert.deepEqual(relu.reference, etat.reference);
  assert.equal(relu.changementsMax, 3);
  // Zero reste zero : le format range porte sa version.
  assert.equal(relu.limites.vitalite, 0);
  assert.equal(relu.limites.force, 40);
});

test('la forme rangee porte la version des limites', () => {
  assert.equal(serialiserEtat(etatInitial()).limitesVersion, VERSION_LIMITES);
});

test('reprendreEtat', async (t) => {
  await t.test('sans rangement, rend l\'etat donne', () => {
    const etat = etatInitial();
    assert.equal(reprendreEtat(etat, CATALOGUE), etat);
  });

  await t.test('une piece que le catalogue ne connait plus tombe', () => {
    localStorage.setItem(CLES.etat, JSON.stringify({ equipped: [['arme:0', 999], ['anneau:0', 1]] }));
    const relu = reprendreEtat(etatInitial(), CATALOGUE);
    assert.equal(relu.equipped.size, 1);
    assert.equal(relu.equipped.get('anneau:0'), ANNEAU);
  });

  await t.test('un champ mal forme ne touche pas le reglage courant', () => {
    localStorage.setItem(CLES.etat, JSON.stringify({
      niveau: 'deux cents', conditions: 'aucune', bannis: { a: 1 }, reference: { sans: 'pieces' },
    }));
    const depart = etatInitial();
    const relu = reprendreEtat(depart, CATALOGUE);
    assert.equal(relu.niveau, depart.niveau);
    assert.equal(relu.conditions, depart.conditions);
    assert.equal(relu.bannis.size, 0);
    assert.equal(relu.reference, null);
  });

  await t.test('les options rangees se posent sur les options par defaut', () => {
    localStorage.setItem(CLES.etat, JSON.stringify({ options: { arme: true } }));
    const relu = reprendreEtat(etatInitial(), CATALOGUE);
    assert.equal(relu.options.arme, true);
    assert.equal(relu.options.passifs, true, 'une option absente garde sa valeur par defaut');
  });

  await t.test('les limites de la version 1 se migrent a la lecture', () => {
    localStorage.setItem(CLES.etat, JSON.stringify({ limites: { vitalite: 0, force: 30 } }));
    const relu = reprendreEtat(etatInitial(), CATALOGUE);
    assert.equal(relu.limites.vitalite, null);
    assert.equal(relu.limites.force, 30);
  });
});

test('echantillonner', async (t) => {
  await t.test('une courte courbe passe entiere', () => {
    assert.deepEqual(echantillonner([1, 2, 3]), [1, 2, 3]);
  });

  await t.test('une longue courbe se reduit et garde son dernier point', () => {
    const longue = Array.from({ length: 5000 }, (_, i) => i);
    const points = echantillonner(longue);
    assert.ok(points.length <= POINTS_GARDES + 1, `${points.length} points`);
    assert.equal(points[0], 0);
    assert.equal(points[points.length - 1], 4999);
  });

  await t.test('une courbe vide rend une courbe vide', () => {
    assert.deepEqual(echantillonner([]), []);
  });
});

test('le resultat range se relit, courbes abimees ecartees', () => {
  sauverResultat({
    generationMax: 1200, fils: 4, intensite: 'normale',
    historiques: [{ seed: 1, history: [10, 20, 30] }],
  });
  // Un rangement abime melange une courbe valide et un reste sans historique.
  const brut = JSON.parse(localStorage.getItem(CLES.resultat));
  brut.historiques.push({ seed: 2 });
  localStorage.setItem(CLES.resultat, JSON.stringify(brut));

  const relu = lireResultat();
  assert.equal(relu.generationMax, 1200);
  assert.equal(relu.fils, 4);
  assert.deepEqual(relu.historiques, [{ seed: 1, history: [10, 20, 30] }]);
});

test('sans resultat range, lireResultat rend null', () => {
  assert.equal(lireResultat(), null);
});
