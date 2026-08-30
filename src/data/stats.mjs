/**
 * Statistiques manipulees par le moteur.
 * Chaque cle sert d'identifiant stable dans tout le projet.
 */

/** Les cinq elements de Dofus, dans l'ordre d'affichage du jeu. */
export const ELEMENTS = Object.freeze(['neutre', 'terre', 'feu', 'eau', 'air']);

/** Caracteristique primaire qui alimente chaque element. */
export const ELEMENT_CHARACTERISTIC = Object.freeze({
  neutre: 'force',
  terre: 'force',
  feu: 'intelligence',
  eau: 'chance',
  air: 'agilite',
});

/**
 * Definition de chaque statistique.
 * `category` sert au regroupement dans l'interface.
 */
export const STATS = Object.freeze([
  // Caracteristiques primaires
  { key: 'vitalite', fr: 'Vitalite', category: 'caracteristiques' },
  { key: 'sagesse', fr: 'Sagesse', category: 'caracteristiques' },
  { key: 'force', fr: 'Force', category: 'caracteristiques' },
  { key: 'intelligence', fr: 'Intelligence', category: 'caracteristiques' },
  { key: 'chance', fr: 'Chance', category: 'caracteristiques' },
  { key: 'agilite', fr: 'Agilite', category: 'caracteristiques' },
  { key: 'puissance', fr: 'Puissance', category: 'caracteristiques' },

  // Principales
  { key: 'pa', fr: 'PA', category: 'principales' },
  { key: 'pm', fr: 'PM', category: 'principales' },
  { key: 'po', fr: 'PO', category: 'principales' },
  { key: 'critique', fr: '% Critique', category: 'principales' },
  { key: 'initiative', fr: 'Initiative', category: 'principales' },
  { key: 'prospection', fr: 'Prospection', category: 'principales' },
  { key: 'invocations', fr: 'Invocations', category: 'principales' },

  // Secondaires
  { key: 'fuite', fr: 'Fuite', category: 'secondaires' },
  { key: 'tacle', fr: 'Tacle', category: 'secondaires' },
  { key: 'esquivePa', fr: 'Esquive PA', category: 'secondaires' },
  { key: 'esquivePm', fr: 'Esquive PM', category: 'secondaires' },
  { key: 'retraitPa', fr: 'Retrait PA', category: 'secondaires' },
  { key: 'retraitPm', fr: 'Retrait PM', category: 'secondaires' },
  { key: 'pods', fr: 'Pods', category: 'secondaires' },
  { key: 'soins', fr: 'Soins', category: 'secondaires' },

  // Dommages fixes
  { key: 'dommages', fr: 'Dommages', category: 'dommages' },
  { key: 'dommagesNeutre', fr: 'Dommages Neutre', category: 'dommages' },
  { key: 'dommagesTerre', fr: 'Dommages Terre', category: 'dommages' },
  { key: 'dommagesFeu', fr: 'Dommages Feu', category: 'dommages' },
  { key: 'dommagesEau', fr: 'Dommages Eau', category: 'dommages' },
  { key: 'dommagesAir', fr: 'Dommages Air', category: 'dommages' },
  { key: 'dommagesCritiques', fr: 'Dommages Critiques', category: 'dommages' },
  { key: 'dommagesPoussee', fr: 'Dommages Poussee', category: 'dommages' },

  // Dommages en pourcentage
  { key: 'pctDommagesFinaux', fr: '% Dommages finaux', category: 'dommages' },
  { key: 'pctDommagesArmes', fr: '% Dommages Armes', category: 'dommages' },
  { key: 'pctDommagesSorts', fr: '% Dommages Sorts', category: 'dommages' },
  { key: 'pctDommagesMelee', fr: '% Dommages Melee', category: 'dommages' },
  { key: 'pctDommagesDistance', fr: '% Dommages Distance', category: 'dommages' },

  // Resistances fixes
  { key: 'resNeutre', fr: 'Resistance Neutre', category: 'resistances' },
  { key: 'resTerre', fr: 'Resistance Terre', category: 'resistances' },
  { key: 'resFeu', fr: 'Resistance Feu', category: 'resistances' },
  { key: 'resEau', fr: 'Resistance Eau', category: 'resistances' },
  { key: 'resAir', fr: 'Resistance Air', category: 'resistances' },
  { key: 'resCritique', fr: 'Resistance Critique', category: 'resistances' },
  { key: 'resPoussee', fr: 'Resistance Poussee', category: 'resistances' },

  // Resistances en pourcentage
  { key: 'pctResNeutre', fr: '% Resistance Neutre', category: 'resistances' },
  { key: 'pctResTerre', fr: '% Resistance Terre', category: 'resistances' },
  { key: 'pctResFeu', fr: '% Resistance Feu', category: 'resistances' },
  { key: 'pctResEau', fr: '% Resistance Eau', category: 'resistances' },
  { key: 'pctResAir', fr: '% Resistance Air', category: 'resistances' },
  { key: 'pctResMelee', fr: '% Resistance Melee', category: 'resistances' },
  { key: 'pctResDistance', fr: '% Resistance Distance', category: 'resistances' },
]);

/** Cles de toutes les statistiques. */
export const STAT_KEYS = Object.freeze(STATS.map((stat) => stat.key));

/** Libelle francais par cle. */
export const STAT_LABELS = Object.freeze(
  Object.fromEntries(STATS.map((stat) => [stat.key, stat.fr])),
);

/**
 * Cree un porteur de statistiques a zero.
 * @returns {Record<string, number>}
 */
export function emptyStats() {
  const stats = {};
  for (const key of STAT_KEYS) stats[key] = 0;
  return stats;
}
