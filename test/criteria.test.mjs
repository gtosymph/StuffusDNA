import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateCriteria, isEquipable, parseCriteria, statConditions, STAT_CRITERIA,
} from '../src/data/criteria.mjs';
import { unequipableItems } from '../src/engine/build.mjs';

/** Statistiques d'un personnage bien dote. */
const FORT = { force: 150, agilite: 120, vitalite: 200, pa: 11, pm: 5, sagesse: 150, intelligence: 50, chance: 50 };
/** Statistiques d'un personnage limite. */
const FAIBLE = { force: 10, agilite: 10, vitalite: 10, pa: 12, pm: 6, sagesse: 10, intelligence: 150, chance: 150 };

const check = (source, stats, extra = {}) =>
  evaluateCriteria(parseCriteria(source), { stats, ...extra });

test('analyse du mini langage', async (t) => {
  await t.test('une condition simple est lue', () => {
    const node = parseCriteria('CS>99');
    assert.equal(node.type, 'criterion');
    assert.equal(node.code, 'CS');
    assert.equal(node.operator, '>');
    assert.equal(node.value, 99);
  });

  await t.test('le et lie deux conditions', () => {
    assert.equal(parseCriteria('CS>99&CA>99').type, 'and');
  });

  await t.test('le ou lie deux conditions', () => {
    assert.equal(parseCriteria('CS>99|CA>99').type, 'or');
  });

  await t.test('une source vide ne donne aucun arbre', () => {
    assert.equal(parseCriteria(''), null);
    assert.equal(parseCriteria(null), null);
  });
});

test('evaluation des conditions de caracteristique', async (t) => {
  await t.test('toutes les conditions doivent tenir avec un et', () => {
    assert.equal(check('CS>99&CA>99&CV>99', FORT), true);
    assert.equal(check('CS>99&CA>99&CV>99', FAIBLE), false);
  });

  await t.test('une seule condition suffit avec un ou', () => {
    assert.equal(check('CS>99|CA>500', FORT), true);
    assert.equal(check('CS>500|CA>500', FORT), false);
  });

  await t.test('les bornes hautes sont strictes', () => {
    // Une arme qui demande moins de douze points d'action.
    assert.equal(check('CP<12', FORT), true);
    assert.equal(check('CP<12', FAIBLE), false);
  });

  await t.test('l operateur different est pris en compte', () => {
    assert.equal(check('CS!150', FORT), false);
    assert.equal(check('CS!10', FORT), true);
  });

  await t.test('les parentheses groupent les conditions', () => {
    assert.equal(check('(CS>500|CA>99)&CV>99', FORT), true);
    assert.equal(check('(CS>500|CA>500)&CV>99', FORT), false);
  });
});

test('conditions hors de portee du solveur', async (t) => {
  await t.test('une quete inconnue ne bloque pas l item', () => {
    assert.equal(check('Qa=166', FAIBLE), true);
  });

  await t.test('un fragment illisible ne bloque pas l item', () => {
    assert.equal(check('PJ>2,40|PJ>24,40', FAIBLE), true);
    assert.equal(check('(Sc=968&SG=08&Sd>18)|PX=A', FAIBLE), true);
  });

  await t.test('la classe compte seulement si elle est renseignee', () => {
    assert.equal(check('PG=3', FAIBLE), true);
    assert.equal(check('PG=3', FAIBLE, { classe: 3 }), true);
    assert.equal(check('PG=3', FAIBLE, { classe: 8 }), false);
  });

  await t.test('le sexe compte seulement s il est renseigne', () => {
    assert.equal(check('PS=1', FAIBLE), true);
    assert.equal(check('PS=1', FAIBLE, { sexe: 1 }), true);
    assert.equal(check('PS=1', FAIBLE, { sexe: 0 }), false);
  });
});

test('extraction des conditions verifiables', async (t) => {
  await t.test('seules les conditions de statistique ressortent', () => {
    const found = statConditions('CP<12&CM<6&CW>99');
    assert.deepEqual(found.map((c) => c.stat), ['pa', 'pm', 'sagesse']);
  });

  await t.test('une condition hors portee ne ressort pas', () => {
    assert.deepEqual(statConditions('Qa=166&PG=3'), []);
  });

  await t.test('chaque code connu vise une statistique', () => {
    for (const [code, stat] of Object.entries(STAT_CRITERIA)) {
      const found = statConditions(`${code}>10`);
      assert.equal(found[0]?.stat, stat, `code ${code}`);
    }
  });
});

test('un item sans condition reste equipable', () => {
  assert.equal(isEquipable({ criteria: null }, { stats: FAIBLE }), true);
  assert.equal(isEquipable({}, { stats: FAIBLE }), true);
});

test('le moteur signale les items non equipables', async (t) => {
  const arme = { fr: 'Arme exigeante', criteriaTree: parseCriteria('CP<12') };
  const cape = { fr: 'Cape libre', criteriaTree: null };

  await t.test('un build conforme ne signale rien', () => {
    assert.deepEqual(unequipableItems([arme, cape], FORT), []);
  });

  await t.test('un build en defaut signale la piece fautive', () => {
    const invalid = unequipableItems([arme, cape], FAIBLE);
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0].fr, 'Arme exigeante');
  });
});
