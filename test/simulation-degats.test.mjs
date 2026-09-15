/**
 * Degats d'une simulation gardee, sort par sort.
 *
 * Comparer deux builds par leur seul score ne dit pas d'ou vient l'ecart. Un
 * build peut gagner cent degats sur un sort de feu et en perdre quarante sur
 * un sort d'air : le total cache le compromis, alors que c'est lui qui decide
 * si le changement vaut la peine.
 *
 * Chaque simulation porte ses statistiques figees : les degats se recalculent
 * donc sans le catalogue, sauf pour l'arme, qui est une piece.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { comparerDegats, degatsDe } from '../web/simulation-degats.mjs';

/** Sort a degats fixes : aucune variance, les nombres se verifient a la main. */
const sortFeu = {
  id: 'feu', name: 'Flamiche',
  lines: [{ element: 'feu', min: 100, max: 100, critMin: 100, critMax: 100 }],
};
const sortAir = {
  id: 'air', name: 'Coup de Vent',
  lines: [{ element: 'air', min: 50, max: 50, critMin: 50, critMax: 50 }],
};

const simulation = (apports) => ({
  sorts: [sortFeu, sortAir],
  options: {},
  stats: { intelligence: 0, agilite: 0, ...apports },
  pieces: [],
});

test('degatsDe', async (t) => {
  await t.test('rend une ligne par sort, dans l\'ordre des sorts', () => {
    const vue = degatsDe(simulation({}), new Map());
    assert.deepEqual(vue.lignes.map((l) => l.nom), ['Flamiche', 'Coup de Vent']);
  });

  await t.test('la caracteristique porte le sort de son element', () => {
    const vue = degatsDe(simulation({ intelligence: 100 }), new Map());
    // 100 * (100 + 100) / 100 = 200 pour le feu ; l'air ne bouge pas.
    assert.equal(vue.lignes[0].moyenne, 200);
    assert.equal(vue.lignes[1].moyenne, 50);
  });

  await t.test('le total est la somme des lignes', () => {
    const vue = degatsDe(simulation({ intelligence: 100 }), new Map());
    assert.equal(vue.total, 250);
  });

  await t.test('le total garde s\'il existe prime sur le recalcul', () => {
    // Une simulation recente porte les degats que le score a vraiment comptes,
    // combo compris. Les recalculer donnerait un autre nombre.
    const vue = degatsDe({ ...simulation({}), degats: 4722 }, new Map());
    assert.equal(vue.total, 4722);
  });

  await t.test('sans sort ni arme, tout vaut zero', () => {
    const vue = degatsDe({ sorts: [], options: {}, stats: {}, pieces: [] }, new Map());
    assert.deepEqual(vue.lignes, []);
    assert.equal(vue.total, 0);
  });

  await t.test('une simulation abimee ne fait pas tomber la page', () => {
    for (const brut of [null, undefined, {}, { sorts: 'non' }]) {
      const vue = degatsDe(brut, new Map());
      assert.equal(vue.total, 0);
      assert.deepEqual(vue.lignes, []);
    }
  });

  await t.test('l\'arme entre dans le compte quand l\'option la compte', () => {
    const arme = {
      id: 7, fr: 'Epee', slot: 'arme', range: 1, usesPerTurn: 1,
      weapon: [{ element: 'feu', min: 20, max: 20 }],
    };
    const avec = {
      ...simulation({}), options: { arme: true }, pieces: [{ cle: 'arme:0', id: 7 }],
    };
    const vue = degatsDe(avec, new Map([[7, arme]]));

    assert.equal(vue.lignes.length, 3, 'les deux sorts et l\'arme');
    assert.equal(vue.lignes[2].nom, 'Epee');
  });
});

test('comparerDegats', async (t) => {
  const gauche = simulation({ intelligence: 100 });
  const droite = simulation({ intelligence: 200, agilite: 100 });

  await t.test('chaque sort porte son avant, son apres et son ecart', () => {
    const { lignes } = comparerDegats(gauche, droite, new Map());

    assert.deepEqual(lignes[0], { nom: 'Flamiche', avant: 200, apres: 300, ecart: 100 });
    assert.deepEqual(lignes[1], { nom: 'Coup de Vent', avant: 50, apres: 100, ecart: 50 });
  });

  await t.test('le total se compare aussi', () => {
    const { total } = comparerDegats(gauche, droite, new Map());
    assert.deepEqual(total, { avant: 250, apres: 400, ecart: 150 });
  });

  await t.test('un sort absent d\'un cote compte zero de ce cote', () => {
    // Changer de sorts entre deux essais est courant : la comparaison doit
    // le montrer plutot que de laisser tomber la ligne.
    const seul = { ...simulation({ intelligence: 100 }), sorts: [sortFeu] };
    const { lignes } = comparerDegats(seul, gauche, new Map());

    assert.deepEqual(lignes.map((l) => l.nom), ['Flamiche', 'Coup de Vent']);
    assert.deepEqual(lignes[1], { nom: 'Coup de Vent', avant: 0, apres: 50, ecart: 50 });
  });

  await t.test('les pdv effectifs se comparent a part', () => {
    const faible = { ...gauche, stats: { ...gauche.stats, pdvEffectifs: 3692 } };
    const fort = { ...droite, stats: { ...droite.stats, pdvEffectifs: 5053 } };
    const { endurance } = comparerDegats(faible, fort, new Map());

    assert.deepEqual(endurance, { avant: 3692, apres: 5053, ecart: 1361 });
  });
});
