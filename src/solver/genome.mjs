/**
 * Representation d'un build pour le solveur.
 *
 * Un genome est un tableau de longueur fixe. Chaque case correspond a un
 * emplacement du personnage et contient un index d'item, ou -1 si l'emplacement
 * reste vide.
 */
import { estObtenable } from '../data/criteria.mjs';
import { SLOTS, TOTAL_SLOT_CAPACITY } from '../data/slots.mjs';

/** Case vide dans un genome. */
export const EMPTY = -1;

/**
 * Construit la disposition des cases : quelle case appartient a quel emplacement.
 * @returns {{slotKey: string, superTypeId: number}[]}
 */
export function buildLayout() {
  const layout = [];
  for (const slot of SLOTS) {
    for (let i = 0; i < slot.capacity; i += 1) {
      layout.push({ slotKey: slot.key, superTypeId: slot.superTypeId });
    }
  }
  return layout;
}

/**
 * Dit si une arme respecte les bornes demandees.
 *
 * Une arme se juge aussi a ce qu'elle prend au tour : son cout en PA, le
 * nombre de fois qu'elle frappe, la distance a laquelle elle atteint et les
 * elements qu'elle touche. Une borne a zero ne filtre rien, et un chiffre
 * absent du catalogue ne fait jamais ecarter l'arme : on ne refuse pas une
 * piece sur une valeur qu'on n'a pas. La portee fait exception : une arme qui
 * n'en declare pas frappe au contact, comme dans le jeu.
 *
 * @param {any} item
 * @param {{paMin?: number, paMax?: number, lancersMin?: number,
 *   portee?: string, porteeMin?: number, elementsMin?: number,
 *   elementsMax?: number}} contraintes
 */
/**
 * Elements distincts qu'une arme frappe vraiment.
 *
 * Une ligne a zero degat ne compte pas : elle decrit un effet, pas un coup.
 *
 * @param {any} item
 * @returns {number}
 */
export function elementsFrappes(item) {
  if (!Array.isArray(item?.weapon)) return 0;

  const vus = new Set();
  for (const ligne of item.weapon) {
    if (!ligne?.element || !(ligne.max > 0)) continue;
    vus.add(ligne.element);
  }
  return vus.size;
}

/**
 * Portee maximale d'une arme, en cases.
 *
 * Une arme sans portee declaree frappe au contact : c'est la valeur du jeu
 * pour une epee ou une dague, et tout le projet la lit de la meme facon.
 *
 * @param {any} item
 * @returns {number}
 */
export function porteeMax(item) {
  return item?.range ?? 1;
}

/**
 * Portee d'une arme : au corps a corps, ou a distance.
 *
 * Le jeu ne la declare pas : elle se lit dans le nombre de cases. Une arme qui
 * porte a plus d'une case frappe a distance — arcs, baguettes, dagues longues.
 * C'est la meme regle que celle du calcul des degats, dans weaponAttack.
 *
 * @param {any} item
 * @returns {'melee'|'distance'}
 */
export function porteeArme(item) {
  return porteeMax(item) > 1 ? 'distance' : 'melee';
}

function armeAcceptee(item, contraintes) {
  const paMin = Number(contraintes.paMin) || 0;
  const paMax = Number(contraintes.paMax) || 0;
  const lancersMin = Number(contraintes.lancersMin) || 0;
  const elementsMin = Number(contraintes.elementsMin) || 0;
  const elementsMax = Number(contraintes.elementsMax) || 0;
  const portee = contraintes.portee;
  const porteeMin = Number(contraintes.porteeMin) || 0;

  // Un cout inconnu n'ecarte rien : on ne juge pas sur un chiffre qu'on n'a pas.
  if (paMin > 0 && Number.isFinite(item.apCost) && item.apCost < paMin) return false;
  if (paMax > 0 && Number.isFinite(item.apCost) && item.apCost > paMax) return false;
  if (lancersMin > 1 && Number.isFinite(item.usesPerTurn) && item.usesPerTurn < lancersMin) return false;

  // Une portee demandee ecarte l'autre moitie du choix : un joueur qui reste
  // au contact ne veut pas d'un arc, meme s'il frappe fort.
  if (portee === 'melee' || portee === 'distance') {
    if (porteeArme(item) !== portee) return false;
  }

  // La portee chiffree dit jusqu'ou l'arme atteint. Un joueur qui veut frapper
  // a trois cases demande trois : les armes qui s'arretent avant sortent du
  // choix, arcs courts comme baguettes.
  if (porteeMin > 0 && porteeMax(item) < porteeMin) return false;

  // Le nombre d'elements decide de la repartition des points : une arme
  // mono-element profite pleinement d'une seule caracteristique, une arme a
  // trois elements demande de tout monter.
  if (elementsMin > 0 || elementsMax > 0) {
    const elements = elementsFrappes(item);
    if (elementsMin > 0 && elements < elementsMin) return false;
    if (elementsMax > 0 && elements > elementsMax) return false;
  }

  return true;
}

