/**
 * Rangement des simulations gardees.
 *
 * Le module vit dans le navigateur ; ici, un rangement en memoire tient la
 * place de localStorage. Le test porte donc sur ce qui compte vraiment : ne
 * pas perdre une simulation, ne pas en empiler deux fois la meme, et rendre
 * un ecart juste entre deux essais.
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
  ajouterSimulation, comparer, enleverSimulation, libelle, lireSimulations,
  MAX_SIMULATIONS, reglagesChanges, renommerSimulation, signature, viderSimulations,
} = await import('../web/simulations.mjs');

/** Simulation minimale, du score et des pieces donnes. */
const essai = (score, ids, reste = {}) => ({
  score, niveau: 190, classe: 5, tenu: true,
  pieces: ids.map((id) => ({ cle: `anneau:${id}`, id })),
  stats: {}, ...reste,
});

test.beforeEach(() => { globalThis.localStorage = new Rangement(); });

test('une simulation ajoutee se relit avec un identifiant et une date', () => {
  const { ajoutee } = ajouterSimulation(essai(4122, [1, 2]));

  assert.ok(ajoutee.id);
  assert.ok(!Number.isNaN(Date.parse(ajoutee.date)));

  const liste = lireSimulations();
  assert.equal(liste.length, 1);
  assert.equal(liste[0].score, 4122);
  assert.deepEqual(liste[0].pieces.map((p) => p.id), [1, 2]);
});

test('la plus recente arrive en tete', () => {
  ajouterSimulation(essai(100, [1]));
  ajouterSimulation(essai(200, [2]));

  assert.deepEqual(lireSimulations().map((s) => s.score), [200, 100]);
});

test('la signature ne depend pas de l\'ordre des pieces', () => {
  assert.equal(signature(essai(500, [3, 1, 2])), signature(essai(500, [1, 2, 3])));
  assert.notEqual(signature(essai(500, [1, 2])), signature(essai(501, [1, 2])));
});

test('siNouvelle refuse un doublon exact et laisse passer un changement', () => {
  ajouterSimulation(essai(4122, [1, 2]));

  const memeBuild = ajouterSimulation(essai(4122, [2, 1]), { siNouvelle: true });
  assert.equal(memeBuild.ajoutee, null);
  assert.equal(lireSimulations().length, 1);

  const meilleur = ajouterSimulation(essai(4300, [1, 3]), { siNouvelle: true });
  assert.ok(meilleur.ajoutee);
  assert.equal(lireSimulations().length, 2);
});

test('la liste est bornee : les plus anciennes partent', () => {
  for (let i = 0; i < MAX_SIMULATIONS + 5; i += 1) ajouterSimulation(essai(i, [i]));

  const liste = lireSimulations();
  assert.equal(liste.length, MAX_SIMULATIONS);
  assert.equal(liste[0].score, MAX_SIMULATIONS + 4);
  assert.equal(liste[liste.length - 1].score, 5);
});

test('renommer garde le nom, un nom vide rend le nom automatique', () => {
  const { ajoutee } = ajouterSimulation(essai(4122, [1]));

  renommerSimulation(ajoutee.id, '  Combo feu  ');
  assert.equal(lireSimulations()[0].nom, 'Combo feu');
  assert.equal(libelle(lireSimulations()[0], () => 'Xelor'), 'Combo feu');

  renommerSimulation(ajoutee.id, '');
  assert.equal(libelle(lireSimulations()[0], () => 'Xelor'), 'Xelor 190');
});

test('enlever ne touche que la simulation visee', () => {
  const premiere = ajouterSimulation(essai(100, [1])).ajoutee;
  ajouterSimulation(essai(200, [2]));

  enleverSimulation(premiere.id);
  assert.deepEqual(lireSimulations().map((s) => s.score), [200]);

  viderSimulations();
  assert.equal(lireSimulations().length, 0);
});

test('un rangement illisible rend une liste vide plutot qu\'une erreur', () => {
  globalThis.localStorage.setItem('copyroxx_simulations', '{ pas du json');
  assert.deepEqual(lireSimulations(), []);
});

test('la comparaison lit l\'ecart dans le sens du temps', () => {
  const avant = essai(4000, [1, 2, 3], { stats: { pa: 12, vitalite: 4000, pm: 6 } });
  const apres = essai(4300, [1, 2, 9], { stats: { pa: 12, vitalite: 3800, pm: 6 } });

  const bilan = comparer(avant, apres, ['pa', 'pm', 'vitalite', 'critique']);

  assert.equal(bilan.ecartScore, 300);
  assert.equal(bilan.communes, 2);
  assert.deepEqual(bilan.enlevees.map((p) => p.id), [3]);
  assert.deepEqual(bilan.ajoutees.map((p) => p.id), [9]);

  // Une statistique nulle des deux cotes n'apparait pas ; celle qui bouge, si.
  assert.deepEqual(bilan.chiffres.map((l) => l.cle), ['pa', 'pm', 'vitalite']);
  assert.equal(bilan.chiffres.find((l) => l.cle === 'vitalite').ecart, -200);
});

test('le meme stuff avec un autre niveau montre le reglage qui a change', () => {
  const avant = essai(4121, [1, 2], { niveau: 193, options: { arme: false, combo: true } });
  const apres = essai(-49, [1, 2], { niveau: 180, options: { arme: true, combo: true } });

  const bilan = comparer(avant, apres, ['pa']);
  assert.equal(bilan.ajoutees.length, 0);
  assert.equal(bilan.enlevees.length, 0);

  const lignes = bilan.reglages;
  assert.deepEqual(lignes.find((l) => l.quoi === 'Niveau'), { quoi: 'Niveau', avant: '193', apres: '180' });
  assert.deepEqual(lignes.find((l) => l.quoi === 'arme'), { quoi: 'arme', avant: 'non', apres: 'oui' });
  // Une option identique des deux cotes n'a rien a dire.
  assert.equal(lignes.some((l) => l.quoi === 'combo'), false);
});

test('deux essais tout a fait identiques n\'ont aucun reglage a signaler', () => {
  const meme = essai(4121, [1, 2], { niveau: 193, options: { arme: false } });
  assert.deepEqual(reglagesChanges(meme, { ...meme }), []);
});
