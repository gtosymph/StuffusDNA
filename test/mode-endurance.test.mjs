/**
 * Mode de recherche « maximiser les pdv effectifs ».
 *
 * Le solveur savait faire une seule chose : frapper le plus fort sous des
 * conditions. Un joueur qui monte un personnage resistant demande l'inverse :
 * tenir le plus longtemps possible, tant que le build frappe encore assez
 * fort. Le mode echange donc les deux roles — l'endurance devient le score,
 * les degats deviennent une condition.
 *
 * L'ordre lexicographique ne bouge pas : un build qui manque une condition
 * passe toujours sous un build qui les tient toutes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  maxViolations, scoreBuild, SEARCH_MODES, STAT_DEGATS,
} from '../src/solver/score.mjs';
import { conditionValue } from '../src/solver/condition-value.mjs';

/** Sort simple : des degats fixes, sans aucune variance. */
const SORT = { name: 'coup', lines: [{ element: 'feu', min: 100, max: 100 }], repeats: 1 };

const statsDe = (apports) => ({ pdv: 3000, pdvEffectifs: 3000, ...apports });

test('conditionValue lit les degats calcules', async (t) => {
  await t.test('la cle des degats totaux vient du calcul, pas des statistiques', () => {
    assert.equal(conditionValue(STAT_DEGATS, statsDe({}), 1234), 1234);
  });

  await t.test('sans degats fournis, la valeur vaut zero', () => {
    assert.equal(conditionValue(STAT_DEGATS, statsDe({})), 0);
  });

  await t.test('les autres cles ne changent pas de sens', () => {
    assert.equal(conditionValue('pdvEffectifs', statsDe({ pdvEffectifs: 4200 }), 999), 4200);
    assert.equal(conditionValue('vitalite', statsDe({ pdv: 3500 }), 999), 3500);
  });
});

test('scoreBuild en mode endurance', async (t) => {
  const objectif = (conditions) => ({
    conditions, spells: [SORT], mode: SEARCH_MODES.ENDURANCE,
  });

  await t.test('le score vaut les pdv effectifs', () => {
    const vue = scoreBuild(statsDe({ pdvEffectifs: 4200 }), objectif([]));
    assert.equal(vue.score, 4200);
    assert.equal(vue.satisfied, true);
  });

  await t.test('les degats se calculent quand meme, pour l\'affichage', () => {
    const vue = scoreBuild(statsDe({}), objectif([]));
    assert.ok(vue.damage > 0, 'les degats du sort doivent etre comptes');
  });

  await t.test('une condition de degats tenue laisse le score intact', () => {
    const brut = scoreBuild(statsDe({ pdvEffectifs: 4200 }), objectif([])).damage;
    const vue = scoreBuild(statsDe({ pdvEffectifs: 4200 }),
      objectif([{ stat: STAT_DEGATS, target: Math.floor(brut), weight: 1 }]));

    assert.equal(vue.satisfied, true);
    assert.equal(vue.score, 4200);
  });

  await t.test('une condition de degats manquee rend un score negatif', () => {
    const vue = scoreBuild(statsDe({ pdvEffectifs: 4200 }),
      objectif([{ stat: STAT_DEGATS, target: 100000, weight: 2 }]));

    assert.equal(vue.satisfied, false);
    assert.ok(vue.score < 0, 'un build qui frappe trop peu passe sous tous les autres');
    assert.equal(vue.unmet[0].stat, STAT_DEGATS);
  });

  await t.test('un build plus resistant bat un build plus fort', () => {
    const resistant = scoreBuild(statsDe({ pdvEffectifs: 5000 }), objectif([]));
    const fragile = scoreBuild(statsDe({ pdvEffectifs: 3000 }), objectif([]));
    assert.ok(resistant.score > fragile.score);
  });

  await t.test('les autres conditions gardent leur role', () => {
    const vue = scoreBuild(statsDe({ pdvEffectifs: 4200, pa: 10 }),
      objectif([{ stat: 'pa', target: 12, weight: 500 }]));

    assert.equal(vue.satisfied, false);
    assert.equal(vue.score, -1000);
  });
});

test('la condition de degats vaut aussi en mode degats', () => {
  // Rien n'interdit de demander un plancher de degats a une recherche
  // ordinaire : la valeur se lit de la meme facon.
  const objectif = {
    conditions: [{ stat: STAT_DEGATS, target: 100000, weight: 1 }],
    spells: [SORT], mode: SEARCH_MODES.DAMAGE,
  };
  const vue = scoreBuild(statsDe({}), objectif);

  assert.equal(vue.satisfied, false);
  assert.ok(vue.score < 0);
});

test('maxViolations voit le plafond de degats', async (t) => {
  const conditions = [{ stat: STAT_DEGATS, target: 0, max: 500, absolute: true }];

  await t.test('sous le plafond, rien n\'est signale', () => {
    assert.deepEqual(maxViolations(conditions, statsDe({}), 400), []);
  });

  await t.test('au-dessus du plafond, la violation se signale', () => {
    const violations = maxViolations(conditions, statsDe({}), 900);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].stat, STAT_DEGATS);
    assert.equal(violations[0].value, 900);
  });
});
