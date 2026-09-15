/**
 * Mode de recherche mixte : maximiser les degats ET les pdv effectifs.
 *
 * Les deux modes purs posent une question tranchee — frapper le plus fort, ou
 * tenir le plus longtemps. Un joueur reel veut les deux, dans une proportion
 * qui depend de ce qu'il joue. Le mode mixte lui donne un seul reglage : la
 * part des degats.
 *
 * Le score est une moyenne geometrique ponderee :
 *
 *     score = degats^a * pdvEffectifs^(1 - a)
 *
 * Cette forme, et pas une somme ponderee, pour trois raisons mesurables ici :
 *   - a = 1 et a = 0 redonnent EXACTEMENT les deux modes purs ;
 *   - multiplier une mesure par une constante ne change pas le classement,
 *     alors qu'une somme ponderee en depend entierement ;
 *   - le poids agit sur des pourcentages, donc sans echelle a regler.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliserPart, scoreBuild, scoreMixte, SEARCH_MODES, tauxDechange,
} from '../src/solver/score.mjs';

/** Sort a degats fixes : les nombres se verifient a la main. */
const SORT = { name: 'coup', lines: [{ element: 'feu', min: 100, max: 100 }], repeats: 1 };

const statsDe = (apports) => ({ pdv: 3000, pdvEffectifs: 3000, ...apports });

test('scoreMixte', async (t) => {
  await t.test('a = 1 rend les degats seuls', () => {
    assert.equal(scoreMixte(4722, 3692, 1), 4722);
  });

  await t.test('a = 0 rend les pdv effectifs seuls', () => {
    assert.equal(scoreMixte(4722, 3692, 0), 3692);
  });

  await t.test('a = 0.5 rend la racine du produit', () => {
    // 4722 * 3692 = 17 433 624 ; sa racine vaut environ 4175,4.
    assert.ok(Math.abs(scoreMixte(4722, 3692, 0.5) - Math.sqrt(4722 * 3692)) < 1e-9);
  });

  await t.test('deux mesures egales rendent cette valeur, quel que soit le poids', () => {
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      assert.ok(Math.abs(scoreMixte(4000, 4000, a) - 4000) < 1e-9, `part ${a}`);
    }
  });

  await t.test('le score reste entre les deux mesures', () => {
    // Homogene de degre un : le score garde l'ordre de grandeur des mesures,
    // au lieu d'un nombre abstrait que personne ne sait lire.
    for (const a of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const vue = scoreMixte(4722, 3692, a);
      assert.ok(vue >= 3692 && vue <= 4722, `part ${a} hors des bornes : ${vue}`);
    }
  });

  await t.test('le poids fait basculer le gagnant', () => {
    const fort = [4722, 3692];
    const resistant = [4011, 5989];
    const gagnant = (a) => (scoreMixte(...fort, a) >= scoreMixte(...resistant, a) ? 'fort' : 'resistant');

    assert.equal(gagnant(1), 'fort');
    assert.equal(gagnant(0.5), 'resistant');
    assert.equal(gagnant(0), 'resistant');
  });

  await t.test('un facteur constant sur un axe ne change pas le classement', () => {
    // C'est la propriete qui manque a une somme ponderee : elle dispense de
    // regler une echelle entre deux mesures qui n'ont pas la meme unite.
    const a = 0.65;
    const avant = scoreMixte(4722, 3692, a) > scoreMixte(4011, 5989, a);
    const apres = scoreMixte(4722, 3692 * 7, a) > scoreMixte(4011, 5989 * 7, a);
    assert.equal(avant, apres);
  });

  await t.test('une mesure nulle annule le score', () => {
    // Un build qui ne frappe pas ne vaut rien, quelle que soit sa resistance.
    assert.equal(scoreMixte(0, 5989, 0.5), 0);
    assert.equal(scoreMixte(4722, 0, 0.5), 0);
  });

  await t.test('une mesure nulle sur un axe de poids nul ne gene pas', () => {
    // A part nulle, les degats ne comptent pas : zero degat ne doit pas
    // effacer un build que le joueur a justement demande de juger sur sa vie.
    assert.equal(scoreMixte(0, 5989, 0), 5989);
    assert.equal(scoreMixte(4722, 0, 1), 4722);
  });

  await t.test('une mesure negative compte pour zero', () => {
    assert.equal(scoreMixte(-10, 5989, 0.5), 0);
  });
});

test('normaliserPart', async (t) => {
  await t.test('garde une part valable', () => {
    assert.equal(normaliserPart(0.65), 0.65);
    assert.equal(normaliserPart(0), 0);
    assert.equal(normaliserPart(1), 1);
  });

  await t.test('borne ce qui sort de l\'intervalle', () => {
    assert.equal(normaliserPart(1.4), 1);
    assert.equal(normaliserPart(-3), 0);
  });

  await t.test('une valeur fausse retombe sur l\'equilibre', () => {
    for (const brut of [null, undefined, NaN, 'x', {}]) {
      assert.equal(normaliserPart(brut), 0.5);
    }
  });
});

