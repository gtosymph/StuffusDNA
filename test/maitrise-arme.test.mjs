import test from 'node:test';
import assert from 'node:assert/strict';

import { computeHit, weaponAttack } from '../src/engine/damage.mjs';
import { damageValue } from '../src/solver/score.mjs';
import { emptyStats } from '../src/data/stats.mjs';

/** Statistiques vierges, completees par les valeurs donnees. */
function stats(valeurs = {}) {
  return { ...emptyStats(), ...valeurs };
}

/** Arme minimale du catalogue pour construire une attaque. */
const ARME = {
  id: 23270,
  fr: 'Éventails de Shihan',
  slot: 'arme',
  apCost: 3,
  usesPerTurn: 2,
  critProbability: 10,
  critBonus: 5,
  range: 1,
  weapon: [
    { element: 'eau', min: 14, max: 17, steal: false },
    { element: 'air', min: 14, max: 17, steal: false },
  ],
};

test('bonus de maitrise d\'arme', async (t) => {
  // Formule relevee dans le calcul de reference : la maitrise ajoute
  // floor(300 * (1 - T) + 360 * T) de puissance au coup d'arme,
  // avec T = clamp(5 + critique, 0, 100) / 100.
  await t.test('54 de critique donne 335 de puissance en plus', () => {
    const s = stats({ critique: 54 });
    const sans = computeHit({ element: 'air', base: 100, source: 'arme' }, s);
    const avec = computeHit({ element: 'air', base: 100, source: 'arme', maitrise: true }, s);
    assert.equal(sans, 100);
    assert.equal(avec, 435);
  });

  await t.test('le taux critique de la maitrise plafonne a 100', () => {
    const s = stats({ critique: 250 });
    const avec = computeHit({ element: 'air', base: 100, source: 'arme', maitrise: true }, s);
    assert.equal(avec, 460);
  });

  await t.test('sans critique, le taux plancher vaut 5', () => {
    const s = stats();
    const avec = computeHit({ element: 'air', base: 100, source: 'arme', maitrise: true }, s);
    // floor(300 * 0.95 + 360 * 0.05) = 303.
    assert.equal(avec, 403);
  });

  await t.test('la maitrise ne touche pas un sort', () => {
    const s = stats({ critique: 54 });
    const sort = computeHit({ element: 'air', base: 100, source: 'sort', maitrise: true }, s);
    assert.equal(sort, 100);
  });
});

test('familles de pourcentages en un seul arrondi', () => {
  // Le calcul de reference compose sorts/armes, melee/distance et finaux
  // en un seul produit, arrondi une fois : floor(480 * 1.06 * 1.11) = 564.
  // Un arrondi entre chaque famille donnerait 563.
  const s = stats({ pctDommagesMelee: 6, pctDommagesFinaux: 11 });
  assert.equal(computeHit({ element: 'air', base: 480, range: 'melee' }, s), 564);
});

test('attaque de l\'arme', async (t) => {
  await t.test('l\'attaque compte les utilisations par tour', () => {
    const attaque = weaponAttack(ARME);
    assert.equal(attaque.repeats, 2);
  });

  await t.test('la maitrise marque chaque ligne par defaut', () => {
    const attaque = weaponAttack(ARME);
    assert.ok(attaque.lines.every((l) => l.maitrise === true));
  });

  await t.test('l\'option desactive la maitrise', () => {
    const attaque = weaponAttack(ARME, { maitrise: false });
    assert.ok(attaque.lines.every((l) => !l.maitrise));
  });
});

test('le total de degats multiplie par les repetitions', () => {
  const s = stats({ critique: 0 });
  const sort = {
    name: 'Simple',
    baseCrit: 0,
    lines: [{ element: 'air', min: 10, max: 10, critMin: 10, critMax: 10 }],
  };
  const simple = damageValue([sort], s).total;
  const double = damageValue([{ ...sort, repeats: 2 }], s).total;
  assert.equal(double, simple * 2);
});

test('le build de reference atteint les degats affiches par RoxxSolver', () => {
  // Stats relevees sur un build reel (Xelor 190) : le calcul de reference
  // affiche 826 par coup d'arme, soit 1652 sur deux utilisations.
  const s = stats({
    critique: 54, puissance: 220, chance: 380, agilite: 750,
    dommages: 5, dommagesEau: 81, dommagesAir: 106, dommagesCritiques: 40,
    pctDommagesMelee: 6, pctDommagesFinaux: 11,
  });
  const attaque = weaponAttack(ARME);
  const { total } = damageValue([attaque], s);
  assert.equal(Math.floor(total), 1653);
});
