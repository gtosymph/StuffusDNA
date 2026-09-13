/**
 * Proximite d'un build avec le stuff porte en jeu.
 *
 * Le meilleur build du solveur ne sert a rien s'il demande seize pieces que
 * le joueur n'a pas. Ce qui compte alors n'est plus le score seul, mais le
 * score rapporte a ce qu'il faut acheter : « combien je gagne si je change
 * deux pieces, trois, quatre ».
 *
 * Ce module ne fait qu'une chose : compter les pieces a acquerir. Trois
 * regles, decidees avec le joueur :
 *
 * - Une piece deja portee dans la reference ne coute rien.
 * - Une piece marquee comme possedee ne coute rien non plus : elle dort dans
 *   la banque, la sortir ne demande aucun achat.
 * - Une case vide de la reference que le build remplit coute un changement :
 *   le Dofus qui manque, il faut bien aller le chercher.
 *
 * Deplacer un anneau d'une case a l'autre ne coute rien : le comptage porte
 * sur les pieces, jamais sur leur emplacement.
 */

/**
 * Compte les pieces d'un build qui ne sont ni portees ni possedees.
 *
 * La reference est un multi-ensemble : deux anneaux identiques portes valent
 * deux exemplaires, et un build qui en porte trois n'en a qu'un a acheter.
 *
 * @param {Iterable<number>} itemIds Pieces du build juge.
 * @param {Iterable<number>} reference Pieces portees en jeu.
 * @param {Iterable<number>} [possedees] Pieces deja en banque.
 * @returns {number} Pieces a acquerir.
 */
export function compterChangements(itemIds, reference, possedees = null) {
  const restant = new Map();
  for (const id of reference ?? []) restant.set(id, (restant.get(id) ?? 0) + 1);

  const enBanque = possedees instanceof Set ? possedees : new Set(possedees ?? []);

  let changements = 0;
  for (const id of itemIds ?? []) {
    const dispo = restant.get(id) ?? 0;
    if (dispo > 0) {
      restant.set(id, dispo - 1);
      continue;
    }
    if (enBanque.has(id)) continue;
    changements += 1;
  }
  return changements;
}

/**
 * Prepare un compteur reutilisable, pour la boucle chaude du solveur.
 *
 * Le solveur compte les changements a chaque evaluation : refaire la table de
 * la reference des milliers de fois par seconde couterait plus que le compte
 * lui-meme. Le compteur la construit une fois et ne garde, entre deux appels,
 * qu'un tableau de travail.
 *
 * @param {object} reglage
 * @param {Iterable<number>} reglage.reference Pieces portees en jeu.
 * @param {Iterable<number>} [reglage.possedees] Pieces deja en banque.
 * @returns {(itemIds: Iterable<number>) => number}
 */
export function creerCompteur({ reference, possedees = null }) {
  const modele = new Map();
  for (const id of reference ?? []) modele.set(id, (modele.get(id) ?? 0) + 1);

  const enBanque = possedees instanceof Set ? possedees : new Set(possedees ?? []);

  // Une seule table de travail, remise a l'etat du modele a chaque appel :
  // la reference tient dans une vingtaine de cases, la recopier coute moins
  // qu'allouer une table neuve.
  const restant = new Map();

  return function compter(itemIds) {
    if (modele.size === 0) {
      // Sans reference, tout est a changer : le compte reste juste.
      let total = 0;
      for (const id of itemIds ?? []) if (!enBanque.has(id)) total += 1;
      return total;
    }

    restant.clear();
    for (const [id, nombre] of modele) restant.set(id, nombre);

    let changements = 0;
    for (const id of itemIds ?? []) {
      const dispo = restant.get(id) ?? 0;
      if (dispo > 0) {
        restant.set(id, dispo - 1);
        continue;
      }
      if (enBanque.has(id)) continue;
      changements += 1;
    }
    return changements;
  };
}

/**
 * Normalise le reglage de proximite venu de l'interface.
 *
 * Un reglage sans reference ne contraint rien : le solveur cherche alors
 * librement, comme avant. C'est le cas par defaut.
 *
 * @param {any} brut
 * @returns {{reference: number[], possedees: Set<number>, max: number}|null}
 */
export function normaliserProximite(brut) {
  if (!brut) return null;

  const reference = identifiants(brut.reference);
  if (reference.length === 0) return null;

  // Une limite absente laisse tout passer : le mode sert alors seulement a
  // lire les paliers, sans rien interdire. Zero, lui, interdit tout
  // changement — il faut donc distinguer « absent » de « zero ».
  const max = brut.max === null || brut.max === undefined || brut.max === ''
    ? Number.NaN
    : Number(brut.max);

  return {
    reference,
    possedees: new Set(identifiants(brut.possedees)),
    max: Number.isFinite(max) && max >= 0 ? Math.floor(max) : Number.POSITIVE_INFINITY,
  };
}

