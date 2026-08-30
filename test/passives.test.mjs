import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasConfigurablePassive, listPassiveItems, normalizePassives, passiveBonuses,
} from '../src/data/passives.mjs';
import { aggregate } from '../src/engine/build.mjs';
import { STAT_KEYS } from '../src/data/stats.mjs';

const KNOWN = new Set(STAT_KEYS);

test('detection des items a passif', async (t) => {
  await t.test('un objet legendaire accepte un passif', () => {
    assert.equal(hasConfigurablePassive({ isLegendary: true, typeFr: 'Cape' }), true);
  });

  await t.test('un Dofus accepte un passif', () => {
    assert.equal(hasConfigurablePassive({ isLegendary: false, typeFr: 'Dofus' }), true);
  });

  await t.test('un item ordinaire n accepte pas de passif', () => {
    assert.equal(hasConfigurablePassive({ isLegendary: false, typeFr: 'Chapeau' }), false);
    assert.equal(hasConfigurablePassive(null), false);
  });

  await t.test('la liste est triee par nom', () => {
    const list = listPassiveItems([
      { id: 2, fr: 'Zeta', typeFr: 'Dofus', slot: 'artefact' },
      { id: 1, fr: 'Alpha', typeFr: 'Dofus', slot: 'artefact' },
      { id: 3, fr: 'Ignore', typeFr: 'Cape', slot: 'cape' },
    ]);
    assert.deepEqual(list.map((i) => i.fr), ['Alpha', 'Zeta']);
  });
});

test('normalisation de la configuration des passifs', async (t) => {
  await t.test('un passif desactive est ignore', () => {
    const { passives } = normalizePassives({ 100: { enabled: false, stats: { force: 50 } } }, KNOWN);
    assert.equal(passives.size, 0);
  });

  await t.test('un passif actif est retenu', () => {
    const { passives } = normalizePassives({ 100: { enabled: true, stats: { force: 50 } } }, KNOWN);
    assert.deepEqual(passives.get(100), { force: 50 });
  });

  await t.test('une statistique inconnue est ecartee avec un avertissement', () => {
    const { passives, warnings } = normalizePassives(
      { 100: { enabled: true, stats: { inconnue: 10, force: 5 } } }, KNOWN,
    );
    assert.deepEqual(passives.get(100), { force: 5 });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /inconnue/);
  });

  await t.test('une valeur non numerique est ecartee', () => {
    const { passives, warnings } = normalizePassives(
      { 100: { enabled: true, stats: { force: 'beaucoup' } } }, KNOWN,
    );
    assert.equal(passives.size, 0);
    assert.equal(warnings.length, 1);
  });

  await t.test('une configuration absente ne casse rien', () => {
    assert.equal(normalizePassives(null, KNOWN).passives.size, 0);
    assert.equal(normalizePassives(undefined, KNOWN).passives.size, 0);
  });
});

test('application des passifs', async (t) => {
  const passives = new Map([[42, { puissance: 100, pctDommagesFinaux: 10 }]]);

  await t.test('un passif compte seulement si l item est equipe', () => {
    const absent = passiveBonuses([{ id: 7 }], passives);
    assert.deepEqual(absent.stats, {});
    assert.deepEqual(absent.active, []);

    const present = passiveBonuses([{ id: 42 }], passives);
    assert.equal(present.stats.puissance, 100);
    assert.deepEqual(present.active, [42]);
  });

  await t.test('l agregation ajoute les passifs aux statistiques', () => {
    const items = [{ id: 42, setId: null, stats: { force: 50 } }];
    const sans = aggregate({ items, level: 190 }, new Map());
    const avec = aggregate({ items, level: 190, passives }, new Map());

    assert.equal(sans.stats.puissance, 0);
    assert.equal(avec.stats.puissance, 100);
    assert.equal(avec.stats.force, 50);
    assert.deepEqual(avec.passives, [42]);
  });
});
