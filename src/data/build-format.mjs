/**
 * Lecture du format texte de configuration d'une recherche.
 *
 * Le fichier se decoupe en sections introduites par un diese :
 * #LEVEL, #MIN_CRIT, #TARGETED_SLOTS, #DMG_LINES, #CONSTRAINTS, #LOCK_ITEMS.
 */

/** Correspondance entre les noms d'emplacement du format et ceux du moteur. */
export const SLOT_ALIASES = Object.freeze({
  amulet: 'amulette',
  hat: 'chapeau',
  ring: 'anneau',
  weapon: 'arme',
  shield: 'bouclier',
  belt: 'ceinture',
  back: 'cape',
  boots: 'bottes',
  dofus: 'artefact',
  // Les Prysmaradites partagent les six emplacements des Dofus et Trophees.
  prysmaradite: 'artefact',
  pet: 'monture',
});

/** Correspondance entre les elements du format et ceux du moteur. */
export const ELEMENT_ALIASES = Object.freeze({
  terre: 'terre', feu: 'feu', eau: 'eau', air: 'air', neutre: 'neutre',
  earth: 'terre', fire: 'feu', water: 'eau', wind: 'air', neutral: 'neutre',
});

/** Correspondance entre les noms de statistique du format et ceux du moteur. */
export const STAT_ALIASES = Object.freeze({
  pa: 'pa', pm: 'pm', po: 'po', vita: 'vitalite', vitalite: 'vitalite',
  pods: 'pods', crit: 'critique', critique: 'critique', soins: 'soins',
  prospe: 'prospection', prospection: 'prospection', sagesse: 'sagesse',
  force: 'force', intelligence: 'intelligence', chance: 'chance', agilite: 'agilite',
  initiative: 'initiative', tacle: 'tacle', fuite: 'fuite', invocations: 'invocations',
});

/** Poids par defaut d'une contrainte issue du format. */
const DEFAULT_WEIGHT = 500;

/**
 * Decoupe le texte en sections.
 * @param {string} source
 * @returns {Map<string, string[]>}
 */
function splitSections(source) {
  const sections = new Map();
  let current = null;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//')) continue;

    if (line.startsWith('#')) {
      current = line.slice(1).trim().toUpperCase();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current).push(line);
  }

  return sections;
}

/**
 * Lit une ligne de degats.
 *
 * La ligne porte un element puis cinq nombres, dans cet ordre :
 * bonus de coups critiques, minimum, maximum, minimum critique, maximum critique.
 *
 * Exemple : "terre 15 20 22 24 26" donne 15 % de critique en plus, 20 a 22 de
 * base, et 24 a 26 en coup critique.
 *
 * @param {string} line
 * @returns {{element: string, critBonus: number, min: number, max: number, critMin: number, critMax: number} | null}
 */
export function parseDamageLine(line) {
  const parts = line.split(/\s+/);
  const element = ELEMENT_ALIASES[parts[0]?.toLowerCase()];
  if (!element) return null;

  const numbers = parts.slice(1).map(Number);
  if (numbers.length < 5 || numbers.some((n) => !Number.isFinite(n))) return null;

  const [critBonus, min, max, critMin, critMax] = numbers;
  return { element, critBonus, min, max, critMin, critMax };
}

/**
 * Lit une contrainte.
 *
 * "stat >= valeur" fixe un objectif a atteindre.
 * "stat <= valeur" fixe un plafond que l'equipement ne doit pas franchir.
 *
 * @param {string} line
 * @returns {{stat: string, target?: number, max?: number, absolute?: boolean, weight: number} | null}
 */
export function parseConstraint(line) {
  const match = /^([A-Za-z_]+)\s*(>=|<=|=)\s*(-?\d+)$/.exec(line.trim());
  if (!match) return null;

  const stat = STAT_ALIASES[match[1].toLowerCase()];
  if (!stat) return null;

  const value = Number(match[3]);
  if (match[2] === '<=') {
    return { stat, target: 0, max: value, absolute: true, weight: DEFAULT_WEIGHT };
  }
  return { stat, target: value, weight: DEFAULT_WEIGHT };
}

/**
 * Lit le fichier complet.
 *
 * @param {string} source
 * @returns {{
 *   level: number, minCrit: number|null,
 *   slots: Record<string, number>, damageLines: any[],
 *   constraints: any[], forced: string[], excluded: string[],
 *   warnings: string[],
 * }}
 */
export function parseBuildFile(source) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new Error('Fichier de configuration vide.');
  }

  const sections = splitSections(source);
  const warnings = [];

  const level = Number(sections.get('LEVEL')?.[0] ?? 200);
  if (!Number.isFinite(level) || level < 1) throw new Error('Niveau invalide.');

  const rawCrit = sections.get('MIN_CRIT')?.[0];
  const minCrit = rawCrit == null ? null : Number(rawCrit);

  const slots = {};
  for (const line of sections.get('TARGETED_SLOTS') ?? []) {
    const [name, count] = line.split(/\s+/);
    const key = SLOT_ALIASES[name?.toLowerCase()];
    if (!key) { warnings.push(`Emplacement inconnu : "${name}".`); continue; }
    slots[key] = (slots[key] ?? 0) + (Number(count) || 1);
  }

  const damageLines = [];
  for (const line of sections.get('DMG_LINES') ?? []) {
    const parsed = parseDamageLine(line);
    if (parsed) damageLines.push(parsed);
    else warnings.push(`Ligne de degats illisible : "${line}".`);
  }

  const constraints = [];
  for (const line of sections.get('CONSTRAINTS') ?? []) {
    const parsed = parseConstraint(line);
    if (parsed) constraints.push(parsed);
    else warnings.push(`Contrainte illisible : "${line}".`);
  }

  const forced = [];
  const excluded = [];
  for (const line of sections.get('LOCK_ITEMS') ?? []) {
    if (line.startsWith('+')) forced.push(line.slice(1).trim());
    else if (line.startsWith('-')) excluded.push(line.slice(1).trim());
    else warnings.push(`Verrou sans signe : "${line}".`);
  }

  return { level, minCrit, slots, damageLines, constraints, forced, excluded, warnings };
}

/**
 * Signale les contraintes qui ne peuvent pas etre satisfaites ensemble.
 * @param {any[]} constraints
 * @returns {string[]}
 */
export function findConflicts(constraints) {
  const conflicts = [];
  const byStat = new Map();

  for (const c of constraints) {
    if (!byStat.has(c.stat)) byStat.set(c.stat, { floor: null, ceiling: null });
    const entry = byStat.get(c.stat);
    if (c.absolute && Number.isFinite(c.max)) entry.ceiling = c.max;
    else if (Number.isFinite(c.target) && c.target > 0) entry.floor = c.target;
  }

  for (const [stat, { floor, ceiling }] of byStat) {
    if (floor != null && ceiling != null && floor > ceiling) {
      conflicts.push(`"${stat}" doit valoir au moins ${floor} et au plus ${ceiling} : aucune valeur ne convient.`);
    }
  }

  return conflicts;
}
