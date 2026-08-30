/**
 * Repartition automatique des points de caracteristique.
 *
 * Le solveur investit les points la ou ils rapportent le plus de score :
 * une descente gloutonne compare, tranche par tranche, le gain de chaque
 * caracteristique rapporte a son cout en points.
 */
import { derive } from '../engine/build.mjs';
import { SCROLLABLE, availablePoints, pointCost } from '../engine/characteristics.mjs';
import { maxViolations, scoreBuild } from './score.mjs';

/** Penalite locale par maximum absolu franchi, alignee sur le solveur. */
const PENALITE_MAX = 1e6;

/**
 * Statistiques de condition qui bougent d'une unite par point investi.
 * Elles servent a caler les tranches sur les objectifs des conditions.
 */
const CIBLES_DIRECTES = Object.freeze({
  vitalite: ['vitalite'],
  sagesse: ['sagesse'],
  force: ['force', 'initiative'],
  intelligence: ['intelligence', 'initiative'],
  chance: ['chance', 'initiative'],
  agilite: ['agilite', 'initiative'],
});

/** Largeur d'une tranche d'investissement par defaut. */
const TRANCHE = 100;

/** Cout d'un point de plus, au niveau d'investissement donne. */
function coutUnitaire(caracteristique, investi) {
  return pointCost(caracteristique, investi + 1) - pointCost(caracteristique, investi);
}

/**
 * Optimise la repartition des points pour un porteur de statistiques donne.
 *
 * @param {object} entree
 * @param {Record<string, number>} entree.raw Statistiques agregees SANS points investis.
 * @param {number} entree.level Niveau du personnage.
 * @param {object} entree.objective Conditions, sorts et mode de recherche.
 * @returns {{allocation: Record<string, number>, score: number, spent: number}}
 */
export function optimiserAllocation({ raw, level, objective }) {
  const budget = availablePoints(level);
  const allocation = Object.fromEntries(SCROLLABLE.map((c) => [c, 0]));

  const statsDe = (alloc) => {
    const porteur = { ...raw };
    for (const c of SCROLLABLE) {
      if (alloc[c] > 0) porteur[c] = (porteur[c] ?? 0) + alloc[c];
    }
    return derive(porteur, level);
  };

  const scoreDe = (alloc) => {
    const stats = statsDe(alloc);
    const detail = scoreBuild(stats, objective);
    const violations = maxViolations(objective.conditions, stats);
    return detail.score - violations.length * PENALITE_MAX;
  };

  let depense = 0;
  let scoreCourant = scoreDe(allocation);

  for (let garde = 0; garde < 200; garde += 1) {
    const derives = statsDe(allocation);
    let meilleur = null;

    for (const c of SCROLLABLE) {
      const investi = allocation[c];
      const unitaire = coutUnitaire(c, investi);
      const restant = budget - depense;
      if (unitaire > restant) continue;

      // La tranche s'arrete a la prochaine borne : palier de cout,
      // objectif ou maximum d'une condition, budget restant.
      let tranche = c === 'vitalite' || c === 'sagesse'
        ? TRANCHE
        : TRANCHE - (investi % TRANCHE);

      for (const condition of objective.conditions ?? []) {
        if (!CIBLES_DIRECTES[c].includes(condition.stat)) continue;
        const valeur = derives[condition.stat === 'vitalite' ? 'pdv' : condition.stat] ?? 0;
        for (const borne of [Number(condition.target), Number(condition.max)]) {
          const distance = borne - valeur;
          if (Number.isFinite(distance) && distance > 0 && distance < tranche) {
            tranche = Math.ceil(distance);
          }
        }
      }

      // Le cout est constant a l'interieur d'un palier : la tranche se
      // reduit pour tenir dans le budget.
      tranche = Math.min(tranche, Math.floor(restant / unitaire));
      if (tranche <= 0) continue;

      const essai = { ...allocation, [c]: investi + tranche };
      const score = scoreDe(essai);
      const gain = score - scoreCourant;
      if (gain <= 0) continue;

      const cout = pointCost(c, investi + tranche) - pointCost(c, investi);
      const ratio = gain / cout;
      if (!meilleur || ratio > meilleur.ratio) {
        meilleur = { caracteristique: c, tranche, cout, score, ratio };
      }
    }

    if (!meilleur) break;

    allocation[meilleur.caracteristique] += meilleur.tranche;
    depense += meilleur.cout;
    scoreCourant = meilleur.score;
  }

  // Les points sans gain de score partent en vitalite : un point de vie de
  // plus ne coute rien et ne dessert jamais un build, sauf maximum absolu.
  const reliquat = budget - depense;
  if (reliquat > 0) {
    const essai = { ...allocation, vitalite: allocation.vitalite + reliquat };
    const score = scoreDe(essai);
    if (score >= scoreCourant) {
      allocation.vitalite += reliquat;
      depense += reliquat;
      scoreCourant = score;
    }
  }

  return { allocation, score: scoreCourant, spent: depense };
}
