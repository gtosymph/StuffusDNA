/**
 * Contexte de recherche reutilise d'une vague a l'autre.
 *
 * Le navigateur cherche par vagues de quelques dizaines de generations. Sans
 * contexte, chaque vague refaisait les pools, les verrous, le classement des
 * pieces et jetait le cache d'evaluation. Le contexte porte ce travail d'une
 * vague a l'autre.
 *
 * La garantie a tenir : reutiliser un contexte ne change RIEN au resultat.
 * Un enchainement de vagues sur contexte garde doit rendre exactement ce que
 * rend le meme enchainement avec une preparation neuve a chaque vague.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { preparerRecherche, solve } from '../src/solver/genetic.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

/** Piece minimale du catalogue d'essai. */
const piece = (id, slot, stats, level = 1) => ({ id, fr: `Piece ${id}`, slot, level, stats });

/** Catalogue reduit mais assez fourni pour que la recherche ait a choisir. */
const CATALOGUE = [];
for (let i = 0; i < 40; i += 1) {
  CATALOGUE.push(piece(100 + i, 'anneau', { force: i * 3, pa: i % 7 === 0 ? 1 : 0, vitalite: i * 5 }));
  CATALOGUE.push(piece(200 + i, 'amulette', { intelligence: i * 4, pm: i % 9 === 0 ? 1 : 0 }));
  CATALOGUE.push(piece(300 + i, 'coiffe', { chance: i * 2, force: i, po: i % 11 === 0 ? 1 : 0 }));
  CATALOGUE.push(piece(400 + i, 'cape', { agilite: i * 3, vitalite: i * 8 }));
  CATALOGUE.push(piece(500 + i, 'ceinture', { force: i * 2, sagesse: i }));
  CATALOGUE.push(piece(600 + i, 'bottes', { force: i, agilite: i * 2 }));
}

const OBJECTIF = Object.freeze({
  conditions: [
    { stat: 'pa', target: 8, weight: 500 },
    { stat: 'pm', target: 4, weight: 500 },
    { stat: 'vitalite', target: 1500, weight: 1 },
  ],
  spells: [{
    id: 1, name: 'Coup', apCost: 4, castsPerTurn: 2, baseCrit: 5,
    lines: [{ element: 'terre', min: 20, max: 30, critMin: 24, critMax: 34, source: 'sort' }],
  }],
  mode: SEARCH_MODES.DAMAGE,
});

const DEMANDE = Object.freeze({
  items: CATALOGUE, setById: new Map(), level: 150, objective: OBJECTIF,
  allocation: {}, scrolls: {}, passives: null, profile: {},
});

const OPTIONS = Object.freeze({
  populationSize: 40, maxGenerations: 12, stagnationLimit: Infinity, optimiserPoints: true,
});

/**
 * Enchaine des vagues, comme le fait un fil de calcul.
 * @param {boolean} garde Vrai pour garder le contexte d'une vague a l'autre.
 * @returns {{score: number, ids: number[], allocation: any, generations: number}[]}
 */
function vagues(garde, nombre = 4) {
  const contexte = garde ? preparerRecherche(DEMANDE) : null;
  const traces = [];
  let graines = [];
  let allocation = {};

  for (let v = 0; v < nombre; v += 1) {
    const result = solve(
      { ...DEMANDE, allocation, seedGenomes: graines, ...(contexte ? { contexte } : {}) },
      { ...OPTIONS, seed: (1 + v * 7919) >>> 0 },
    );
    graines = result.topGenomes;
    allocation = result.allocation ?? allocation;
    traces.push({
      score: result.score,
      ids: result.items.map((item) => item.id).sort((a, b) => a - b),
      allocation: result.allocation,
      history: result.history,
    });
  }

  return traces;
}

test('un contexte garde rend exactement ce que rend une preparation neuve', () => {
  const avecContexte = vagues(true);
  const sansContexte = vagues(false);

  assert.deepEqual(avecContexte, sansContexte);
});

test('le contexte prepare rend bien de quoi chercher', () => {
  const contexte = preparerRecherche(DEMANDE);

  assert.ok(contexte.pools.length > 0);
  assert.equal(contexte.pools.length, contexte.layout.length);
  assert.ok(contexte.rankings.length === contexte.pools.length);
  assert.equal(typeof contexte.evaluate, 'function');
});

test('une repartition de points imposee prime sur celle du contexte', () => {
  const contexte = preparerRecherche(DEMANDE);
  solve({ ...DEMANDE, contexte }, { ...OPTIONS, optimiserPoints: true, seed: 1 });

  // Le solveur a reparti les points a sa facon pendant la premiere vague.
  const apresPremiere = { ...contexte.porteur.allocation };
  const impose = { force: 100, intelligence: 0, chance: 0, agilite: 0, vitalite: 0, sagesse: 0 };

  solve(
    { ...DEMANDE, allocation: impose, contexte },
    { ...OPTIONS, optimiserPoints: false, maxGenerations: 0, seed: 2 },
  );

  assert.notDeepEqual(apresPremiere, impose);
  assert.equal(contexte.porteur.allocation.force, 100);
});

test('un catalogue vide se refuse des la preparation', () => {
  assert.throws(() => preparerRecherche({ ...DEMANDE, items: [] }), /Catalogue vide/);
  assert.throws(() => preparerRecherche({ ...DEMANDE, objective: {} }), /Objectif invalide/);
  assert.throws(() => solve({ ...DEMANDE, items: [] }, OPTIONS), /Catalogue vide/);
});
