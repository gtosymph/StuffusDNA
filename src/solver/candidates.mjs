/**
 * Archive des meilleurs builds distincts d'une recherche.
 *
 * Le solveur ne rend qu'un gagnant. Or la recherche croise sans cesse des
 * builds proches en score et tres differents en composition : celui qui perd
 * 20 points de degats mais rend un point de mouvement, celui qui evite une
 * panoplie que le joueur ne possede pas. L'archive les garde pour que le
 * joueur tranche lui-meme.
 *
 * La regle tient en une phrase : deux candidats gardes different toujours
 * d'au moins `ecartMinimum` emplacements. Un build trop proche d'un candidat
 * ne s'ajoute pas, il le remplace quand il fait mieux.
 */

/** Nombre de candidats gardes par defaut. */
export const TAILLE_ARCHIVE = 8;

/** Emplacements de difference exiges entre deux candidats gardes. */
export const ECART_MINIMUM = 2;

/**
 * Nombre d'emplacements qui different entre deux builds.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function ecartGenomes(a, b) {
  const taille = Math.max(a.length, b.length);
  let ecart = 0;
  for (let i = 0; i < taille; i += 1) {
    if (a[i] !== b[i]) ecart += 1;
  }
  return ecart;
}

/**
 * Nombre de pieces a changer pour passer d'un build a l'autre.
 *
 * La comparaison porte sur les pieces portees, jamais sur leur emplacement :
 * deux anneaux echanges de case donnent le meme build pour le joueur.
 *
 * @param {number[]} a Identifiants du premier build.
 * @param {number[]} b Identifiants du second.
 * @returns {number}
 */
export function ecartPieces(a, b) {
  const restants = [...b];
  let ecart = 0;
  for (const piece of a) {
    const place = restants.indexOf(piece);
    if (place >= 0) restants.splice(place, 1);
    else ecart += 1;
  }
  return ecart;
}

/**
 * Cree une archive de builds distincts.
 *
 * @param {object} [reglages]
 * @param {number} [reglages.taille] Nombre de candidats gardes.
 * @param {number} [reglages.ecartMinimum] Emplacements de difference exiges.
 * @param {(genome: number[]) => number[]} [reglages.identite] Signature d'un
 *   build : par defaut le genome lui-meme. Passer la liste triee des pieces
 *   portees rend l'archive insensible a l'emplacement.
 * @returns {{proposer: Function, liste: Function, taille: number}}
 */
export function creerArchive({
  taille = TAILLE_ARCHIVE, ecartMinimum = ECART_MINIMUM, identite = null,
} = {}) {
  /** @type {{genome: number[], cle: number[], score: number, detail: any}[]} */
  const gardes = [];
  const signer = identite ?? ((genome) => genome);

  /**
   * Propose un build a l'archive.
   *
   * @param {number[]} genome
   * @param {number} score
   * @param {any} [detail] Donnees jointes, rendues telles quelles.
   * @returns {boolean} Vrai si l'archive a retenu le build.
   */
  function proposer(genome, score, detail = null) {
    if (!Array.isArray(genome) || !Number.isFinite(score)) return false;

    const cle = signer(genome);
    const entree = { genome: [...genome], cle, score, detail };

    // Un voisin trop proche represente deja ce coin de l'espace de recherche.
    const voisin = gardes.findIndex((c) => ecartPieces(c.cle, cle) < ecartMinimum);
    if (voisin >= 0) {
      if (score <= gardes[voisin].score) return false;
      gardes[voisin] = entree;
      trier();
      return true;
    }

    if (gardes.length < taille) {
      gardes.push(entree);
      trier();
      return true;
    }

    // Archive pleine : le nouveau ne rentre qu'en chassant le plus faible.
    const dernier = gardes[gardes.length - 1];
    if (score <= dernier.score) return false;
    gardes[gardes.length - 1] = entree;
    trier();
    return true;
  }

  function trier() {
    gardes.sort((a, b) => b.score - a.score);
  }

  /**
   * Candidats gardes, du meilleur au moins bon.
   * Les genomes rendus sont des copies : l'appelant peut les modifier.
   * @returns {{genome: number[], score: number, detail: any}[]}
   */
  function liste() {
    return gardes.map((c) => ({ genome: [...c.genome], score: c.score, detail: c.detail }));
  }

  return { proposer, liste, taille };
}
