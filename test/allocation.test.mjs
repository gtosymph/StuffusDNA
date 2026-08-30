/**
 * Tests de la repartition automatique des points de caracteristique.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyStats } from '../src/data/stats.mjs';
import { availablePoints, pointCost } from '../src/engine/characteristics.mjs';
import { optimiserAllocation } from '../src/solver/allocation.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

const SORT_FEU = {
  name: 'Essai', apCost: 4, castsPerTurn: 1, baseCrit: 0,
  lines: [{ element: 'feu', min: 20, max: 24, critMin: 24, critMax: 28, source: 'sort', range: null }],
};

test('les points servent l element du sort en mode degats', () => {
  const { allocation, spent } = optimiserAllocation({
    raw: emptyStats(),
    level: 190,
    objective: { conditions: [], spells: [SORT_FEU], mode: SEARCH_MODES.DAMAGE },
  });

  // L'intelligence porte les degats Feu : elle recoit la part du lion.
  assert.ok(allocation.intelligence > 0);
  assert.equal(allocation.force, 0);
  assert.equal(allocation.chance, 0);
  assert.equal(allocation.agilite, 0);
  assert.ok(spent <= availablePoints(190));
});

test('une condition en defaut passe avant les degats', () => {
  const conditions = [{ stat: 'vitalite', target: 1200, weight: 5, max: null }];
  const { allocation } = optimiserAllocation({
    raw: emptyStats(),
    level: 190,
    objective: { conditions, spells: [SORT_FEU], mode: SEARCH_MODES.DAMAGE },
  });

  // La base au niveau 190 donne 1000 points de vie : il en manque 200.
  assert.equal(allocation.vitalite >= 200, true);
});

test('le budget de points est toujours respecte', () => {
  const { allocation, spent } = optimiserAllocation({
    raw: emptyStats(),
    level: 190,
    objective: {
      conditions: [
        { stat: 'sagesse', target: 300, weight: 10, max: null },
        { stat: 'force', target: 400, weight: 10, max: null },
      ],
      spells: [],
      mode: SEARCH_MODES.STATS,
    },
  });

  let calcule = 0;
  for (const [cle, valeur] of Object.entries(allocation)) calcule += pointCost(cle, valeur);
  assert.equal(calcule, spent);
  assert.ok(spent <= availablePoints(190));
});

test('le reliquat part en vitalite', () => {
  const { allocation } = optimiserAllocation({
    raw: emptyStats(),
    level: 190,
    // Sans sort ni condition, aucun investissement ne rapporte de score.
    objective: { conditions: [], spells: [], mode: SEARCH_MODES.DAMAGE },
  });
  assert.equal(allocation.vitalite, availablePoints(190));
});
