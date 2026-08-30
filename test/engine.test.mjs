import test from 'node:test';
import assert from 'node:assert/strict';

import { availablePoints, checkAllocation, maxForBudget, pointCost } from '../src/engine/characteristics.mjs';
import { BASE, derive, setBonuses } from '../src/engine/build.mjs';
import { computeHit, computeLine, computeSpell } from '../src/engine/damage.mjs';
import { effectValue, effectsToStats } from '../src/data/catalog.mjs';
import { EFFECT_TO_STAT, IGNORED_EFFECTS, WEAPON_DAMAGE_EFFECTS } from '../src/data/effect-map.mjs';
import { emptyStats, STAT_KEYS } from '../src/data/stats.mjs';

test('cout des points de caracteristique', async (t) => {
  // Valeurs relevees sur une fiche de personnage de niveau 190.
  await t.test('la sagesse coute trois points par unite', () => {
    assert.equal(pointCost('sagesse', 190), 570);
  });

  await t.test('les caracteristiques elementaires suivent des paliers de cent', () => {
    assert.equal(pointCost('force', 100), 100);
    assert.equal(pointCost('agilite', 187), 274);
    assert.equal(pointCost('chance', 200), 300);
  });

  await t.test('la vitalite coute un point par unite', () => {
    assert.equal(pointCost('vitalite', 350), 350);
  });

  await t.test('une valeur nulle ou negative ne coute rien', () => {
    assert.equal(pointCost('force', 0), 0);
    assert.equal(pointCost('force', -20), 0);
  });
});

test('budget de points disponible', () => {
  assert.equal(availablePoints(190), 945);
  assert.equal(availablePoints(200), 995);
  assert.equal(availablePoints(1), 0);
});

test('une repartition complete laisse le bon reliquat', () => {
  // La fiche de reference annonce un point restant.
  const bilan = checkAllocation({ sagesse: 190, force: 100, agilite: 187 }, 190);
  assert.equal(bilan.spent, 944);
  assert.equal(bilan.remaining, 1);
  assert.equal(bilan.valid, true);
});

test('maxForBudget est l inverse de pointCost', () => {
  for (const value of [50, 100, 187, 250, 400]) {
    const cost = pointCost('agilite', value);
    assert.equal(maxForBudget('agilite', cost), value);
  }
});

test('statistiques derivees', async (t) => {
  const stats = { ...emptyStats(), vitalite: 2080, force: 550, chance: 230, sagesse: 600, agilite: 717 };
  const out = derive(stats, 190);

  await t.test('les points de vie suivent le niveau et la vitalite', () => {
    assert.equal(out.pdv, BASE.vieFixe + BASE.vieParNiveau * 190 + 2080);
    assert.equal(out.pdv, 3080);
  });

  await t.test('les pods dependent de la force', () => {
    assert.equal(out.pods, 3750);
  });

  await t.test('le tacle et la fuite suivent l agilite', () => {
    assert.equal(out.tacle, 71);
    assert.equal(out.fuite, 71);
  });

  await t.test('esquive et retrait suivent la sagesse', () => {
    assert.equal(out.esquivePa, 60);
    assert.equal(out.retraitPm, 60);
  });

  await t.test('la prospection part de cent et suit la chance', () => {
    assert.equal(out.prospection, 123);
  });

  await t.test('l initiative additionne les quatre caracteristiques', () => {
    assert.equal(out.initiative, 550 + 230 + 717);
  });

  await t.test('les points d action partent de la base du personnage', () => {
    // Une fiche de niveau 190 sans equipement annonce sept points d'action :
    // le personnage en gagne un au niveau cent.
    assert.equal(out.pa, BASE.pa + 1);
    assert.equal(out.pa, 7);
    assert.equal(out.pm, BASE.pm);
  });
});

test('valeur retenue pour un effet', async (t) => {
  await t.test('un champ to nul designe une valeur unique', () => {
    assert.equal(effectValue({ from: 1, to: 0 }), 1);
  });

  await t.test('une plage retient le jet maximal', () => {
    assert.equal(effectValue({ from: 251, to: 300 }), 300);
  });

  await t.test('une plage negative retient la valeur la plus forte', () => {
    assert.equal(effectValue({ from: -16, to: -20 }), -20);
  });
});

test('conversion des effets en statistiques', () => {
  const stats = effectsToStats([
    { effectId: 125, from: 251, to: 300 },  // Vitalite
    { effectId: 111, from: 1, to: 0 },      // PA
    { effectId: 153, from: 50, to: 60 },    // Malus de vitalite
  ]);
  assert.equal(stats.vitalite, 300 - 60);
  assert.equal(stats.pa, 1);
});

