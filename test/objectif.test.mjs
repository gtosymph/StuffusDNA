/**
 * Ce que l'etat demande au moteur.
 *
 * L'objectif traverse le fil de calcul et decide de tout ce que le solveur
 * cherche. Une option mal traduite se voit seulement des heures plus tard,
 * dans un build etrange : ces tests fixent chaque traduction.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attaqueArme, attaquesAffichees, buildCourant, itemsFiltres, objectif, sortsCalcules,
  valeurDeReference,
} from '../web/objectif.mjs';
import { etatInitial } from '../web/reglages.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

const SORT = {
  id: 1, name: 'Sort', apCost: 4, castsPerTurn: 2, baseCrit: 10,
  telefragCible: { bonusImmediat: 5 },
  lines: [
    { element: 'feu', min: 20, max: 24, critMin: 24, critMax: 28 },
    { element: 'feu', min: 10, max: 12, critMin: 12, critMax: 14, differe: 1 },
  ],
};

const EPEE = {
  id: 10, slot: 'arme', fr: 'Epee', level: 100, typeFr: 'Epee', apCost: 4, usesPerTurn: 1,
  weapon: [{ element: 'feu', min: 10, max: 20 }],
  stats: { force: 50 },
};
const ANNEAU = { id: 1, slot: 'anneau', fr: 'Anneau de feu', level: 150, typeFr: 'Anneau', stats: { pa: 1 } };
const BOTTES = { id: 2, slot: 'bottes', fr: 'Bottes', level: 199, typeFr: 'Bottes', stats: { pm: 1 }, criteria: 'Pk<3' };

const CATALOGUE = {
  items: [EPEE, ANNEAU, BOTTES],
  itemById: new Map([EPEE, ANNEAU, BOTTES].map((i) => [i.id, i])),
  setById: new Map(),
};

/** Etat au niveau 200 avec un sort. */
function etatAvecSort(options = {}) {
  const etat = etatInitial();
  return { ...etat, niveau: 200, sorts: [SORT], options: { ...etat.options, ...options } };
}

test('sortsCalcules', async (t) => {
  await t.test('les coups comptent en melee sauf option distance', () => {
    assert.equal(sortsCalcules(etatAvecSort())[0].lines[0].range, 'melee');
    assert.equal(sortsCalcules(etatAvecSort({ distance: true }))[0].lines[0].range, 'distance');
  });

  await t.test('le sort porte le choix de compter les tours suivants', () => {
    assert.equal(sortsCalcules(etatAvecSort())[0].compterDiffere, false);
    assert.equal(sortsCalcules(etatAvecSort({ toursSuivants: true }))[0].compterDiffere, true);
    // La ligne differee reste dans le sort, pour rester lisible.
    assert.equal(sortsCalcules(etatAvecSort())[0].lines.length, 2);
  });

  await t.test('la cible telefrag ajoute le bonus a la premiere ligne seulement', () => {
    const [sort] = sortsCalcules(etatAvecSort({ cibleTelefrag: true }));
    assert.equal(sort.lines[0].min, 25);
    assert.equal(sort.lines[0].critMax, 33);
    assert.equal(sort.lines[1].min, 10);
  });

  await t.test('ne touche pas les sorts de l\'etat', () => {
    const etat = etatAvecSort({ cibleTelefrag: true });
    sortsCalcules(etat);
    assert.equal(etat.sorts[0].lines[0].min, 20);
    assert.equal(etat.sorts[0].compterDiffere, undefined);
  });
});

test('objectif', async (t) => {
  await t.test('le mode suit la presence de degats a compter', () => {
    assert.equal(objectif(etatInitial()).mode, SEARCH_MODES.STATS);
    assert.equal(objectif(etatAvecSort()).mode, SEARCH_MODES.DAMAGE);
    const armeSeule = { ...etatInitial(), options: { ...etatInitial().options, arme: true } };
    assert.equal(objectif(armeSeule).mode, SEARCH_MODES.DAMAGE);
  });

  await t.test('les bornes de l\'arme ne partent que si l\'arme compte', () => {
    assert.equal(objectif(etatAvecSort({ armePaMin: 5 })).arme, null);
    const bornes = objectif(etatAvecSort({ arme: true, armePaMin: 5, armePorteeMin: 3 })).arme;
    assert.equal(bornes.paMin, 5);
    assert.equal(bornes.porteeMin, 3);
  });

  await t.test('le combo ne part que s\'il est actif, et ses nombres sont propres', () => {
    assert.equal(objectif(etatAvecSort()).combo, null);
    const combo = objectif(etatAvecSort({ combo: true, paReserves: '-3', comboElements: 'x' })).combo;
    assert.equal(combo.reserve, 0);
    assert.equal(combo.elementsMin, 0);
  });

  await t.test('sans reference figee, la proximite reste absente', () => {
    assert.equal(objectif(etatAvecSort()).proximite, null);
  });

  await t.test('avec une reference, la proximite porte pieces, banque et limite', () => {
    const etat = { ...etatAvecSort(), reference: { itemIds: [1, 2] }, changementsMax: 3 };
    etat.possedees = new Set([10]);
    const proximite = objectif(etat).proximite;
    assert.deepEqual(proximite.reference, [1, 2]);
    assert.deepEqual(proximite.possedees, [10]);
    assert.equal(proximite.max, 3);
  });

  await t.test('une limite de changements a zero veut dire « au repos »', () => {
    const etat = { ...etatAvecSort(), reference: { itemIds: [1] }, changementsMax: 0 };
    assert.equal(objectif(etat).proximite.max, null);
  });

  await t.test('les limites de caracteristique voyagent telles quelles', () => {
    const etat = etatAvecSort();
    assert.equal(objectif(etat).limites, etat.limites);
  });
});

