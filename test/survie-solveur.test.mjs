/**
 * Paliers de survie rendus par le solveur.
 *
 * Le solveur collecte, pendant la recherche, le build le plus fort de chaque
 * tranche de points de vie. Le joueur lit ensuite la courbe : ce que chaque
 * tranche de vie lachee rapporte en degats.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { solve } from '../src/solver/genetic.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';
import { estTenable, trancheDe } from '../src/solver/survie.mjs';

const piece = (id, slot, stats, level = 1) => ({
  id, fr: `${slot} ${id}`, slot, level, stats, typeFr: slot,
});

/** Pieces « feu » contre pieces « vie » : le compromis est dans le catalogue. */
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

function chercher(objective = OBJECTIF, options = {}) {
  return solve({
    items: CATALOGUE, setById: new Map(), level: 200, objective,
    allocation: {}, scrolls: {}, passives: null, profile: {},
    lockedIds: [], banned: new Set(), allowedSlots: null, seedGenomes: [], seedItems: [],
  }, {
    populationSize: 60, maxGenerations: 60, stagnationLimit: Infinity,
    optimiserPoints: true, seed: 3, ...options,
  });
}

test('le solveur rend des paliers de survie en mode degats', () => {
  const { survie } = chercher();
  assert.ok(Array.isArray(survie) && survie.length >= 2, `${survie?.length} palier(s)`);

  for (const palier of survie) {
    assert.ok(Number.isFinite(palier.damage) && palier.damage > 0);
    assert.ok(Number.isFinite(palier.pdv) && palier.pdv > 0);
    assert.equal(palier.tranche, trancheDe(palier.pdv));
    assert.ok(Array.isArray(palier.itemIds) && palier.itemIds.length > 0);
    assert.ok(palier.allocation, 'chaque palier porte sa repartition de points');
  }

  const tranches = survie.map((p) => p.tranche);
  assert.deepEqual(tranches, [...tranches].sort((a, b) => a - b), 'de la vie basse a la vie haute');
  assert.equal(new Set(tranches).size, tranches.length, 'une tranche, un build');
});

test('les paliers tiennent tout sauf la vie', () => {
  const { survie } = chercher();
  for (const palier of survie) {
    const horsVie = (palier.unmet ?? []).filter((u) => u.stat !== 'vitalite' && u.stat !== 'pdv');
    assert.deepEqual(horsVie, [], `le palier a ${palier.pdv} pdv manque ${JSON.stringify(horsVie)}`);
    assert.ok(palier.stats.pa >= 8, `le palier a ${palier.pdv} pdv n'a que ${palier.stats.pa} PA`);
  }
});

test('un palier sous la condition de vie existe : c\'est ce que la courbe montre', () => {
  // Le catalogue « feu » entier frappe plus fort mais n'atteint pas 3000 de
  // vitalite : ce build ne gagne jamais la recherche, la courbe le garde.
  const { survie, detail } = chercher();
  const sous = survie.filter((p) => p.pdv < 3000);
  assert.ok(sous.length > 0, 'au moins un build sous la condition');
  assert.ok(sous.some((p) => p.damage >= detail.damage), 'et il frappe au moins aussi fort que le gagnant');
});

test('la tranche du gagnant frappe au moins aussi fort que lui', () => {
  // Le gagnant rejoint les pretendants de sa tranche. Il peut y etre battu :
  // un build note avec sa propre repartition de points tient parfois la
  // condition de vie que la repartition partagee lui refusait.
  const { survie, stats, detail } = chercher();
  const sienne = survie.find((p) => p.tranche === trancheDe(stats.pdv));
  assert.ok(sienne, 'la tranche du gagnant existe');
  assert.ok(sienne.damage >= detail.damage - 1e-9, `${sienne.damage} < ${detail.damage}`);
});

test('en mode caracteristiques, aucun palier de survie', () => {
  const { survie } = chercher({ ...OBJECTIF, spells: [], mode: SEARCH_MODES.STATS });
  assert.deepEqual(survie, []);
});

test('estTenable lit les vues du solveur', () => {
  const { survie } = chercher();
  for (const palier of survie) {
    assert.equal(estTenable({ invalid: [], violations: [], detail: { unmet: palier.unmet } }), true);
  }
});
