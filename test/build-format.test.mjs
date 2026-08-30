import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findConflicts, parseBuildFile, parseConstraint, parseDamageLine, SLOT_ALIASES,
} from '../src/data/build-format.mjs';
import { TOTAL_SLOT_CAPACITY } from '../src/data/slots.mjs';
import { applyLocks, buildLayout, planLocks, repair } from '../src/solver/genome.mjs';

const FICHIER = `#LEVEL
190
#MIN_CRIT
31
#TARGETED_SLOTS
amulet 1
ring 2
dofus 5
prysmaradite 1
#DMG_LINES
terre 15 20 22 24 26
feu 5 10 12 13 15
#CONSTRAINTS
pa <= 12
pm <= 5
#LOCK_ITEMS
+dofus pourpre
-dolmanax
`;

test('lecture d une ligne de degats', async (t) => {
  await t.test('les cinq nombres sont lus dans l ordre', () => {
    const line = parseDamageLine('terre 15 20 22 24 26');
    assert.deepEqual(line, {
      element: 'terre', critBonus: 15, min: 20, max: 22, critMin: 24, critMax: 26,
    });
  });

  await t.test('un element inconnu est refuse', () => {
    assert.equal(parseDamageLine('boue 15 20 22 24 26'), null);
  });

  await t.test('une ligne incomplete est refusee', () => {
    assert.equal(parseDamageLine('terre 15 20'), null);
  });
});

test('lecture d une contrainte', async (t) => {
  await t.test('le signe superieur fixe un objectif', () => {
    assert.deepEqual(parseConstraint('pa >= 12'), { stat: 'pa', target: 12, weight: 500 });
  });

  await t.test('le signe inferieur fixe un plafond absolu', () => {
    const c = parseConstraint('pa <= 12');
    assert.equal(c.max, 12);
    assert.equal(c.absolute, true);
  });

  await t.test('une statistique inconnue est refusee', () => {
    assert.equal(parseConstraint('brouette >= 3'), null);
  });
});

test('lecture du fichier complet', async (t) => {
  const parsed = parseBuildFile(FICHIER);

  await t.test('les sections sont reconnues', () => {
    assert.equal(parsed.level, 190);
    assert.equal(parsed.minCrit, 31);
    assert.equal(parsed.damageLines.length, 2);
    assert.equal(parsed.constraints.length, 2);
  });

  await t.test('les emplacements sont traduits', () => {
    assert.equal(parsed.slots.amulette, 1);
    assert.equal(parsed.slots.anneau, 2);
    // Les cinq Dofus et la Prysmaradite occupent la meme famille de six cases.
    assert.equal(parsed.slots.artefact, 6);
    assert.equal(parsed.slots.prysmaradite, undefined);
  });

  await t.test('les verrous sont separes par leur signe', () => {
    assert.deepEqual(parsed.forced, ['dofus pourpre']);
    assert.deepEqual(parsed.excluded, ['dolmanax']);
  });

  await t.test('un fichier vide est refuse', () => {
    assert.throws(() => parseBuildFile(''), /vide/);
  });
});

test('le total des emplacements du format couvre le personnage', () => {
  // Un personnage porte seize pieces : une amulette, une arme, deux anneaux,
  // une ceinture, des bottes, un bouclier, un chapeau, une cape, une monture
  // et six Dofus ou trophees.
  //
  // Le build enregistre par le solveur de reference contient bien seize
  // emplacements, et son ecran d'equipement en montre cinq a gauche, cinq a
  // droite et six en bas. Les Prysmaradites n'ont donc pas de case propre.
  assert.equal(TOTAL_SLOT_CAPACITY, 16);
  assert.equal(SLOT_ALIASES.prysmaradite, 'artefact');
  assert.equal(SLOT_ALIASES.dofus, 'artefact');
});

test('detection des contraintes incompatibles', async (t) => {
  await t.test('un plancher au dessus du plafond est signale', () => {
    const conflicts = findConflicts([
      { stat: 'pa', max: 12, absolute: true },
      { stat: 'pa', target: 22 },
    ]);
    assert.equal(conflicts.length, 1);
    assert.match(conflicts[0], /pa/);
  });

  await t.test('des bornes compatibles ne sont pas signalees', () => {
    const conflicts = findConflicts([
      { stat: 'pa', max: 12, absolute: true },
      { stat: 'pa', target: 10 },
    ]);
    assert.deepEqual(conflicts, []);
  });
});

test('verrouillage des items', async (t) => {
  const layout = buildLayout();
  const anneau = { id: 100, slot: 'anneau' };
  const autre = { id: 200, slot: 'anneau' };
  const pools = layout.map((cell) => (cell.slotKey === 'anneau' ? [anneau, autre] : []));

  await t.test('un item impose prend une case', () => {
    const { cells, missing } = planLocks(layout, pools, [anneau]);
    assert.equal(cells.size, 1);
    assert.deepEqual(missing, []);
  });

  await t.test('un item absent du pool est signale', () => {
    const { missing } = planLocks(layout, pools, [{ id: 999, slot: 'cape' }]);
    assert.equal(missing.length, 1);
  });

  await t.test('deux items imposes occupent deux cases distinctes', () => {
    const { cells } = planLocks(layout, pools, [anneau, autre]);
    assert.equal(cells.size, 2);
    assert.equal(new Set(cells.keys()).size, 2);
  });

  await t.test('la reparation garde les cases imposees', () => {
    const { cells } = planLocks(layout, pools, [anneau]);
    const genome = new Array(layout.length).fill(-1);
    repair(genome, layout, pools, cells);
    for (const [cell, index] of cells) assert.equal(genome[cell], index);
  });

  await t.test('applyLocks impose les valeurs', () => {
    const genome = [0, 0, 0];
    applyLocks(genome, new Map([[1, 5]]));
    assert.equal(genome[1], 5);
  });
});
