/**
 * Savoir si ce qui est a l'ecran repond encore aux reglages courants.
 *
 * Une recherche est longue : ses resultats restent affiches pendant que le
 * joueur continue de regler. Rien ne disait qu'ils repondaient a une question
 * PRECEDENTE. On lisait donc des degats a zero sur des stuffs trouves avant
 * d'avoir pose le moindre sort, sans aucun moyen de comprendre pourquoi.
 *
 * La signature repond a une seule question : « si je relance maintenant, la
 * recherche cherchera-t-elle autre chose ? ». Elle ne retient donc que ce qui
 * entre dans la requete du solveur. Le stuff porte, lui, n'en fait pas partie :
 * il est un RESULTAT de la recherche, et l'inclure perimerait les resultats au
 * moment meme ou la recherche les pose. La repartition des points tombe sous
 * la meme regle, pour la meme raison.
 */

import { ecrire, lireTexte, nomDeCle } from '../stockage.mjs';

/**
 * Cle ou la signature du dernier lancement se range.
 *
 * Elle survit au rechargement, sinon des resultats ranges par une session
 * precedente reviennent a l'ecran en se faisant passer pour frais : c'est
 * exactement la gene que ce module existe pour supprimer. Elle ne fait pas
 * partie des cles du profil : une signature absente vaut « perime », et se
 * tromper de ce cote-la ne coute qu'un rappel de trop.
 */
const CLE = nomDeCle('copyroxx_v2_signature');

/** Tout ce qui change ce que le solveur cherche. */
const ENTREES = Object.freeze([
  'classe', 'niveau', 'sexe', 'mode', 'partDegats', 'changementsMax',
]);

/** Reglages dont l'ordre ne compte pas : deux mêmes ensembles se valent. */
const ranger = (ensemble) => [...(ensemble ?? [])].sort().join(',');

/**
 * Signature des reglages qui commandent la recherche.
 *
 * @param {any} etat
 * @returns {string}
 */
export function signatureRecherche(etat) {
  if (!etat) return '';

  return JSON.stringify([
    ENTREES.map((cle) => etat[cle]),
    // Un sort compte par son identite, pas par sa place dans la liste.
    (etat.sorts ?? []).map((s) => s.id).sort(),
    // Un minimum compte par sa cible ET son objectif.
    (etat.conditions ?? []).map((c) => [c.stat, c.target, c.max ?? null, !!c.absolute]),
    ranger(etat.bannis), ranger(etat.verrous), ranger(etat.possedees),
    etat.options,
    // `allocation` n'y est PAS : le solveur la reecrit lui-meme a chaque
    // build (voir src/solver/allocation.mjs). L'inclure ferait perimer chaque
    // recherche par son propre resultat. Les parchemins et les limites, eux,
    // restent des reglages du joueur : ils bornent ce que le solveur peut
    // investir, et le solveur n'y touche jamais.
    etat.limites, etat.scrolls,
    etat.reference ? [...etat.reference.itemIds].sort() : null,
  ]);
}

/** Range la signature du lancement qui vient d'avoir lieu. */
export function garderSignature(etat) {
  const signature = signatureRecherche(etat);
  ecrire(CLE, signature);
  return signature;
}

/**
 * Reprend la signature du dernier lancement, s'il y en a eu un.
 *
 * @returns {string|null} Null quand rien n'a jamais ete lance ici.
 */
export const reprendreSignature = () => lireTexte(CLE, null);

/**
 * Les resultats a l'ecran repondent-ils encore aux reglages courants ?
 *
 * @param {string|null} signatureDuLancement Signature au dernier lancement.
 * @param {any} etat Etat courant.
 * @returns {boolean} Vrai si un reglage a bouge depuis.
 */
export function reglagesChanges(signatureDuLancement, etat) {
  if (signatureDuLancement === null) return false;
  return signatureDuLancement !== signatureRecherche(etat);
}
