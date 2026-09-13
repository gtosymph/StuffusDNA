/**
 * Explication d'un build.
 *
 * Le solveur rend un build sans jamais dire pourquoi. Deux questions
 * reviennent alors : quelle piece porte le resultat, et quelle statistique
 * ferait encore monter les degats. Ce module y repond par la mesure, pas par
 * une regle : il enleve chaque piece pour voir ce que le score perd, puis
 * ajoute un peu de chaque statistique pour voir ce que les degats gagnent.
 */
import { computeBuild } from '../engine/build.mjs';
import { ELEMENT_CHARACTERISTIC } from '../data/stats.mjs';
import { damageValue, scoreBuild } from './score.mjs';

/**
 * Statistiques dont on mesure l'effet, avec le pas applique a chacune.
 *
 * Le pas differe par famille : dix points de caracteristique se gagnent aussi
 * facilement qu'un pour cent de dommages, les comparer au meme pas n'aurait
 * aucun sens pour le joueur.
 */
export const PAS_PAR_STAT = Object.freeze({
  puissance: 10,
  force: 10,
  intelligence: 10,
  chance: 10,
  agilite: 10,
  dommagesNeutre: 1,
  dommagesTerre: 1,
  dommagesFeu: 1,
  dommagesEau: 1,
  dommagesAir: 1,
  dommages: 1,
  critique: 1,
  dommagesCritiques: 1,
  pctDommagesArmes: 1,
  pctDommagesSorts: 1,
  pctDommagesMelee: 1,
  pctDommagesDistance: 1,
  pctDommagesFinaux: 1,
});

/**
 * Apport de chaque piece au score du build.
 *
 * L'apport d'une piece vaut ce que le build perd quand on l'enleve. Les
 * bonus de panoplie sont donc comptes : enlever une piece peut faire tomber
 * un palier, et la perte le montre.
 *
 * @param {any[]} items Pieces portees.
 * @param {object} contexte
 * @param {number} contexte.level
 * @param {Record<string, number>} contexte.allocation
 * @param {Record<string, boolean>} contexte.scrolls
 * @param {any} contexte.passives
 * @param {any} contexte.profile
 * @param {Map<number, any>} contexte.setById
 * @param {object} contexte.objective
 * @returns {{id: number, fr: string, slot: string, apport: number, degats: number,
 *   casseCondition: boolean, scoreAvec: number, scoreSans: number}[]}
 */
export function apportsPieces(items, contexte) {
  const { level, allocation, scrolls, passives, profile, setById, objective } = contexte;

  const noter = (portees) => {
    const { stats } = computeBuild(
      { items: portees, level, allocation, scrolls, passives, profile, menace: objective?.menace },
      setById,
    );
    return scoreBuild(stats, objective);
  };

  const avec = noter(items);

  const apports = items.map((item, index) => {
    const sans = noter(items.filter((_, i) => i !== index));

    // Deux mesures separees : le score melange les degats et les penalites de
    // condition, si bien qu'une piece qui rend un seul point d'action parait
    // plus utile qu'une piece qui rend cinq cents degats. Le joueur a besoin
    // des deux informations, pas de leur somme.
    return {
      id: item.id,
      fr: item.fr,
      slot: item.slot,
      apport: avec.score - sans.score,
      degats: Math.max(0, (avec.damage ?? 0) - (sans.damage ?? 0)),
      casseCondition: (sans.unmet?.length ?? 0) > (avec.unmet?.length ?? 0),
      // Les conditions que la piece est seule a tenir : le joueur voit ce
      // qu'il perdrait vraiment, pas seulement qu'il perdrait quelque chose.
      conditionsPerdues: (sans.unmet ?? [])
        .filter((manque) => !(avec.unmet ?? []).some((u) => u.stat === manque.stat))
        .map((manque) => manque.stat),
      scoreAvec: avec.score,
      scoreSans: sans.score,
    };
  });

  apports.sort((a, b) => b.degats - a.degats || b.apport - a.apport);
  return apports;
}

/**
 * Gain de degats rendu par un peu de chaque statistique.
 *
 * Une statistique qui ne touche aucun des sorts retenus rend zero : le joueur
 * voit ainsi tout de suite ou investir, et ou ne rien investir.
 *
 * @param {Record<string, number>} stats Statistiques du build.
 * @param {object} objective Objectif, dont les sorts comptes.
 * @returns {{stat: string, pas: number, gain: number, gainParPas: number}[]}
 */
export function sensibiliteStats(stats, objective) {
  const spells = objective?.spells ?? [];
  if (spells.length === 0) return [];

  const base = damageValue(spells, stats).total;

  const mesures = [];
  for (const [stat, pas] of Object.entries(PAS_PAR_STAT)) {
    const augmentees = { ...stats, [stat]: (stats[stat] ?? 0) + pas };
    const gain = damageValue(spells, augmentees).total - base;
    mesures.push({ stat, pas, gain, gainParPas: gain / pas });
  }

  mesures.sort((a, b) => b.gain - a.gain);
  return mesures;
}

/**
 * Elements touches par les sorts retenus.
 * Sert a n'expliquer que ce qui concerne le build : un sort de feu ne rend
 * aucun interet a l'agilite.
 * @param {object} objective
 * @returns {Set<string>}
 */
export function elementsUtiles(objective) {
  const caracs = new Set();
  for (const spell of objective?.spells ?? []) {
    for (const ligne of spell.lines ?? []) {
      const carac = ELEMENT_CHARACTERISTIC[ligne.element];
      if (carac) caracs.add(carac);
    }
  }
  return caracs;
}
