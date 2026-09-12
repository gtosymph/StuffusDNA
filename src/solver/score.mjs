/**
 * Fonction de score du solveur.
 *
 * Le score suit un ordre lexicographique, mesure par essais controles :
 *   - s'il reste des conditions non satisfaites, le score vaut l'oppose de la
 *     somme des penalites, donc un nombre negatif ;
 *   - si toutes les conditions sont satisfaites, le score vaut les degats totaux.
 *
 * Un build qui respecte toutes les conditions bat donc toujours un build qui
 * en manque une. Un depassement d'objectif n'apporte aucun bonus.
 *
 * En mode caracteristiques, sans aucun sort, la regle change : le score somme
 * les ecarts signes, ponderes par le poids. Un depassement rapporte alors,
 * et le maximum tronque la valeur comptee.
 *
 * Les deux modes ont ete mesures par essais controles sur une valeur de 54 :
 *   - objectif 10, poids 1, sans maximum -> 44 ;
 *   - objectif 10, poids 2, sans maximum -> 88 ;
 *   - objectif 10, poids 2, maximum 30   -> 40, donc valeur tronquee a 30.
 *
 * En mode degats au contraire, un depassement ne rapporte rien et le maximum
 * n'entre pas dans le score : il n'y sert que de contrainte de recherche,
 * signalee au solveur par maxViolations.
 */
import { computeSpell } from '../engine/damage.mjs';
import { optimiserCombo } from './combo.mjs';
import { conditionValue } from './condition-value.mjs';

/** Modes de recherche proposes par le solveur. */
export const SEARCH_MODES = Object.freeze({
  DAMAGE: 'degats',
  STATS: 'caracteristiques',
});

/** Valeur sentinelle utilisee pour "pas de maximum". */
export const NO_MAX = 32767;

/**
 * Normalise une condition saisie par l'utilisateur.
 * @param {object} condition
 * @returns {{stat: string, target: number, weight: number, max: number, absolute: boolean}}
 */
export function normalizeCondition(condition) {
  if (!condition || typeof condition.stat !== 'string') {
    throw new Error('Condition invalide : la statistique visee est absente.');
  }

  const target = Number(condition.target ?? 0);
  const weight = Number(condition.weight ?? 1);

  const rawMax = condition.max;
  const parsedMax = rawMax == null || rawMax === '' ? Infinity : Number(rawMax);
  const max = !Number.isFinite(parsedMax) || parsedMax >= NO_MAX ? Infinity : parsedMax;

  if (!Number.isFinite(target)) throw new Error(`Objectif invalide pour "${condition.stat}".`);
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error(`Poids invalide pour "${condition.stat}".`);
  }

  return {
    stat: condition.stat,
    target,
    weight,
    max,
    absolute: Boolean(condition.absolute),
  };
}

/**
 * Conditions deja normalisees, gardees par tableau d'origine.
 *
 * L'objectif ne bouge pas pendant une recherche, mais le score se calcule des
 * centaines de milliers de fois : normaliser a chaque appel refaisait le meme
 * travail et allouait un objet par condition.
 *
 * ATTENTION : le cache tient sur l'identite du tableau. Ne modifiez jamais un
 * tableau de conditions en place ; construisez-en un nouveau.
 */
const CONDITIONS_NORMALISEES = new WeakMap();

/**
 * Normalise une liste de conditions, une seule fois par liste.
 * @param {any[]} conditions
 * @returns {ReturnType<typeof normalizeCondition>[]}
 */
export function normalizeConditions(conditions) {
  const connu = CONDITIONS_NORMALISEES.get(conditions);
  if (connu) return connu;

  const normalisees = conditions.map(normalizeCondition);
  CONDITIONS_NORMALISEES.set(conditions, normalisees);
  return normalisees;
}

/**
 * Evalue une condition sur un build.
 * @param {{stat: string, target: number, weight: number, max: number, absolute: boolean}} condition
 * @param {Record<string, number>} stats
 * @returns {{met: boolean, missing: number, penalty: number, value: number}}
 */
export function evaluateCondition(condition, stats) {
  const value = conditionValue(condition.stat, stats);
  const missing = Math.max(0, condition.target - value);

  return { met: missing === 0, missing, penalty: missing * condition.weight, value };
}

/**
 * Degats totaux d'un build, toutes attaques confondues.
 * @param {any[]} spells
 * @param {Record<string, number>} stats
 * @returns {{total: number, perSpell: any[]}}
 */
export function damageValue(spells, stats) {
  let total = 0;
  const perSpell = [];

  for (const spell of spells) {
    const result = computeSpell(spell, stats);
    // L'attaque d'une arme compte ses utilisations par tour ; un sort
    // compte un seul lancer, comme dans le calcul de reference.
    const repeats = Number(spell.repeats) > 0 ? Number(spell.repeats) : 1;
    total += result.average * repeats;
    perSpell.push({ name: spell.name ?? '', repeats, ...result });
  }

  return { total, perSpell };
}

