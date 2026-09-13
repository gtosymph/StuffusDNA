/**
 * Meilleur remplacement par case.
 *
 * L'apport d'une piece dit ce qu'elle vaut ; le remplacement dit quoi acheter.
 * Pour chaque case du personnage, le catalogue entier s'essaie a sa place :
 * la piece qui fait gagner le plus de degats sans casser une condition se
 * montre, avec son gain. Une case vide compte aussi — la remplir est souvent
 * le premier achat.
 *
 * Le calcul est exhaustif et non genetique : un seul echange a la fois, tous
 * les candidats. Mesure sur le catalogue entier : cinq mille evaluations en
 * une cinquantaine de millisecondes. Les points de caracteristique restent
 * ceux du joueur : un remplacement qui demanderait de les redistribuer se
 * lit dans la recherche, pas ici.
 */
import { computeBuild } from '../engine/build.mjs';
import { estObtenable } from '../data/criteria.mjs';
import { SLOTS } from '../data/slots.mjs';
import { maxViolations, scoreBuild } from './score.mjs';

const SANS_DETAILS = Object.freeze({ details: false });

/**
 * Candidats admis, par case.
 *
 * @param {any[]} catalogue
 * @param {{level: number, bannis: Set<number>}} contexte
 * @returns {Map<string, any[]>}
 */
function candidatsParCase(catalogue, { level, bannis }) {
  const parCase = new Map();
  for (const item of catalogue) {
    if (item.level > level || bannis.has(item.id) || !estObtenable(item)) continue;
    if (!parCase.has(item.slot)) parCase.set(item.slot, []);
    parCase.get(item.slot).push(item);
  }
  return parCase;
}

/**
 * Vrai quand une piece ne peut pas rejoindre le build tel quel.
 * @param {any} candidat
 * @param {any[]} autres Pieces portees, la case remplacee exclue.
 */
function incompatible(candidat, autres) {
  if (autres.some((item) => item.id === candidat.id)) return true;
  if (candidat.slot === 'arme' && candidat.twoHanded && autres.some((item) => item.slot === 'bouclier')) return true;
  if (candidat.slot === 'bouclier' && autres.some((item) => item.slot === 'arme' && item.twoHanded)) return true;
  return false;
}

/**
 * Meilleur remplacement pour chaque case, du plus gros gain au plus petit.
 *
 * Quand le build tient ses conditions, seul un echange qui les tient encore
 * et frappe plus fort se propose. Quand il ne les tient pas, seul un echange
 * qui les redresse se propose : c'est le premier achat a faire.
 *
 * @param {any[]} items Pieces portees.
 * @param {object} contexte
 * @param {any[]} contexte.catalogue Toutes les pieces connues.
 * @param {Set<number>} [contexte.bannis]
 * @param {number} contexte.level
 * @param {Record<string, number>} contexte.allocation
 * @param {Record<string, boolean>} contexte.scrolls
 * @param {any} contexte.passives
 * @param {any} contexte.profile
 * @param {Map<number, any>} contexte.setById
 * @param {object} contexte.objective
 * @returns {{slot: string, actuel: any|null, remplacant: any, gainDegats: number,
 *   redresse: boolean, damage: number}[]}
 */
export function meilleursRemplacements(items, contexte) {
  const {
    catalogue, bannis = new Set(), level, allocation, scrolls, passives, profile, setById, objective,
  } = contexte;

  const noter = (portees) => {
    const { stats, invalid } = computeBuild(
      { items: portees, level, allocation, scrolls, passives, profile, menace: objective?.menace },
      setById,
    );
    const detail = scoreBuild(stats, objective, SANS_DETAILS);
    if (invalid.length > 0
      || maxViolations(objective.conditions, stats, detail.damage).length > 0) return null;
    return detail;
  };

  const base = noter(items) ?? scoreBuild(
    computeBuild(
      { items, level, allocation, scrolls, passives, profile, menace: objective?.menace },
      setById,
    ).stats, objective, SANS_DETAILS,
  );

  // Un echange vaut s'il tient les conditions et frappe plus fort ; ou, quand
  // le build ne les tient pas, s'il les redresse.
  const meilleurQue = (detail, plancher) => detail !== null && detail.satisfied
    && (!base.satisfied || detail.damage > plancher);

  const candidats = candidatsParCase(catalogue, { level, bannis });
  const propositions = [];

  const essayer = (slot, actuel, autres, poser) => {
    let meilleur = null;
    for (const candidat of candidats.get(slot) ?? []) {
      if (incompatible(candidat, autres)) continue;
      const detail = noter(poser(candidat));
      if (!meilleurQue(detail, meilleur?.damage ?? base.damage)) continue;
      if (meilleur && detail.damage <= meilleur.damage) continue;
      meilleur = { slot, actuel, remplacant: candidat, damage: detail.damage,
        gainDegats: detail.damage - base.damage, redresse: !base.satisfied };
    }
    if (meilleur) propositions.push(meilleur);
  };

  // Chaque case portee : le catalogue de sa case s'essaie a sa place.
  items.forEach((actuel, index) => {
    const autres = items.filter((_, i) => i !== index);
    essayer(actuel.slot, actuel, autres, (candidat) => items.map((it, i) => (i === index ? candidat : it)));
  });

  // Chaque case libre : le catalogue de sa case s'essaie en plus. Une seule
  // proposition par case, meme quand deux emplacements sont libres.
  for (const slot of SLOTS) {
    const portees = items.filter((item) => item.slot === slot.key).length;
    if (portees >= slot.capacity) continue;
    essayer(slot.key, null, items, (candidat) => [...items, candidat]);
  }

  propositions.sort((a, b) => Number(b.redresse) - Number(a.redresse) || b.gainDegats - a.gainDegats);
  return propositions;
}
