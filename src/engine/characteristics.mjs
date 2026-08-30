/**
 * Regles de repartition des points de caracteristique.
 * Les paliers ont ete verifies contre les valeurs affichees par le jeu :
 * 190 Sagesse coute 570 points, 187 Agilite coute 274 points.
 */

/** Caracteristiques primaires sur lesquelles des points sont investis. */
export const SCROLLABLE = Object.freeze([
  'vitalite', 'sagesse', 'force', 'intelligence', 'chance', 'agilite',
]);

/** Bonus maximal apporte par les parchemins, par caracteristique. */
export const SCROLL_BONUS = 100;

/** Points gagnes a chaque niveau, a partir du niveau 2. */
const POINTS_PER_LEVEL = 5;

/**
 * Cout d'un point, par tranche de valeur deja investie.
 * `step` donne la largeur de la tranche, `cost` le prix d'un point dedans.
 */
const COST_TABLE = Object.freeze({
  vitalite: [{ step: Infinity, cost: 1 }],
  sagesse: [{ step: Infinity, cost: 3 }],
  elemental: [
    { step: 100, cost: 1 },
    { step: 100, cost: 2 },
    { step: 100, cost: 3 },
    { step: 100, cost: 4 },
    { step: Infinity, cost: 5 },
  ],
});

/**
 * Renvoie la table de cout d'une caracteristique.
 * @param {string} characteristic
 */
function costTableFor(characteristic) {
  if (characteristic === 'vitalite') return COST_TABLE.vitalite;
  if (characteristic === 'sagesse') return COST_TABLE.sagesse;
  return COST_TABLE.elemental;
}

/**
 * Points necessaires pour atteindre une valeur investie.
 * @param {string} characteristic
 * @param {number} target Valeur obtenue par les points seuls.
 * @returns {number}
 */
export function pointCost(characteristic, target) {
  if (!Number.isFinite(target) || target <= 0) return 0;

  const table = costTableFor(characteristic);
  let remaining = Math.floor(target);
  let spent = 0;

  for (const tier of table) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, tier.step);
    spent += taken * tier.cost;
    remaining -= taken;
  }
  return spent;
}

/**
 * Valeur maximale atteignable avec un budget de points.
 * @param {string} characteristic
 * @param {number} budget
 * @returns {number}
 */
export function maxForBudget(characteristic, budget) {
  if (!Number.isFinite(budget) || budget <= 0) return 0;

  const table = costTableFor(characteristic);
  let left = Math.floor(budget);
  let value = 0;

  for (const tier of table) {
    if (left <= 0) break;
    const affordable = Math.min(tier.step, Math.floor(left / tier.cost));
    value += affordable;
    left -= affordable * tier.cost;
    if (affordable < tier.step) break;
  }
  return value;
}

/**
 * Points de caracteristique disponibles a un niveau donne.
 * @param {number} level
 * @returns {number}
 */
export function availablePoints(level) {
  if (!Number.isFinite(level) || level < 1) return 0;
  return (Math.floor(level) - 1) * POINTS_PER_LEVEL;
}

/**
 * Verifie une repartition de points.
 * @param {Record<string, number>} allocation Valeur visee par caracteristique.
 * @param {number} level
 * @returns {{spent: number, available: number, remaining: number, valid: boolean}}
 */
export function checkAllocation(allocation, level) {
  let spent = 0;
  for (const characteristic of SCROLLABLE) {
    spent += pointCost(characteristic, allocation[characteristic] ?? 0);
  }
  const available = availablePoints(level);
  return { spent, available, remaining: available - spent, valid: spent <= available };
}
