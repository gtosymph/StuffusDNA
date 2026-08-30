/**
 * Passifs en combat des Dofus et des objets legendaires.
 *
 * Un passif depend de conditions de combat qu'un solveur ne peut pas simuler :
 * points de vie perdus, nombre d'ennemis proches, tour en cours. Le moteur ne
 * devine donc aucun apport. L'utilisateur active un passif et declare les
 * statistiques qu'il apporte dans sa situation de jeu.
 */

/** Types d'items dont un exemplaire peut porter un passif en combat. */
const PASSIVE_TYPES = Object.freeze(new Set(['Dofus', 'Prysmaradite']));

/**
 * Determine si un item peut porter un passif configurable.
 * @param {any} item
 * @returns {boolean}
 */
export function hasConfigurablePassive(item) {
  if (!item) return false;
  return item.isLegendary === true || PASSIVE_TYPES.has(item.typeFr);
}

/**
 * Liste les items du catalogue qui acceptent un passif.
 * @param {any[]} items
 * @returns {{id: number, fr: string, slot: string, typeFr: string, legendary: boolean}[]}
 */
export function listPassiveItems(items) {
  return items
    .filter(hasConfigurablePassive)
    .map((item) => ({
      id: item.id,
      fr: item.fr,
      slot: item.slot,
      typeFr: item.typeFr,
      legendary: item.isLegendary === true,
    }))
    .sort((a, b) => a.fr.localeCompare(b.fr, 'fr'));
}

/**
 * Verifie une configuration de passifs et ecarte les entrees inutilisables.
 *
 * @param {Record<string|number, {enabled?: boolean, stats?: Record<string, number>}>} config
 * @param {Set<string>} knownStats Cles de statistiques acceptees.
 * @returns {{passives: Map<number, Record<string, number>>, warnings: string[]}}
 */
export function normalizePassives(config, knownStats) {
  const passives = new Map();
  const warnings = [];

  if (!config || typeof config !== 'object') return { passives, warnings };

  for (const [rawId, entry] of Object.entries(config)) {
    const id = Number(rawId);
    if (!Number.isInteger(id)) {
      warnings.push(`Identifiant d'item invalide : "${rawId}".`);
      continue;
    }
    if (!entry?.enabled) continue;

    const stats = {};
    for (const [key, value] of Object.entries(entry.stats ?? {})) {
      if (!knownStats.has(key)) {
        warnings.push(`Statistique inconnue "${key}" sur le passif de l'item ${id}.`);
        continue;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        warnings.push(`Valeur invalide pour "${key}" sur le passif de l'item ${id}.`);
        continue;
      }
      if (numeric !== 0) stats[key] = numeric;
    }

    if (Object.keys(stats).length > 0) passives.set(id, stats);
  }

  return { passives, warnings };
}

/**
 * Somme les apports des passifs actifs sur les items equipes.
 * @param {any[]} items Items equipes.
 * @param {Map<number, Record<string, number>>} passives
 * @returns {{stats: Record<string, number>, active: number[]}}
 */
export function passiveBonuses(items, passives) {
  const stats = {};
  const active = [];

  if (!passives || passives.size === 0) return { stats, active };

  for (const item of items) {
    const bonus = passives.get(item?.id);
    if (!bonus) continue;

    for (const [key, value] of Object.entries(bonus)) {
      stats[key] = (stats[key] ?? 0) + value;
    }
    active.push(item.id);
  }

  return { stats, active };
}
