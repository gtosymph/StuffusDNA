/**
 * Points de vie effectifs.
 *
 * Une resistance ne se compare pas a de la vitalite tant qu'on ne la traduit
 * pas en points de vie. Ce module fait cette traduction, et toute la courbe
 * « Degats ou survie » repose dessus : une erreur ici deplace chaque palier.
 *
 * La regle du jeu : un coup subi vaut (degats - resistance fixe) x (1 - res %),
 * la fixe d'abord, le pourcentage ensuite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MENACE_DEFAUT, REDUCTION_PLANCHER, normaliserMenace, pdvEffectifs, reductionSubie,
} from '../src/engine/defense.mjs';

/** Porteur de statistiques avec les seules cles qui nous interessent. */
const avec = (apports = {}) => ({ ...apports });

test('reductionSubie', async (t) => {
  await t.test('sans aucune resistance, rien ne se reduit', () => {
    assert.equal(reductionSubie(avec()), 1);
  });

  await t.test('un pourcentage uniforme se lit directement', () => {
    const stats = avec({
      pctResNeutre: 20, pctResTerre: 20, pctResFeu: 20, pctResEau: 20, pctResAir: 20,
    });
    assert.equal(reductionSubie(stats), 0.8);
  });

  await t.test('un pourcentage dans un seul element compte pour un cinquieme', () => {
    // Cinquante pour cent de resistance feu seulement : sur cinq elements,
    // le coup moyen ne baisse que de dix pour cent.
    assert.equal(reductionSubie(avec({ pctResFeu: 50 })), 0.9);
  });

  await t.test('la resistance fixe se mesure contre le coup de reference', () => {
    // Trente de fixe partout, coup de reference trois cents : dix pour cent.
    const stats = avec({
      resNeutre: 30, resTerre: 30, resFeu: 30, resEau: 30, resAir: 30,
    });
    assert.equal(reductionSubie(stats), 0.9);
  });

  await t.test('un coup de reference plus faible donne plus de poids a la fixe', () => {
    const stats = avec({
      resNeutre: 30, resTerre: 30, resFeu: 30, resEau: 30, resAir: 30,
    });
    assert.equal(reductionSubie(stats, normaliserMenace({ coup: 150 })), 0.8);
  });

  await t.test('la fixe s\'enleve avant le pourcentage', () => {
    // (300 - 100) x (1 - 0,5) = 100 sur 300. L'ordre inverse donnerait 50.
    const stats = avec({
      resNeutre: 100, resTerre: 100, resFeu: 100, resEau: 100, resAir: 100,
      pctResNeutre: 50, pctResTerre: 50, pctResFeu: 50, pctResEau: 50, pctResAir: 50,
    });
    assert.equal(reductionSubie(stats), 1 / 3);
  });

  await t.test('le pourcentage se plafonne a cinquante', () => {
    const a = avec({
      pctResNeutre: 50, pctResTerre: 50, pctResFeu: 50, pctResEau: 50, pctResAir: 50,
    });
    const b = avec({
      pctResNeutre: 90, pctResTerre: 90, pctResFeu: 90, pctResEau: 90, pctResAir: 90,
    });
    assert.equal(reductionSubie(a), 0.5);
    assert.equal(reductionSubie(b), 0.5);
  });

  await t.test('le plafond se regle', () => {
    const stats = avec({
      pctResNeutre: 90, pctResTerre: 90, pctResFeu: 90, pctResEau: 90, pctResAir: 90,
    });
    assert.equal(reductionSubie(stats, normaliserMenace({ plafond: 60 })), 0.4);
  });

  await t.test('une vulnerabilite augmente le coup recu', () => {
    const stats = avec({
      pctResNeutre: -10, pctResTerre: -10, pctResFeu: -10, pctResEau: -10, pctResAir: -10,
    });
    assert.equal(Number(reductionSubie(stats).toFixed(6)), 1.1);
  });

  await t.test('melee et distance comptent pour moitie chacune', () => {
    // Vingt pour cent en melee seulement : l'adversaire frappe moitie au
    // contact, la reduction vaut donc dix pour cent.
    assert.equal(reductionSubie(avec({ pctResMelee: 20 })), 0.9);
    assert.equal(reductionSubie(avec({ pctResDistance: 20 })), 0.9);
    assert.equal(reductionSubie(avec({ pctResMelee: 20, pctResDistance: 20 })), 0.8);
  });

  await t.test('la position se multiplie avec les elements', () => {
    const stats = avec({
      pctResNeutre: 50, pctResTerre: 50, pctResFeu: 50, pctResEau: 50, pctResAir: 50,
      pctResMelee: 50, pctResDistance: 50,
    });
    assert.equal(reductionSubie(stats), 0.25);
  });

  await t.test('la reduction ne descend jamais sous le plancher', () => {
    // Une fixe superieure au coup de reference annulerait le coup, et les
    // points de vie effectifs partiraient a l'infini.
    const stats = avec({
      resNeutre: 9999, resTerre: 9999, resFeu: 9999, resEau: 9999, resAir: 9999,
    });
    assert.equal(reductionSubie(stats), REDUCTION_PLANCHER);
  });

  await t.test('l\'entree n\'est pas modifiee', () => {
    const stats = avec({ pctResFeu: 20, resFeu: 10 });
    reductionSubie(stats);
    assert.deepEqual(stats, { pctResFeu: 20, resFeu: 10 });
  });
});

