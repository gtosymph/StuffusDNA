/**
 * Enregistrement des jeux de sorts et de conditions.
 *
 * Les jeux restent dans le navigateur : ils survivent au rechargement et se
 * reprennent d'une simulation a l'autre.
 */

import { CLES as CLES_RANGEMENT, ecrireJson, lireJson } from './stockage.mjs';

/** Cle de rangement, par nature de jeu. */
const CLES = Object.freeze({ sorts: CLES_RANGEMENT.setsSorts, conditions: CLES_RANGEMENT.setsConditions });

/**
 * Lit les jeux enregistres d'une nature donnee.
 * @param {'sorts'|'conditions'} nature
 * @returns {{nom: string, date: string, contenu: any}[]}
 */
export function lireSets(nature) {
  const liste = lireJson(CLES[nature], []);
  return Array.isArray(liste) ? liste : [];
}

/**
 * Enregistre un jeu sous un nom. Un nom deja pris est remplace.
 * @param {'sorts'|'conditions'} nature
 * @param {string} nom
 * @param {any} contenu
 * @returns {{nom: string, date: string, contenu: any}[]}
 */
export function enregistrerSet(nature, nom, contenu) {
  const propre = String(nom ?? '').trim();
  if (propre === '') throw new Error('Donnez un nom au jeu avant de l\'enregistrer.');

  const liste = lireSets(nature).filter((s) => s.nom !== propre);
  liste.push({ nom: propre, date: new Date().toISOString(), contenu });
  liste.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  if (!ecrireJson(CLES[nature], liste)) {
    throw new Error('Enregistrement impossible : le rangement du navigateur est plein ou refuse d\'ecrire.');
  }
  return liste;
}

/**
 * Enleve un jeu enregistre.
 * @param {'sorts'|'conditions'} nature
 * @param {string} nom
 */
export function enleverSet(nature, nom) {
  const liste = lireSets(nature).filter((s) => s.nom !== nom);
  ecrireJson(CLES[nature], liste);
  return liste;
}

/**
 * Retrouve le contenu d'un jeu.
 * @param {'sorts'|'conditions'} nature
 * @param {string} nom
 * @returns {any|null}
 */
export function chargerSet(nature, nom) {
  return lireSets(nature).find((s) => s.nom === nom)?.contenu ?? null;
}
