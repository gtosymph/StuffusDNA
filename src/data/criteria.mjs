/**
 * Analyse et evaluation des conditions d'equipement des items.
 *
 * Une condition s'ecrit dans un mini langage : un code de deux ou trois lettres,
 * un operateur, une valeur. Les conditions se combinent avec "&" pour un ET,
 * "|" pour un OU, et des parentheses pour grouper.
 *
 * Exemple : "CS>99&CA>99&CV>99" demande plus de 99 en Force, Agilite et Vitalite.
 */

/**
 * Codes lies a une statistique du personnage.
 * Le solveur peut les verifier sur le build qu'il assemble.
 */
export const STAT_CRITERIA = Object.freeze({
  CP: 'pa',
  CM: 'pm',
  CS: 'force',
  CI: 'intelligence',
  CA: 'agilite',
  CC: 'chance',
  CV: 'vitalite',
  CW: 'sagesse',
});

/**
 * Codes lies au personnage, connus hors combat.
 * `PG` designe la classe et `PS` le sexe.
 */
export const PROFILE_CRITERIA = Object.freeze({
  PG: 'classe',
  PS: 'sexe',
});

/** Operateurs acceptes par le mini langage. */
const OPERATORS = Object.freeze({
  '>': (left, right) => left > right,
  '<': (left, right) => left < right,
  '=': (left, right) => left === right,
  '!': (left, right) => left !== right,
});

/** Motif d'une condition simple : code, operateur, valeur. */
const CRITERION_PATTERN = /^([A-Za-z]{2,3})([<>=!])(-?\d+)/;

/**
 * Decoupe une expression en arbre logique.
 *
 * @param {string} source
 * @returns {any} Noeud racine.
 */
export function parseCriteria(source) {
  if (typeof source !== 'string' || source.trim() === '') return null;

  let position = 0;
  const text = source.trim();

  /** Lit une expression complete, en traitant le OU. */
  function readExpression() {
    let node = readTerm();
    while (position < text.length && text[position] === '|') {
      position += 1;
      const right = readTerm();
      node = { type: 'or', left: node, right };
    }
    return node;
  }

  /** Lit une suite de conditions liees par un ET. */
  function readTerm() {
    let node = readFactor();
    while (position < text.length && text[position] === '&') {
      position += 1;
      const right = readFactor();
      node = { type: 'and', left: node, right };
    }
    return node;
  }

  /** Lit un groupe entre parentheses ou une condition simple. */
  function readFactor() {
    if (text[position] === '(') {
      position += 1;
      const node = readExpression();
      // Une parenthese fermante manquante ne bloque pas la lecture.
      if (text[position] === ')') position += 1;
      return node;
    }
    return readCriterion();
  }

  /** Lit une condition simple et avance jusqu'au prochain separateur. */
  function readCriterion() {
    const rest = text.slice(position);
    const match = CRITERION_PATTERN.exec(rest);

    if (!match) {
      // Fragment illisible : on saute jusqu'au prochain separateur.
      const next = rest.search(/[&|)]/);
      position += next === -1 ? rest.length : next;
      return { type: 'unknown', raw: rest.slice(0, next === -1 ? undefined : next) };
    }

    position += match[0].length;
    // Certaines conditions portent des parametres apres une virgule.
    while (position < text.length && !'&|)'.includes(text[position])) position += 1;

    return {
      type: 'criterion',
      code: match[1],
      operator: match[2],
      value: Number(match[3]),
    };
  }

  const root = readExpression();
  return root;
}

/**
 * Evalue un arbre de conditions sur un contexte donne.
 *
 * Une condition que le solveur ne sait pas juger compte comme satisfaite. Le
 * moteur ne doit pas ecarter un item pour une quete ou un metier inconnu.
 *
 * @param {any} node Arbre rendu par parseCriteria.
 * @param {object} context
 * @param {Record<string, number>} context.stats Statistiques du build.
 * @param {number} [context.classe] Identifiant de classe.
 * @param {number} [context.sexe] 0 pour masculin, 1 pour feminin.
 * @returns {boolean}
 */
export function evaluateCriteria(node, context) {
  if (!node) return true;

  if (node.type === 'and') {
    return evaluateCriteria(node.left, context) && evaluateCriteria(node.right, context);
  }
  if (node.type === 'or') {
    return evaluateCriteria(node.left, context) || evaluateCriteria(node.right, context);
  }
  if (node.type === 'unknown') return true;

  const compare = OPERATORS[node.operator];
  if (!compare) return true;

  const statKey = STAT_CRITERIA[node.code];
  if (statKey) {
    return compare(context.stats?.[statKey] ?? 0, node.value);
  }

  const profileKey = PROFILE_CRITERIA[node.code];
  if (profileKey) {
    const actual = context[profileKey];
    // Un profil non renseigne ne doit pas ecarter l'item.
    if (actual == null) return true;
    return compare(actual, node.value);
  }

  // Quetes, metiers, alignement : hors de portee du solveur.
  return true;
}

/**
 * Codes de conditions qu'un joueur ordinaire ne peut pas remplir.
 * "PX" designe un droit de compte, reserve aux equipes du jeu.
 */
const CODES_HORS_JEU = Object.freeze(new Set(['PX']));

/**
 * Indique si un item peut etre obtenu par un joueur ordinaire.
 *
 * Quelques objets de service portent des conditions de droits de compte. Leurs
 * valeurs depassent de loin celles du jeu normal : un solveur qui les retient
 * produit des caracteristiques impossibles.
 *
 * @param {any} item
 * @returns {boolean}
 */
export function estObtenable(item) {
  const source = item?.criteria;
  if (typeof source !== 'string' || source === '') return true;

  for (const code of CODES_HORS_JEU) {
    if (new RegExp(`${code}[<>=!]`).test(source)) return false;
  }
  return true;
}

/**
 * Indique si un item est equipable dans un contexte donne.
 * @param {any} item
 * @param {object} context
 * @returns {boolean}
 */
export function isEquipable(item, context) {
  if (!item?.criteria) return true;
  return evaluateCriteria(parseCriteria(item.criteria), context);
}

/**
 * Liste les conditions d'un item que le solveur sait juger.
 * @param {string} source
 * @returns {{code: string, stat: string, operator: string, value: number}[]}
 */
export function statConditions(source) {
  const found = [];

  function walk(node) {
    if (!node) return;
    if (node.type === 'and' || node.type === 'or') {
      walk(node.left);
      walk(node.right);
      return;
    }
    if (node.type !== 'criterion') return;
    const stat = STAT_CRITERIA[node.code];
    if (stat) found.push({ code: node.code, stat, operator: node.operator, value: node.value });
  }

  walk(parseCriteria(source));
  return found;
}
