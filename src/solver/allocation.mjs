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
 * Points encore investissables dans une caracteristique, sous sa limite.
 *
 * La limite borne la VALEUR INVESTIE, celle que montre le curseur — pas son
 * cout en points. « Limite 10 en force » arrete le curseur a dix, que ces dix
 * coutent dix points ou vingt. Elle ne touche pas a ce que l'equipement
 * apporte : borner la caracteristique entiere se demande par le maximum d'une
 * condition, qui existe pour cela.
 *
 * Une limite absente ou negative ne borne rien. Zero, en revanche, interdit
 * d'investir : c'est une limite comme une autre.
 *
 * @param {Record<string, number>|null|undefined} limites
 * @param {string} caracteristique
 * @param {number} investi Points deja mis dans cette caracteristique.
 * @returns {number} Points encore possibles, ou l'infini sans limite.
 */
export function margeSousLimite(limites, caracteristique, investi) {
  const brut = limites?.[caracteristique];

  // Une limite absente ne borne rien. Zero, lui, est une vraie limite : il
  // interdit d'investir. « Aucune limite » et « rien du tout » sont deux
  // demandes opposees, elles ne peuvent pas partager la meme valeur.
  if (brut === null || brut === undefined || brut === '') return Number.POSITIVE_INFINITY;

  const limite = Number(brut);
  if (!Number.isFinite(limite) || limite < 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, limite - investi);
}

/**
 * Optimise la repartition des points pour un porteur de statistiques donne.
 *
 * @param {object} entree
 * @param {Record<string, number>} entree.raw Statistiques agregees SANS points investis.
 * @param {number} entree.level Niveau du personnage.
 * @param {object} entree.objective Conditions, sorts et mode de recherche.
 * @param {Record<string, number>} [entree.objective.limites] Valeur finale
 *   maximale par caracteristique. Zero : aucune limite.
 * @returns {{allocation: Record<string, number>, score: number, spent: number}}
 */
export function optimiserAllocation({ raw, level, objective }) {
  const budget = availablePoints(level);
  const limites = objective.limites ?? null;
  const allocation = Object.fromEntries(SCROLLABLE.map((c) => [c, 0]));

  const statsDe = (alloc) => {
    const porteur = { ...raw };
    for (const c of SCROLLABLE) {
      if (alloc[c] > 0) porteur[c] = (porteur[c] ?? 0) + alloc[c];
    }
    return derive(porteur, level, objective.menace);
  };

  const scoreDe = (alloc) => {
    const stats = statsDe(alloc);
    const detail = scoreBuild(stats, objective);
    const violations = maxViolations(objective.conditions, stats, detail.damage);
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

      // La limite de la caracteristique ferme la tranche avant le budget :
      // un point de plus ferait passer le curseur au-dessus de la valeur
      // demandee.
      tranche = Math.min(tranche, margeSousLimite(limites, c, investi));

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
  // Une limite sur la vitalite ferme aussi cette porte de sortie : les points
  // restent alors sans emploi, ce que le joueur a demande.
  const margeVitalite = margeSousLimite(limites, 'vitalite', allocation.vitalite);
  const reliquat = Math.min(budget - depense, margeVitalite);
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
