/**
 * Calcul incremental d'un build pour le solveur.
 *
 * L'agregation complete des statistiques prend deux tiers du cout d'une
 * evaluation (mesure au profil : 67 %). Or la recherche locale note des
 * voisins qui different d'une a trois cases du build courant. Ce module
 * garde une base agregee et n'applique que la difference : retirer les
 * apports des pieces sortantes, ajouter ceux des pieces entrantes, corriger
 * les paliers des panoplies touchees.
 *
 * Garantie : le resultat est IDENTIQUE au calcul complet, cle par cle.
 * Toutes les valeurs sont entieres, les additions sont donc exactes.
 * Le test test/incremental.test.mjs verifie l'equivalence stricte.
 */
import { aggregate, countSetPieces, derive, unequipableItems } from '../engine/build.mjs';
import { EMPTY, decode } from './genome.mjs';

/**
 * Au-dela de ce nombre de cases differentes, le delta perd son interet :
 * le calcul repart d'une agregation complete et la base se replace.
 */
export const DIFF_MAX = 8;

/** Ajoute les apports d'une source dans un porteur, en place. */
function ajouter(cible, source) {
  for (const [cle, valeur] of Object.entries(source)) {
    if (valeur) cible[cle] = (cible[cle] ?? 0) + valeur;
  }
}

/** Retire les apports d'une source d'un porteur, en place. */
function retirer(cible, source) {
  for (const [cle, valeur] of Object.entries(source)) {
    if (valeur) cible[cle] = (cible[cle] ?? 0) - valeur;
  }
}

/**
 * Cree un calculateur incremental de build.
 *
 * `rebaser(genome)` fige la base : agregation complete du genome donne.
 * `calculer(genome)` rend les statistiques du genome par delta avec la base,
 * sans toucher la base. La repartition des points est lue dans `porteur` au
 * moment du rebasage : apres un changement de points, rebasez.
 *
 * @param {object} contexte
 * @param {any[][]} contexte.pools Pools d'items par case.
 * @param {Map<number, any>} contexte.setById Panoplies indexees.
 * @param {number} contexte.level Niveau du personnage.
 * @param {{allocation: Record<string, number>}} contexte.porteur
 * @param {Record<string, boolean>} contexte.scrolls
 * @param {Map<number, Record<string, number>>|null} contexte.passives
 * @param {{classe?: number, sexe?: number}} [contexte.profile]
 * @returns {{rebaser: (genome: number[]) => void,
 *            calculer: (genome: number[]) => {stats: any, raw: any, items: any[], invalid: any[]}}}
 */
export function createIncrementalBuild({
  pools, setById, level, porteur, scrolls, passives, profile = {},
}) {
  let genomeBase = null;
  let rawBase = null;
  let setCountsBase = null;

  function rebaser(genome) {
    const items = decode(genome, pools);
    const agrege = aggregate(
      { items, level, allocation: porteur.allocation, scrolls, passives },
      setById,
    );
    genomeBase = [...genome];
    rawBase = agrege.stats;
    setCountsBase = countSetPieces(items);
  }

  function calculer(genome) {
    if (!rawBase) rebaser(genome);

    const differences = [];
    for (let i = 0; i < genome.length; i += 1) {
      if (genome[i] !== genomeBase[i]) differences.push(i);
    }
    if (differences.length > DIFF_MAX) {
      rebaser(genome);
      differences.length = 0;
    }

    const raw = { ...rawBase };
    // Panoplies dont le compte de pieces bouge : setId -> variation.
    const variations = new Map();

    for (const cellule of differences) {
      const sortant = genomeBase[cellule] === EMPTY ? null : pools[cellule][genomeBase[cellule]];
      const entrant = genome[cellule] === EMPTY ? null : pools[cellule][genome[cellule]];

      if (sortant) {
        if (sortant.stats) retirer(raw, sortant.stats);
        if (sortant.setId != null) {
          variations.set(sortant.setId, (variations.get(sortant.setId) ?? 0) - 1);
        }
        const passif = passives?.get(sortant.id);
        if (passif) retirer(raw, passif);
      }
      if (entrant) {
        if (entrant.stats) ajouter(raw, entrant.stats);
        if (entrant.setId != null) {
          variations.set(entrant.setId, (variations.get(entrant.setId) ?? 0) + 1);
        }
        const passif = passives?.get(entrant.id);
        if (passif) ajouter(raw, passif);
      }
    }

    // Les paliers de panoplie suivent la meme regle que setBonuses :
    // tiers[n - 1] porte le bonus de n pieces, rien sous deux pieces.
    for (const [setId, variation] of variations) {
      if (variation === 0) continue;
      const set = setById.get(setId);
      if (!set) continue;

      const avant = setCountsBase.get(setId) ?? 0;
      const apres = avant + variation;
      if (avant >= 2 && set.tiers[avant - 1]) retirer(raw, set.tiers[avant - 1]);
      if (apres >= 2 && set.tiers[apres - 1]) ajouter(raw, set.tiers[apres - 1]);
    }

    const items = decode(genome, pools);
    const stats = derive(raw, level);
    const invalid = unequipableItems(items, stats, profile);

    return { stats, raw, items, invalid };
  }

  return { rebaser, calculer };
}
