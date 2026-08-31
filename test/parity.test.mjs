/**
 * Tests de parite.
 *
 * Les valeurs attendues proviennent d'un build de reference et d'essais
 * controles, condition par condition. Ils verrouillent la fonction de score
 * et la formule de degats.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeLine, computeSpell, criticalRate } from '../src/engine/damage.mjs';
import { conditionValue } from '../src/solver/condition-value.mjs';
import { scoreBuild, SEARCH_MODES } from '../src/solver/score.mjs';
import { emptyStats } from '../src/data/stats.mjs';

/** Statistiques relevees sur le build de reference, niveau 190. */
const REFERENCE_STATS = Object.freeze({
  ...emptyStats(),
  pdv: 3080, pods: 3750, critique: 43, soins: 10, prospection: 258,
  sagesse: 600, resCritique: 0, dommagesNeutre: 47, dommages: 5,
  pctDommagesArmes: 0, pctDommagesDistance: 6, pctDommagesSorts: 6,
  initiative: 2207, tacle: 71, invocations: 6, pa: 12, pm: 5, po: 2,
  intelligence: 460, puissance: 160, dommagesFeu: 107, dommagesCritiques: 15,
});

/** Les seize conditions du build de reference. */
const REFERENCE_CONDITIONS = Object.freeze([
  { stat: 'pa', target: 12, weight: 500, max: 12 },
  { stat: 'pm', target: 5, weight: 500, absolute: true },
  { stat: 'po', target: 2, weight: 250 },
  { stat: 'vitalite', target: 4000, weight: 1 },
  { stat: 'pods', target: 5000, weight: 1 },
  { stat: 'critique', target: 75, weight: 50, max: 100, absolute: true },
  { stat: 'soins', target: 60, weight: 30 },
  { stat: 'prospection', target: 200, weight: 15 },
  { stat: 'sagesse', target: 300, weight: 15 },
  { stat: 'resCritique', target: 100, weight: 10 },
  { stat: 'dommagesNeutre', target: 150, weight: 25 },
  { stat: 'pctDommagesArmes', target: 1, weight: 75 },
  { stat: 'pctDommagesDistance', target: 1, weight: 75 },
  { stat: 'initiative', target: 2000, weight: 1, absolute: true },
  { stat: 'tacle', target: 70, weight: 20 },
  { stat: 'invocations', target: 6, weight: 125, max: 6 },
]);

test('resolution des valeurs de condition', async (t) => {
  await t.test('la condition vitalite lit les points de vie', () => {
    // Essai controle : objectif 5000, poids 1, score obtenu -1920.
    assert.equal(conditionValue('vitalite', REFERENCE_STATS), 3080);
    assert.equal(5000 - conditionValue('vitalite', REFERENCE_STATS), 1920);
  });

  await t.test('une condition de degats ajoute la statistique Dommages', () => {
    // Essai controle : objectif 200, poids 1, score obtenu -148.
    assert.equal(conditionValue('dommagesNeutre', REFERENCE_STATS), 52);
    assert.equal(200 - conditionValue('dommagesNeutre', REFERENCE_STATS), 148);
  });

  await t.test('les autres conditions lisent la statistique telle quelle', () => {
    assert.equal(conditionValue('tacle', REFERENCE_STATS), 71);
    assert.equal(conditionValue('prospection', REFERENCE_STATS), 258);
  });
});

test('le score reproduit la penalite du build de reference', () => {
  const result = scoreBuild(REFERENCE_STATS, {
    conditions: REFERENCE_CONDITIONS,
    spells: [],
    mode: SEARCH_MODES.DAMAGE,
  });

  assert.equal(result.penalty, 8795);
  assert.equal(result.score, -8795);
  assert.equal(result.satisfied, false);
  assert.equal(result.unmet.length, 7);
});

test('un objectif depasse n apporte aucun bonus', () => {
  // Essai controle : objectif 20 sur une valeur de 52, aucune penalite.
  const result = scoreBuild(REFERENCE_STATS, {
    conditions: [{ stat: 'dommagesNeutre', target: 20, weight: 1 }],
    spells: [],
    mode: SEARCH_MODES.DAMAGE,
  });

  assert.equal(result.penalty, 0);
  assert.equal(result.satisfied, true);
  assert.equal(result.score, 0);
});

