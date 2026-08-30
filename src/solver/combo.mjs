/**
 * Optimisateur de combo de sorts.
 *
 * Le probleme est un sac a dos borne A CHOIX MULTIPLE : chaque sort coute des
 * PA, se lance un nombre limite de fois par tour, rapporte ses degats moyens
 * par lancer, et deux variantes d'un meme couple s'excluent — au plus un
 * membre par groupe. La programmation dynamique reste exacte.
 *
 * Telefrag : en jeu, un telefrag rend 2 PA au Xelor, une seule fois par sort
 * et par tour. Le modele traduit cela en une remise de 2 PA sur le premier
 * lancer de chaque sort qui genere un telefrag.
 *
 * Condition d'elements : quand elementsMin est demande, l'etat de la
 * programmation dynamique porte aussi le masque des elements couverts.
 * Si le budget ne permet pas d'atteindre le minimum, le combo couvre le
 * maximum possible puis maximise les degats (elementsManquants le signale).
 *
 * La taille reste petite : budget <= ~20 PA, <= ~10 sorts, <= 4 lancers,
 * 32 masques d'elements au plus.
 */
import { computeSpell } from '../engine/damage.mjs';

/** PA rendus par un telefrag, une fois par sort et par tour. */
export const PA_TELEFRAG = 2;

/** Elements comptes dans la condition de couverture. */
const ELEMENTS_COMPTES = Object.freeze(['terre', 'feu', 'eau', 'air', 'neutre']);

/** Cout total de k lancers d'un sort, remise telefrag comprise. */
function coutLancers(k, cout, rend) {
  return Math.max(0, k * cout - (k > 0 ? rend : 0));
}

/** Masque de bits des elements touches par les lignes d'un sort. */
function masqueElements(spell) {
  let masque = 0;
  for (const ligne of spell.lines ?? []) {
    const bit = ELEMENTS_COMPTES.indexOf(ligne.element);
    if (bit >= 0) masque |= 1 << bit;
  }
  return masque;
}

/** Noms des elements presents dans un masque. */
function elementsDuMasque(masque) {
  return ELEMENTS_COMPTES.filter((_, bit) => masque & (1 << bit));
}

/** Nombre de bits leves d'un masque. */
function compterBits(masque) {
  let n = 0;
  for (let m = masque; m > 0; m >>= 1) n += m & 1;
  return n;
}

