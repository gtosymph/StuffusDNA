/**
 * Resolution de la valeur observee par une condition.
 *
 * Deux regles s'ecartent de la lecture directe d'une statistique. Elles ont ete
 * mesurees par essais controles sur un build de reference :
 *
 *   - une condition "vitalite" porte sur les points de vie, pas sur la
 *     caracteristique Vitalite ;
 *   - une condition sur les degats d'un element ajoute la statistique
 *     "Dommages", qui vaut pour tous les elements.
 */

/** Conditions de degats qui beneficient de la statistique "Dommages". */
const ELEMENTAL_DAMAGE_CONDITIONS = Object.freeze(new Set([
  'dommagesNeutre', 'dommagesTerre', 'dommagesFeu', 'dommagesEau', 'dommagesAir',
]));

/**
 * Renvoie la valeur qu'une condition compare a son objectif.
 * @param {string} stat Statistique visee par la condition.
 * @param {Record<string, number>} stats Statistiques derivees du build.
 * @returns {number}
 */
export function conditionValue(stat, stats) {
  if (stat === 'vitalite' || stat === 'pdv') {
    return stats.pdv ?? 0;
  }

  if (ELEMENTAL_DAMAGE_CONDITIONS.has(stat)) {
    return (stats[stat] ?? 0) + (stats.dommages ?? 0);
  }

  return stats[stat] ?? 0;
}
