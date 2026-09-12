/**
 * Descente locale sur un build.
 *
 * L'algorithme genetique explore largement mais affine mal : il ne se demande
 * jamais si le remplacement d'une seule piece ameliorerait le build. Cette
 * descente comble ce manque. A build fige, elle parcourt chaque emplacement,
 * essaie les pieces du pool et retient la meilleure. Une seconde passe tente
 * de completer les panoplies portees, dont les bonus de groupe echappent a la
 * note d'une piece isolee. Elle recommence tant que le score monte.
 */
import { ELEMENT_CHARACTERISTIC } from '../data/stats.mjs';
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

/** Statistique de degats fixes associee a chaque element. */
const DOMMAGES_PAR_ELEMENT = Object.freeze({
  neutre: 'dommagesNeutre',
  terre: 'dommagesTerre',
  feu: 'dommagesFeu',
  eau: 'dommagesEau',
  air: 'dommagesAir',
});

/**
 * Statistiques d'item qui alimentent une condition derivee.
 * Exemple : la fuite d'un build vaut agilite/10 plus la fuite des items.
 */
const CONTRIBUTIONS_DERIVEES = Object.freeze({
  fuite: [['agilite', 0.1]],
  tacle: [['agilite', 0.1]],
  retraitPa: [['sagesse', 0.1]],
  retraitPm: [['sagesse', 0.1]],
  esquivePa: [['sagesse', 0.1]],
  esquivePm: [['sagesse', 0.1]],
  pdv: [['vitalite', 1]],
});

/**
 * Deduit de l'objectif le poids de chaque statistique d'item.
 *
 * Deux familles sortent : les statistiques visees par les conditions, au poids
 * de leur condition, et les statistiques qui montent les degats des sorts
 * retenus (caracteristique de l'element, dommages fixes, puissance, critique).
 *
 * @param {object} objective
 * @returns {{conditions: Record<string, number>, degats: Record<string, number>}}
 */
export function poidsObjectif(objective) {
  const conditions = {};
  for (const condition of objective?.conditions ?? []) {
    if (!condition?.stat) continue;
    const poids = Math.max(1, Number(condition.weight) || 1);
    conditions[condition.stat] = (conditions[condition.stat] ?? 0) + poids;
  }

  const degats = {};
  const spells = objective?.spells ?? [];
  if ((objective?.mode ?? 'degats') === 'degats' && spells.length > 0) {
    const ajouter = (cle, poids) => { degats[cle] = (degats[cle] ?? 0) + poids; };

    for (const spell of spells) {
      for (const ligne of spell.lines ?? []) {
        const carac = ELEMENT_CHARACTERISTIC[ligne.element];
        if (!carac) continue;
        ajouter(carac, 1);
        ajouter(DOMMAGES_PAR_ELEMENT[ligne.element], 1);
        ajouter('puissance', 1);
        ajouter('dommages', 1);
        ajouter('critique', 0.5);
        ajouter('dommagesCritiques', 0.5);
        ajouter('pctDommagesSorts', 0.5);
        ajouter('pctDommagesFinaux', 0.5);
      }
    }
  }

  return { conditions, degats };
}

/**
 * Contribution d'un item a une statistique de condition, derivees comprises.
 * @param {Record<string, number>} stats
 * @param {string} cle
 * @returns {number}
 */
function contribution(stats, cle) {
  let valeur = Math.max(0, stats[cle] ?? 0);
  for (const [source, facteur] of CONTRIBUTIONS_DERIVEES[cle] ?? []) {
    valeur += Math.max(0, stats[source] ?? 0) * facteur;
  }
  return valeur;
}

/**
 * Ordonne les pieces d'un pool par leur interet pour l'objectif.
 *
 * Chaque piece recoit deux notes, conditions et degats, normalisees par le
 * maximum du pool puis additionnees : aucune famille n'ecrase l'autre.
 * Le classement ne depend pas du build courant, il se calcule une seule fois.
 *
 * @param {any[]} pool
 * @param {{conditions: Record<string, number>, degats: Record<string, number>}} poids
 * @returns {number[]} Indices du pool, du plus prometteur au moins.
 */
export function rankPool(pool, poids) {
  const notes = pool.map((item, index) => {
    const stats = item.stats ?? {};
    let noteConditions = 0;
    let noteDegats = 0;

    for (const [cle, p] of Object.entries(poids.conditions)) {
      noteConditions += contribution(stats, cle) * p;
    }
    for (const [cle, p] of Object.entries(poids.degats)) {
      noteDegats += Math.max(0, stats[cle] ?? 0) * p;
    }

    // A interet egal, une piece riche en effets offre plus de chances.
    return { index, noteConditions, noteDegats, richesse: Object.keys(stats).length };
  });

  const maxConditions = Math.max(1, ...notes.map((n) => n.noteConditions));
  const maxDegats = Math.max(1, ...notes.map((n) => n.noteDegats));
  for (const note of notes) {
    note.totale = note.noteConditions / maxConditions
      + note.noteDegats / maxDegats
      + note.richesse * 1e-4;
  }

  notes.sort((a, b) => b.totale - a.totale);
  return notes.map((n) => n.index);
}

/**
 * Prepare les classements, un par emplacement.
 * @param {any[][]} pools
 * @param {object} objective
 * @returns {number[][]}
 */
export function buildRankings(pools, objective) {
  const poids = poidsObjectif(objective);
  return pools.map((pool) => rankPool(pool, poids));
}

