/**
 * Lignes de degats differees.
 *
 * Une ligne differee touche N tours APRES le lancer : elle ne fait pas partie
 * des degats du tour. L'Epee du Jugement du Iop annonce 26 a 30 sur sa fiche
 * et portait 67 a 74 dans le score, parce que sa ligne differee s'ajoutait au
 * coup immediat. Le solveur choisissait alors un build pour des degats qui ne
 * tombaient pas ce tour-la.
 *
 * Le differe n'est pas perdu pour autant : il se lit a part. Et le joueur qui
 * vise le combat entier, non le seul premier tour, peut demander l'inverse :
 * l'option « sorts des tours suivants » fait rentrer ces lignes dans le total.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSpell, computeSpellDetail } from '../src/engine/damage.mjs';
import { damageValue } from '../src/solver/score.mjs';
import { emptyStats } from '../src/data/stats.mjs';

/** Statistiques nues : les degats valent alors les bases du sort. */
const NUES = Object.freeze({ ...emptyStats() });

/** Sort a deux lignes : un coup immediat et un coup au tour suivant. */
const SORT = Object.freeze({
  id: 1, name: 'Epee', apCost: 4, castsPerTurn: 1, baseCrit: 0,
  lines: [
    { element: 'terre', min: 26, max: 30, critMin: 32, critMax: 36, source: 'sort' },
    { element: 'terre', min: 41, max: 44, critMin: 49, critMax: 53, source: 'sort', differe: 1 },
  ],
});

/** Le meme sort, sa ligne differee enlevee. */
const IMMEDIAT = Object.freeze({ ...SORT, lines: [SORT.lines[0]] });

test('les degats du tour ignorent la ligne differee', () => {
  const avec = computeSpell(SORT, NUES);
  const sans = computeSpell(IMMEDIAT, NUES);

  assert.equal(avec.average, sans.average);
  assert.equal(avec.normal, sans.normal);
  assert.equal(avec.critical, sans.critical);
});

test('le differe se lit a part, il n\'est pas perdu', () => {
  const avec = computeSpell(SORT, NUES);
  const differeSeul = computeSpell({ ...SORT, lines: [{ ...SORT.lines[1], differe: 0 }] }, NUES);

  assert.ok(avec.differe > 0);
  assert.equal(avec.differe, differeSeul.average);
  assert.equal(computeSpell(IMMEDIAT, NUES).differe, 0);
});

test('le score du solveur ne compte que le coup du tour', () => {
  assert.equal(damageValue([SORT], NUES).total, damageValue([IMMEDIAT], NUES).total);
});

test('les bornes montrees decrivent le coup du tour', () => {
  const detail = computeSpellDetail(SORT, NUES);

  assert.equal(detail.normalMin, 26);
  assert.equal(detail.normalMax, 30);
  assert.equal(detail.critMin, 32);
  assert.equal(detail.critMax, 36);
});

test('le detail garde la ligne differee, marquee de son delai', () => {
  const detail = computeSpellDetail(SORT, NUES);

  assert.equal(detail.parLigne.length, 2, 'les deux lignes restent lisibles');
  assert.equal(detail.parLigne[0].differe, 0);
  assert.equal(detail.parLigne[1].differe, 1);
  assert.equal(detail.parLigne[1].normalMin, 41, 'la ligne differee garde sa valeur');
});

test('un sort entierement differe ne pese rien dans le tour', () => {
  const tout = { ...SORT, lines: SORT.lines.map((l) => ({ ...l, differe: 2 })) };
  const detail = computeSpellDetail(tout, NUES);

  assert.equal(detail.average, 0);
  assert.ok(detail.differe > 0);
  assert.equal(detail.normalMax, 0);
});

/**
 * Le choix de compter les tours suivants.
 *
 * L'option ne doit pas se contenter de laisser passer la ligne : le moteur
 * l'ecartait quand meme, et le score ne bougeait pas d'un point. Le choix vit
 * donc sur le sort, et le moteur l'honore.
 */
test('compterDiffere fait entrer la ligne differee dans le tour', async (t) => {
  const compte = { ...SORT, compterDiffere: true };

  await t.test('la moyenne cumule le coup du tour et le differe', () => {
    const avec = computeSpell(compte, NUES);
    const sans = computeSpell(SORT, NUES);

    assert.equal(avec.average, sans.average + sans.differe);
    assert.ok(avec.average > sans.average, 'le total doit monter');
  });

  await t.test('le differe reste lisible a part, meme quand il compte', () => {
    assert.equal(computeSpell(compte, NUES).differe, computeSpell(SORT, NUES).differe);
  });

  await t.test('le score du solveur suit le choix', () => {
    const avec = damageValue([compte], NUES).total;
    const sans = damageValue([SORT], NUES).total;

    assert.ok(avec > sans, `${avec} doit depasser ${sans}`);
    assert.equal(avec, sans + computeSpell(SORT, NUES).differe);
  });

  await t.test('les bornes montrees cumulent les deux lignes', () => {
    const detail = computeSpellDetail(compte, NUES);

    assert.equal(detail.normalMin, 26 + 41);
    assert.equal(detail.normalMax, 30 + 44);
    assert.equal(detail.critMin, 32 + 49);
    assert.equal(detail.critMax, 36 + 53);
  });

  await t.test('le detail garde le delai de chaque ligne', () => {
    // Compter une ligne ne fait pas oublier a quel tour elle tombe.
    assert.equal(computeSpellDetail(compte, NUES).parLigne[1].differe, 1);
  });

  await t.test('un sort sans ligne differee ne change pas', () => {
    assert.deepEqual(
      computeSpell({ ...IMMEDIAT, compterDiffere: true }, NUES),
      computeSpell(IMMEDIAT, NUES),
    );
  });

  await t.test('un sort entierement differe pese alors son plein', () => {
    const tout = { ...SORT, compterDiffere: true, lines: SORT.lines.map((l) => ({ ...l, differe: 2 })) };
    const detail = computeSpellDetail(tout, NUES);

    assert.ok(detail.average > 0);
    assert.equal(detail.average, detail.differe);
    assert.equal(detail.normalMax, 30 + 44);
  });
});
