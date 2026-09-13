/**
 * Comptage des pieces a changer.
 *
 * Le solveur rend le meilleur build ; le joueur, lui, compte ce qu'il doit
 * acheter. Ce comptage decide donc de tout le mode « proche de mon stuff » :
 * une erreur d'une piece change le palier annonce.
 *
 * Les trois regles a tenir : une piece portee est gratuite, une piece en
 * banque aussi, une case vide que l'on remplit coute un changement. Deplacer
 * un anneau d'une case a l'autre ne coute rien.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compterChangements, creerCompteur, creerPaliers, frontiere, normaliserProximite,
} from '../src/solver/proximite.mjs';

/** Stuff porte en jeu : deux anneaux identiques, et le reste. */
const REFERENCE = [10, 11, 12, 13, 20, 20];

test('compterChangements', async (t) => {
  await t.test('le meme build ne coute rien', () => {
    assert.equal(compterChangements(REFERENCE, REFERENCE), 0);
  });

  await t.test('chaque piece nouvelle coute un changement', () => {
    assert.equal(compterChangements([10, 11, 12, 13, 20, 99], REFERENCE), 1);
    assert.equal(compterChangements([10, 11, 98, 99, 20, 20], REFERENCE), 2);
    assert.equal(compterChangements([90, 91, 92, 93, 94, 95], REFERENCE), 6);
  });

  await t.test('l\'ordre des pieces ne compte pas', () => {
    // Deux anneaux echanges de case donnent le meme build pour le joueur.
    assert.equal(compterChangements([...REFERENCE].reverse(), REFERENCE), 0);
  });

  await t.test('une case vide que l\'on remplit coute un changement', () => {
    // La reference n'a que cinq pieces, le build en pose six.
    assert.equal(compterChangements([10, 11, 12, 13, 20, 77], [10, 11, 12, 13, 20]), 1);
  });

  await t.test('enlever une piece ne coute rien', () => {
    // Le joueur n'achete rien pour retirer un trophee.
    assert.equal(compterChangements([10, 11], REFERENCE), 0);
  });

  await t.test('un exemplaire de plus d\'une piece portee en deux fois coute', () => {
    // La reference porte deux fois la piece 20 ; un troisieme exemplaire
    // demande bien un achat.
    assert.equal(compterChangements([20, 20, 20], REFERENCE), 1);
    assert.equal(compterChangements([20, 20], REFERENCE), 0);
  });

  await t.test('une piece en banque ne coute rien', () => {
    assert.equal(compterChangements([10, 11, 12, 13, 20, 99], REFERENCE, [99]), 0);
    assert.equal(compterChangements([90, 91, 92], REFERENCE, new Set([90, 91])), 1);
  });

  await t.test('sans reference, tout est a changer', () => {
    assert.equal(compterChangements([1, 2, 3], []), 3);
    assert.equal(compterChangements([1, 2, 3], null), 3);
    assert.equal(compterChangements([1, 2, 3], [], [2]), 2);
  });

  await t.test('un build vide ne coute rien', () => {
    assert.equal(compterChangements([], REFERENCE), 0);
    assert.equal(compterChangements(null, REFERENCE), 0);
  });
});

test('creerCompteur rend les memes comptes que compterChangements', () => {
  const compter = creerCompteur({ reference: REFERENCE, possedees: [99] });

  const cas = [
    REFERENCE,
    [10, 11, 12, 13, 20, 99],
    [90, 91, 92, 93, 94, 95],
    [20, 20, 20],
    [],
    [...REFERENCE].reverse(),
  ];

  for (const build of cas) {
    assert.equal(compter(build), compterChangements(build, REFERENCE, [99]),
      `desaccord sur ${JSON.stringify(build)}`);
  }
});

test('le compteur reste juste appele plusieurs fois de suite', () => {
  // Sa table de travail se recycle entre deux appels : un reste d'un compte
  // precedent fausserait tous les suivants.
  const compter = creerCompteur({ reference: REFERENCE });

  for (let i = 0; i < 5; i += 1) {
    assert.equal(compter(REFERENCE), 0, `appel ${i}`);
    assert.equal(compter([90, 91]), 2, `appel ${i}`);
    assert.equal(compter([10, 90]), 1, `appel ${i}`);
  }
});

