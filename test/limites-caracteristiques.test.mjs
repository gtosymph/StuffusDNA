/**
 * Limites de caracteristique.
 *
 * La repartition automatique investit la ou le score monte. Un joueur peut
 * vouloir l'en empecher : garder sa vitalite basse pour un build de glass
 * cannon, ou caler une caracteristique sur un palier exact.
 *
 * La limite borne la VALEUR INVESTIE, celle du curseur — pas son cout en
 * points. « Limite 10 en force » arrete le curseur a dix, que ces dix coutent
 * dix points ou vingt. Elle ne touche pas a ce que l'equipement apporte :
 * borner la caracteristique entiere se demande par le maximum d'une condition.
 *
 * Zero est une vraie limite : elle interdit d'investir. Le champ vide dit
 * « aucune limite ». Les deux demandes sont opposees et ne peuvent pas
 * partager la meme valeur.
 *
 * Elle bride la recherche seulement. La saisie a la main reste libre : c'est
 * le panneau des points qui le montre, pas le moteur qui l'interdit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { margeSousLimite, optimiserAllocation } from '../src/solver/allocation.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';
import { emptyStats } from '../src/data/stats.mjs';

/** Statistiques agregees d'un build, sans les points investis. */
const brut = (stats = {}) => ({ ...emptyStats(), ...stats });

/** Objectif qui pousse les points vers la vitalite. */
const OBJECTIF = Object.freeze({
  conditions: [{ stat: 'vitalite', target: 5000, weight: 10 }],
  spells: [{
    name: 'Sort', apCost: 4, castsPerTurn: 2, baseCrit: 0,
    lines: [{ element: 'feu', min: 30, max: 34, critMin: 36, critMax: 40, source: 'sort', range: 'melee' }],
  }],
  useWeapon: false,
  mode: SEARCH_MODES.DAMAGE,
});

/** Repartit les points au niveau 200, sous les limites donnees. */
function repartir(limites, raw = brut()) {
  return optimiserAllocation({ raw, level: 200, objective: { ...OBJECTIF, limites } });
}

test('margeSousLimite', async (t) => {
  await t.test('une limite absente ou negative ne borne rien', () => {
    for (const limites of [null, undefined, {}, { vitalite: null }, { vitalite: '' }, { vitalite: -5 }]) {
      assert.equal(margeSousLimite(limites, 'vitalite', 100), Number.POSITIVE_INFINITY);
    }
  });

  await t.test('zero interdit d\'investir', () => {
    // Zero n'est pas « aucune limite » : c'est « rien du tout ».
    assert.equal(margeSousLimite({ vitalite: 0 }, 'vitalite', 0), 0);
    assert.equal(margeSousLimite({ vitalite: 0 }, 'vitalite', 100), 0);
  });

  await t.test('la marge est ce qu\'il reste avant la limite', () => {
    assert.equal(margeSousLimite({ vitalite: 100 }, 'vitalite', 40), 60);
    assert.equal(margeSousLimite({ vitalite: 100 }, 'vitalite', 100), 0);
  });

  await t.test('une valeur deja au-dessus ferme la caracteristique', () => {
    // Elle ne rend jamais un nombre negatif : on n'enleve pas de points.
    assert.equal(margeSousLimite({ vitalite: 10 }, 'vitalite', 400), 0);
  });

  await t.test('une limite ne touche pas les autres caracteristiques', () => {
    assert.equal(margeSousLimite({ vitalite: 10 }, 'force', 400), Number.POSITIVE_INFINITY);
  });
});

test('sans limite, la repartition investit librement', () => {
  const { allocation } = repartir(null);
  assert.ok(allocation.vitalite > 10, 'la vitalite doit monter sans limite');
});

test('une limite a zero n\'investit rien dans cette caracteristique', () => {
  const { allocation } = repartir({ vitalite: 0 });
  assert.equal(allocation.vitalite, 0);
});

test('tout mettre a zero ne depense aucun point', () => {
  const { allocation, spent } = repartir({
    vitalite: 0, sagesse: 0, force: 0, intelligence: 0, chance: 0, agilite: 0,
  });

  assert.equal(spent, 0);
  for (const [cle, valeur] of Object.entries(allocation)) {
    assert.equal(valeur, 0, `${cle} investie a ${valeur}`);
  }
});

test('une limite arrete le curseur a la valeur demandee', () => {
  for (const borne of [10, 50, 200]) {
    const { allocation } = repartir({ vitalite: borne });
    assert.ok(allocation.vitalite <= borne, `vitalite investie : ${allocation.vitalite}`);
  }
});

test('la limite ne regarde pas ce que l\'equipement apporte', () => {
  // L'equipement donne 2950 de vitalite, bien au-dessus de la limite. Elle
  // n'empeche pas pour autant d'investir ses cent points : borner la
  // caracteristique entiere se demande par le maximum d'une condition.
  const { allocation } = repartir({ vitalite: 100 }, brut({ vitalite: 2950 }));
  assert.equal(allocation.vitalite, 100);
});

test('la limite porte sur le curseur, pas sur le cout en points', () => {
  // Cent de force coutent cent points ; les cent suivants en coutent deux
  // cents. Une limite de 150 arrete le curseur a 150, pas a 150 points
  // depenses — sinon elle s'arreterait bien avant.
  const pousseeForce = {
    ...OBJECTIF,
    conditions: [{ stat: 'force', target: 900, weight: 10 }],
  };
  const { allocation, spent } = optimiserAllocation({
    raw: brut(), level: 200, objective: { ...pousseeForce, limites: { force: 150 } },
  });

  assert.equal(allocation.force, 150);
  assert.ok(spent > 150, `le cout doit depasser la valeur investie : ${spent}`);
});

test('une limite sur une caracteristique en laisse une autre libre', () => {
  // Les conditions doivent etre tenues pour que les degats comptent : en
  // defaut, le score ne regarde que la penalite et l'intelligence ne
  // rapporte rien. Une cible de sept points d'action est tenue d'office.
  const atteignable = { ...OBJECTIF, conditions: [{ stat: 'pa', target: 7, weight: 500 }] };
  const { allocation } = optimiserAllocation({
    raw: brut(), level: 200, objective: { ...atteignable, limites: { vitalite: 10 } },
  });

  // Les points bloques ne disparaissent pas : ils partent ailleurs, la ou
  // le score monte encore.
  assert.ok(allocation.vitalite <= 10, `vitalite investie : ${allocation.vitalite}`);
  assert.ok(allocation.intelligence > 0, 'l\'intelligence doit recevoir les points libres');
});

test('plusieurs limites se cumulent', () => {
  const { allocation } = repartir({ vitalite: 10, intelligence: 50, force: 20 });

  assert.ok(allocation.vitalite <= 10);
  assert.ok(allocation.intelligence <= 50);
  assert.ok(allocation.force <= 20);
});

test('tout limiter laisse des points sans emploi', () => {
  // Le reliquat part d'ordinaire en vitalite. Une limite ferme aussi cette
  // porte : les points restent libres, ce que le joueur a demande.
  const { allocation, spent } = repartir({
    vitalite: 5, sagesse: 5, force: 5, intelligence: 5, chance: 5, agilite: 5,
  });

  for (const [cle, valeur] of Object.entries(allocation)) {
    assert.ok(valeur <= 5, `${cle} investie a ${valeur}`);
  }
  assert.ok(spent <= 40, `seuls quelques points partent : ${spent}`);
});
