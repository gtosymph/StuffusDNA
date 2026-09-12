/**
 * Agregation d'un build complet : base du personnage, items, panoplies,
 * parchemins et points de caracteristique.
 */
import { emptyStats, STAT_KEYS } from '../data/stats.mjs';
import { evaluateCriteria } from '../data/criteria.mjs';
import { passiveBonuses } from '../data/passives.mjs';
import { SCROLLABLE, SCROLL_BONUS, checkAllocation } from './characteristics.mjs';

/** Niveau a partir duquel le personnage gagne un point d'action. */
export const NIVEAU_PA_BONUS = 100;

/** Valeurs de depart d'un personnage, hors equipement. */
export const BASE = Object.freeze({
  pa: 6,
  pm: 3,
  po: 0,
  pods: 1000,
  prospection: 100,
  invocations: 1,
  vieParNiveau: 5,
  vieFixe: 50,
  podsParForce: 5,
});

/**
 * Additionne des apports de statistiques dans un porteur.
 * @param {Record<string, number>} target Porteur modifie en place.
 * @param {Record<string, number>} source
 */
function addInto(target, source) {
  // « for...in » ne construit aucun tableau intermediaire, la ou
  // Object.entries alloue une paire par cle. La fonction tourne des
  // centaines de milliers de fois par recherche : elle pesait onze pour
  // cent du temps de calcul, moitie en allocations rendues au ramasse-miettes.
  for (const key in source) {
    const value = source[key];
    if (value) target[key] = (target[key] ?? 0) + value;
  }
}

/**
 * Compte les pieces equipees par panoplie.
 * @param {any[]} items
 * @returns {Map<number, number>}
 */
