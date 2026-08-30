/**
 * Correspondance entre un effectId DofusDB et une statistique du moteur.
 * Les identifiants proviennent de la table data/effects.json, verifiee
 * contre les 142 effectId reellement portes par les items equipables.
 */

/**
 * Effets de bonus. La valeur `sign` vaut -1 pour les effets de malus,
 * dont les valeurs from/to sont stockees en positif par DofusDB.
 */
export const EFFECT_TO_STAT = Object.freeze(new Map([
  // --- Caracteristiques primaires ---
  [125, { stat: 'vitalite', sign: 1 }],
  [153, { stat: 'vitalite', sign: -1 }],
  [124, { stat: 'sagesse', sign: 1 }],
  [156, { stat: 'sagesse', sign: -1 }],
  [118, { stat: 'force', sign: 1 }],
  [157, { stat: 'force', sign: -1 }],
  [126, { stat: 'intelligence', sign: 1 }],
  [155, { stat: 'intelligence', sign: -1 }],
  [123, { stat: 'chance', sign: 1 }],
  [152, { stat: 'chance', sign: -1 }],
  [119, { stat: 'agilite', sign: 1 }],
  [154, { stat: 'agilite', sign: -1 }],
  [138, { stat: 'puissance', sign: 1 }],
  [186, { stat: 'puissance', sign: -1 }],

  // --- Principales ---
  [111, { stat: 'pa', sign: 1 }],
  [101, { stat: 'pa', sign: -1 }],
  [168, { stat: 'pa', sign: -1 }],
  [128, { stat: 'pm', sign: 1 }],
  [127, { stat: 'pm', sign: -1 }],
  [169, { stat: 'pm', sign: -1 }],
  [117, { stat: 'po', sign: 1 }],
  [116, { stat: 'po', sign: -1 }],
  [115, { stat: 'critique', sign: 1 }],
  [171, { stat: 'critique', sign: -1 }],
  [174, { stat: 'initiative', sign: 1 }],
  [175, { stat: 'initiative', sign: -1 }],
  [176, { stat: 'prospection', sign: 1 }],
  [177, { stat: 'prospection', sign: -1 }],
  [182, { stat: 'invocations', sign: 1 }],
  [2990, { stat: 'invocations', sign: -1 }],

  // --- Secondaires ---
  [752, { stat: 'fuite', sign: 1 }],
  [754, { stat: 'fuite', sign: -1 }],
  [753, { stat: 'tacle', sign: 1 }],
  [755, { stat: 'tacle', sign: -1 }],
  [160, { stat: 'esquivePa', sign: 1 }],
  [162, { stat: 'esquivePa', sign: -1 }],
  [161, { stat: 'esquivePm', sign: 1 }],
  [163, { stat: 'esquivePm', sign: -1 }],
  [410, { stat: 'retraitPa', sign: 1 }],
  [411, { stat: 'retraitPa', sign: -1 }],
  [412, { stat: 'retraitPm', sign: 1 }],
  [413, { stat: 'retraitPm', sign: -1 }],
  [158, { stat: 'pods', sign: 1 }],
  [159, { stat: 'pods', sign: -1 }],
  [178, { stat: 'soins', sign: 1 }],
  [179, { stat: 'soins', sign: -1 }],

  // --- Dommages fixes ---
  [112, { stat: 'dommages', sign: 1 }],
  [430, { stat: 'dommagesNeutre', sign: 1 }],
  [431, { stat: 'dommagesNeutre', sign: -1 }],
  [422, { stat: 'dommagesTerre', sign: 1 }],
  [423, { stat: 'dommagesTerre', sign: -1 }],
  [424, { stat: 'dommagesFeu', sign: 1 }],
  [425, { stat: 'dommagesFeu', sign: -1 }],
  [426, { stat: 'dommagesEau', sign: 1 }],
  [427, { stat: 'dommagesEau', sign: -1 }],
  [428, { stat: 'dommagesAir', sign: 1 }],
  [429, { stat: 'dommagesAir', sign: -1 }],
  [418, { stat: 'dommagesCritiques', sign: 1 }],
  [419, { stat: 'dommagesCritiques', sign: -1 }],
  [414, { stat: 'dommagesPoussee', sign: 1 }],
  [415, { stat: 'dommagesPoussee', sign: -1 }],

  // --- Dommages en pourcentage ---
  [165, { stat: 'pctDommagesFinaux', sign: 1 }],
  [2808, { stat: 'pctDommagesArmes', sign: 1 }],
  [2812, { stat: 'pctDommagesSorts', sign: 1 }],
  [2813, { stat: 'pctDommagesSorts', sign: -1 }],
  [2800, { stat: 'pctDommagesMelee', sign: 1 }],
  [2801, { stat: 'pctDommagesMelee', sign: -1 }],
  [2804, { stat: 'pctDommagesDistance', sign: 1 }],
  [2805, { stat: 'pctDommagesDistance', sign: -1 }],

  // --- Resistances fixes ---
  [244, { stat: 'resNeutre', sign: 1 }],
  [248, { stat: 'resNeutre', sign: -1 }],
  [240, { stat: 'resTerre', sign: 1 }],
  [245, { stat: 'resTerre', sign: -1 }],
  [243, { stat: 'resFeu', sign: 1 }],
  [247, { stat: 'resFeu', sign: -1 }],
  [241, { stat: 'resEau', sign: 1 }],
  [246, { stat: 'resEau', sign: -1 }],
  [242, { stat: 'resAir', sign: 1 }],
  [249, { stat: 'resAir', sign: -1 }],
  [420, { stat: 'resCritique', sign: 1 }],
  [421, { stat: 'resCritique', sign: -1 }],
  [416, { stat: 'resPoussee', sign: 1 }],
  [417, { stat: 'resPoussee', sign: -1 }],

  // --- Resistances en pourcentage ---
  [214, { stat: 'pctResNeutre', sign: 1 }],
  [219, { stat: 'pctResNeutre', sign: -1 }],
  [210, { stat: 'pctResTerre', sign: 1 }],
  [215, { stat: 'pctResTerre', sign: -1 }],
  [213, { stat: 'pctResFeu', sign: 1 }],
  [218, { stat: 'pctResFeu', sign: -1 }],
  [211, { stat: 'pctResEau', sign: 1 }],
  [216, { stat: 'pctResEau', sign: -1 }],
  [212, { stat: 'pctResAir', sign: 1 }],
  [217, { stat: 'pctResAir', sign: -1 }],
  [2803, { stat: 'pctResMelee', sign: 1 }],
  [2802, { stat: 'pctResMelee', sign: -1 }],
  [2807, { stat: 'pctResDistance', sign: 1 }],
  [2806, { stat: 'pctResDistance', sign: -1 }],
]));

