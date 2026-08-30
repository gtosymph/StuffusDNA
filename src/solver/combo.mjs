/**
 * Optimisateur de combo de sorts.
 *
 * Le probleme est un sac a dos borne : chaque sort coute des PA, se lance un
 * nombre limite de fois par tour, et rapporte ses degats moyens par lancer.
 * L'optimiseur choisit le nombre de lancers de chaque sort pour maximiser les
 * degats sous un budget de PA, par programmation dynamique exacte.
 *
 * Telefrag : en jeu, un telefrag rend 2 PA au Xelor, une seule fois par sort
 * et par tour. Le modele traduit cela en une remise de 2 PA sur le premier
 * lancer de chaque sort qui genere un telefrag. L'ordre des lancers ne change
 * alors pas le total : le choix des quantites suffit.
 *
 * La taille reste minuscule (budget <= ~20 PA, <= ~10 sorts, <= 4 lancers) :
 * le calcul exact tient dans quelques centaines d'operations par evaluation.
 */
import { computeSpell } from '../engine/damage.mjs';

/** PA rendus par un telefrag, une fois par sort et par tour. */
export const PA_TELEFRAG = 2;

/** Cout total de k lancers d'un sort, remise telefrag comprise. */
function coutLancers(k, cout, rend) {
  return Math.max(0, k * cout - (k > 0 ? rend : 0));
}

/**
 * Choisit le meilleur combo de lancers sous un budget de PA.
 *
 * @param {any[]} spells Sorts au format du moteur (apCost, castsPerTurn, lines).
 * @param {Record<string, number>} stats Statistiques du personnage.
 * @param {object} reglages
 * @param {number} reglages.paBudget Budget de PA disponible pour le combo.
 * @param {boolean} [reglages.telefrag] Faux pour ignorer la remise telefrag.
 * @returns {{total: number, budget: number, paUtilises: number, lancers: any[]}}
 */
export function optimiserCombo(spells, stats, { paBudget, telefrag = true }) {
  const budget = Math.max(0, Math.floor(paBudget ?? 0));

  // Deux variantes d'un meme couple s'excluent en jeu : les entrees se
  // regroupent par couple, et le sac a dos devient a choix multiple — au
  // plus un membre par groupe, avec son nombre de lancers.
  const groupes = new Map();
  for (const spell of spells) {
    const cout = Number.isFinite(spell.apCost) && spell.apCost > 0 ? spell.apCost : null;
    if (cout == null) continue;

    const resultat = computeSpell(spell, stats);
    if (resultat.average <= 0) continue;

    const rend = telefrag && spell.telefrag?.genere ? PA_TELEFRAG : 0;
    const entree = { spell, moyenne: resultat.average, cout, max: Math.max(1, resultat.casts), rend };

    const cle = spell.exclusiveGroup ?? `seul:${spell.id}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(entree);
  }

  const parGroupe = [...groupes.values()];

  // dp[pa] : meilleurs degats avec au plus pa PA. choix[g][pa] memorise le
  // membre retenu et son nombre de lancers, pour reconstruire le combo.
  let dp = new Float64Array(budget + 1);
  const choix = [];

  for (const membres of parGroupe) {
    const suivant = new Float64Array(budget + 1);
    const pris = [];

    for (let pa = 0; pa <= budget; pa += 1) {
      let meilleur = dp[pa];
      let retenu = null;

      for (let m = 0; m < membres.length; m += 1) {
        const { moyenne, cout, max, rend } = membres[m];

        for (let k = 1; k <= max; k += 1) {
          const coutTotal = coutLancers(k, cout, rend);
          if (coutTotal > pa) break;

          const valeur = dp[pa - coutTotal] + k * moyenne;
          if (valeur > meilleur) {
            meilleur = valeur;
            retenu = { membre: m, k };
          }
        }
      }

      suivant[pa] = meilleur;
      pris.push(retenu);
    }

    dp = suivant;
    choix.push(pris);
  }

  // Reconstruction du combo, du dernier groupe vers le premier.
  const lancers = [];
  let pa = budget;

  for (let g = parGroupe.length - 1; g >= 0; g -= 1) {
    const retenu = choix[g][pa];
    if (!retenu) continue;

    const { spell, moyenne, cout, rend } = parGroupe[g][retenu.membre];
    const coutTotal = coutLancers(retenu.k, cout, rend);

    lancers.push({
      id: spell.id,
      name: spell.name ?? '',
      icon: spell.icon ?? null,
      lancers: retenu.k,
      cout,
      rend,
      coutTotal,
      moyenne,
      total: retenu.k * moyenne,
    });
    pa -= coutTotal;
  }

  lancers.reverse();

  return { total: dp[budget], budget, paUtilises: budget - pa, lancers };
}
