/**
 * Chargement et indexation du catalogue d'items, des panoplies et des types.
 */
import { parseCriteria } from './criteria.mjs';
import { statForEffect, WEAPON_DAMAGE_EFFECTS } from './effect-map.mjs';
import { SLOTS } from './slots.mjs';

/**
 * Valeur retenue pour un effet d'item.
 * DofusDB met `to` a zero quand l'effet n'a qu'une seule valeur possible.
 * Le moteur retient le jet maximal, qui correspond a un item parfait.
 * @param {{from: number, to: number}} effect
 * @returns {number}
 */
export function effectValue(effect) {
  const { from, to } = effect;
  if (to === 0) return from;
  return Math.abs(to) >= Math.abs(from) ? to : from;
}

/**
 * Convertit les effets bruts d'un item en apports de statistiques.
 * @param {{effectId: number, from: number, to: number}[]} effects
 * @returns {Record<string, number>}
 */
export function effectsToStats(effects) {
  const stats = {};
  for (const effect of effects) {
    const mapping = statForEffect(effect.effectId);
    if (!mapping) continue;

    // La source stocke deja les malus en negatif. Multiplier par le signe
    // nierait deux fois et transformerait un malus en bonus. La valeur
    // absolue, puis le signe voulu, donne le bon resultat quelle que soit
    // la convention de la source.
    const brut = effectValue(effect);
    const value = mapping.sign < 0 ? -Math.abs(brut) : brut;

    stats[mapping.stat] = (stats[mapping.stat] ?? 0) + value;
  }
  return stats;
}

/**
 * Extrait les lignes de degats propres d'une arme.
 * @param {{effectId: number, from: number, to: number}[]} effects
 * @returns {{element: string, min: number, max: number, steal: boolean}[]}
 */
export function weaponDamageLines(effects) {
  const lines = [];
  for (const effect of effects) {
    const spec = WEAPON_DAMAGE_EFFECTS.get(effect.effectId);
    if (!spec) continue;
    const min = effect.from;
    const max = effect.to === 0 ? effect.from : effect.to;
    lines.push({ element: spec.element, min, max, steal: spec.steal });
  }
  return lines;
}

/**
 * Objets reserves aux maitres du jeu, sans le marqueur "(MJ)" dans le nom.
 * 2155 : Amulette de Jiva.
 */
const IDS_MAITRE_DU_JEU = new Set([2155]);

/**
 * Vrai si l'objet est reserve aux maitres du jeu : il sort du catalogue.
 * @param {any} item
 */
function estReserveMj(item) {
  return IDS_MAITRE_DU_JEU.has(item.id) || /\(MJ\)/.test(item.fr ?? '');
}

/**
 * Construit le catalogue et ses index a partir des donnees brutes.
 *
 * La fonction ne lit aucun fichier : elle tourne aussi bien sous Node que
 * dans un navigateur. Les adaptateurs fournissent les donnees.
 *
 * @param {any[]} rawItems Contenu de items.json.
 * @param {any[]} rawSets Contenu de sets.json.
 * @returns {{
 *   items: any[],
 *   itemById: Map<number, any>,
 *   itemsBySlot: Map<string, any[]>,
 *   setById: Map<number, any>,
 * }}
 */
export function buildCatalog(rawItems, rawSets) {
  if (!Array.isArray(rawItems)) throw new Error('Catalogue invalide : liste d\'items attendue.');
  if (!Array.isArray(rawSets)) throw new Error('Catalogue invalide : liste de panoplies attendue.');

  const items = rawItems.filter((item) => !estReserveMj(item)).map((item) => ({
    ...item,
    stats: effectsToStats(item.effects),
    weapon: item.slot === 'arme' ? weaponDamageLines(item.effects) : [],
    // L'arbre est prepare une seule fois : le solveur le relit a chaque build.
    criteriaTree: item.criteria ? parseCriteria(item.criteria) : null,
  }));

  const itemById = new Map(items.map((item) => [item.id, item]));

  const itemsBySlot = new Map(SLOTS.map((slot) => [slot.key, []]));
  for (const item of items) itemsBySlot.get(item.slot)?.push(item);

  const setById = new Map(
    rawSets.map((set) => [
      set.id,
      {
        ...set,
        // tiers[n] contient les statistiques obtenues avec (n + 1) pieces.
        tiers: (set.effects ?? []).map((tier) => effectsToStats(tier)),
      },
    ]),
  );

  return { items, itemById, itemsBySlot, setById };
}