/**
 * Effets qui portent les degats propres d'une arme, par element.
 * Ils ne sont pas des bonus de caracteristique.
 */
export const WEAPON_DAMAGE_EFFECTS = Object.freeze(new Map([
  [100, { element: 'neutre', steal: false }],
  [97, { element: 'terre', steal: false }],
  [99, { element: 'feu', steal: false }],
  [96, { element: 'eau', steal: false }],
  [98, { element: 'air', steal: false }],
  [95, { element: 'neutre', steal: true }],
  [92, { element: 'terre', steal: true }],
  [94, { element: 'feu', steal: true }],
  [91, { element: 'eau', steal: true }],
  [93, { element: 'air', steal: true }],
]));

/**
 * Effets sans influence sur les statistiques ni sur les degats.
 * Ils sont ignores sans avertissement lors de l'agregation.
 */
export const IGNORED_EFFECTS = Object.freeze(new Set([
  5, 6, 77, 108, 130, 146, 149, 220, 225, 226, 281, 282, 283, 286, 287, 288, 289,
  290, 291, 293, 295, 297, 720, 722, 724, 795, 805, 812, 981, 984, 1042, 2818,
  2822, 2828, 2871, 3829, 3830, 3831, 3833, 3834, 3835, 3836,
]));

/**
 * Renvoie la statistique visee par un effet, ou null si l'effet ne compte pas.
 * @param {number} effectId
 * @returns {{stat: string, sign: number} | null}
 */
export function statForEffect(effectId) {
  return EFFECT_TO_STAT.get(effectId) ?? null;
}
