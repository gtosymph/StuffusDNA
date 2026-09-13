/**
 * Compromis entre degats et survie.
 *
 * Le solveur rend le build qui frappe le plus fort sous les conditions. Le
 * joueur, lui, hesite : « si je lache 500 points de vie, je gagne combien ? ».
 * Le collecteur range chaque build croise dans une tranche de points de vie
 * et garde le plus fort de chaque tranche. La frontiere ne montre ensuite que
 * ce qui vaut l'echange : moins de vie pour PLUS de degats.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  creerPaliersSurvie, estTenable, frontiereSurvie, PAS_ENDURANCE, trancheDe,
} from '../src/solver/survie.mjs';

test('trancheDe range l\'endurance par pas', () => {
  assert.equal(trancheDe(0), 0);
  assert.equal(trancheDe(PAS_ENDURANCE - 1), 0);
  assert.equal(trancheDe(PAS_ENDURANCE), 1);
  assert.equal(trancheDe(4120, 250), 16);
  assert.equal(trancheDe(4120, 500), 8);
});

test('estTenable', async (t) => {
  const vue = (extra = {}) => ({
    invalid: [], violations: [], detail: { unmet: [] }, ...extra,
  });

  await t.test('un build sans defaut est tenable', () => {
    assert.equal(estTenable(vue()), true);
  });

  await t.test('un manque de vie seul reste tenable : c\'est ce que l\'on mesure', () => {
    assert.equal(estTenable(vue({ detail: { unmet: [{ stat: 'vitalite', missing: 300 }] } })), true);
    assert.equal(estTenable(vue({ detail: { unmet: [{ stat: 'pdv', missing: 300 }] } })), true);
  });

  await t.test('un manque sur une autre condition ne l\'est pas', () => {
    assert.equal(estTenable(vue({ detail: { unmet: [{ stat: 'pa', missing: 1 }] } })), false);
  });

  await t.test('une piece interdite ou un maximum franchi ne l\'est pas', () => {
    assert.equal(estTenable(vue({ invalid: [{}] })), false);
    assert.equal(estTenable(vue({ violations: [{ stat: 'pa' }] })), false);
  });

  await t.test('un maximum de vie franchi reste tenable', () => {
    // Le joueur qui borne sa vitalite veut justement voir au-dela.
    assert.equal(estTenable(vue({ violations: [{ stat: 'vitalite' }] })), true);
  });
});

test('creerPaliersSurvie', async (t) => {
  await t.test('garde le build le plus fort de chaque tranche', () => {
    const paliers = creerPaliersSurvie({ pas: 500 });
    paliers.proposer([1], { damage: 100, endurance: 4100 });
    paliers.proposer([2], { damage: 300, endurance: 4200 });
    paliers.proposer([3], { damage: 200, endurance: 4300 });
    paliers.proposer([4], { damage: 50, endurance: 3600 });

    const liste = paliers.liste();
    assert.deepEqual(liste.map((p) => p.genome), [[4], [2]]);
    assert.deepEqual(liste.map((p) => p.tranche), [7, 8]);
  });

  await t.test('la liste va de la tranche la plus basse a la plus haute', () => {
    const paliers = creerPaliersSurvie({ pas: 500 });
    paliers.proposer([1], { damage: 100, endurance: 5000 });
    paliers.proposer([2], { damage: 100, endurance: 3000 });
    paliers.proposer([3], { damage: 100, endurance: 4000 });
    assert.deepEqual(paliers.liste().map((p) => p.endurance), [3000, 4000, 5000]);
  });

  await t.test('une mesure absente ou fausse n\'entre pas', () => {
    const paliers = creerPaliersSurvie();
    for (const mesure of [{ damage: NaN, endurance: 4000 }, { damage: 100, endurance: undefined }, { damage: 100, endurance: -1 }]) {
      paliers.proposer([1], mesure);
    }
    assert.deepEqual(paliers.liste(), []);
  });

  await t.test('le meme genome ne prend qu\'une place', () => {
    const paliers = creerPaliersSurvie({ garde: 2 });
    for (let i = 0; i < 10; i += 1) paliers.proposer([1, 2], { damage: 100, endurance: 4000 });
    paliers.proposer([3, 4], { damage: 50, endurance: 4000 });

    // La description definitive inverse le classement : [3, 4] doit etre la.
    const definitif = (genome) => ({ damage: genome[0] === 3 ? 999 : 1, endurance: 4000 });
    assert.deepEqual(paliers.liste(definitif)[0].genome, [3, 4]);
  });

  await t.test('la description definitive decide de la tranche et des degats', () => {
    const paliers = creerPaliersSurvie({ pas: 500 });
    paliers.proposer([1], { damage: 100, endurance: 4100 });
    paliers.proposer([2], { damage: 200, endurance: 4200 });

    // Avec sa propre repartition de points, [1] monte en vie et change de
    // tranche ; [2] frappe moins que prevu.
    const definitif = (genome) => (genome[0] === 1
      ? { damage: 150, endurance: 4600, allocation: { vitalite: 100 } }
      : { damage: 120, endurance: 4200 });
    const liste = paliers.liste(definitif);

    assert.deepEqual(liste.map((p) => [p.tranche, p.damage, p.endurance]), [[8, 120, 4200], [9, 150, 4600]]);
    assert.deepEqual(liste[1].allocation, { vitalite: 100 }, 'la description passe entiere');
  });

  await t.test('deux pretendants qui finissent dans la meme tranche se departagent', () => {
    const paliers = creerPaliersSurvie({ pas: 500 });
    paliers.proposer([1], { damage: 100, endurance: 4100 });
    paliers.proposer([2], { damage: 200, endurance: 4600 });

    const definitif = (genome) => ({ damage: genome[0] === 1 ? 300 : 200, endurance: 4100 });
    const liste = paliers.liste(definitif);
    assert.equal(liste.length, 1);
    assert.deepEqual(liste[0].genome, [1]);
  });
});

test('frontiereSurvie', async (t) => {
  const palier = (endurance, damage) => ({ endurance, damage, tranche: Math.floor(endurance / 250) });

  await t.test('garde ce qui vaut l\'echange : moins de vie pour plus de degats', () => {
    const liste = [palier(3000, 900), palier(3500, 700), palier(4000, 800), palier(4500, 500)];
    assert.deepEqual(frontiereSurvie(liste).map((p) => p.endurance), [4500, 4000, 3000]);
  });

  await t.test('la liste rendue va de la plus haute vie a la plus basse', () => {
    const liste = [palier(3000, 900), palier(4500, 500)];
    assert.deepEqual(frontiereSurvie(liste).map((p) => p.endurance), [4500, 3000]);
  });

  await t.test('a degats egaux, la vie la plus haute gagne', () => {
    const liste = [palier(3000, 500), palier(4000, 500)];
    assert.deepEqual(frontiereSurvie(liste).map((p) => p.endurance), [4000]);
  });

  await t.test('une liste vide rend une liste vide, l\'entree ne bouge pas', () => {
    assert.deepEqual(frontiereSurvie([]), []);
    const liste = [palier(3000, 900), palier(4500, 500)];
    frontiereSurvie(liste);
    assert.deepEqual(liste.map((p) => p.endurance), [3000, 4500]);
  });
});

test('noteSousPlafond', async (t) => {
  const { noteSousPlafond } = await import('../src/solver/survie.mjs');
  const vue = (damage, endurance, extra = {}) => ({
    invalid: [], violations: [], detail: { unmet: [], damage }, stats: { pdvEffectifs: endurance }, score: damage, ...extra,
  });

  await t.test('sous le plafond, la note vaut les degats', () => {
    assert.equal(noteSousPlafond(vue(1000, 2900), 3000, 2), 1000);
  });

  await t.test('au-dessus du plafond, chaque point de vie en trop coute', () => {
    assert.equal(noteSousPlafond(vue(1000, 3200), 3000, 2), 600);
  });

  await t.test('un build qui ne tient pas le reste passe sous tout build tenable', () => {
    const casse = vue(5000, 2000, { detail: { unmet: [{ stat: 'pa' }], damage: 5000 }, score: -12 });
    assert.ok(noteSousPlafond(casse, 3000, 2) < noteSousPlafond(vue(1, 9000), 3000, 2));
    // Et deux builds casses se departagent encore sur leur score.
    const pire = vue(5000, 2000, { detail: { unmet: [{ stat: 'pa' }], damage: 5000 }, score: -500 });
    assert.ok(noteSousPlafond(casse, 3000, 2) > noteSousPlafond(pire, 3000, 2));
  });
});

test('tranchesAVisiter', async (t) => {
  const { tranchesAVisiter } = await import('../src/solver/survie.mjs');

  await t.test('les tranches sous celle du gagnant, la plus proche d\'abord', () => {
    assert.deepEqual(tranchesAVisiter(13, 4), [12, 11, 10, 9]);
  });

  await t.test('jamais sous zero', () => {
    assert.deepEqual(tranchesAVisiter(2, 4), [1, 0]);
    assert.deepEqual(tranchesAVisiter(0, 4), []);
  });
});

test('objectifDeTranche', async (t) => {
  const { objectifDeTranche, aConditionDeVie } = await import('../src/solver/survie.mjs');
  const objectif = {
    conditions: [{ stat: 'pa', target: 12, weight: 1000 }, { stat: 'vitalite', target: 3000, weight: 2 }],
    spells: [{ name: 'x' }], mode: 'degats',
  };

  await t.test('remplace les conditions de vie par un plafond absolu de la tranche', () => {
    const tranche = objectifDeTranche(objectif, 11, 250);
    assert.deepEqual(tranche.conditions[0], objectif.conditions[0]);
    assert.deepEqual(tranche.conditions[1], { stat: 'pdvEffectifs', target: 0, max: 2999, absolute: true, weight: 1 });
    assert.equal(tranche.spells, objectif.spells, 'le reste passe tel quel');
  });

  await t.test('aConditionDeVie', () => {
    assert.equal(aConditionDeVie(objectif), true);
    assert.equal(aConditionDeVie({ conditions: [{ stat: 'pa' }] }), false);
    assert.equal(aConditionDeVie({ conditions: [{ stat: 'pdv', target: 100 }] }), true);
    // Une condition de vie a zero ne demande rien : pas de compromis a montrer.
    assert.equal(aConditionDeVie({ conditions: [{ stat: 'vitalite', target: 0 }] }), false);
    // La condition sur l'endurance parle de vie elle aussi.
    assert.equal(aConditionDeVie({ conditions: [{ stat: 'pdvEffectifs', target: 4000 }] }), true);
  });

  await t.test('une condition sur l\'endurance s\'efface aussi', () => {
    const avecEndurance = {
      conditions: [{ stat: 'pa', target: 12 }, { stat: 'pdvEffectifs', target: 4000, weight: 2 }],
    };
    const tranche = objectifDeTranche(avecEndurance, 11, 250);
    assert.equal(tranche.conditions.length, 2);
    assert.deepEqual(tranche.conditions[1], { stat: 'pdvEffectifs', target: 0, max: 2999, absolute: true, weight: 1 });
  });
});
