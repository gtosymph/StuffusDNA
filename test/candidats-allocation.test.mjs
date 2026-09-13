/**
 * Repartition des points propre a chaque candidat.
 *
 * Le solveur rend un gagnant et quelques autres builds. Tous etaient notes
 * avec les points du gagnant, et le joueur qui portait un candidat heritait
 * de cette repartition : un build aux pieces differentes se retrouvait en
 * defaut sur des conditions qu'il savait pourtant tenir.
 *
 * Un candidat porte donc sa propre repartition, calculee sur ses seules
 * pieces, et son score est celui de cette repartition.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { solve } from '../src/solver/genetic.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';
import { availablePoints, pointCost, SCROLLABLE } from '../src/engine/characteristics.mjs';
import { computeBuild } from '../src/engine/build.mjs';

/** Piece minimale, d'un emplacement et de statistiques donnes. */
const piece = (id, slot, stats, level = 1) => ({
  id, fr: `${slot} ${id}`, slot, level, stats, typeFr: slot,
});

/**
 * Catalogue ou deux familles de pieces s'opposent.
 *
 * Les pieces « feu » apportent de l'intelligence, les pieces « vie » de la
 * vitalite. Deux builds proches en score n'investissent alors pas du tout au
 * meme endroit : c'est exactement le cas que la repartition partagee ratait.
 */
const CATALOGUE = [
  piece(1, 'amulette', { intelligence: 200, pa: 1 }),
  piece(2, 'amulette', { vitalite: 400, pa: 1 }),
  piece(3, 'cape', { intelligence: 180, pm: 1 }),
  piece(4, 'cape', { vitalite: 380, pm: 1 }),
  piece(5, 'chapeau', { intelligence: 160, critique: 20 }),
  piece(6, 'chapeau', { vitalite: 360, critique: 20 }),
  piece(7, 'bottes', { intelligence: 150, pm: 1 }),
  piece(8, 'bottes', { vitalite: 350, pm: 1 }),
  piece(9, 'ceinture', { intelligence: 140 }),
  piece(10, 'ceinture', { vitalite: 340 }),
];

const OBJECTIF = {
  // Les cibles restent a la portee du petit catalogue : un objectif
  // inatteignable mettrait tous les builds a la meme penalite, et la
  // repartition partirait partout en vitalite sans rien distinguer.
  conditions: [
    { stat: 'pa', target: 8, weight: 500 },
    { stat: 'vitalite', target: 3000, weight: 5 },
  ],
  spells: [{
    name: 'Sort', apCost: 4, castsPerTurn: 2, baseCrit: 0,
    lines: [{ element: 'feu', min: 20, max: 24, critMin: 24, critMax: 28, source: 'sort', range: 'melee' }],
  }],
  useWeapon: false,
  mode: SEARCH_MODES.DAMAGE,
};

/** Lance une recherche courte mais deterministe. */
function chercher(options = {}) {
  return solve({
    items: CATALOGUE, setById: new Map(), level: 200, objective: OBJECTIF,
    allocation: {}, scrolls: {}, passives: null, profile: {},
    lockedIds: [], banned: new Set(), allowedSlots: null, seedGenomes: [], seedItems: [],
  }, {
    populationSize: 60, maxGenerations: 80, stagnationLimit: Infinity,
    optimiserPoints: true, seed: 3, ...options,
  });
}

/** Points depenses par une repartition. */
function depense(allocation) {
  return SCROLLABLE.reduce((total, c) => total + pointCost(c, allocation[c] ?? 0), 0);
}

test('chaque candidat porte sa propre repartition', () => {
  const { candidats } = chercher();

  assert.ok(candidats.length > 1, 'la recherche doit rendre plusieurs candidats');
  for (const candidat of candidats) {
    assert.ok(candidat.allocation, 'un candidat sans repartition ne se porte pas');
    for (const c of SCROLLABLE) {
      assert.equal(typeof candidat.allocation[c], 'number', `${c} doit etre un nombre`);
      assert.ok(candidat.allocation[c] >= 0, `${c} ne peut pas etre negatif`);
    }
  }
});

test('aucune repartition de candidat ne depasse le budget du niveau', () => {
  const { candidats } = chercher();
  const budget = availablePoints(200);

  for (const candidat of candidats) {
    assert.ok(depense(candidat.allocation) <= budget,
      `un candidat depense ${depense(candidat.allocation)} pour un budget de ${budget}`);
  }
});

test('le score annonce est celui de la repartition portee', () => {
  const { candidats } = chercher();

  // Le contrat qui compte : reposer le build et ses points redonne les memes
  // statistiques que celles annoncees. Sans cela, le joueur voit un chiffre
  // a l'ecran et un autre une fois le build porte.
  for (const candidat of candidats) {
    const items = candidat.itemIds.map((id) => CATALOGUE.find((p) => p.id === id)).filter(Boolean);
    const { stats } = computeBuild({
      items, level: 200, allocation: candidat.allocation, scrolls: {}, passives: null, profile: {},
    }, new Map());

    assert.equal(stats.intelligence, candidat.stats.intelligence);
    assert.equal(stats.vitalite, candidat.stats.vitalite);
    assert.equal(stats.pa, candidat.stats.pa);
  }
});

test('deux candidats aux pieces opposees n\'investissent pas au meme endroit', () => {
  const { candidats } = chercher();
  const empreintes = new Set(candidats.map((c) => JSON.stringify(c.allocation)));

  // Le catalogue oppose deux familles : si toutes les repartitions se
  // ressemblent, c'est que la repartition du gagnant a ete recopiee partout.
  assert.ok(empreintes.size > 1,
    'des builds aux pieces opposees doivent investir differemment');
});

test('le gagnant garde la repartition de la recherche', () => {
  const resultat = chercher();
  const gagnant = resultat.candidats.find((c) =>
    JSON.stringify([...c.itemIds].sort((a, b) => a - b))
    === JSON.stringify(resultat.items.map((i) => i.id).sort((a, b) => a - b)));

  if (!gagnant) return;
  assert.deepEqual(gagnant.allocation, resultat.allocation);
});
