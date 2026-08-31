/**
 * Archive des meilleurs builds distincts.
 *
 * Le solveur ne rend qu'un gagnant, alors que la recherche croise souvent
 * plusieurs builds proches en score et tres differents en composition. Cette
 * archive les garde pour que le joueur choisisse lui-meme.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { creerArchive, ecartGenomes, ecartPieces } from '../src/solver/candidates.mjs';

test('ecartGenomes compte les cases qui different', () => {
  assert.equal(ecartGenomes([1, 2, 3], [1, 2, 3]), 0);
  assert.equal(ecartGenomes([1, 2, 3], [1, 9, 3]), 1);
  assert.equal(ecartGenomes([1, 2, 3], [9, 9, 9]), 3);
});

test('l\'archive garde le premier build propose', () => {
  const archive = creerArchive({ taille: 3, ecartMinimum: 2 });
  archive.proposer([1, 1, 1, 1], 100);

  const liste = archive.liste();
  assert.equal(liste.length, 1);
  assert.equal(liste[0].score, 100);
  assert.deepEqual(liste[0].genome, [1, 1, 1, 1]);
});

test('un build identique n\'entre pas deux fois', () => {
  const archive = creerArchive({ taille: 3, ecartMinimum: 2 });
  archive.proposer([1, 1, 1, 1], 100);
  archive.proposer([1, 1, 1, 1], 100);

  assert.equal(archive.liste().length, 1);
});

test('un build trop proche remplace le voisin seulement s\'il est meilleur', () => {
  const archive = creerArchive({ taille: 3, ecartMinimum: 2 });
  archive.proposer([1, 1, 1, 1], 100);

  // Une seule case differe : trop proche, et moins bon.
  archive.proposer([1, 1, 1, 2], 90);
  assert.equal(archive.liste().length, 1);
  assert.equal(archive.liste()[0].score, 100);

  // Toujours trop proche, mais meilleur : il prend la place.
  archive.proposer([1, 1, 1, 3], 120);
  assert.equal(archive.liste().length, 1);
  assert.equal(archive.liste()[0].score, 120);
  assert.deepEqual(archive.liste()[0].genome, [1, 1, 1, 3]);
});

test('un build distinct entre meme s\'il est moins bon', () => {
  const archive = creerArchive({ taille: 3, ecartMinimum: 2 });
  archive.proposer([1, 1, 1, 1], 100);
  archive.proposer([2, 2, 1, 1], 80);

  assert.equal(archive.liste().length, 2);
  assert.deepEqual(archive.liste().map((c) => c.score), [100, 80]);
});

test('l\'archive pleine ne garde que les meilleurs', () => {
  const archive = creerArchive({ taille: 2, ecartMinimum: 2 });
  archive.proposer([1, 1, 1, 1], 100);
  archive.proposer([2, 2, 1, 1], 80);
  archive.proposer([3, 3, 1, 1], 90);

  const scores = archive.liste().map((c) => c.score);
  assert.deepEqual(scores, [100, 90]);
});

test('un build trop faible n\'entre pas dans une archive pleine', () => {
  const archive = creerArchive({ taille: 2, ecartMinimum: 2 });
  archive.proposer([1, 1, 1, 1], 100);
  archive.proposer([2, 2, 1, 1], 90);
  archive.proposer([3, 3, 1, 1], 10);

  assert.deepEqual(archive.liste().map((c) => c.score), [100, 90]);
});

test('l\'archive rend des copies : modifier le resultat ne la corrompt pas', () => {
  const archive = creerArchive({ taille: 3, ecartMinimum: 2 });
  const genome = [1, 1, 1, 1];
  archive.proposer(genome, 100);

  genome[0] = 42;
  const liste = archive.liste();
  liste[0].genome[1] = 42;

  assert.deepEqual(archive.liste()[0].genome, [1, 1, 1, 1]);
});

test('ecartPieces compte les pieces a changer entre deux builds', () => {
  assert.equal(ecartPieces([1, 2, 3], [1, 2, 3]), 0);
  assert.equal(ecartPieces([1, 2, 3], [1, 2, 9]), 1);
  // Les memes pieces dans un autre ordre restent le meme build.
  assert.equal(ecartPieces([3, 1, 2], [1, 2, 3]), 0);
});

test('deux builds aux memes pieces ne comptent que pour un candidat', () => {
  // Deux anneaux echanges de case : le genome differe, le build est le meme.
  const archive = creerArchive({
    taille: 4, ecartMinimum: 2, identite: (g) => [...g].sort((a, b) => a - b),
  });
  archive.proposer([7, 9, 1, 1], 100);
  archive.proposer([9, 7, 1, 1], 100);

  assert.equal(archive.liste().length, 1);
});

test('l\'archive porte le detail joint a un build', () => {
  const archive = creerArchive({ taille: 3, ecartMinimum: 2 });
  archive.proposer([1, 1, 1, 1], 100, { degats: 4200 });

  assert.equal(archive.liste()[0].detail.degats, 4200);
});