test('le compteur sans reference compte tout sauf la banque', () => {
  const compter = creerCompteur({ reference: [], possedees: [5] });

  assert.equal(compter([1, 2, 3]), 3);
  assert.equal(compter([1, 5]), 1);
  assert.equal(compter([]), 0);
});

test('normaliserProximite', async (t) => {
  await t.test('sans reference, le reglage ne contraint rien', () => {
    for (const brut of [null, undefined, {}, { reference: [] }, { max: 3 }]) {
      assert.equal(normaliserProximite(brut), null);
    }
  });

  await t.test('une reference donnee rend un reglage complet', () => {
    const regle = normaliserProximite({ reference: [1, 2], possedees: [3], max: 4 });

    assert.deepEqual(regle.reference, [1, 2]);
    assert.ok(regle.possedees.has(3));
    assert.equal(regle.max, 4);
  });

  await t.test('une limite absente ou fausse laisse tout passer', () => {
    for (const max of [undefined, null, -1, 'trois', NaN]) {
      assert.equal(normaliserProximite({ reference: [1], max }).max, Number.POSITIVE_INFINITY);
    }
  });

  await t.test('une limite a zero interdit tout changement', () => {
    assert.equal(normaliserProximite({ reference: [1], max: 0 }).max, 0);
  });

  await t.test('les identifiants qui ne sont pas des nombres partent', () => {
    const regle = normaliserProximite({ reference: [1, 'deux', null, 3], possedees: ['x', 5] });

    assert.deepEqual(regle.reference, [1, 3]);
    assert.deepEqual([...regle.possedees], [5]);
  });
});

/**
 * Paliers : le meilleur build pour chaque nombre de pieces a changer.
 *
 * Le tableau doit se lire de haut en bas sans surprise : chaque ligne coute
 * plus cher que la precedente ET rapporte plus. Un palier qui coute plus sans
 * rapporter davantage n'a rien a dire au joueur.
 */