/**
 * Prepare les pools d'items utilisables par case, apres filtrage.
 *
 * @param {any[]} items Catalogue complet.
 * @param {object} constraints
 * @param {number} constraints.level Niveau du personnage.
 * @param {Set<number>} [constraints.banned] Items exclus.
 * @param {Set<string>} [constraints.allowedSlots] Emplacements autorises.
 * @param {boolean} [constraints.allowUnobtainable] Autorise les objets de service.
 * @param {{paMin?: number, paMax?: number, lancersMin?: number, portee?: string,
 *           elementsMin?: number, elementsMax?: number}} [constraints.armeContraintes]
 *   Bornes que toute arme proposee doit respecter.
 * @returns {{layout: any[], pools: any[][], pool: any[]}}
 */
export function buildPools(items, {
  level, banned = new Set(), allowedSlots = null, allowUnobtainable = false,
  armeContraintes = null,
}) {
  const layout = buildLayout();

  const usable = items.filter((item) => {
    if (item.level > level) return false;
    if (banned.has(item.id)) return false;
    if (allowedSlots && !allowedSlots.has(item.slot)) return false;
    // Les objets reserves aux equipes du jeu fausseraient le resultat.
    if (!allowUnobtainable && !estObtenable(item)) return false;
    if (armeContraintes && item.slot === 'arme' && !armeAcceptee(item, armeContraintes)) return false;
    return true;
  });

  const bySlot = new Map();
  for (const item of usable) {
    if (!bySlot.has(item.slot)) bySlot.set(item.slot, []);
    bySlot.get(item.slot).push(item);
  }

  const pools = layout.map((cell) => bySlot.get(cell.slotKey) ?? []);
  return { layout, pools, pool: usable };
}

/**
 * Place les items imposes dans leurs cases et renvoie la carte des verrous.
 *
 * Un item impose occupe la premiere case libre de son emplacement. Les cases
 * ainsi prises ne changent plus, ni par mutation ni par croisement.
 *
 * @param {any[]} layout
 * @param {any[][]} pools
 * @param {any[]} lockedItems Items imposes.
 * @returns {{cells: Map<number, number>, missing: any[]}}
 */
export function planLocks(layout, pools, lockedItems) {
  const cells = new Map();
  const missing = [];

  for (const item of lockedItems ?? []) {
    let placed = false;

    for (let i = 0; i < layout.length; i += 1) {
      if (cells.has(i) || layout[i].slotKey !== item.slot) continue;

      const index = pools[i].findIndex((candidate) => candidate.id === item.id);
      if (index === -1) continue;

      cells.set(i, index);
      placed = true;
      break;
    }

    if (!placed) missing.push(item);
  }

  return { cells, missing };
}

/**
 * Reapplique les verrous sur un genome.
 * @param {number[]} genome Modifie en place.
 * @param {Map<number, number>} cells
 * @returns {number[]}
 */
export function applyLocks(genome, cells) {
  for (const [cell, index] of cells) genome[cell] = index;
  return genome;
}

/**
 * Repare un genome pour respecter les regles d'equipement.
 *
 * Deux regles s'appliquent :
 *   - un meme item ne peut occuper deux cases ;
 *   - une arme a deux mains interdit le bouclier.
 *
 * @param {number[]} genome Modifie en place.
 * @param {any[]} layout
 * @param {any[][]} pools
 * @param {Map<number, number>} [locks] Cases imposees.
 * @returns {number[]} Le genome repare.
 */
