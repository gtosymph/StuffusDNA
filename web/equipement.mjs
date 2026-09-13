/**
 * Gestes sur l'equipement : poser, retirer, bannir, verrouiller, posseder.
 *
 * Chaque fonction lit un etat et rend le MORCEAU d'etat qui change, sans
 * toucher a l'original. L'application applique ce morceau d'un seul coup :
 * « Annuler » revient ainsi sur un geste entier, jamais sur sa moitie.
 *
 * Les Map et les Set se recopient avant tout changement : l'etat precedent
 * reste tel quel dans l'historique d'annulation.
 */
import { SLOTS } from '../src/data/slots.mjs';

/**
 * Enleve une piece de toutes les cases qui la portent.
 *
 * @param {Map<string, any>} equipped Recopie, modifiee.
 * @param {Set<string>} posees Recopie, modifiee.
 * @param {number} id
 */
function liberer(equipped, posees, id) {
  for (const [cle, piece] of equipped) {
    if (piece.id === id) { equipped.delete(cle); posees.delete(cle); }
  }
}

/**
 * Pose une piece dans la premiere case libre qui l'accepte.
 *
 * @param {any} etat
 * @param {any} item
 * @returns {{equipped: Map<string, any>, posees: Set<string>}|null} Null si
 *   aucune case ne connait ce type de piece.
 */
export function equiper(etat, item) {
  const slot = SLOTS.find((s) => s.key === item.slot);
  if (!slot) return null;

  const equipped = new Map(etat.equipped);
  const posees = new Set(etat.posees);
  liberer(equipped, posees, item.id);

  let cible = null;
  for (let i = 0; i < slot.capacity; i += 1) {
    const cle = `${slot.key}:${i}`;
    if (!equipped.has(cle)) { cible = cle; break; }
  }
  cible ??= `${slot.key}:${slot.capacity - 1}`;

  equipped.set(cible, item);
  posees.add(cible);

  // Une arme a deux mains libere le bouclier, et reciproquement.
  if (item.slot === 'arme' && item.twoHanded) { equipped.delete('bouclier:0'); posees.delete('bouclier:0'); }
  if (item.slot === 'bouclier' && equipped.get('arme:0')?.twoHanded) {
    equipped.delete('arme:0'); posees.delete('arme:0');
  }

  return { equipped, posees };
}

/**
 * Pose une piece a la place d'une autre, dans sa case.
 *
 * Sans piece a remplacer, elle prend la premiere case libre, comme `equiper`.
 * La piece remplacee perd son verrou : le joueur a choisi de s'en separer.
 *
 * @param {any} etat
 * @param {any|null} actuel Piece a remplacer, portee.
 * @param {any} item
 */
export function remplacer(etat, actuel, item) {
  const cle = actuel
    ? [...etat.equipped.entries()].find(([, piece]) => piece.id === actuel.id)?.[0]
    : null;
  if (!cle) return equiper(etat, item);

  const equipped = new Map(etat.equipped);
  const posees = new Set(etat.posees);
  const verrous = new Set(etat.verrous);
  liberer(equipped, posees, item.id);
  verrous.delete(actuel.id);
  equipped.set(cle, item);
  posees.add(cle);
  return { equipped, posees, verrous };
}

/**
 * Vide une case. La piece qui la quittait perd son verrou.
 * @param {any} etat
 * @param {string} cle
 */
export function retirer(etat, cle) {
  const equipped = new Map(etat.equipped);
  const posees = new Set(etat.posees);
  const verrous = new Set(etat.verrous);
  const piece = equipped.get(cle);
  if (piece) verrous.delete(piece.id);
  equipped.delete(cle);
  posees.delete(cle);
  return { equipped, posees, verrous };
}

/**
 * Bannit des pieces : le solveur ne les propose plus, celles portees tombent.
 *
 * @param {any} etat
 * @param {any[]} items
 */
export function bannirPieces(etat, items) {
  const bannis = new Set(etat.bannis);
  const verrous = new Set(etat.verrous);
  const equipped = new Map(etat.equipped);
  const posees = new Set(etat.posees);

  for (const item of items) {
    bannis.add(item.id);
    verrous.delete(item.id);
    liberer(equipped, posees, item.id);
  }
  return { bannis, verrous, equipped, posees };
}

/**
 * Autorise de nouveau des pieces bannies.
 * @param {any} etat
 * @param {any[]} items
 */
export function autoriserPieces(etat, items) {
  const bannis = new Set(etat.bannis);
  for (const item of items) bannis.delete(item.id);
  return { bannis };
}

/**
 * Bannit une piece, ou l'autorise de nouveau si elle l'etait deja.
 *
 * @param {any} etat
 * @param {any} item
 * @returns {{patch: object, bannie: boolean}}
 */
export function basculerBanni(etat, item) {
  if (etat.bannis.has(item.id)) {
    return { patch: autoriserPieces(etat, [item]), bannie: false };
  }
  return { patch: bannirPieces(etat, [item]), bannie: true };
}

/**
 * Verrouille une piece, ou la libere si elle l'etait deja.
 *
 * Une piece verrouillee reste dans le build : le solveur la garde. Une piece
 * verrouillee mais absente est posee du meme geste.
 *
 * @param {any} etat
 * @param {any} item
 * @returns {{patch: object, verrouillee: boolean}}
 */
export function basculerVerrou(etat, item) {
  const verrous = new Set(etat.verrous);

  if (verrous.has(item.id)) {
    verrous.delete(item.id);
    return { patch: { verrous }, verrouillee: false };
  }

  verrous.add(item.id);
  const portee = [...etat.equipped.values()].some((p) => p.id === item.id);
  const pose = portee ? null : equiper(etat, item);
  return { patch: { ...(pose ?? {}), verrous }, verrouillee: true };
}

/**
 * Marque des pieces comme possedees, ou les enleve de la banque.
 *
 * Une piece possedee dort en banque : la porter ne demande aucun achat, et
 * elle ne compte donc pas dans les pieces a changer.
 *
 * @param {any} etat
 * @param {any[]} items
 * @param {boolean} actif Vrai pour ajouter, faux pour enlever.
 */
export function posseder(etat, items, actif) {
  const possedees = new Set(etat.possedees);
  for (const item of items) {
    if (actif) possedees.add(item.id);
    else possedees.delete(item.id);
  }
  return { possedees };
}

/**
 * Pose un build rendu par le solveur ou choisi dans une liste.
 *
 * Les pieces viennent du solveur : aucune n'est marquee comme posee a la
 * main. Les verrous qui ne portent plus sur une piece du build tombent. La
 * repartition des points suit le build quand il en apporte une.
 *
 * @param {any} etat
 * @param {{itemIds: number[], allocation?: Record<string, number>}} resultat
 * @param {Map<number, any>} itemById
 */
export function appliquerBuild(etat, resultat, itemById) {
  const equipped = new Map();
  const restant = new Map(SLOTS.map((s) => [s.key, s.capacity]));

  for (const id of resultat.itemIds) {
    const item = itemById.get(id);
    if (!item) continue;
    const libre = restant.get(item.slot) ?? 0;
    if (libre <= 0) continue;
    const slot = SLOTS.find((s) => s.key === item.slot);
    equipped.set(`${item.slot}:${slot.capacity - libre}`, item);
    restant.set(item.slot, libre - 1);
  }

  const portes = new Set([...equipped.values()].map((piece) => piece.id));
  return {
    equipped,
    posees: new Set(),
    verrous: new Set([...etat.verrous].filter((id) => portes.has(id))),
    ...(resultat.allocation ? { allocation: { ...etat.allocation, ...resultat.allocation } } : {}),
  };
}