test('creerPaliers', async (t) => {
  await t.test('un palier vide ne rend rien', () => {
    assert.deepEqual(creerPaliers().liste(), []);
  });

  await t.test('chaque palier garde son meilleur build', () => {
    const paliers = creerPaliers();
    paliers.proposer([1], 100, 1);
    paliers.proposer([2], 300, 1);
    paliers.proposer([3], 200, 1);

    assert.deepEqual(paliers.liste().map((p) => p.genome), [[2]]);
  });

  await t.test('la liste va du moins cher au plus cher', () => {
    const paliers = creerPaliers();
    paliers.proposer([3], 300, 3);
    paliers.proposer([1], 100, 1);
    paliers.proposer([2], 200, 2);

    assert.deepEqual(paliers.liste().map((p) => p.changements), [1, 2, 3]);
  });

  await t.test('la liste garde tous les paliers, meme ceux qui ne gagnent rien', () => {
    const paliers = creerPaliers();
    paliers.proposer([1], 100, 1);
    paliers.proposer([2], 100, 2);
    paliers.proposer([3], 90, 3);
    paliers.proposer([4], 150, 4);

    // Un palier qui ne bat personne sert encore d'alternative a valeur egale :
    // il ne se reduit qu'au moment de montrer.
    assert.deepEqual(paliers.liste().map((p) => p.changements), [1, 2, 3, 4]);
  });

  await t.test('la limite ecarte les builds trop chers', () => {
    const paliers = creerPaliers({ max: 2 });
    paliers.proposer([1], 100, 1);
    paliers.proposer([2], 500, 3);

    assert.deepEqual(paliers.liste().map((p) => p.changements), [1]);
  });

  await t.test('un compte absent ou negatif n\'entre nulle part', () => {
    const paliers = creerPaliers();
    for (const compte of [undefined, null, NaN, -1, Number.POSITIVE_INFINITY]) {
      paliers.proposer([1], 100, compte);
    }
    assert.deepEqual(paliers.liste(), []);
  });

  await t.test('un score qui n\'est pas un nombre n\'entre pas', () => {
    const paliers = creerPaliers();
    paliers.proposer([1], NaN, 1);
    paliers.proposer([2], undefined, 1);
    assert.deepEqual(paliers.liste(), []);
  });

  await t.test('le meme genome ne s\'ajoute pas deux fois', () => {
    const paliers = creerPaliers({ garde: 2 });
    for (let i = 0; i < 10; i += 1) paliers.proposer([1, 2], 100, 1);

    // Sans ce garde-fou, un seul build occuperait toutes les places et
    // ecarterait les vrais pretendants.
    paliers.proposer([3, 4], 50, 1);
    assert.equal(paliers.liste((genome) => (genome[0] === 3 ? 999 : 1)).length, 1);
    assert.deepEqual(paliers.liste((genome) => (genome[0] === 3 ? 999 : 1))[0].genome, [3, 4]);
  });

  await t.test('le score definitif departage les pretendants', () => {
    const paliers = creerPaliers();
    // En cours de route, [1] paraissait meilleur que [2].
    paliers.proposer([1], 300, 1);
    paliers.proposer([2], 100, 1);

    // Le score definitif inverse le classement : c'est lui qui tranche.
    const definitif = (genome) => (genome[0] === 2 ? 900 : 300);
    const liste = paliers.liste(definitif);

    assert.deepEqual(liste[0].genome, [2]);
    assert.equal(liste[0].score, 900);
  });

  await t.test('le score definitif se lit dans la liste rendue', () => {
    const paliers = creerPaliers();
    paliers.proposer([1], 100, 1);
    paliers.proposer([2], 200, 2);

    const definitif = (genome) => (genome[0] === 1 ? 500 : 200);
    assert.deepEqual(paliers.liste(definitif).map((p) => p.score), [500, 200]);
  });
});

/**
 * Frontiere : ce qui merite d'etre montre.
 *
 * Elle se prend au moment d'afficher, jamais au moment de collecter. Un
 * palier ecarte reste utile comme alternative a valeur egale ; le reduire
 * trop tot le rendait introuvable.
 */
test('frontiere', async (t) => {
  const palier = (changements, score) => ({ changements, score });

  await t.test('une suite croissante passe entiere', () => {
    const liste = [palier(1, 100), palier(2, 200), palier(3, 300)];
    assert.deepEqual(frontiere(liste).map((p) => p.changements), [1, 2, 3]);
  });

  await t.test('un palier plus cher qui ne fait pas mieux sort', () => {
    const liste = [palier(1, 100), palier(2, 100), palier(3, 90), palier(4, 150)];
    assert.deepEqual(frontiere(liste).map((p) => p.changements), [1, 4]);
  });

  await t.test('l\'ordre d\'entree ne change rien', () => {
    const liste = [palier(4, 150), palier(2, 100), palier(1, 100), palier(3, 90)];
    assert.deepEqual(frontiere(liste).map((p) => p.changements), [1, 4]);
  });

  await t.test('une liste vide rend une liste vide', () => {
    assert.deepEqual(frontiere([]), []);
  });

  await t.test('la valeur comparee se choisit', () => {
    const liste = [
      { changements: 1, score: 500, damage: 100 },
      { changements: 2, score: 100, damage: 300 },
    ];

    // Sur le score, le palier 2 sort ; sur les degats, il reste.
    assert.deepEqual(frontiere(liste).map((p) => p.changements), [1]);
    assert.deepEqual(frontiere(liste, (p) => p.damage).map((p) => p.changements), [1, 2]);
  });

  await t.test('la liste d\'entree ne bouge pas', () => {
    const liste = [palier(2, 100), palier(1, 200)];
    frontiere(liste);
    assert.deepEqual(liste.map((p) => p.changements), [2, 1]);
  });
});