test('le score bascule sur les degats une fois les conditions satisfaites', () => {
  const spells = [{ name: 'Essai', baseCrit: 0, lines: [{ element: 'feu', min: 10, max: 10 }] }];
  const result = scoreBuild(REFERENCE_STATS, {
    conditions: [{ stat: 'tacle', target: 10, weight: 1 }],
    spells,
    mode: SEARCH_MODES.DAMAGE,
  });

  assert.equal(result.satisfied, true);
  assert.equal(result.score, result.damage);
  assert.ok(result.score > 0);
});

test('un build satisfait bat toujours un build en defaut', () => {
  const conditions = [{ stat: 'tacle', target: 100, weight: 1 }];
  const enDefaut = scoreBuild(REFERENCE_STATS, { conditions, mode: SEARCH_MODES.DAMAGE });
  const satisfait = scoreBuild(
    { ...REFERENCE_STATS, tacle: 100 },
    { conditions, mode: SEARCH_MODES.DAMAGE },
  );
  assert.ok(satisfait.score > enDefaut.score);
});

test('degats d un sort du build de reference', async (t) => {
  // Sort Feu, base 23 a 26, base critique 28 a 31, bonus de critique du sort 10.
  const line = {
    element: 'feu', min: 23, max: 26, critMin: 28, critMax: 31,
    source: 'sort', range: 'distance',
  };

  await t.test('le coup non critique vaut 323', () => {
    const result = computeLine(line, REFERENCE_STATS, 0);
    assert.equal(result.normal, 323);
  });

  await t.test('le coup critique vaut 380', () => {
    const result = computeLine(line, REFERENCE_STATS, 1);
    assert.equal(result.critical, 380);
  });

  await t.test('la moyenne vaut 353 avec le bonus de critique du sort', () => {
    const spell = { baseCrit: 10, lines: [line] };
    const result = computeSpell(spell, REFERENCE_STATS);
    assert.equal(Math.round(result.average), 353);
  });
});

test('taux de coup critique', async (t) => {
  await t.test('le bonus du sort s ajoute au taux du personnage', () => {
    assert.equal(criticalRate(REFERENCE_STATS, 10), 0.53);
  });

  await t.test('le taux ne depasse jamais cent pour cent', () => {
    assert.equal(criticalRate({ critique: 90 }, 40), 1);
  });

  await t.test('le taux ne descend jamais sous zero', () => {
    assert.equal(criticalRate({ critique: -20 }, 0), 0);
  });
});

test('points d action de base selon le niveau', async (t) => {
  // Une fiche de niveau 190 sans equipement annonce sept points d'action
  // et trois points de mouvement.
  const { derive, BASE } = await import('../src/engine/build.mjs');

  await t.test('sept points d action au niveau 190', () => {
    assert.equal(derive({ ...emptyStats() }, 190).pa, 7);
  });

  await t.test('six points d action avant le niveau cent', () => {
    assert.equal(derive({ ...emptyStats() }, 99).pa, 6);
    assert.equal(derive({ ...emptyStats() }, 100).pa, 7);
  });

  await t.test('trois points de mouvement a tout niveau', () => {
    assert.equal(derive({ ...emptyStats() }, 190).pm, BASE.pm);
    assert.equal(derive({ ...emptyStats() }, 190).pm, 3);
  });

  await t.test('la penalite du scenario depouille vaut quatre mille', () => {
    // PA : 12 vise, 7 obtenus, poids 500 -> 2500.
    // PM :  6 vises, 3 obtenus, poids 500 -> 1500.
    const stats = derive({ ...emptyStats() }, 190);
    const r = scoreBuild(stats, {
      conditions: [
        { stat: 'pa', target: 12, weight: 500, max: 12, absolute: true },
        { stat: 'pm', target: 6, weight: 500 },
      ],
      spells: [], mode: SEARCH_MODES.DAMAGE,
    });
    assert.equal(r.penalty, 4000);
    assert.equal(r.score, -4000);
  });
});

