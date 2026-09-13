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
 * Cle de condition qui porte les degats totaux du build.
 *
 * Elle ne vit pas dans STATS : aucun item ne la donne, et le gabarit des
 * statistiques n'a rien a en faire.
 */
export const STAT_DEGATS = 'degatsTotaux';

/**
 * Renvoie la valeur qu'une condition compare a son objectif.
 * @param {string} stat Statistique visee par la condition.
 * @param {Record<string, number>} stats Statistiques derivees du build.
 * @param {number} [degats] Degats totaux du build, pour la condition STAT_DEGATS.
 * @returns {number}
 */
export function conditionValue(stat, stats, degats = 0) {
  // Les degats ne sont pas une statistique : ils sortent du calcul des sorts.
  // Le mode « maximiser les pdv effectifs » en fait pourtant une condition,
  // et le score les lui passe.
  if (stat === STAT_DEGATS) return degats;

  if (stat === 'vitalite' || stat === 'pdv') {
    return stats.pdv ?? 0;
  }

  if (ELEMENTAL_DAMAGE_CONDITIONS.has(stat)) {
    return (stats[stat] ?? 0) + (stats.dommages ?? 0);
  }

  return stats[stat] ?? 0;
}
