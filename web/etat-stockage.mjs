/**
 * Rangement de l'etat et du dernier resultat dans le navigateur.
 *
 * Deux choses survivent a un rechargement : ce que le joueur a regle, et la
 * courbe de sa derniere recherche. Ce module ne connait ni le document ni le
 * rendu : il recoit un etat, en range une forme legere, et rend un etat
 * complete a la lecture.
 */
import { classeConnue } from './classes.mjs';
import { CLES, ecrireJson, lireJson } from './stockage.mjs';

/**
 * Version du format des limites de caracteristique.
 *
 * La version 1 se servait de zero pour dire « aucune limite ». La version 2
 * distingue les deux demandes : le champ vide ne borne rien, zero interdit
 * d'investir. Sans cette marque, un etat range par l'ancienne version
 * fermerait les six caracteristiques d'un coup.
 */
export const VERSION_LIMITES = 2;

/** Nombre maximal de points de courbe gardes par fil dans le navigateur. */
export const POINTS_GARDES = 600;

/**
 * Remet les limites d'un etat range au format courant.
 *
 * @param {any} data Etat lu du rangement.
 * @returns {Record<string, number|null>}
 */
export function migrerLimites(data) {
  if (data.limitesVersion >= VERSION_LIMITES) return data.limites;

  // Version 1 : les zeros voulaient dire « aucune limite ».
  const migrees = {};
  for (const [cle, valeur] of Object.entries(data.limites)) {
    migrees[cle] = Number(valeur) > 0 ? Number(valeur) : null;
  }
  return migrees;
}

/**
 * Forme rangee de l'etat : les pieces par identifiant, les ensembles en listes.
 * @param {any} etat
 */
export function serialiserEtat(etat) {
  return {
    niveau: etat.niveau, classe: etat.classe, sexe: etat.sexe,
    conditions: etat.conditions, sorts: etat.sorts, options: etat.options,
    mode: etat.mode, partDegats: etat.partDegats,
    allocation: etat.allocation, scrolls: etat.scrolls,
    limites: etat.limites, limitesVersion: VERSION_LIMITES,
    bannis: [...etat.bannis],
    possedees: [...etat.possedees],
    reference: etat.reference,
    changementsMax: etat.changementsMax,
    verrous: [...etat.verrous],
    equipped: [...etat.equipped.entries()].map(([cle, piece]) => [cle, piece.id]),
    posees: [...etat.posees],
  };
}

/** Modes de recherche acceptes dans un etat range. */
const MODES = new Set(['degats', 'endurance', 'mixte', 'caracteristiques']);

/** Enregistre l'etat courant : un rechargement ne perd plus le travail. */
export function sauverEtat(etat) {
  ecrireJson(CLES.etat, serialiserEtat(etat));
}

/**
 * Complete un etat avec ce que le rangement porte.
 *
 * Chaque champ ne remplace le sien que s'il a la forme attendue : un
 * rangement abime ou ancien ne fait tomber que le champ concerne.
 *
 * @param {any} etat Etat de depart, d'ordinaire l'etat initial.
 * @param {{itemById: Map<number, any>}} catalogue
 * @returns {any} Nouvel etat ; le meme si rien n'est range.
 */
export function reprendreEtat(etat, catalogue) {
  const data = lireJson(CLES.etat, null);
  if (!data || typeof data !== 'object') return etat;

  const equipped = new Map();
  for (const [cle, id] of data.equipped ?? []) {
    const piece = catalogue.itemById.get(id);
    if (piece) equipped.set(cle, piece);
  }

  return {
    ...etat,
    ...(Number.isFinite(data.niveau) ? { niveau: data.niveau } : {}),
    ...(Number.isFinite(data.classe) ? { classe: classeConnue(data.classe) } : {}),
    ...(Number.isFinite(data.sexe) ? { sexe: data.sexe } : {}),
    ...(Array.isArray(data.conditions) ? { conditions: data.conditions } : {}),
    ...(Array.isArray(data.sorts) ? { sorts: data.sorts } : {}),
    // Le mode n'existait pas : un etat range avant lui se relit comme le
    // faisait l'ancienne regle, d'apres les sorts et l'arme.
    mode: MODES.has(data.mode)
      ? data.mode
      : (((data.sorts?.length ?? 0) > 0 || data.options?.arme) ? 'degats' : 'caracteristiques'),
    // Le mode mixte n'existait pas : un etat range avant lui n'a pas de part,
    // et garde donc l'equilibre de l'etat initial.
    ...(Number.isFinite(data.partDegats) ? { partDegats: data.partDegats } : {}),
    ...(data.options ? { options: { ...etat.options, ...data.options } } : {}),
    ...(data.allocation ? { allocation: { ...etat.allocation, ...data.allocation } } : {}),
    ...(data.scrolls ? { scrolls: { ...etat.scrolls, ...data.scrolls } } : {}),
    ...(data.limites ? { limites: { ...etat.limites, ...migrerLimites(data) } } : {}),
    ...(Array.isArray(data.bannis) ? { bannis: new Set(data.bannis) } : {}),
    ...(Array.isArray(data.possedees) ? { possedees: new Set(data.possedees) } : {}),
    ...(data.reference?.itemIds ? { reference: data.reference } : {}),
    ...(Number.isFinite(data.changementsMax) ? { changementsMax: data.changementsMax } : {}),
    ...(Array.isArray(data.verrous) ? { verrous: new Set(data.verrous) } : {}),
    equipped,
    posees: new Set(data.posees ?? []),
  };
}

/**
 * Echantillonne une courbe pour qu'elle tienne dans le rangement.
 *
 * Le dernier point reste toujours : c'est lui que le joueur lit.
 *
 * @param {number[]} history
 * @returns {number[]}
 */
export function echantillonner(history) {
  const pas = Math.max(1, Math.ceil(history.length / POINTS_GARDES));
  const points = [];
  for (let i = 0; i < history.length; i += pas) points.push(history[i]);
  if (history.length > 0 && points[points.length - 1] !== history[history.length - 1]) {
    points.push(history[history.length - 1]);
  }
  return points;
}

/**
 * Enregistre la courbe et le compteur : un rechargement garde le resultat.
 *
 * @param {{generationMax: number, fils: number, intensite: string,
 *   historiques: {seed: number, history: number[]}[]}} resultat
 */
export function sauverResultat({ generationMax, fils, intensite, historiques }) {
  ecrireJson(CLES.resultat, {
    generationMax,
    fils,
    intensite,
    historiques: historiques.map(({ seed, history }) => ({ seed, history: echantillonner(history) })),
  });
}

/**
 * Dernier resultat range, courbes nettoyees.
 * @returns {{generationMax: number, fils: number, intensite: any,
 *   historiques: {seed: number, history: number[]}[]}|null}
 */
export function lireResultat() {
  const data = lireJson(CLES.resultat, null);
  if (!data || !Array.isArray(data.historiques)) return null;
  return {
    ...data,
    historiques: data.historiques.filter((h) => Array.isArray(h?.history)),
  };
}