/** Prepare les entrees et les regroupe par couple de variantes. */
function preparerGroupes(spells, stats, { telefrag, unLancer }) {
  const groupes = new Map();

  for (const spell of spells) {
    const cout = Number.isFinite(spell.apCost) && spell.apCost > 0 ? spell.apCost : null;
    if (cout == null) continue;

    const resultat = computeSpell(spell, stats);
    if (resultat.average <= 0) continue;

    const rend = telefrag && spell.telefrag?.genere ? PA_TELEFRAG : 0;
    // L'option globale ou la case du sort limitent a un seul lancer.
    const max = unLancer || spell.unParTour ? 1 : Math.max(1, resultat.casts);

    const entree = {
      spell, cout, rend, max,
      moyenne: resultat.average,
      masque: masqueElements(spell),
    };

    const cle = spell.exclusiveGroup ?? `seul:${spell.id}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(entree);
  }

  return [...groupes.values()];
}

/** Met en forme un lancer retenu pour l'affichage. */
function ligneLancer(entree, k) {
  const { spell, moyenne, cout, rend } = entree;
  return {
    id: spell.id,
    name: spell.name ?? '',
    icon: spell.icon ?? null,
    lancers: k,
    cout,
    rend,
    coutTotal: coutLancers(k, cout, rend),
    moyenne,
    total: k * moyenne,
  };
}

/** Sac a dos sans condition d'elements : un seul axe, le budget de PA. */
function optimiserSimple(parGroupe, budget) {
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

  const lancers = [];
  let pa = budget;

  for (let g = parGroupe.length - 1; g >= 0; g -= 1) {
    const retenu = choix[g][pa];
    if (!retenu) continue;

    const entree = parGroupe[g][retenu.membre];
    lancers.push(ligneLancer(entree, retenu.k));
    pa -= coutLancers(retenu.k, entree.cout, entree.rend);
  }

  lancers.reverse();
  return { total: dp[budget], paUtilises: budget - pa, lancers };
}

/**
 * Sac a dos avec condition d'elements : l'etat porte le masque des elements
 * couverts. dp[masque][pa] = meilleurs degats en depensant exactement pa.
 */
function optimiserAvecElements(parGroupe, budget, elementsMin) {
  const NB_MASQUES = 1 << ELEMENTS_COMPTES.length;
  const creer = () => {
    const table = [];
    for (let m = 0; m < NB_MASQUES; m += 1) {
      table.push(new Float64Array(budget + 1).fill(Number.NEGATIVE_INFINITY));
    }
    return table;
  };

  let dp = creer();
  dp[0][0] = 0;
  const choix = [];

  for (const membres of parGroupe) {
    const suivant = creer();
    const pris = Array.from({ length: NB_MASQUES }, () => new Array(budget + 1).fill(null));

    for (let masque = 0; masque < NB_MASQUES; masque += 1) {
      for (let pa = 0; pa <= budget; pa += 1) {
        const base = dp[masque][pa];
        if (base === Number.NEGATIVE_INFINITY) continue;

        // Le groupe peut etre saute : l'etat se recopie tel quel.
        if (base > suivant[masque][pa]) suivant[masque][pa] = base;

        for (let m = 0; m < membres.length; m += 1) {
          const membre = membres[m];

          for (let k = 1; k <= membre.max; k += 1) {
            const paSuivant = pa + coutLancers(k, membre.cout, membre.rend);
            if (paSuivant > budget) break;

            const masqueSuivant = masque | membre.masque;
            const valeur = base + k * membre.moyenne;
            if (valeur > suivant[masqueSuivant][paSuivant]) {
              suivant[masqueSuivant][paSuivant] = valeur;
              pris[masqueSuivant][paSuivant] = { membre: m, k, masquePrec: masque, paPrec: pa };
            }
          }
        }
      }
    }

    dp = suivant;
    choix.push(pris);
  }

  // Meilleur etat final, en deux passes :
  //   1. les degats les plus hauts parmi les masques qui atteignent le minimum ;
  //   2. sinon, couvrir le maximum d'elements possible, puis les degats.
  let retenu = null;
  for (let masque = 0; masque < NB_MASQUES; masque += 1) {
    if (compterBits(masque) < elementsMin) continue;
    for (let pa = 0; pa <= budget; pa += 1) {
      const valeur = dp[masque][pa];
      if (valeur === Number.NEGATIVE_INFINITY) continue;
      if (!retenu || valeur > retenu.valeur) retenu = { masque, pa, valeur };
    }
  }

  if (!retenu) {
    for (let masque = 0; masque < NB_MASQUES; masque += 1) {
      const bits = compterBits(masque);
      for (let pa = 0; pa <= budget; pa += 1) {
        const valeur = dp[masque][pa];
        if (valeur === Number.NEGATIVE_INFINITY) continue;
        if (!retenu || bits > retenu.bits
          || (bits === retenu.bits && valeur > retenu.valeur)) {
          retenu = { masque, pa, valeur, bits };
        }
      }
    }
  }

  if (!retenu) return { total: 0, paUtilises: 0, lancers: [], masque: 0 };

  // Reconstruction : chaque groupe redonne son choix, ou se recopie.
  const lancers = [];
  let { masque, pa } = retenu;

  for (let g = parGroupe.length - 1; g >= 0; g -= 1) {
    const entree = choix[g][masque][pa];
    if (!entree) continue;

    lancers.push(ligneLancer(parGroupe[g][entree.membre], entree.k));
    masque = entree.masquePrec;
    pa = entree.paPrec;
  }

  lancers.reverse();
  return { total: retenu.valeur, paUtilises: retenu.pa, lancers, masque: retenu.masque };
}

/**
 * Choisit le meilleur combo de lancers sous un budget de PA.
 *
 * @param {any[]} spells Sorts au format du moteur (apCost, castsPerTurn, lines).
 * @param {Record<string, number>} stats Statistiques du personnage.
 * @param {object} reglages
 * @param {number} reglages.paBudget Budget de PA disponible pour le combo.
 * @param {boolean} [reglages.telefrag] Faux pour ignorer la remise telefrag.
 * @param {number} [reglages.elementsMin] Elements distincts exiges (0 = libre).
 * @param {boolean} [reglages.unLancer] Vrai : chaque sort se lance au plus une fois.
 * @returns {{total: number, budget: number, paUtilises: number, lancers: any[],
 *   elementsCouverts: string[], elementsMin: number, elementsManquants: number}}
 */
export function optimiserCombo(spells, stats, reglages) {
  const { paBudget, telefrag = true, elementsMin = 0, unLancer = false } = reglages;
  const budget = Math.max(0, Math.floor(paBudget ?? 0));
  const minElements = Math.max(0, Math.min(ELEMENTS_COMPTES.length, Math.floor(elementsMin)));

  const parGroupe = preparerGroupes(spells, stats, { telefrag, unLancer });

  const resultat = minElements > 0
    ? optimiserAvecElements(parGroupe, budget, minElements)
    : optimiserSimple(parGroupe, budget);

  // Elements couverts par les lancers retenus, pour l'affichage.
  let masque = resultat.masque ?? 0;
  if (minElements === 0) {
    const parId = new Map(parGroupe.flat().map((e) => [e.spell.id, e.masque]));
    for (const l of resultat.lancers) masque |= parId.get(l.id) ?? 0;
  }
  const elementsCouverts = elementsDuMasque(masque);

  return {
    total: resultat.total,
    budget,
    paUtilises: resultat.paUtilises,
    lancers: resultat.lancers,
    elementsCouverts,
    elementsMin: minElements,
    elementsManquants: Math.max(0, minElements - elementsCouverts.length),
  };
}