/**
 * Indexe les pieces de panoplie : panoplie -> cases ou une piece existe.
 * @param {any[][]} pools
 * @returns {Map<number, {cellule: number, index: number}[]>}
 */
export function indexerPanoplies(pools) {
  const parPanoplie = new Map();

  for (let cellule = 0; cellule < pools.length; cellule += 1) {
    for (let index = 0; index < pools[cellule].length; index += 1) {
      const setId = pools[cellule][index]?.setId;
      if (setId == null) continue;
      if (!parPanoplie.has(setId)) parPanoplie.set(setId, []);
      parPanoplie.get(setId).push({ cellule, index });
    }
  }

  return parPanoplie;
}

/**
 * Tente de completer les panoplies deja portees par le build.
 *
 * Le bonus d'une panoplie ne tombe qu'a partir de plusieurs pieces : la note
 * d'une piece isolee ne le voit pas, cette passe dediee si.
 *
 * @param {number[]} courant Modifie en place quand un essai gagne.
 * @param {object} contexte Voir improve.
 * @param {number} score Score courant.
 * @returns {{score: number, ameliore: boolean}}
 */
function passePanoplies(courant, { layout, pools, noter, rebaser, panoplies, locks }, score) {
  let ameliore = false;

  const portees = new Set();
  for (let cellule = 0; cellule < courant.length; cellule += 1) {
    const item = courant[cellule] === EMPTY ? null : pools[cellule][courant[cellule]];
    if (item?.setId != null) portees.add(item.setId);
  }

  for (const setId of portees) {
    for (const { cellule, index } of panoplies.get(setId) ?? []) {
      if (courant[cellule] === index) continue;
      if (locks && locks.has(cellule)) continue;

      const essai = [...courant];
      essai[cellule] = index;
      repair(essai, layout, pools, locks);

      const note = noter(essai);
      if (note > score) {
        courant.splice(0, courant.length, ...essai);
        rebaser(courant);
        score = note;
        ameliore = true;
      }
    }
  }

  return { score, ameliore };
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
 * @param {{noter: Function, rebaser: Function}} [contexte.evaluateur]
 *   Evaluateur incremental : quand il est present, la descente note ses
 *   voisins par delta au lieu de reevaluer le build entier.
 * @param {Map<number, {cellule: number, index: number}[]>} [contexte.panoplies]
 * @param {Map<number, number>|null} [contexte.locks] Cases imposees.
 * @param {Partial<typeof DEFAULT_LOCAL>} [options]
 * @returns {{genome: number[], score: number, gain: number, passes: number}}
 */
export function improve(genome, contexte, options = {}) {
  const { layout, pools, rankings, evaluate, evaluateur = null, panoplies = null, locks = null } = contexte;
  const reglages = { ...DEFAULT_LOCAL, ...options };

  const noter = evaluateur
    ? (g) => evaluateur.noter(g).score
    : (g) => evaluate(g).score;
  // La base des deltas suit le build courant : rebasee a chaque adoption.
  const rebaser = evaluateur ? (g) => evaluateur.rebaser(g) : () => {};

  let courant = [...genome];
  rebaser(courant);
  let score = noter(courant);
  const depart = score;
  let passes = 0;

  // Tampon d'essai, alloue une seule fois. La boucle interne essaie des
  // dizaines de pieces par case et par passe : y copier le genome creait
  // autant de tableaux jetables, tous rendus aussitot au ramasse-miettes.
  // Personne ne garde de reference sur un essai : seul son index est retenu.
  const essai = new Array(courant.length);

  for (; passes < reglages.maxPasses; passes += 1) {
    let ameliore = false;

    for (let cellule = 0; cellule < layout.length; cellule += 1) {
      const pool = pools[cellule];
      if (pool.length === 0) continue;
      // Une case imposee par l'utilisateur ne se remplace pas.
      if (locks && locks.has(cellule)) continue;

      const ordre = rankings[cellule] ?? pool.map((_, i) => i);
      const nbEssais = Math.min(reglages.candidatesPerSlot, ordre.length);

      const avant = courant[cellule];
      let meilleurIndex = avant;
      let meilleurScore = score;

      // La case vide s'essaie en dernier : un emplacement libre vaut parfois
      // mieux que la meilleure piece disponible.
      for (let rang = 0; rang <= nbEssais; rang += 1) {
        const dernier = rang === nbEssais;
        if (dernier && !reglages.tryEmpty) break;
        const candidat = dernier ? EMPTY : ordre[rang];
        if (candidat === avant) continue;

        for (let k = 0; k < courant.length; k += 1) essai[k] = courant[k];
        essai[cellule] = candidat;
        // La reparation ecarte les doublons et le conflit arme a deux mains.
        repair(essai, layout, pools, locks);

        const note = noter(essai);
        if (note > meilleurScore) {
          meilleurScore = note;
          meilleurIndex = candidat;
        }
      }

      if (meilleurIndex !== avant) {
        courant[cellule] = meilleurIndex;
        repair(courant, layout, pools, locks);
        rebaser(courant);
        score = noter(courant);
        ameliore = true;
      }
    }

    // Les bonus de groupe se cherchent panoplie par panoplie.
    if (panoplies && panoplies.size > 0) {
      const resultat = passePanoplies(courant, { layout, pools, noter, rebaser, panoplies, locks }, score);
      score = resultat.score;
      ameliore = ameliore || resultat.ameliore;
    }

    if (!ameliore) break;
  }

  return { genome: courant, score, gain: score - depart, passes: passes + 1 };
}