test('les tables d effets ne se recouvrent pas', () => {
  for (const id of EFFECT_TO_STAT.keys()) {
    assert.equal(WEAPON_DAMAGE_EFFECTS.has(id), false, `effet ${id} classe deux fois`);
    assert.equal(IGNORED_EFFECTS.has(id), false, `effet ${id} mappe et ignore`);
  }
  for (const mapping of EFFECT_TO_STAT.values()) {
    assert.ok(STAT_KEYS.includes(mapping.stat), `statistique inconnue: ${mapping.stat}`);
  }
});

test('calcul d un coup', async (t) => {
  const stats = { ...emptyStats(), agilite: 700, puissance: 160, dommagesAir: 100, dommages: 5 };

  await t.test('la caracteristique et la puissance amplifient la base', () => {
    // 32 * (100 + 860) / 100 + 105 = 307.2 + 105 = 412
    assert.equal(computeHit({ element: 'air', base: 32 }, stats), 412);
  });

  await t.test('les degats critiques s ajoutent seulement en coup critique', () => {
    const withCrit = { ...stats, dommagesCritiques: 20 };
    const normal = computeHit({ element: 'air', base: 32 }, withCrit);
    const critical = computeHit({ element: 'air', base: 32, critical: true }, withCrit);
    assert.equal(critical - normal, 20);
  });

  await t.test('les pourcentages de degats s appliquent en dernier', () => {
    const boosted = { ...stats, pctDommagesFinaux: 50 };
    assert.equal(computeHit({ element: 'air', base: 32 }, boosted), Math.floor(412.2 * 1.5));
  });

  await t.test('la poussee ignore les caracteristiques', () => {
    const pushed = { ...emptyStats(), dommagesPoussee: 20 };
    assert.equal(computeHit({ element: 'poussee', base: 100 }, pushed), 120);
  });

  await t.test('une base nulle ne fait aucun degat', () => {
    assert.equal(computeHit({ element: 'air', base: 0 }, stats), 0);
  });

  await t.test('un element inconnu leve une erreur', () => {
    assert.throws(() => computeHit({ element: 'boue', base: 10 }, stats), /Element inconnu/);
  });
});

test('moyenne ponderee par le taux critique', () => {
  const stats = { ...emptyStats(), agilite: 100, critique: 100 };
  const line = { element: 'air', min: 10, max: 10, critMin: 20, critMax: 20 };
  const result = computeLine(line, stats);
  // Avec cent pour cent de critique, la moyenne rejoint le coup critique.
  assert.equal(result.average, result.critical);
});

test('un sort additionne ses lignes, pour un seul lancer', () => {
  const stats = { ...emptyStats(), agilite: 100 };
  const spell = {
    apCost: 4,
    castsPerTurn: 2,
    lines: [
      { element: 'air', min: 10, max: 10 },
      { element: 'air', min: 10, max: 10 },
    ],
  };
  const single = computeHit({ element: 'air', base: 10 }, stats);
  const result = computeSpell(spell, stats);
  // La valeur d'un sort porte sur un lancer ; les lancers vont dans parTour.
  assert.equal(result.average, single * 2);
  assert.equal(result.parTour, single * 2 * 2);
  assert.equal(result.perAp, (single * 2) / 4);
});

test('les bonus de panoplie suivent le nombre de pieces', () => {
  // tiers[0] correspond a une seule piece equipee : il ne porte aucun bonus.
  const setById = new Map([[7, { fr: 'Essai', tiers: [{}, { force: 10 }, { force: 30 }] }]]);

  const une = setBonuses([{ setId: 7 }], setById);
  assert.deepEqual(une.stats, {});

  const deux = setBonuses([{ setId: 7 }, { setId: 7 }], setById);
  assert.equal(deux.stats.force, 10);

  const trois = setBonuses([{ setId: 7 }, { setId: 7 }, { setId: 7 }], setById);
  assert.equal(trois.stats.force, 30);
});

test('un malus reste un malus, quelle que soit la convention de la source', async (t) => {
  // La source stocke les malus en negatif. Appliquer en plus un signe negatif
  // niait deux fois et transformait le malus en bonus : 813 items etaient
  // touches, dont un anneau qui rendait +200 de Force au lieu de -200.
  await t.test('valeur deja negative', () => {
    const stats = effectsToStats([{ effectId: 157, from: -200, to: 0 }]);
    assert.equal(stats.force, -200);
  });

  await t.test('valeur stockee en positif', () => {
    const stats = effectsToStats([{ effectId: 153, from: 50, to: 60 }]);
    assert.equal(stats.vitalite, -60);
  });

  await t.test('un bonus reste positif', () => {
    const stats = effectsToStats([{ effectId: 118, from: 40, to: 60 }]);
    assert.equal(stats.force, 60);
  });

  await t.test('bonus et malus se compensent', () => {
    const stats = effectsToStats([
      { effectId: 118, from: 40, to: 60 },
      { effectId: 157, from: -200, to: 0 },
    ]);
    assert.equal(stats.force, -140);
  });
});
