/**
 * Recherche sur les seules conditions, sans sort ni arme.
 *
 * Le mode caracteristiques note un build par la somme ponderee de ses ecarts
 * a l'objectif. Pris seul, ce calcul laisse un depassement payer un manque :
 * six cents points de Chance en trop compensent le point de portee absent, et
 * le solveur rend un build qui ne tient pas les conditions demandees.
 *
 * La regle attendue est celle du mode degats : tout build qui tient toutes
 * ses conditions bat tout build qui en manque une, quel que soit l'ecart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreBuild, SEARCH_MODES } from '../src/solver/score.mjs';
import { emptyStats } from '../src/data/stats.mjs';

/** Conditions du cas signale : douze PA, cinq PM, six PO, chance et degats eau. */
const CONDITIONS = Object.freeze([
  { stat: 'pa', target: 12, weight: 1 },
  { stat: 'pm', target: 5, weight: 1 },
  { stat: 'po', target: 6, weight: 1 },
  { stat: 'chance', target: 600, weight: 1 },
  { stat: 'dommagesEau', target: 100, weight: 1 },
]);

/** Note un build sur ces conditions, sans aucun sort. */
const noter = (valeurs) => scoreBuild(
  { ...emptyStats(), ...valeurs },
  { conditions: CONDITIONS, spells: [], mode: SEARCH_MODES.STATS },
);

/** Build qui tient les cinq conditions, sans rien de plus. */
const JUSTE = { pa: 12, pm: 5, po: 6, chance: 600, dommagesEau: 100 };

test('un depassement ne paie pas une condition manquante', async (t) => {
  await t.test('le build qui tient tout bat celui qui manque la portee', () => {
    const tenu = noter(JUSTE);
    // Six cents points de Chance de plus, mais un point de portee en moins.
    const manqueUnPo = noter({ ...JUSTE, po: 5, chance: 1200 });

    assert.equal(tenu.satisfied, true);
    assert.equal(manqueUnPo.satisfied, false);
    assert.ok(tenu.score > manqueUnPo.score,
      `un build en defaut a marque ${manqueUnPo.score} contre ${tenu.score}`);
  });

  await t.test('aucun depassement ne rattrape un manque, si grand soit-il', () => {
    const tenu = noter(JUSTE);
    for (const chance of [1000, 5000, 100000]) {
      const enDefaut = noter({ ...JUSTE, pa: 11, chance });
      assert.equal(enDefaut.satisfied, false);
      assert.ok(tenu.score > enDefaut.score, `chance=${chance} a rattrape un PA manquant`);
    }
  });

  await t.test('un build en defaut sur deux conditions passe apres celui qui n en manque qu une', () => {
    const uneManquante = noter({ ...JUSTE, po: 5 });
    const deuxManquantes = noter({ ...JUSTE, po: 5, pm: 4 });
    assert.ok(uneManquante.score > deuxManquantes.score);
  });
});

test('entre deux builds qui tiennent tout, le plus fourni gagne', () => {
  const juste = noter(JUSTE);
  const genereux = noter({ ...JUSTE, chance: 900 });

  assert.equal(juste.satisfied, true);
  assert.equal(genereux.satisfied, true);
  assert.ok(genereux.score > juste.score);
  assert.equal(genereux.score - juste.score, 300);
});

test('un maximum ne descend jamais sous l objectif', () => {
  // Un maximum place sous l'objectif se contredit lui-meme. S'il tronquait la
  // valeur sous l'objectif, un build satisfait recevrait un score negatif et
  // repasserait derriere des builds en defaut.
  const contradictoire = scoreBuild(
    { ...emptyStats(), force: 500 },
    {
      conditions: [{ stat: 'force', target: 400, weight: 1, max: 100 }],
      spells: [], mode: SEARCH_MODES.STATS,
    },
  );

  assert.equal(contradictoire.satisfied, true);
  assert.ok(contradictoire.score >= 0, `score negatif malgre les conditions tenues : ${contradictoire.score}`);
});

test('le poids d une condition pese sur l ordre des builds en defaut', () => {
  const conditions = [
    { stat: 'pa', target: 12, weight: 500 },
    { stat: 'chance', target: 600, weight: 1 },
  ];
  const note = (valeurs) => scoreBuild({ ...emptyStats(), ...valeurs },
    { conditions, spells: [], mode: SEARCH_MODES.STATS }).score;

  // Manquer un PA lourdement pondere coute plus cher que manquer de la chance.
  const sansPa = note({ pa: 11, chance: 600 });
  const sansChance = note({ pa: 12, chance: 500 });
  assert.ok(sansChance > sansPa);
});
