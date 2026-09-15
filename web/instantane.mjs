/**
 * Aller-retour entre l'etat et une simulation gardee.
 *
 * Une simulation est un instantane : de quoi revenir exactement a un
 * moment. Ce module fabrique l'instantane depuis l'etat, et l'etat depuis
 * l'instantane. Il ne range rien : c'est le role de simulations.mjs.
 */
import { classeConnue } from './classes.mjs';

/**
 * Instantane du moment.
 *
 * Les pieces partent avec leur emplacement : sans lui, deux anneaux ne se
 * remettent pas a la meme place. Les statistiques partent entieres, pour que
 * la comparaison de deux simulations n'ait rien a recalculer.
 *
 * @param {any} etat
 * @param {{stats: Record<string, number>}} build Build courant, deja calcule.
 * @param {{score: number, satisfied: boolean, unmet?: any[]}} detail Score du build.
 */
export function instantane(etat, build, detail) {
  return {
    nom: '',
    niveau: etat.niveau, classe: etat.classe, sexe: etat.sexe,
    score: detail.score,
    // Les degats se gardent a part du score : le score vaut les degats quand
    // les conditions tiennent, et moins la penalite quand elles tombent. Sans
    // ce champ, comparer deux essais dont l'un manque une condition opposait
    // un nombre de degats a un nombre negatif.
    degats: detail.damage,
    tenu: detail.satisfied,
    manquantes: detail.unmet?.length ?? 0,
    pieces: [...etat.equipped.entries()].map(([cle, piece]) => ({ cle, id: piece.id })),
    stats: { ...build.stats },
    conditions: etat.conditions,
    sorts: etat.sorts,
    options: etat.options,
    allocation: etat.allocation,
    scrolls: etat.scrolls,
    limites: etat.limites,
    bannis: [...etat.bannis],
    verrous: [...etat.verrous],
  };
}

/**
 * Morceau d'etat qui remet une simulation en place.
 *
 * @param {any} etat
 * @param {any} simulation
 * @param {Map<number, any>} itemById
 * @returns {{patch: object, manquantes: number}} Le morceau d'etat, et le
 *   nombre de pieces que le catalogue ne connait plus.
 */
export function patchDepuisSimulation(etat, simulation, itemById) {
  const equipped = new Map();
  let manquantes = 0;
  for (const { cle, id } of simulation.pieces ?? []) {
    const piece = itemById.get(id);
    if (piece) equipped.set(cle, piece);
    else manquantes += 1;
  }

  return {
    manquantes,
    patch: {
      niveau: simulation.niveau ?? etat.niveau,
      classe: classeConnue(simulation.classe),
      sexe: simulation.sexe ?? etat.sexe,
      equipped,
      // Les pieces viennent d'un instantane, aucune n'est posee a la main.
      posees: new Set(),
      conditions: simulation.conditions ?? etat.conditions,
      sorts: simulation.sorts ?? etat.sorts,
      options: { ...etat.options, ...(simulation.options ?? {}) },
      allocation: { ...etat.allocation, ...(simulation.allocation ?? {}) },
      scrolls: { ...etat.scrolls, ...(simulation.scrolls ?? {}) },
      limites: { ...etat.limites, ...(simulation.limites ?? {}) },
      bannis: new Set(simulation.bannis ?? []),
      verrous: new Set(simulation.verrous ?? []),
      candidats: [],
    },
  };
}