test('attaqueArme', async (t) => {
  await t.test('rend null sans option ou sans arme', () => {
    assert.equal(attaqueArme(etatAvecSort()), null);
    assert.equal(attaqueArme(etatAvecSort({ arme: true })), null);
  });

  await t.test('rend l\'attaque de l\'arme portee, ajoutee aux attaques affichees', () => {
    const etat = etatAvecSort({ arme: true });
    etat.equipped.set('arme:0', EPEE);
    const attaque = attaqueArme(etat);
    assert.ok(attaque, 'une attaque');
    assert.equal(attaquesAffichees(etat).length, 2);
    assert.deepEqual(attaquesAffichees(etat)[1], attaque);
  });
});

test('buildCourant rend null sans catalogue, un build sinon', () => {
  const etat = etatAvecSort();
  etat.equipped.set('anneau:0', ANNEAU);
  assert.equal(buildCourant(etat, null), null);
  const build = buildCourant(etat, CATALOGUE);
  assert.ok(build.stats.pa >= 1, 'l\'anneau donne un PA');
});

test('itemsFiltres', async (t) => {
  await t.test('ecarte les pieces au-dessus du niveau', () => {
    const etat = { ...etatInitial(), niveau: 150 };
    assert.deepEqual(itemsFiltres(etat, CATALOGUE).map((i) => i.id), [ANNEAU.id, EPEE.id]);
  });

  await t.test('filtre par case, par nom et par statistique', () => {
    const base = { ...etatInitial(), niveau: 200 };
    assert.deepEqual(itemsFiltres({ ...base, filtre: 'arme' }, CATALOGUE).map((i) => i.id), [EPEE.id]);
    assert.deepEqual(itemsFiltres({ ...base, recherche: '  FEU ' }, CATALOGUE).map((i) => i.id), [ANNEAU.id]);
    const pa = { ...base, filtreStat: { stat: 'pa', op: '>=', valeur: 1 } };
    assert.deepEqual(itemsFiltres(pa, CATALOGUE).map((i) => i.id), [ANNEAU.id]);
    const sansPa = { ...base, filtreStat: { stat: 'pa', op: '<=', valeur: 0 } };
    assert.deepEqual(itemsFiltres(sansPa, CATALOGUE).map((i) => i.id), [BOTTES.id, EPEE.id]);
  });

  await t.test('le filtre des trophees majeurs lit la condition Pk<3', () => {
    const etat = { ...etatInitial(), niveau: 200, filtrePk: true };
    assert.deepEqual(itemsFiltres(etat, CATALOGUE).map((i) => i.id), [BOTTES.id]);
  });

  await t.test('sans catalogue, rien', () => {
    assert.deepEqual(itemsFiltres(etatInitial(), null), []);
  });
});

test('valeurDeReference', async (t) => {
  await t.test('rend null sans reference ou sans pieces connues', () => {
    assert.equal(valeurDeReference(etatAvecSort(), CATALOGUE), null);
    assert.equal(valeurDeReference({ ...etatAvecSort(), reference: { itemIds: [999] } }, CATALOGUE), null);
  });

  await t.test('rend degats et etat des conditions, a part du score', () => {
    const etat = { ...etatAvecSort(), reference: { itemIds: [ANNEAU.id] } };
    const valeur = valeurDeReference(etat, CATALOGUE);
    assert.ok(Number.isFinite(valeur.damage) && valeur.damage > 0);
    assert.equal(typeof valeur.satisfied, 'boolean');
    // Les conditions de depart (12 PA) ne tiennent pas avec un anneau seul.
    assert.equal(valeur.satisfied, false);
    assert.ok(valeur.score < 0, 'un score de penalite');
  });
});