export function countSetPieces(items) {
  const counts = new Map();
  for (const item of items) {
    if (item?.setId == null) continue;
    counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Calcule les bonus apportes par les panoplies equipees.
 * @param {any[]} items
 * @param {Map<number, any>} setById
 * @returns {{stats: Record<string, number>, active: {setId: number, pieces: number, fr: string}[]}}
 */
export function setBonuses(items, setById) {
  const stats = {};
  const active = [];

  for (const [setId, pieces] of countSetPieces(items)) {
    if (pieces < 2) continue;
    const set = setById.get(setId);
    if (!set) continue;

    // tiers[0] ne porte aucun bonus : il correspond a une seule piece equipee.
    // Verifie sur la Panoplie du YeCh'Ti, dont tiers[2] rend exactement ce que
    // le jeu annonce pour trois pieces : 200 Vitalite, 1 PA, 10 % Critique.
    const tier = set.tiers[pieces - 1];
    if (tier) addInto(stats, tier);
    active.push({ setId, pieces, fr: set.fr });
  }

  return { stats, active };
}

/**
 * Assemble les statistiques brutes d'un build.
 * @param {object} build
 * @param {any[]} build.items Items equipes.
 * @param {number} build.level Niveau du personnage.
 * @param {Record<string, number>} [build.allocation] Points investis par caracteristique.
 * @param {Record<string, boolean>} [build.scrolls] Parchemins pris par caracteristique.
 * @param {Map<number, Record<string, number>>} [build.passives] Passifs actifs.
 * @param {Map<number, any>} setById
 * @returns {{stats: Record<string, number>, sets: any[], passives: number[], allocation: any}}
 */
export function aggregate({ items, level, allocation = {}, scrolls = {}, passives = null }, setById) {
  const stats = emptyStats();

  // 1. Apports des items.
  for (const item of items) {
    if (item?.stats) addInto(stats, item.stats);
  }

  // 2. Bonus de panoplie.
  const { stats: setStats, active: sets } = setBonuses(items, setById);
  addInto(stats, setStats);

  // 3. Passifs en combat declares par l'utilisateur.
  const { stats: passiveStats, active: activePassives } = passiveBonuses(items, passives);
  addInto(stats, passiveStats);

  // 4. Parchemins et points de caracteristique.
  for (const characteristic of SCROLLABLE) {
    if (scrolls[characteristic]) stats[characteristic] += SCROLL_BONUS;
    const invested = allocation[characteristic] ?? 0;
    if (invested > 0) stats[characteristic] += invested;
  }

  return { stats, sets, passives: activePassives, allocation: checkAllocation(allocation, level) };
}

/**
 * Ajoute les statistiques derivees, calculees a partir des caracteristiques.
 * Les formules ont ete verifiees contre les valeurs affichees en jeu.
 * @param {Record<string, number>} stats
 * @param {number} level
 * @returns {Record<string, number>} Nouveau porteur, l'entree n'est pas modifiee.
 */
export function derive(stats, level) {
  const out = { ...stats };

  // Un personnage gagne un point d'action au niveau cent : sans equipement,
  // une fiche de niveau 190 annonce sept points d'action.
  const paBase = BASE.pa + (level >= NIVEAU_PA_BONUS ? 1 : 0);
  out.pa = paBase + (stats.pa ?? 0);
  out.pm = BASE.pm + (stats.pm ?? 0);
  out.po = BASE.po + (stats.po ?? 0);
  out.invocations = BASE.invocations + (stats.invocations ?? 0);

  out.pdv = BASE.vieFixe + BASE.vieParNiveau * level + (stats.vitalite ?? 0);
  out.pods = BASE.pods + BASE.podsParForce * (stats.force ?? 0) + (stats.pods ?? 0);
  out.prospection = BASE.prospection + Math.floor((stats.chance ?? 0) / 10) + (stats.prospection ?? 0);

  const sagesse = Math.floor((stats.sagesse ?? 0) / 10);
  out.esquivePa = sagesse + (stats.esquivePa ?? 0);
  out.esquivePm = sagesse + (stats.esquivePm ?? 0);
  out.retraitPa = sagesse + (stats.retraitPa ?? 0);
  out.retraitPm = sagesse + (stats.retraitPm ?? 0);

  const agilite = Math.floor((stats.agilite ?? 0) / 10);
  out.tacle = agilite + (stats.tacle ?? 0);
  out.fuite = agilite + (stats.fuite ?? 0);

  out.initiative =
    (stats.force ?? 0) + (stats.intelligence ?? 0) + (stats.chance ?? 0) +
    (stats.agilite ?? 0) + (stats.initiative ?? 0);

  return out;
}

/**
 * Nombre de bonus de panoplie actifs d'un build.
 * Chaque panoplie apporte (pieces - 1) bonus : c'est la valeur que les
 * trophees comparent, par exemple "Bonus de panoplie < 3".
 * @param {any[]} items
 * @returns {number}
 */
export function setBonusCount(items) {
  let total = 0;
  for (const pieces of countSetPieces(items).values()) {
    total += Math.max(0, pieces - 1);
  }
  return total;
}

/**
 * Liste les items dont les conditions d'equipement ne sont pas remplies.
 *
 * Le jeu evalue ces conditions sur les statistiques finales, l'item compris.
 * Un build qui porte un tel item n'existe pas en jeu.
 *
 * @param {any[]} items Items equipes.
 * @param {Record<string, number>} stats Statistiques derivees du build.
 * @param {{classe?: number, sexe?: number}} [profile]
 * @returns {any[]} Items non equipables.
 */
export function unequipableItems(items, stats, profile = {}) {
  const invalid = [];
  const bonusPanoplie = setBonusCount(items);
  // Le contexte ne depend pas de la piece examinee : le construire dans la
  // boucle creait seize objets par evaluation, tous jetes aussitot.
  const contexte = { stats, bonusPanoplie, ...profile };
  for (const item of items) {
    if (!item?.criteriaTree) continue;
    if (!evaluateCriteria(item.criteriaTree, contexte)) invalid.push(item);
  }
  return invalid;
}

/**
 * Calcule un build de bout en bout.
 * @param {object} build
 * @param {Map<number, any>} setById
 */
export function computeBuild(build, setById) {
  const { stats, sets, passives, allocation } = aggregate(build, setById);
  const derived = derive(stats, build.level);
  const invalid = unequipableItems(build.items, derived, build.profile);
  return { stats: derived, raw: stats, sets, passives, allocation, invalid };
}

/** Cles de statistiques connues, exportees pour la validation. */
export { STAT_KEYS };
