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

test('une condition de fuite se comble par l\'agilite (stat derivee)', () => {
  // Cas reel : items donnant sagesse 420 et fuite 50 ; conditions sagesse 600
  // et fuite 60. La fuite derive de l'agilite (1 pour 10) : l'optimiseur doit
  // caler une tranche d'agilite sur la distance, puis investir le reste en
  // intelligence pour les degats feu.
  const raw = { sagesse: 420, fuite: 50, vitalite: 2000 };
  const objective = {
    conditions: [
      { stat: 'sagesse', target: 600, weight: 15, max: null, absolute: false },
      { stat: 'fuite', target: 60, weight: 1, max: null, absolute: false },
    ],
    spells: [{
      name: 'Sort feu', apCost: 4, castsPerTurn: 1, baseCrit: 0,
      lines: [{ element: 'feu', min: 30, max: 34, critMin: 36, critMax: 40, source: 'sort', range: 'melee' }],
    }],
    mode: 'degats',
  };

  const { allocation, score } = optimiserAllocation({ raw, level: 190, objective });

  const sagesseFinale = 420 + allocation.sagesse;
  const fuiteFinale = 50 + Math.floor(allocation.agilite / 10);
  assert.ok(sagesseFinale >= 600, `sagesse ${sagesseFinale} < 600`);
  assert.ok(fuiteFinale >= 60, `fuite ${fuiteFinale} < 60 (agilite ${allocation.agilite})`);
  assert.ok(score > 0, `score ${score} : les conditions devraient etre satisfaites`);
  assert.ok(allocation.intelligence > 0, 'le reste du budget doit nourrir les degats feu');
});
