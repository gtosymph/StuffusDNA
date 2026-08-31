import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRankings, improve, indexerPanoplies, poidsObjectif, rankPool,
} from '../src/solver/local-search.mjs';
import { EMPTY } from '../src/solver/genome.mjs';

const OBJECTIF_FEU = {
  mode: 'degats',
  conditions: [{ stat: 'pa', target: 12, weight: 1000 }],
  spells: [{ name: 'Brasier', apCost: 3, lines: [{ element: 'feu', min: 20, max: 24 }] }],
};

test('poids des statistiques tires de l objectif', async (t) => {
  await t.test('les conditions apportent leur poids', () => {
    const poids = poidsObjectif(OBJECTIF_FEU);
    assert.ok((poids.conditions.pa ?? 0) > 0);
  });

  await t.test('les sorts feu creditent l intelligence et les dommages feu', () => {
    const poids = poidsObjectif(OBJECTIF_FEU);
    assert.ok((poids.degats.intelligence ?? 0) > 0);
    assert.ok((poids.degats.dommagesFeu ?? 0) > 0);
    assert.ok((poids.degats.puissance ?? 0) > 0);
    assert.equal(poids.degats.force ?? 0, 0);
  });

  await t.test('sans sorts, aucun poids de degats', () => {
    const poids = poidsObjectif({ conditions: [{ stat: 'pm', target: 5, weight: 1 }], spells: [] });
    assert.deepEqual(poids.degats, {});
  });
});

test('classement des pieces oriente objectif', async (t) => {
  await t.test('une piece de degats passe devant une piece hors sujet', () => {
    const pool = [
      { id: 1, stats: { force: 300 } },
      { id: 2, stats: { intelligence: 300 } },
    ];
    const ordre = rankPool(pool, poidsObjectif(OBJECTIF_FEU));
    assert.equal(ordre[0], 1);
  });

  await t.test('une condition fuite credite l agilite', () => {
    const pool = [
      { id: 1, stats: { fuite: 20 } },
      { id: 2, stats: { agilite: 400 } },
    ];
    const objectif = { mode: 'degats', conditions: [{ stat: 'fuite', target: 60, weight: 1 }], spells: [] };
    const ordre = rankPool(pool, poidsObjectif(objectif));
    assert.equal(ordre[0], 1);
  });

  await t.test('buildRankings couvre chaque pool', () => {
    const pools = [[{ id: 1, stats: {} }], []];
    const rankings = buildRankings(pools, OBJECTIF_FEU);
    assert.equal(rankings.length, 2);
    assert.deepEqual(rankings[1], []);
  });
});

test('index des panoplies par case', () => {
  const pools = [
    [{ id: 1, setId: 7 }, { id: 2 }],
    [{ id: 3, setId: 7 }, { id: 4, setId: 9 }],
  ];
  const index = indexerPanoplies(pools);
  assert.deepEqual(index.get(7), [{ cellule: 0, index: 0 }, { cellule: 1, index: 0 }]);
  assert.deepEqual(index.get(9), [{ cellule: 1, index: 1 }]);
});

test('la descente locale complete une panoplie', () => {
  // Deux cases. La piece 3 complete la panoplie 7 et declenche un gros bonus,
  // mais la passe par emplacement est coupee (candidatesPerSlot 0) : seule la
  // passe panoplies peut la trouver.
  const layout = [{ slotKey: 'a' }, { slotKey: 'b' }];
  const pools = [
    [{ id: 1, setId: 7, stats: { force: 10 } }],
    [{ id: 3, setId: 7, stats: { force: 1 } }, { id: 4, stats: { force: 5 } }],
  ];
  const evaluate = (genome) => {
    const items = genome.map((index, cellule) => (index === EMPTY ? null : pools[cellule][index])).filter(Boolean);
    let score = items.reduce((somme, item) => somme + (item.stats?.force ?? 0), 0);
    if (items.filter((item) => item.setId === 7).length >= 2) score += 1000;
    return { score };
  };
  const contexte = {
    layout, pools, rankings: pools.map(() => []), evaluate, panoplies: indexerPanoplies(pools),
  };

  const resultat = improve([0, 1], contexte, { candidatesPerSlot: 0, tryEmpty: false });
  assert.deepEqual(resultat.genome, [0, 0]);
  assert.equal(resultat.score, 1011);
});