test('tauxDechange', async (t) => {
  await t.test('a l\'equilibre, un pour cent vaut un pour cent', () => {
    assert.equal(tauxDechange(0.5), 1);
  });

  await t.test('plus la part des degats monte, plus un degat coute cher', () => {
    // A 65 %, lacher 1 % de degats demande 1,857 % de pdv effectifs.
    assert.ok(Math.abs(tauxDechange(0.65) - (0.65 / 0.35)) < 1e-9);
    assert.ok(tauxDechange(0.8) > tauxDechange(0.65));
  });

  await t.test('aux bornes, le taux n\'est plus fini', () => {
    assert.equal(tauxDechange(1), Infinity);
    assert.equal(tauxDechange(0), 0);
  });
});

test('scoreBuild en mode mixte', async (t) => {
  const objectif = (conditions, partDegats) => ({
    conditions, spells: [SORT], mode: SEARCH_MODES.MIXTE, partDegats,
  });

  await t.test('le score compose les degats et l\'endurance', () => {
    const vue = scoreBuild(statsDe({ pdvEffectifs: 4000 }), objectif([], 0.5));
    assert.ok(Math.abs(vue.score - Math.sqrt(vue.damage * 4000)) < 1e-9);
    assert.equal(vue.endurance, 4000);
    assert.equal(vue.satisfied, true);
  });

  await t.test('sans part donnee, l\'equilibre s\'applique', () => {
    const vue = scoreBuild(statsDe({ pdvEffectifs: 4000 }), objectif([], undefined));
    assert.ok(Math.abs(vue.score - Math.sqrt(vue.damage * 4000)) < 1e-9);
  });

  await t.test('la part rejoint exactement les deux modes purs', () => {
    const stats = statsDe({ pdvEffectifs: 4000 });
    const pur = (mode) => scoreBuild(stats, { conditions: [], spells: [SORT], mode }).score;

    assert.equal(scoreBuild(stats, objectif([], 1)).score, pur(SEARCH_MODES.DAMAGE));
    assert.equal(scoreBuild(stats, objectif([], 0)).score, pur(SEARCH_MODES.ENDURANCE));
  });

  await t.test('une condition manquee garde l\'ordre lexicographique', () => {
    const vue = scoreBuild(statsDe({ pdvEffectifs: 4000, pa: 10 }),
      objectif([{ stat: 'pa', target: 12, weight: 500 }], 0.5));

    assert.equal(vue.satisfied, false);
    assert.equal(vue.score, -1000);
  });

  await t.test('les conditions de degats et de pdv effectifs restent posables', () => {
    const conditions = [
      { stat: 'degatsTotaux', target: 100000, weight: 1 },
      { stat: 'pdvEffectifs', target: 1, weight: 1 },
    ];
    const vue = scoreBuild(statsDe({ pdvEffectifs: 4000 }), objectif(conditions, 0.5));

    assert.equal(vue.satisfied, false);
    assert.equal(vue.unmet[0].stat, 'degatsTotaux');
  });

  await t.test('un build meilleur des deux cotes gagne toujours', () => {
    const faible = scoreBuild(statsDe({ pdvEffectifs: 3000 }), objectif([], 0.5));
    const fort = scoreBuild(statsDe({ pdvEffectifs: 5000, dommages: 50 }), objectif([], 0.5));
    assert.ok(fort.score > faible.score);
  });
});

/**
 * Le mixte dans la machinerie de la courbe.
 *
 * Le mode mixte choisit un point sur la frontiere des compromis ; il ne la
 * change pas. Il garde donc l'axe du mode degats, et la part doit traverser
 * intacte les objectifs de tranche : sans elle, chaque vague de tranche
 * jugerait les builds sur autre chose que ce que le joueur a regle.
 */
test('le mode mixte garde l\'axe des degats', async (t) => {
  const { AXE_ENDURANCE, axeDe, objectifDeTranche, sansConditionsDAxe } =
    await import('../src/solver/survie.mjs');

  await t.test('l\'axe reste celui de l\'endurance', () => {
    assert.equal(axeDe(SEARCH_MODES.MIXTE), AXE_ENDURANCE);
  });

  await t.test('la part traverse un objectif de tranche', () => {
    const objective = {
      conditions: [{ stat: 'pa', target: 12, weight: 1 }],
      mode: SEARCH_MODES.MIXTE, partDegats: 0.65,
    };
    assert.equal(objectifDeTranche(objective, 3).partDegats, 0.65);
    assert.equal(sansConditionsDAxe(objective).partDegats, 0.65);
  });
});
