/**
 * Meilleur remplacement par case.
 *
 * L'apport d'une piece dit ce qu'elle vaut ; le remplacement dit quoi acheter.
 * Pour chaque case portee, le catalogue entier s'essaie a sa place, et la
 * piece qui fait gagner le plus de degats sans casser une condition se montre.
 * Une case vide compte aussi : la remplir est souvent le premier achat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { meilleursRemplacements } from '../src/solver/remplacements.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

const SORT_FEU = {
  name: 'Feu', apCost: 3, castsPerTurn: 1, baseCrit: 0,
  lines: [{ element: 'feu', min: 20, max: 20, critMin: 20, critMax: 20, source: 'sort', range: null }],
};

const piece = (id, fr, slot, stats, level = 1) => ({ id, fr, slot, level, stats, setId: null, typeFr: slot });

const CATALOGUE = [
  piece(1, 'Coiffe faible', 'chapeau', { intelligence: 50 }),
  piece(2, 'Coiffe forte', 'chapeau', { intelligence: 400 }),
  piece(3, 'Coiffe haute', 'chapeau', { intelligence: 900 }, 150),
  piece(4, 'Cape terne', 'cape', { prospection: 40 }),
  piece(5, 'Cape PA', 'cape', { pa: 1, intelligence: 10 }),
  piece(6, 'Cape feu', 'cape', { intelligence: 300 }),
  piece(7, 'Anneau feu', 'anneau', { intelligence: 200 }),
  piece(8, 'Anneau doux', 'anneau', { intelligence: 100 }),
  piece(9, 'Dofus feu', 'artefact', { intelligence: 150 }),
];

const contexte = (objective, extra = {}) => ({
  level: 100, allocation: {}, scrolls: {}, passives: null,
  profile: { classe: 5, sexe: 0 }, setById: new Map(), objective,
  catalogue: CATALOGUE, bannis: new Set(), ...extra,
});

const SANS_CONDITION = { mode: SEARCH_MODES.DAMAGE, conditions: [], spells: [SORT_FEU] };

test('la meilleure piece de chaque case portee se propose, du plus gros gain au plus petit', () => {
  const portees = [piece(1, 'Coiffe faible', 'chapeau', { intelligence: 50 }), piece(4, 'Cape terne', 'cape', { prospection: 40 })];
  const propositions = meilleursRemplacements(portees, contexte(SANS_CONDITION));

  const parCase = Object.fromEntries(propositions.map((p) => [p.slot, p]));
  assert.equal(parCase.chapeau.remplacant.id, 2, 'la coiffe haute est hors niveau');
  assert.equal(parCase.cape.remplacant.id, 6);
  assert.ok(parCase.chapeau.gainDegats > parCase.cape.gainDegats);
  assert.equal(propositions[0].slot, 'chapeau');
  assert.ok(propositions.every((p) => p.gainDegats > 0));
});

test('une case vide se propose a remplir', () => {
  const propositions = meilleursRemplacements([piece(2, 'Coiffe forte', 'chapeau', { intelligence: 400 })], contexte(SANS_CONDITION));
  const dofus = propositions.find((p) => p.slot === 'artefact');
  assert.ok(dofus, 'un Dofus a poser');
  assert.equal(dofus.actuel, null);
  assert.equal(dofus.remplacant.id, 9);
  // Deux anneaux vides : une seule proposition, la meme piece ne se pose pas deux fois.
  assert.equal(propositions.filter((p) => p.slot === 'anneau').length, 1);
});

test('une piece deja portee ne se propose pas ailleurs', () => {
  const portees = [piece(7, 'Anneau feu', 'anneau', { intelligence: 200 })];
  const propositions = meilleursRemplacements(portees, contexte(SANS_CONDITION));
  const anneau = propositions.find((p) => p.slot === 'anneau');
  assert.equal(anneau.remplacant.id, 8, 'l\'anneau feu est deja porte');
});

test('un remplacement qui casse une condition ne se propose pas', () => {
  const avecPa = { ...SANS_CONDITION, conditions: [{ stat: 'pa', target: 8, weight: 100 }] };
  // La cape PA tient les 8 PA (7 de base + 1) ; la cape feu frappe plus fort mais les perd.
  const portees = [piece(5, 'Cape PA', 'cape', { pa: 1, intelligence: 10 })];
  const propositions = meilleursRemplacements(portees, contexte(avecPa));
  assert.equal(propositions.find((p) => p.slot === 'cape'), undefined);
});

test('un remplacement qui redresse une condition se montre, meme sans gain de degats', () => {
  const avecPa = { ...SANS_CONDITION, conditions: [{ stat: 'pa', target: 8, weight: 100 }] };
  const portees = [piece(6, 'Cape feu', 'cape', { intelligence: 300 })];
  const propositions = meilleursRemplacements(portees, contexte(avecPa));
  const cape = propositions.find((p) => p.slot === 'cape');
  assert.ok(cape, 'la cape PA redresse la condition');
  assert.equal(cape.remplacant.id, 5);
  assert.equal(cape.redresse, true);
});

test('les pieces bannies et hors niveau restent dehors', () => {
  const portees = [piece(1, 'Coiffe faible', 'chapeau', { intelligence: 50 })];
  const propositions = meilleursRemplacements(portees, contexte(SANS_CONDITION, { bannis: new Set([2]) }));
  assert.equal(propositions.find((p) => p.slot === 'chapeau'), undefined, 'la forte est bannie, la haute hors niveau');
});

test('un build deja optimal ne propose rien', () => {
  const portees = [piece(2, 'Coiffe forte', 'chapeau', { intelligence: 400 }), piece(6, 'Cape feu', 'cape', { intelligence: 300 }),
    piece(7, 'Anneau feu', 'anneau', { intelligence: 200 }), piece(8, 'Anneau doux', 'anneau', { intelligence: 100 }),
    piece(9, 'Dofus feu', 'artefact', { intelligence: 150 })];
  assert.deepEqual(meilleursRemplacements(portees, contexte(SANS_CONDITION)), []);
});

test('les pieces d\'entree ne bougent pas', () => {
  const portees = [piece(1, 'Coiffe faible', 'chapeau', { intelligence: 50 })];
  const copie = JSON.parse(JSON.stringify(portees));
  meilleursRemplacements(portees, contexte(SANS_CONDITION));
  assert.deepEqual(portees, copie);
});