/**
 * Meilleur build pour chaque nombre de pieces a changer.
 *
 * Le joueur ne veut pas un build, il veut un arbitrage : « une piece me
 * rapporte 339, deux m'en rapportent 623, la quatrieme ne rapporte presque
 * rien ». Le collecteur range donc chaque build croise dans son palier et ne
 * garde que le meilleur de chacun.
 *
 * La liste rendue est une FRONTIERE : elle ne garde qu'un palier qui fait
 * vraiment mieux que tous les precedents. Changer quatre pieces pour gagner
 * moins qu'en changeant trois n'a aucun sens — ce palier ne se montre pas.
 *
 * Chaque palier garde plusieurs pretendants, pas un seul. Le score vu pendant
 * la recherche est provisoire : il depend de la repartition des points du
 * moment, qui suit le meilleur build et change en cours de route. Trancher
 * dessus laissait passer un build moins bon que le gagnant. Les pretendants
 * se departagent donc a la fin, sur leur score definitif.
 *
 * @param {{max?: number, garde?: number}} [reglage]
 */
export function creerPaliers({ max = Number.POSITIVE_INFINITY, garde = 4 } = {}) {
  /** @type {Map<number, {genome: number[], score: number, cle: string}[]>} */
  const pretendants = new Map();

  return {
    /**
     * Propose un build a son palier.
     * @param {number[]} genome
     * @param {number} score Score provisoire, il ne sert qu'a classer.
     * @param {number} changements
     */
    proposer(genome, score, changements) {
      if (!Number.isFinite(changements) || changements < 0 || changements > max) return;
      if (!Number.isFinite(score)) return;

      const liste = pretendants.get(changements) ?? [];
      const cle = genome.join(',');
      if (liste.some((entree) => entree.cle === cle)) return;

      liste.push({ genome: [...genome], score, cle });
      liste.sort((a, b) => b.score - a.score);
      if (liste.length > garde) liste.length = garde;
      pretendants.set(changements, liste);
    },

    /**
     * Meilleur build de chaque palier, du moins cher au plus cher.
     *
     * La liste n'est PAS reduite a la frontiere : un palier qui ne bat pas un
     * palier moins cher reste utile a l'affichage, comme alternative a valeur
     * egale quand une piece est trop chere. Reduire ici privait l'interface
     * de ces builds, qu'elle ne pouvait plus retrouver.
     *
     * `noter` rend le score definitif d'un genome : c'est lui qui departage
     * les pretendants d'un meme palier.
     *
     * @param {(genome: number[]) => number} [noter]
     * @returns {{genome: number[], score: number, changements: number}[]}
     */
    liste(noter = null) {
      const paliers = [];
      for (const [changements, liste] of pretendants) {
        let meilleur = null;
        for (const pretendant of liste) {
          const score = noter ? noter(pretendant.genome) : pretendant.score;
          if (!meilleur || score > meilleur.score) {
            meilleur = { genome: pretendant.genome, score, changements };
          }
        }
        if (meilleur) paliers.push(meilleur);
      }
      paliers.sort((a, b) => a.changements - b.changements);
      return paliers;
    },
  };
}

/**
 * Reduit une liste de paliers a sa frontiere.
 *
 * Un palier plus cher qui ne fait pas mieux n'a rien a dire : on peut toujours
 * changer moins de pieces pour le meme resultat. La reduction se fait au
 * moment de montrer, jamais au moment de collecter : les paliers ecartes
 * servent encore d'alternatives a valeur egale.
 *
 * @param {any[]} paliers Du moins cher au plus cher.
 * @param {(palier: any) => number} [valeur] Ce qui se compare, le score par defaut.
 * @returns {any[]}
 */
export function frontiere(paliers, valeur = (palier) => palier.score) {
  const tries = [...paliers].sort((a, b) => a.changements - b.changements);

  const gardes = [];
  let plafond = Number.NEGATIVE_INFINITY;
  for (const palier of tries) {
    const note = valeur(palier);
    if (!(note > plafond)) continue;
    plafond = note;
    gardes.push(palier);
  }
  return gardes;
}

/**
 * Identifiants valides d'une liste, les autres ecartes.
 *
 * `Number(null)` vaut zero et non NaN : sans ce filtre, un trou dans la liste
 * deviendrait la piece d'identifiant zero.
 *
 * @param {Iterable<any>|null|undefined} liste
 * @returns {number[]}
 */
function identifiants(liste) {
  const sortie = [];
  for (const brut of liste ?? []) {
    if (brut === null || brut === undefined || brut === '') continue;
    const id = Number(brut);
    if (Number.isFinite(id)) sortie.push(id);
  }
  return sortie;
}
