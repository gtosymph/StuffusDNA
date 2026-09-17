import assert from 'node:assert/strict';
import test from 'node:test';

import { enBase64 } from '../src/partage/base64.mjs';
import { ecrire } from '../src/partage/msgpack.mjs';
import {
  CASES, casesDofusbook, chargeDofusbook, lienDofusbook, statistiquesInnees,
} from '../src/partage/dofusbook.mjs';
import { aggregate, derive } from '../src/engine/build.mjs';

/** Pieces portees, telles que l'interface les range : `emplacement:rang`. */
const porter = (paires) => new Map(paires.map(([cle, id]) => [cle, { id }]));

test('ecrire : les entiers prennent la plus petite forme', () => {
  assert.deepEqual([...ecrire(0)], [0x00]);
  assert.deepEqual([...ecrire(127)], [0x7f]);
  assert.deepEqual([...ecrire(170)], [0xcc, 0xaa]);
  assert.deepEqual([...ecrire(1030)], [0xcd, 0x04, 0x06]);
  assert.deepEqual([...ecrire(100000)], [0xce, 0x00, 0x01, 0x86, 0xa0]);
});

test('ecrire : tableaux, tables et chaines', () => {
  assert.deepEqual([...ecrire([1, 2])], [0x92, 0x01, 0x02]);
  assert.deepEqual([...ecrire({ 3: 7 })], [0x81, 0xa1, 0x33, 0x07]);
  assert.deepEqual([...ecrire(new Array(16).fill(0))], [0xdc, 0x00, 0x10, ...new Array(16).fill(0)]);
});

test('ecrire : refuse ce qu\'elle ne saurait pas relire', () => {
  assert.throws(() => ecrire(-1), TypeError);
  assert.throws(() => ecrire(1.5), TypeError);
  assert.throws(() => ecrire(null), TypeError);
  assert.throws(() => ecrire(true), TypeError);
});

test('enBase64 : les trois restes de division', () => {
  assert.equal(enBase64(Uint8Array.from([])), '');
  assert.equal(enBase64(Uint8Array.from([0x4d])), 'TQ==');
  assert.equal(enBase64(Uint8Array.from([0x4d, 0x61])), 'TWE=');
  assert.equal(enBase64(Uint8Array.from([0x4d, 0x61, 0x6e])), 'TWFu');
  assert.equal(enBase64(Uint8Array.from([0xff, 0xfe, 0xfd])), '//79');
});

test('statistiquesInnees : le personnage nu, au niveau demande', () => {
  assert.deepEqual(statistiquesInnees(196), {
    0: 1030, 6: 7, 7: 3, 9: 100, 11: 1, 23: 1000,
  });
  // Le point d'action arrive au niveau cent, pas avant.
  assert.equal(statistiquesInnees(99)[6], 6);
  assert.equal(statistiquesInnees(100)[6], 7);
});

test('statistiquesInnees : les parchemins entrent dans la base', () => {
  const table = statistiquesInnees(200, { vitalite: true, chance: true });
  assert.equal(table['0'], 1050 + 100);
  assert.equal(table['4'], 100);
  assert.equal(table['1'], undefined, 'une caracteristique sans parchemin ne s\'ecrit pas');
});

/*
 * La traduction double ce que le moteur pose en debut de calcul. Ce test tient
 * les deux cotes ensemble : si le moteur change la base du personnage, le lien
 * Dofusbook doit changer avec lui, ou ce test tombe.
 */
test('statistiquesInnees : la meme base que le moteur', () => {
  for (const niveau of [1, 99, 100, 196, 200]) {
    const brut = aggregate({ items: [], level: niveau }, new Map());
    const attendu = derive(brut.stats, niveau);
    const table = statistiquesInnees(niveau);
    // Cote Dofusbook la case « vitalite » de la base porte les points de vie
    // du personnage nu, que le moteur nomme pdv.
    assert.equal(table['0'], attendu.pdv, `points de vie au niveau ${niveau}`);
    assert.equal(table['6'], attendu.pa, `pa au niveau ${niveau}`);
    assert.equal(table['7'], attendu.pm, `pm au niveau ${niveau}`);
  }
});

test('casesDofusbook : seize cases, zero quand elle est vide', () => {
  const cases = casesDofusbook(porter([['arme:0', 32223], ['anneau:1', 11738]]));
  assert.equal(cases.length, 16);
  assert.equal(cases[CASES.indexOf('arme:0')], 32223);
  assert.equal(cases[CASES.indexOf('anneau:1')], 11738);
  assert.equal(cases[CASES.indexOf('anneau:0')], 0);
  assert.equal(cases.filter((id) => id !== 0).length, 2);
});

test('casesDofusbook : aucune piece portee reste seize zeros', () => {
  assert.deepEqual(casesDofusbook(new Map()), new Array(16).fill(0));
  assert.deepEqual(casesDofusbook(undefined), new Array(16).fill(0));
});

test('chargeDofusbook : les six cles, toutes exigees par la page', () => {
  const charge = chargeDofusbook({
    niveau: 200, allocation: { chance: 300 }, scrolls: {}, equipped: new Map(),
  });
  assert.deepEqual(Object.keys(charge), ['0', '1', '2', '3', '4', '5']);
  assert.deepEqual(charge[1], [0, 0, 0, 0, 300, 0], 'l\'ordre est celui de la fiche du jeu');
  assert.equal(charge[2], 200);
  assert.equal(charge[3], 0);
  assert.deepEqual(charge[4], { 5: 2, 6: 6 }, 'deux anneaux et six Dofus');
});

test('chargeDofusbook : un niveau hors du jeu leve', () => {
  assert.throws(() => chargeDofusbook({ niveau: 0 }), TypeError);
  assert.throws(() => chargeDofusbook({ niveau: null }), TypeError);
});

/*
 * Le lien releve sur Dofusbook, refabrique piece par piece.
 *
 * Il vient d'un build reel passe par le solveur de reference le 2026-09-17,
 * et la page l'ouvre sur le bon stuff. Tant que cet octet-la sort, le format
 * est le bon ; le jour ou Dofusbook en change, ce test le dira.
 */
test('lienDofusbook : refabrique un lien releve sur leur page', () => {
  const attendu = 'hqEwhqEwzQQGoTYHoTcDoTlkojExAaIyM80D6KExlgDMqgDMyADMhKEyzMShMwChNIKhNQKhN'
    + 'gahNdwAEM01Wc0s0s0tvc01Ws0szM0t2s0t2s0C480bg80Cts0DzM1xz80C4c194M19382B+Q==';

  const lien = lienDofusbook({
    niveau: 196,
    scrolls: {},
    allocation: { sagesse: 170, intelligence: 200, agilite: 132 },
    equipped: porter([
      ['cape:0', 13657], ['chapeau:0', 11474], ['ceinture:0', 11709], ['bottes:0', 13658],
      ['amulette:0', 11468], ['anneau:0', 11738], ['anneau:1', 11738],
      ['artefact:0', 739], ['artefact:1', 7043], ['artefact:2', 694],
      ['artefact:3', 972], ['artefact:4', 29135], ['artefact:5', 737],
      ['bouclier:0', 32224], ['arme:0', 32223], ['monture:0', 33273],
    ]),
  });

  assert.equal(decodeURIComponent(new URL(lien).searchParams.get('stuff')), attendu);
});
