/**
 * Les deux listes de la fiche, dans le volet d'inspection de v2.
 *
 * Elles ne repondent pas a la meme question. L'essentiel sert a decider, donc
 * il met en tete ce que le joueur a lui-meme demande : une exigence en defaut
 * doit se voir sans la chercher. « Tout voir » sert a retrouver, donc il suit
 * les familles du jeu — la faute que ce test attrape est celle deja faite une
 * fois sur la maquette : parcourir les mesures dans l'ordre de DECISION coupe
 * une famille en deux, et « Principales » apparait a deux endroits.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { FAMILLES, lignesCompletes, lignesEssentielles } from '../web/v2/fiche.mjs';

const STATS = {
  pa: 12, pm: 6, pdv: 5135, critique: 42, initiative: 530,
  vitalite: 4080, force: 900, puissance: 145,
  pctDommagesNeutre: 30, resNeutre: 12, pctResNeutre: 40,
};

const familles = (lignes) => lignes.filter((l) => l.famille).map((l) => l.famille);
const cles = (lignes) => lignes.filter((l) => l.cle).map((l) => l.cle);

test('tout voir', async (t) => {
  await t.test('chaque famille n\'apparait qu\'une fois', () => {
    const vues = familles(lignesCompletes(STATS));
    assert.equal(new Set(vues).size, vues.length);
  });

  await t.test('les familles suivent l\'ordre du jeu', () => {
    const attendu = FAMILLES.map(([nom]) => nom);
    const vues = familles(lignesCompletes(STATS));
    assert.deepEqual(vues, attendu.filter((nom) => vues.includes(nom)));
  });

  await t.test('une famille sans aucune statistique connue disparait', () => {
    const vues = familles(lignesCompletes({ pa: 12 }));
    assert.deepEqual(vues, ['Principales']);
  });

  await t.test('une statistique absente ne fait pas une ligne a zero', () => {
    assert.ok(!cles(lignesCompletes({ pa: 12 })).includes('pm'));
  });

  await t.test('une statistique sous minimum se signale', () => {
    const ligne = lignesCompletes(STATS, new Set(['pa'])).find((l) => l.cle === 'pa');
    assert.equal(ligne.sousMinimum, true);
  });
});

test('l\'essentiel', async (t) => {
  const mesures = { degats: 775, pdvEffectifs: 9245 };

  await t.test('les deux mesures ouvrent la liste', () => {
    assert.deepEqual(cles(lignesEssentielles(STATS, [], mesures)).slice(0, 2),
      ['degatsTotaux', 'pdvEffectifs']);
  });

  await t.test('les exigences du joueur passent avant l\'appoint', () => {
    const lignes = lignesEssentielles(STATS, ['vitalite'], mesures);
    assert.deepEqual(familles(lignes), ['vos exigences', 'puis']);
    const suite = cles(lignes);
    assert.ok(suite.indexOf('vitalite') < suite.indexOf('pa'));
  });

  await t.test('une exigence n\'est jamais repetee dans l\'appoint', () => {
    const suite = cles(lignesEssentielles(STATS, ['pa'], mesures));
    assert.equal(suite.filter((c) => c === 'pa').length, 1);
  });

  await t.test('la liste ne depasse pas huit mesures', () => {
    const beaucoup = ['vitalite', 'force', 'puissance', 'initiative', 'critique', 'pdv'];
    assert.ok(cles(lignesEssentielles(STATS, beaucoup, mesures)).length <= 8);
  });

  await t.test('sans sorts, les degats se taisent au lieu d\'annoncer zero', () => {
    const ligne = lignesEssentielles(STATS, [], { degats: null, pdvEffectifs: 9245 })[0];
    assert.equal(ligne.muet, true);
    assert.equal(ligne.valeur, null);
  });

  await t.test('avec des sorts, les degats portent leur chiffre', () => {
    const ligne = lignesEssentielles(STATS, [], mesures)[0];
    assert.equal(ligne.muet, false);
    assert.equal(ligne.valeur, 775);
  });

  await t.test('une exigence sur une statistique inconnue est ignoree', () => {
    const suite = cles(lignesEssentielles(STATS, ['soins'], mesures));
    assert.ok(!suite.includes('soins'));
  });
});