/**
 * Calcule le score complet d'un build.
 *
 * @param {Record<string, number>} stats Statistiques derivees du build.
 * @param {object} objective
 * @param {any[]} objective.conditions
 * @param {any[]} [objective.spells]
 * @param {string} [objective.mode]
 * @param {{details?: boolean}} [options] details : mettre faux dans la boucle
 *   du solveur, qui ne lit que le score. Le detail par condition coute un
 *   objet par condition et par evaluation, pour rien.
 * @returns {{score: number, penalty: number, damage: number, satisfied: boolean, unmet: any[], details: any[]}}
 */
export function scoreBuild(stats, objective, options = {}) {
  const { conditions, spells = [], mode = SEARCH_MODES.DAMAGE } = objective;
  const avecDetails = options.details !== false;
  const normalisees = normalizeConditions(conditions);
  let penalty = 0;
  const unmet = [];
  const details = [];

  for (const condition of normalisees) {
    const result = evaluateCondition(condition, stats);

    penalty += result.penalty;
    if (avecDetails) details.push({ stat: condition.stat, weight: condition.weight, ...result });
    if (!result.met) {
      unmet.push({ stat: condition.stat, missing: result.missing, weight: condition.weight });
    }
  }

  const satisfied = penalty === 0;

  // Mode caracteristiques : la somme ponderee des depassements mesure le build.
  if (mode === SEARCH_MODES.STATS) {
    let somme = 0;
    for (const condition of normalisees) {
      const brut = conditionValue(condition.stat, stats);
      // Le maximum tronque la valeur : il evite de sur-investir sans rien
      // bloquer. Place sous l'objectif il se contredirait lui-meme, et
      // rendrait negative la somme d'un build pourtant satisfait : il ne
      // descend donc jamais sous l'objectif.
      const plafond = Math.max(condition.max, condition.target);
      const retenue = Number.isFinite(plafond) ? Math.min(brut, plafond) : brut;
      somme += (retenue - condition.target) * condition.weight;
    }

    // Meme ordre lexicographique qu'en mode degats : la somme ne departage
    // que des builds qui tiennent toutes leurs conditions. Sans cela, un
    // depassement paie un manque — six cents points de Chance en trop
    // effacent le point de portee absent — et le solveur rend un build qui
    // ne respecte pas ce qui lui a ete demande.
    return {
      score: satisfied ? somme : -penalty,
      penalty, damage: 0, weighted: somme, satisfied, unmet, details,
    };
  }

  // Combo actif : le score retient le meilleur enchainement sous le budget
  // de PA du build, moins la reserve demandee. Sinon, somme simple des sorts.
  const combo = objectiveCombo(objective, stats, spells);
  const damage = combo ? combo.total : damageValue(spells, stats).total;

  return {
    score: satisfied ? damage : -penalty,
    penalty,
    damage,
    ...(combo ? { combo } : {}),
    satisfied,
    unmet,
    details,
  };
}

/**
 * Optimise le combo si l'objectif le demande.
 * @param {object} objective
 * @param {Record<string, number>} stats
 * @param {any[]} spells
 * @returns {ReturnType<typeof optimiserCombo> | null}
 */
function objectiveCombo(objective, stats, spells) {
  const reglage = objective?.combo;
  if (!reglage?.actif) return null;

  const reserve = Number.isFinite(reglage.reserve) ? Math.max(0, reglage.reserve) : 0;

  return optimiserCombo(spells, stats, {
    paBudget: (stats.pa ?? 0) - reserve,
    telefrag: reglage.telefrag !== false,
    elementsMin: Number(reglage.elementsMin) || 0,
    unLancer: Boolean(reglage.unLancer),
    cibleTelefrag: Boolean(reglage.cibleTelefrag),
  });
}

/**
 * Liste les conditions dont le maximum absolu est depasse.
 *
 * Le solveur ne doit pas proposer un tel build : le maximum absolu decrit une
 * limite que l'equipement ne peut pas franchir.
 *
 * @param {any[]} conditions
 * @param {Record<string, number>} stats
 * @returns {{stat: string, value: number, max: number}[]}
 */
export function maxViolations(conditions, stats) {
  const violations = [];

  for (const condition of normalizeConditions(conditions)) {
    if (!condition.absolute || !Number.isFinite(condition.max)) continue;

    const value = conditionValue(condition.stat, stats);
    if (value > condition.max) violations.push({ stat: condition.stat, value, max: condition.max });
  }

  return violations;
}

export { conditionValue };