/**
 * Cases de l'arme et du bouclier, gardees par disposition.
 * La disposition ne change pas de la recherche ; les chercher a chaque
 * reparation revenait a parcourir seize cases pour rien, des centaines de
 * milliers de fois.
 */
const CASES_ARME = new WeakMap();

/** @returns {{arme: number, bouclier: number}} */
function casesArmeBouclier(layout) {
  const connu = CASES_ARME.get(layout);
  if (connu) return connu;

  const trouve = {
    arme: layout.findIndex((cell) => cell.slotKey === 'arme'),
    bouclier: layout.findIndex((cell) => cell.slotKey === 'bouclier'),
  };
  CASES_ARME.set(layout, trouve);
  return trouve;
}

export function repair(genome, layout, pools, locks = null) {
  if (locks) applyLocks(genome, locks);
  const seen = new Set();

  // Les cases imposees gardent la priorite sur les doublons.
  if (locks) {
    for (const [cell, index] of locks) {
      const item = pools[cell][index];
      if (item) seen.add(item.id);
    }
  }

  for (let i = 0; i < genome.length; i += 1) {
    if (locks?.has(i)) continue;
    const index = genome[i];
    if (index === EMPTY) continue;

    const item = pools[i][index];
    if (!item) {
      genome[i] = EMPTY;
      continue;
    }

    if (seen.has(item.id)) {
      genome[i] = EMPTY;
      continue;
    }
    seen.add(item.id);
  }

  // Une arme a deux mains libere la case du bouclier.
  const { arme: weaponCell, bouclier: shieldCell } = casesArmeBouclier(layout);

  if (weaponCell >= 0 && shieldCell >= 0 && genome[weaponCell] !== EMPTY) {
    const weapon = pools[weaponCell][genome[weaponCell]];
    if (weapon?.twoHanded && !locks?.has(shieldCell)) genome[shieldCell] = EMPTY;
  }

  return genome;
}

/**
 * Cree un genome aleatoire valide.
 * @param {any[]} layout
 * @param {any[][]} pools
 * @param {() => number} random
 * @param {number} [fillRate] Probabilite de remplir une case.
 * @param {Map<number, number>} [locks] Cases imposees.
 * @returns {number[]}
 */
export function randomGenome(layout, pools, random, fillRate = 0.9, locks = null) {
  const genome = new Array(layout.length).fill(EMPTY);

  for (let i = 0; i < layout.length; i += 1) {
    if (locks?.has(i)) continue;
    const pool = pools[i];
    if (pool.length === 0 || random() > fillRate) continue;
    genome[i] = Math.floor(random() * pool.length);
  }

  return repair(genome, layout, pools, locks);
}

/**
 * Construit un genome a partir d'une liste d'items equipes.
 * Chaque item prend la premiere case libre de son emplacement.
 *
 * @param {any[]} layout
 * @param {any[][]} pools
 * @param {any[]} items
 * @returns {number[]} Genome repare.
 */
export function genomeFromItems(layout, pools, items) {
  const genome = new Array(layout.length).fill(EMPTY);

  for (const item of items ?? []) {
    for (let i = 0; i < layout.length; i += 1) {
      if (genome[i] !== EMPTY || layout[i].slotKey !== item.slot) continue;
      const index = pools[i].findIndex((candidate) => candidate.id === item.id);
      if (index === -1) break;
      genome[i] = index;
      break;
    }
  }

  return repair(genome, layout, pools);
}

/**
 * Convertit un genome en liste d'items equipes.
 * @param {number[]} genome
 * @param {any[][]} pools
 * @returns {any[]}
 */
export function decode(genome, pools) {
  const items = [];
  for (let i = 0; i < genome.length; i += 1) {
    const index = genome[i];
    if (index === EMPTY) continue;
    const item = pools[i][index];
    if (item) items.push(item);
  }
  return items;
}

export { TOTAL_SLOT_CAPACITY };
