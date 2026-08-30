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

/** Copie d'un sort avec un supplement de degats de base sur sa premiere ligne. */
function sortBonifie(spell, supplement) {
  if (supplement <= 0) return spell;
  return {
    ...spell,
    lines: (spell.lines ?? []).map((ligne, rang) => (rang === 0
      ? {
        ...ligne,
        min: ligne.min + supplement,
        max: ligne.max + supplement,
        critMin: (ligne.critMin ?? ligne.min) + supplement,
        critMax: (ligne.critMax ?? ligne.max) + supplement,
      }
      : ligne)),
  };
}

/** Prepare les entrees et les regroupe par couple de variantes. */
function preparerGroupes(spells, stats, { telefrag, unLancer, cibleTelefrag }) {
  const groupes = new Map();

  for (const spell of spells) {
    const cout = Number.isFinite(spell.apCost) && spell.apCost > 0 ? spell.apCost : null;
    if (cout == null) continue;

    const resultat = computeSpell(spell, stats);
    if (resultat.average <= 0) continue;

    const tf = cibleTelefrag ? spell.telefragCible ?? null : null;
    const rend = telefrag && spell.telefrag?.genere ? PA_TELEFRAG : 0;
    // L'option globale ou la case du sort limitent a un seul lancer.
    const max = unLancer || spell.unParTour ? 1 : Math.max(1, resultat.casts);

    // Valeur cumulee de k lancers. Avec un cumul telefrag (Fletrissement),
    // chaque lancer part d'une base augmentee par les lancers precedents.
    const valeurs = new Float64Array(max + 1);
    let cumul = 0;
    for (let k = 1; k <= max; k += 1) {
      cumul += tf && tf.bonusParLancer > 0
        ? computeSpell(sortBonifie(spell, (k - 1) * tf.bonusParLancer), stats).average
        : resultat.average;
      valeurs[k] = cumul;
    }

    const entree = {
      spell,
      // Le vol de PA sur cible telefrag (Ralentissement) reduit le cout.
      cout: Math.max(0, cout - (tf?.gainPa ?? 0)),
      rend,
      max,
      moyenne: resultat.average,
      valeurs,
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
  const { spell, moyenne, cout, rend, valeurs } = entree;
  return {
    id: spell.id,
    name: spell.name ?? '',
    icon: spell.icon ?? null,
    lancers: k,
    cout,
    rend,
    coutTotal: coutLancers(k, cout, rend),
    moyenne,
    total: valeurs[k],
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
        const { valeurs, cout, max, rend } = membres[m];

        for (let k = 1; k <= max; k += 1) {
          const coutTotal = coutLancers(k, cout, rend);
          if (coutTotal > pa) break;

          const valeur = dp[pa - coutTotal] + valeurs[k];
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
 * couverts. dp[masque * (budget+1) + pa] = meilleurs degats en depensant
 * exactement pa.
 *
 * Le calcul tourne pour CHAQUE build essaye par le solveur : tout reste en
 * tableaux plats. Les bits se compactent sur les elements reellement
 * presents dans les sorts (souvent 3 ou 4, jamais plus de 5), ce qui divise
 * le nombre de masques et le cout d'autant.
 */
function optimiserAvecElements(parGroupe, budget, elementsMin) {
  // Compactage : un bit par element present, dans l'ordre de decouverte.
  let union = 0;
  for (const membres of parGroupe) for (const m of membres) union |= m.masque;

  const bitsPresents = [];
  for (let bit = 0; bit < ELEMENTS_COMPTES.length; bit += 1) {
    if (union & (1 << bit)) bitsPresents.push(bit);
  }

  const compact = (masque) => {
    let sortie = 0;
    for (let i = 0; i < bitsPresents.length; i += 1) {
      if (masque & (1 << bitsPresents[i])) sortie |= 1 << i;
    }
    return sortie;
  };
  const etendre = (masque) => {
    let sortie = 0;
    for (let i = 0; i < bitsPresents.length; i += 1) {
      if (masque & (1 << i)) sortie |= 1 << bitsPresents[i];
    }
    return sortie;
  };

  const nbMasques = 1 << bitsPresents.length;
  const largeur = budget + 1;
  const taille = nbMasques * largeur;

  let dp = new Float64Array(taille).fill(Number.NEGATIVE_INFINITY);
  let suivant = new Float64Array(taille);
  dp[0] = 0;

  // Choix encodes en entiers : membre, lancers, masque et pa precedents.
  const choix = [];

  for (const membres of parGroupe) {
    suivant.set(dp);
    const pris = new Int32Array(taille).fill(-1);
    const masquesMembres = membres.map((m) => compact(m.masque));

    for (let masque = 0; masque < nbMasques; masque += 1) {
      const rang = masque * largeur;

      for (let pa = 0; pa <= budget; pa += 1) {
        const base = dp[rang + pa];
        if (base === Number.NEGATIVE_INFINITY) continue;

        for (let m = 0; m < membres.length; m += 1) {
          const membre = membres[m];
          const masqueSuivant = masque | masquesMembres[m];
          const rangSuivant = masqueSuivant * largeur;

          for (let k = 1; k <= membre.max; k += 1) {
            const paSuivant = pa + coutLancers(k, membre.cout, membre.rend);
            if (paSuivant > budget) break;

            const valeur = base + membre.valeurs[k];
            if (valeur > suivant[rangSuivant + paSuivant]) {
              suivant[rangSuivant + paSuivant] = valeur;
              pris[rangSuivant + paSuivant] = (((m << 4) | k) << 14) | (masque << 8) | pa;
            }
          }
        }
      }
    }

    const echange = dp;
    dp = suivant;
    suivant = echange;
    choix.push(pris);
  }

  // Meilleur etat final, en deux passes :
  //   1. les degats les plus hauts parmi les masques qui atteignent le minimum ;
  //   2. sinon, couvrir le maximum d'elements possible, puis les degats.
  let retenu = null;
  for (let masque = 0; masque < nbMasques; masque += 1) {
    if (compterBits(masque) < elementsMin) continue;
    for (let pa = 0; pa <= budget; pa += 1) {
      const valeur = dp[masque * largeur + pa];
      if (valeur === Number.NEGATIVE_INFINITY) continue;
      if (!retenu || valeur > retenu.valeur) retenu = { masque, pa, valeur };
    }
  }

  if (!retenu) {
    for (let masque = 0; masque < nbMasques; masque += 1) {
      const bits = compterBits(masque);
      for (let pa = 0; pa <= budget; pa += 1) {
        const valeur = dp[masque * largeur + pa];
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
    const code = choix[g][masque * largeur + pa];
    if (code < 0) continue;

    const k = (code >> 14) & 0xf;
    const membre = code >> 18;
    lancers.push(ligneLancer(parGroupe[g][membre], k));
    masque = (code >> 8) & 0x3f;
    pa = code & 0xff;
  }

  lancers.reverse();
  return {
    total: retenu.valeur,
    paUtilises: retenu.pa,
    lancers,
    masque: etendre(retenu.masque),
  };
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
 * @param {boolean} [reglages.cibleTelefrag] Vrai : bonus des sorts sur cible telefrag.
 * @returns {{total: number, budget: number, paUtilises: number, lancers: any[],
 *   elementsCouverts: string[], elementsMin: number, elementsManquants: number}}
 */
export function optimiserCombo(spells, stats, reglages) {
  const { paBudget, telefrag = true, elementsMin = 0, unLancer = false,
    cibleTelefrag = false } = reglages;
  const budget = Math.max(0, Math.floor(paBudget ?? 0));
  const minElements = Math.max(0, Math.min(ELEMENTS_COMPTES.length, Math.floor(elementsMin)));

  const parGroupe = preparerGroupes(spells, stats, { telefrag, unLancer, cibleTelefrag });

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
