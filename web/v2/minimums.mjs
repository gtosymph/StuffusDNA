/**
 * Ce qu'un minimum vaut, et ce qui reste a poser.
 *
 * La feuille des minimums dessine ; ce module decide. Les deux regles qu'il
 * porte sont les seules du volet qui puissent se tromper sans qu'on le voie a
 * l'ecran, et ce sont donc les seules qui meritent un test.
 */

/**
 * Ce qu'un minimum vaut a sa creation.
 *
 * Le poids 1 en fait une preference, pas un couperet : le solveur la tiendra
 * s'il peut. C'est le reglage le moins surprenant pour qui vient d'ajouter
 * une ligne sans encore savoir ce que le poids veut dire.
 *
 * @param {string} stat
 */
export const MINIMUM_NEUF = (stat) => ({
  stat, target: 0, weight: 1, max: null, absolute: false,
});

/**
 * Les mesures sur lesquelles aucun minimum ne porte encore.
 *
 * La liste d'ajout ne propose que celles-la : offrir un choix qui sera refuse
 * au clic suivant n'aide personne. L'ordre du catalogue est conserve, et la
 * mesure des degats ferme la marche — elle ne vient pas des caracteristiques,
 * mais elle se pose comme les autres.
 *
 * @param {{stat: string}[]} conditions Minimums deja poses.
 * @param {{key: string, fr: string}[]} statistiques Catalogue des mesures.
 * @param {{cle: string, libelle: string}} degats La mesure des degats.
 * @returns {[string, string][]} Paires cle / libelle, prêtes pour une liste.
 */
export function mesuresLibres(conditions, statistiques, degats) {
  const posees = new Set((conditions ?? []).map((c) => c.stat));
  return [
    ...statistiques.filter((s) => !posees.has(s.key)).map((s) => [s.key, s.fr]),
    ...(posees.has(degats.cle) ? [] : [[degats.cle, degats.libelle]]),
  ];
}
