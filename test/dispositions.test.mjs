/**
 * Le registre des dispositions.
 *
 * Une disposition qui pointe une feuille absente ne se voit pas : le lien
 * echoue en silence, la feuille se retire elle-meme, et l'ecran garde la
 * disposition de base sans rien dire. Ce test attrape la faute de frappe
 * dans un chemin, qu'aucun autre test ne verrait.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DISPOSITIONS } from '../web/layouts.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');

test('la premiere disposition est celle de la feuille de base', () => {
  assert.equal(DISPOSITIONS[0].cle, 'colonnes');
  assert.equal(DISPOSITIONS[0].fichier, null);
  assert.equal(DISPOSITIONS[0].plan, null);
});

test('chaque disposition porte une cle et un nom uniques', () => {
  const cles = DISPOSITIONS.map((d) => d.cle);
  const noms = DISPOSITIONS.map((d) => d.nom);
  assert.equal(new Set(cles).size, cles.length);
  assert.equal(new Set(noms).size, noms.length);
  for (const d of DISPOSITIONS) {
    assert.match(d.cle, /^[a-z]+$/);
    assert.ok(d.nom.length > 0);
  }
});

test('chaque feuille de disposition existe sur le disque', () => {
  for (const d of DISPOSITIONS) {
    if (!d.fichier) continue;
    assert.ok(existsSync(join(WEB, d.fichier)), `feuille absente : ${d.fichier}`);
  }
});

test('une disposition autre que la base porte une feuille et un plan', () => {
  for (const d of DISPOSITIONS.slice(1)) {
    assert.equal(typeof d.plan, 'function', `${d.cle} n'a pas de plan`);
    assert.ok(d.fichier, `${d.cle} n'a pas de feuille`);
  }
});
