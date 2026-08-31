/**
 * Explication d'un build : apport de chaque piece, et statistique qui paie.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { apportsPieces, sensibiliteStats } from '../src/solver/explain.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

/** Sort de feu simple : seule l'intelligence le monte. */
const SORT_FEU = {
  name: 'Feu', apCost: 3, castsPerTurn: 1, baseCrit: 0,
  lines: [{ element: 'feu', min: 20, max: 20, critMin: 20, critMax: 20, source: 'sort', range: null }],
};

const OBJECTIF = { mode: SEARCH_MODES.DAMAGE, conditions: [], spells: [SORT_FEU] };

/** Piece d'essai : un nom, un emplacement, des statistiques. */
function piece(id, fr, slot, stats) {
  return { id, fr, slot, level: 1, stats, setId: null };
}

const CONTEXTE = {
  level: 1, allocation: {}, scrolls: {}, passives: null,
  profile: { classe: 5, sexe: 0 }, setById: new Map(), objective: OBJECTIF,
};

test('la piece qui monte les degats a le plus gros apport', () => {
  const items = [
    piece(1, 'Coiffe forte', 'chapeau', { intelligence: 400 }),
    piece(2, 'Cape terne', 'cape', { prospection: 40 }),
  ];

  const apports = apportsPieces(items, CONTEXTE);

  assert.equal(apports.length, 2);
  assert.equal(apports[0].id, 1, 'les apports se classent du plus fort au plus faible');
  assert.ok(apports[0].apport > 0);
  assert.equal(apports[1].apport, 0, 'une piece sans effet sur l\'objectif n\'apporte rien');
});

test('l\'apport d\'une piece vaut ce que sa perte coute', () => {
  const items = [piece(1, 'Coiffe forte', 'chapeau', { intelligence: 400 })];

  const [apport] = apportsPieces(items, CONTEXTE);

  // Le build sans la piece ne porte plus rien : l'apport vaut tout le score.
  assert.equal(Math.round(apport.apport), Math.round(apport.scoreAvec - apport.scoreSans));
  assert.ok(apport.scoreSans < apport.scoreAvec);
});

test('l\'apport separe les degats de la condition qui casse', () => {
  const objectif = {
    mode: SEARCH_MODES.DAMAGE,
    // Le personnage porte 6 PA de base : la cible a 7 rend la ceinture decisive.
    conditions: [{ stat: 'pa', target: 7, weight: 1000, absolute: true }],
    spells: [SORT_FEU],
  };
  const items = [
    piece(1, 'Coiffe forte', 'chapeau', { intelligence: 400 }),
    piece(2, 'Ceinture a PA', 'ceinture', { pa: 1 }),
  ];

  const apports = apportsPieces(items, { ...CONTEXTE, objective: objectif });
  const parId = new Map(apports.map((a) => [a.id, a]));

  // La coiffe ne porte aucune condition : elle apporte des degats, rien de plus.
  assert.ok(parId.get(1).degats > 0);
  assert.equal(parId.get(1).casseCondition, false);

  // La ceinture ne rend aucun degat, mais sans elle la condition tombe.
  assert.equal(parId.get(2).degats, 0);
  assert.equal(parId.get(2).casseCondition, true);
});

test('la sensibilite classe les statistiques qui paient', () => {
  const stats = { intelligence: 200, agilite: 200, puissance: 0 };

  const sensible = sensibiliteStats(stats, OBJECTIF);
  const parStat = new Map(sensible.map((s) => [s.stat, s]));

  assert.ok(parStat.get('intelligence').gain > 0, 'l\'intelligence monte un sort de feu');
  assert.equal(parStat.get('agilite')?.gain ?? 0, 0, 'l\'agilite ne touche pas un sort de feu');
  assert.equal(sensible[0].gain, Math.max(...sensible.map((s) => s.gain)));
});

test('la sensibilite rend le pas applique a chaque statistique', () => {
  const sensible = sensibiliteStats({ intelligence: 100 }, OBJECTIF);
  const intelligence = sensible.find((s) => s.stat === 'intelligence');

  assert.ok(intelligence.pas > 0);
  assert.equal(typeof intelligence.gainParPas, 'number');
});

test('un build sans sort ne rend aucune sensibilite utile', () => {
  const sensible = sensibiliteStats({ intelligence: 100 }, { ...OBJECTIF, spells: [] });

  assert.deepEqual(sensible, []);
});
