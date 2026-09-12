/**
 * Favoris des simulations gardees.
 *
 * La liste des essais est bornee : au dela de quarante, les plus anciens
 * partent. Un joueur qui garde un build qui l'interesse ne doit pas le perdre
 * pour autant, simplement parce qu'il a relance dix recherches depuis. Le
 * favori est donc une promesse : une fois marque, un essai reste.
 *
 * Deux autres promesses en decoulent. Le menage de la liste epargne les
 * favoris, et le tri les montre en premier sans toucher a l'ordre du temps.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/** Rangement en memoire, du meme contrat que celui du navigateur. */
class Rangement {
  constructor() { this.donnees = new Map(); }

  getItem(cle) { return this.donnees.has(cle) ? this.donnees.get(cle) : null; }

  setItem(cle, valeur) { this.donnees.set(cle, String(valeur)); }

  removeItem(cle) { this.donnees.delete(cle); }
}

globalThis.localStorage = new Rangement();

const {
  ajouterSimulation, basculerFavori, borner, favorisEnTete, lireSimulations,
  MAX_SIMULATIONS, viderSimulations,
} = await import('../web/simulations.mjs');

/** Repart d'une liste vide avant chaque essai. */
function remettreAZero() {
  globalThis.localStorage.donnees.clear();
}

/** Range une simulation minimale, du nom donne. */
function garder(nom) {
  const { ajoutee } = ajouterSimulation({ nom, score: 100, pieces: [], classe: 1, niveau: 200 });
  return ajoutee;
}

test('borner', async (t) => {
  const liste = (n, favoris = new Set()) => Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, favori: favoris.has(i),
  }));

  await t.test('une liste sous la borne ne perd personne', () => {
    const entree = liste(5);
    assert.equal(borner(entree, 10), entree);
  });

  await t.test('les plus anciennes partent en premier', () => {
    const gardees = borner(liste(5), 3);
    assert.deepEqual(gardees.map((s) => s.id), ['s0', 's1', 's2']);
  });

  await t.test('un favori ancien reste, une ordinaire plus recente part', () => {
    // s4 est la plus ancienne de toutes, mais elle est en favori.
    const gardees = borner(liste(5, new Set([4])), 3);
    assert.deepEqual(gardees.map((s) => s.id), ['s0', 's1', 's4']);
  });

  await t.test('l\'ordre de la liste ne bouge pas', () => {
    const gardees = borner(liste(6, new Set([1, 5])), 4);
    assert.deepEqual(gardees.map((s) => s.id), ['s0', 's1', 's2', 's5']);
  });

  await t.test('des favoris plus nombreux que la borne restent tous', () => {
    const gardees = borner(liste(5, new Set([0, 1, 2, 3, 4])), 3);
    assert.equal(gardees.length, 5);
  });
});

test('basculerFavori marque puis demarque', () => {
  remettreAZero();
  const simulation = garder('essai');

  basculerFavori(simulation.id);
  assert.equal(lireSimulations()[0].favori, true);

  basculerFavori(simulation.id);
  assert.equal(lireSimulations()[0].favori, false);
});

test('un favori survit au depassement de la borne', () => {
  remettreAZero();
  const garde = garder('a garder');
  basculerFavori(garde.id);

  for (let i = 0; i < MAX_SIMULATIONS + 5; i += 1) garder(`essai ${i}`);

  const liste = lireSimulations();
  assert.equal(liste.length, MAX_SIMULATIONS);
  assert.ok(liste.some((s) => s.id === garde.id), 'le favori doit rester dans la liste');
});

test('le menage epargne les favoris', () => {
  remettreAZero();
  const garde = garder('a garder');
  garder('ordinaire');
  basculerFavori(garde.id);

  const restantes = viderSimulations();
  assert.deepEqual(restantes.map((s) => s.id), [garde.id]);
});

test('le menage complet enleve tout, favoris compris', () => {
  remettreAZero();
  const garde = garder('a garder');
  basculerFavori(garde.id);

  assert.deepEqual(viderSimulations({ garderFavoris: false }), []);
});

test('favorisEnTete remonte les favoris sans melanger le reste', () => {
  const liste = [
    { id: 'c', favori: false },
    { id: 'b', favori: true },
    { id: 'a', favori: false },
    { id: 'z', favori: true },
  ];

  assert.deepEqual(favorisEnTete(liste).map((s) => s.id), ['b', 'z', 'c', 'a']);
  // Le tri rend une nouvelle liste : l'appelant garde la sienne intacte.
  assert.deepEqual(liste.map((s) => s.id), ['c', 'b', 'a', 'z']);
});