test('palier de panoplie selon le nombre de pieces', async (t) => {
  // Le jeu annonce, pour trois pieces de la Panoplie du YeCh'Ti :
  // 200 Vitalite, 30 Force, 30 Intelligence, 30 Agilite, 10 % Critique,
  // 1 PA, 10 Esquive PA, 10 Esquive PM.
  const { setBonuses } = await import('../src/engine/build.mjs');

  const setById = new Map([[1, {
    fr: 'Essai',
    tiers: [
      {},
      { vitalite: 100, critique: 5 },
      { vitalite: 200, critique: 10, pa: 1 },
    ],
  }]]);
  const piece = { setId: 1 };

  await t.test('une seule piece ne donne aucun bonus', () => {
    assert.deepEqual(setBonuses([piece], setById).stats, {});
  });

  await t.test('deux pieces donnent le premier palier', () => {
    const { stats } = setBonuses([piece, piece], setById);
    assert.equal(stats.vitalite, 100);
    assert.equal(stats.critique, 5);
    assert.equal(stats.pa, undefined);
  });

  await t.test('trois pieces donnent le palier suivant', () => {
    const { stats } = setBonuses([piece, piece, piece], setById);
    assert.equal(stats.vitalite, 200);
    assert.equal(stats.critique, 10);
    assert.equal(stats.pa, 1);
  });
});

test('mode caracteristiques, sans aucun sort', async (t) => {
  // Mesures relevees sur une valeur effective de 54 (39 + 15) :
  //   objectif 10, poids 1, sans maximum -> 44
  //   objectif 10, poids 2, sans maximum -> 88
  //   objectif 10, poids 2, maximum 30   -> 40
  const stats = { ...emptyStats(), dommagesNeutre: 39, dommages: 15 };
  const essai = (target, weight, max) => scoreBuild(stats, {
    conditions: [{ stat: 'dommagesNeutre', target, weight, max }],
    spells: [], mode: SEARCH_MODES.STATS,
  }).score;

  await t.test('l ecart est pondere par le poids', () => {
    assert.equal(essai(10, 1, null), 44);
    assert.equal(essai(10, 2, null), 88);
  });

  await t.test('le maximum tronque la valeur comptee', () => {
    assert.equal(essai(10, 2, 30), 40);
  });

  await t.test('un objectif non atteint donne un score negatif', () => {
    assert.equal(essai(100, 1, null), 54 - 100);
  });

  await t.test('deux builds inegaux ne sont plus ex aequo', () => {
    const conditions = [{ stat: 'force', target: 100, weight: 1 }];
    const faible = scoreBuild({ ...emptyStats(), force: 120 }, { conditions, spells: [], mode: SEARCH_MODES.STATS });
    const fort = scoreBuild({ ...emptyStats(), force: 900 }, { conditions, spells: [], mode: SEARCH_MODES.STATS });
    assert.equal(faible.score, 20);
    assert.equal(fort.score, 800);
    assert.ok(fort.score > faible.score);
  });

  await t.test('le mode degats ignore toujours le depassement', () => {
    const r = scoreBuild(stats, {
      conditions: [{ stat: 'dommagesNeutre', target: 10, weight: 2, max: 30 }],
      spells: [], mode: SEARCH_MODES.DAMAGE,
    });
    assert.equal(r.penalty, 0);
    assert.equal(r.score, 0);
  });
});

test('Sables du Temps : parite mesuree contre RoxxSolver', async (t) => {
  // Build reel du 2026-08-30 : RoxxSolver montrait 439/504 en melee.
  // Les familles de pourcentages composent un seul produit, arrondi une
  // seule fois apres l'arrondi de la base : c'est l'ordre du calcul de
  // reference, verifie a l'unite pres.
  const stats = {
    ...emptyStats(),
    intelligence: 560, puissance: 160, dommagesFeu: 104, dommages: 5,
    pctDommagesSorts: 6, pctDommagesMelee: 6, critique: 52,
  };
  const ligne = { element: 'feu', min: 33, max: 36, critMin: 40, critMax: 43, source: 'sort' };

  await t.test('sans portee, seule la famille sorts s applique', () => {
    const result = computeLine({ ...ligne, range: null }, stats, 0);
    assert.equal(result.normal, 414);
    assert.equal(computeLine({ ...ligne, range: null }, stats, 1).critical, 475);
  });

  await t.test('en melee, les valeurs RoxxSolver sont reproduites a l unite', () => {
    const enMelee = { ...ligne, range: 'melee' };
    assert.equal(computeLine(enMelee, stats, 0).normal, 439);
    assert.equal(computeLine(enMelee, stats, 1).critical, 504);
    const sort = { baseCrit: 15, lines: [enMelee] };
    assert.equal(Math.floor(computeSpell(sort, stats).average), 482);
  });
});
