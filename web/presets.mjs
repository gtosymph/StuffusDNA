/**
 * Enregistrement des jeux : sorts, minimums, pieces interdites, banque, stuff.
 *
 * Les jeux restent dans le navigateur : ils survivent au rechargement et se
 * reprennent d'une simulation a l'autre.
 *
 * Une nature n'est rien d'autre qu'un nom de tiroir. Ce module ne sait pas ce
 * qu'il range : c'est l'appelant qui dit comment lire l'etat et comment le
 * reposer, et cela suffit pour que « mes pieces interdites » se garde comme
 * « mes sorts », sans une ligne de plus ici.
 */

import { ecrireJson, lireJson, nomDeCle } from './stockage.mjs';

/**
 * Cle de rangement d'une nature.
 *
 * Les deux premieres gardent leur nom historique : renommer leur cle
 * effacerait les jeux deja enregistres chez le joueur.
 */
const HISTORIQUES = Object.freeze({ sorts: 'sorts', conditions: 'conditions' });
const cleDe = (nature) => nomDeCle(`copyroxx_sets_${HISTORIQUES[nature] ?? nature}`);

/**
 * Lit les jeux enregistres d'une nature donnee.
 * @param {string} nature
 * @returns {{nom: string, date: string, contenu: any}[]}
 */
export function lireSets(nature) {
  const liste = lireJson(cleDe(nature), []);
  return Array.isArray(liste) ? liste : [];
}

/**
 * Enregistre un jeu sous un nom. Un nom deja pris est remplace.
 * @param {string} nature
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

  if (!ecrireJson(cleDe(nature), liste)) {
    throw new Error('Enregistrement impossible : le rangement du navigateur est plein ou refuse d\'ecrire.');
  }
  return liste;
}

/**
 * Enleve un jeu enregistre.
 * @param {string} nature
 * @param {string} nom
 */
export function enleverSet(nature, nom) {
  const liste = lireSets(nature).filter((s) => s.nom !== nom);
  ecrireJson(cleDe(nature), liste);
  return liste;
}

/**
 * Retrouve le contenu d'un jeu.
 * @param {string} nature
 * @param {string} nom
 * @returns {any|null}
 */
export function chargerSet(nature, nom) {
  return lireSets(nature).find((s) => s.nom === nom)?.contenu ?? null;
}
