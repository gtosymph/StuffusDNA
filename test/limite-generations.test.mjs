/**
 * L'arret automatique de la recherche.
 *
 * Deux erreurs coutent cher ici, et elles sont symetriques : une limite mal
 * lue qui arrete la recherche au premier tour, et une limite mal comptee qui
 * ne l'arrete jamais. Les deux passent inapercues a l'ecran — l'une ressemble
 * a une panne, l'autre a une machine qui chauffe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIMITE_DEFAUT, LIMITE_MAX, LIMITE_MIN, limiteAtteinte, normaliserLimite,
  phraseArretAuto, SANS_LIMITE,
} from '../web/limite-generations.mjs';

test('un champ vide rend la limite de depart, pas zero', () => {
  // Un champ vide veut dire « je n'ai rien regle », pas « ne t'arrete jamais ».
  assert.equal(normaliserLimite(''), LIMITE_DEFAUT);
  assert.equal(normaliserLimite(null), LIMITE_DEFAUT);
  assert.equal(normaliserLimite(undefined), LIMITE_DEFAUT);
});

test('zero et les valeurs impossibles disent « sans limite »', () => {
  assert.equal(normaliserLimite(0), SANS_LIMITE);
  assert.equal(normaliserLimite('0'), SANS_LIMITE);
  assert.equal(normaliserLimite(-5), SANS_LIMITE);
  assert.equal(normaliserLimite('abc'), SANS_LIMITE);
});

test('une limite se ramene dans ses bornes', () => {
  assert.equal(normaliserLimite(1), LIMITE_MIN);
  assert.equal(normaliserLimite(9e9), LIMITE_MAX);
  assert.equal(normaliserLimite('20000'), 20000);
  assert.equal(normaliserLimite(20000.7), 20000);
});

test('la limite se declenche a l\'egalite, pas apres', () => {
  assert.equal(limiteAtteinte(19999, 20000), false);
  assert.equal(limiteAtteinte(20000, 20000), true);
  assert.equal(limiteAtteinte(20001, 20000), true);
});

test('sans limite, rien n\'arrete la recherche', () => {
  assert.equal(limiteAtteinte(1e9, SANS_LIMITE), false);
  assert.equal(limiteAtteinte(1e9, -1), false);
});

test('le compte part du lancement, pas du debut des temps', () => {
  // Une reprise a la generation 40 000 avec une limite de 20 000 doit
  // s'arreter a 60 000. Compter le total ferait qu'un deuxieme clic sur
  // « Chercher » ne chercherait rien du tout.
  const decalage = 40000;
  const limite = 20000;
  const faites = (generationMax) => generationMax - decalage;

  assert.equal(limiteAtteinte(faites(41000), limite), false);
  assert.equal(limiteAtteinte(faites(59999), limite), false);
  assert.equal(limiteAtteinte(faites(60000), limite), true);
});

test('l\'arret dit pourquoi il s\'arrete et ou repartir', () => {
  const phrase = phraseArretAuto(20000);
  assert.match(phrase, /20/);
  assert.match(phrase, /Chercher/);
  assert.match(phrase, /reglages/);
});
