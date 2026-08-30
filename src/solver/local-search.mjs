/**
 * Descente locale sur un build.
 *
 * L'algorithme genetique explore largement mais affine mal : il ne se demande
 * jamais si le remplacement d'une seule piece ameliorerait le build. Cette
 * descente comble ce manque. A build fige, elle parcourt chaque emplacement,
 * essaie les pieces du pool et retient la meilleure. Elle recommence tant que
 * le score monte.
 */
import { EMPTY, repair } from './genome.mjs';

/** Reglages par defaut de la descente. */
export const DEFAULT_LOCAL = Object.freeze({
  /** Nombre maximal de parcours complets des emplacements. */
  maxPasses: 3,
  /** Pieces essayees par emplacement, les mieux notees d'abord. */
  candidatesPerSlot: 60,
  /** La case vide est aussi essayee : un emplacement libre vaut parfois mieux. */
  tryEmpty: true,
});

/**
 * Ordonne les pieces d'un pool par leur interet pour l'objectif.
 *
 * Le classement sert a n'essayer qu'une tete de liste plutot que tout le pool.
 * Il ne depend pas du build courant, il se calcule donc une seule fois.
 *
 * @param {any[]} pool
 * @param {string[]} stats Statistiques visees par les conditions.
 * @returns {number[]} Indices du pool, du plus prometteur au moins.
 */
export function rankPool(pool, stats) {
  const notes = pool.map((item, index) => {
    let note = 0;
    for (const cle of stats) note += Math.abs(item.stats?.[cle] ?? 0);
    // A interet egal, une piece riche en effets offre plus de chances.
    return { index, note: note + Object.keys(item.stats ?? {}).length * 0.01 };
  });

  notes.sort((a, b) => b.note - a.note);
  return notes.map((n) => n.index);
}

/**
 * Prepare les classements, un par emplacement.
 * @param {any[][]} pools
 * @param {string[]} stats
 * @returns {number[][]}
 */
export function buildRankings(pools, stats) {
  return pools.map((pool) => rankPool(pool, stats));
}

/**
 * Ameliore un genome par remplacements successifs d'une seule piece.
 *
 * @param {number[]} genome Point de depart. Il n'est pas modifie.
 * @param {object} contexte
 * @param {any[]} contexte.layout
 * @param {any[][]} contexte.pools
 * @param {number[][]} contexte.rankings
 * @param {(genome: number[]) => {score: number}} contexte.evaluate
 * @param {Map<number, number>|null} [contexte.locks] Cases imposees.
 * @param {Partial<typeof DEFAULT_LOCAL>} [options]
 * @returns {{genome: number[], score: number, gain: number, passes: number}}
 */
export function improve(genome, { layout, pools, rankings, evaluate, locks = null }, options = {}) {
  const reglages = { ...DEFAULT_LOCAL, ...options };

  let courant = [...genome];
  let score = evaluate(courant).score;
  const depart = score;
  let passes = 0;

  for (; passes < reglages.maxPasses; passes += 1) {
    let ameliore = false;

    for (let cellule = 0; cellule < layout.length; cellule += 1) {
      const pool = pools[cellule];
      if (pool.length === 0) continue;
      // Une case imposee par l'utilisateur ne se remplace pas.
      if (locks && locks.has(cellule)) continue;

      const ordre = rankings[cellule] ?? pool.map((_, i) => i);
      const essais = ordre.slice(0, reglages.candidatesPerSlot);
      if (reglages.tryEmpty) essais.push(EMPTY);

      const avant = courant[cellule];
      let meilleurIndex = avant;
      let meilleurScore = score;

      for (const candidat of essais) {
        if (candidat === avant) continue;

        const essai = [...courant];
        essai[cellule] = candidat;
        // La reparation ecarte les doublons et le conflit arme a deux mains.
        repair(essai, layout, pools, locks);

        const note = evaluate(essai).score;
        if (note > meilleurScore) {
          meilleurScore = note;
          meilleurIndex = candidat;
        }
      }

      if (meilleurIndex !== avant) {
        courant[cellule] = meilleurIndex;
        repair(courant, layout, pools, locks);
        score = evaluate(courant).score;
        ameliore = true;
      }
    }

    if (!ameliore) break;
  }

  return { genome: courant, score, gain: score - depart, passes: passes + 1 };
}