test('pdvEffectifs', async (t) => {
  await t.test('sans resistance, les points de vie effectifs valent la vie', () => {
    assert.equal(pdvEffectifs(3000, avec()), 3000);
  });

  await t.test('vingt pour cent de resistance ajoutent un quart de vie', () => {
    assert.equal(pdvEffectifs(3000, avec({
      pctResNeutre: 20, pctResTerre: 20, pctResFeu: 20, pctResEau: 20, pctResAir: 20,
    })), 3750);
  });

  await t.test('le resultat est un entier', () => {
    const valeur = pdvEffectifs(3000, avec({ pctResFeu: 7, resTerre: 13 }));
    assert.equal(valeur, Math.round(valeur));
  });

  await t.test('une vie nulle ou absente rend zero', () => {
    assert.equal(pdvEffectifs(0, avec({ pctResFeu: 20 })), 0);
    assert.equal(pdvEffectifs(null, avec()), 0);
  });
});

test('normaliserMenace', async (t) => {
  await t.test('sans reglage, les valeurs par defaut s\'appliquent', () => {
    assert.deepEqual(normaliserMenace(), MENACE_DEFAUT);
    assert.deepEqual(normaliserMenace(null), MENACE_DEFAUT);
    assert.deepEqual(normaliserMenace({}), MENACE_DEFAUT);
  });

  await t.test('un reglage partiel garde les autres valeurs', () => {
    assert.deepEqual(normaliserMenace({ coup: 500 }), { ...MENACE_DEFAUT, coup: 500 });
  });

  await t.test('une valeur fausse revient au defaut', () => {
    for (const coup of [0, -1, 'trois', NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(normaliserMenace({ coup }).coup, MENACE_DEFAUT.coup);
    }
    for (const plafond of [-1, 'x', NaN]) {
      assert.equal(normaliserMenace({ plafond }).plafond, MENACE_DEFAUT.plafond);
    }
  });

  await t.test('un plafond a zero interdit toute resistance en pourcentage', () => {
    const menace = normaliserMenace({ plafond: 0 });
    assert.equal(menace.plafond, 0);
    assert.equal(reductionSubie(avec({ pctResFeu: 50 }), menace), 1);
  });

  await t.test('la position se coupe', () => {
    const menace = normaliserMenace({ position: false });
    assert.equal(reductionSubie(avec({ pctResMelee: 50, pctResDistance: 50 }), menace), 1);
  });

  await t.test('le reglage rendu est fige', () => {
    assert.throws(() => { normaliserMenace().coup = 1; });
  });
});

/**
 * Bout en bout : la statistique derivee du moteur.
 *
 * Le solveur ne lit jamais `reductionSubie` directement ; il lit
 * `stats.pdvEffectifs`. Ce lien doit tenir, sinon toute la courbe retombe sur
 * la vie brute sans que rien ne le signale.
 */
test('derive pose les points de vie effectifs', async (t) => {
  const { derive } = await import('../src/engine/build.mjs');

  await t.test('sans resistance, ils valent la vie', () => {
    const stats = derive({ vitalite: 1000 }, 190);
    assert.equal(stats.pdv, 2000);
    assert.equal(stats.pdvEffectifs, 2000);
  });

  await t.test('une resistance uniforme les fait monter', () => {
    const stats = derive({
      vitalite: 1000,
      pctResNeutre: 20, pctResTerre: 20, pctResFeu: 20, pctResEau: 20, pctResAir: 20,
    }, 190);
    assert.equal(stats.pdvEffectifs, 2500);
  });

  await t.test('le modele d\'adversaire du joueur s\'applique', () => {
    const stats = { vitalite: 1000, resNeutre: 30, resTerre: 30, resFeu: 30, resEau: 30, resAir: 30 };
    assert.equal(derive(stats, 190).pdvEffectifs, Math.round(2000 / 0.9));
    assert.equal(derive(stats, 190, normaliserMenace({ coup: 150 })).pdvEffectifs, 2500);
  });

  await t.test('une resistance vaut de la vitalite, et le solveur peut les echanger', () => {
    // Mille de vitalite contre vingt pour cent de resistance partout : les
    // deux builds tiennent le meme temps, la courbe les met cote a cote.
    const parLaVie = derive({ vitalite: 1500 }, 190);
    const parLaRes = derive({
      vitalite: 1000,
      pctResNeutre: 20, pctResTerre: 20, pctResFeu: 20, pctResEau: 20, pctResAir: 20,
    }, 190);

    assert.equal(parLaVie.pdvEffectifs, 2500);
    assert.equal(parLaRes.pdvEffectifs, 2500);
    assert.ok(parLaRes.pdv < parLaVie.pdv, 'moins de vie brute, autant d\'endurance');
  });
});
