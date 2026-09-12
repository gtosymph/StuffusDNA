/**
 * Bride d'intensite de la recherche.
 *
 * Les fils saturent le processeur tant qu'ils cherchent. L'intensite dit la
 * part du temps qu'ils passent a calculer ; le reste, ils se reposent entre
 * deux vagues. Une machine qui chauffe pendant une heure devient penible a
 * utiliser, et le joueur doit pouvoir laisser tourner sans y penser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { INTENSITE_MIN, INTENSITES, normaliserIntensite, reposApresVague } from '../src/solver/intensite.mjs';

test('plein regime ne se repose jamais', () => {
  assert.equal(reposApresVague(1000, 1), 0);
  assert.equal(reposApresVague(5000, 1), 0);
});

test('le repos tient la part de temps demandee', async (t) => {
  await t.test('a moitie, le fil se repose autant qu il travaille', () => {
    assert.equal(reposApresVague(1000, 0.5), 1000);
  });

  await t.test('a quatre dixiemes, une seconde de calcul vaut une seconde et demie de repos', () => {
    assert.equal(reposApresVague(1000, 0.4), 1500);
  });

  await t.test('la part travaillee se retrouve dans le cycle complet', () => {
    for (const part of [0.7, 0.5, 0.4, 0.25]) {
      const travail = 800;
      const cycle = travail + reposApresVague(travail, part);
      assert.ok(Math.abs(travail / cycle - part) < 0.001,
        `part ${part} : le fil a travaille ${(travail / cycle).toFixed(3)} du temps`);
    }
  });
});

test('un reglage absent ou illisible laisse le plein regime', () => {
  // La bride ne doit jamais ralentir la recherche par accident.
  for (const valeur of [undefined, null, '', 'beaucoup', Number.NaN, 0, -1]) {
    assert.equal(normaliserIntensite(valeur), 1, `valeur ${String(valeur)}`);
    assert.equal(reposApresVague(1000, valeur), 0, `valeur ${String(valeur)}`);
  }
});

test('une intensite hors bornes se ramene dans les bornes', () => {
  assert.equal(normaliserIntensite(5), 1);
  assert.equal(normaliserIntensite(0.001), INTENSITE_MIN);
  // Une valeur venue d'un champ de formulaire arrive en texte.
  assert.equal(normaliserIntensite('0.7'), 0.7);
});

test('une vague de duree nulle ou absurde ne fait pas attendre', () => {
  for (const duree of [0, -100, Number.NaN, undefined]) {
    assert.equal(reposApresVague(duree, 0.4), 0);
  }
});

test('les intensites proposees vont de la plus forte a la plus douce', () => {
  assert.equal(INTENSITES[0].valeur, 1);
  for (let i = 1; i < INTENSITES.length; i += 1) {
    assert.ok(INTENSITES[i].valeur < INTENSITES[i - 1].valeur);
    assert.ok(INTENSITES[i].valeur >= INTENSITE_MIN);
  }
});
