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
 * moment meme ou la recherche les pose.
 */

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
    etat.allocation, etat.limites, etat.scrolls,
    etat.reference ? [...etat.reference.itemIds].sort() : null,
  ]);
}

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
