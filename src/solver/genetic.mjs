/**
 * Solveur genetique de stuff.
 *
 * L'algorithme fait evoluer une population de builds. A chaque generation il
 * conserve les meilleurs individus, croise les parents selectionnes par tournoi
 * et applique des mutations sur les emplacements.
 */
import { aggregate, computeBuild } from '../engine/build.mjs';
import { weaponAttack } from '../engine/damage.mjs';
import { maxViolations, scoreBuild, SEARCH_MODES } from './score.mjs';
import { optimiserAllocation } from './allocation.mjs';
import { EMPTY, buildPools, decode, genomeFromItems, planLocks, randomGenome, repair } from './genome.mjs';
import { buildRankings, improve, indexerPanoplies } from './local-search.mjs';
import { createIncrementalBuild } from './incremental.mjs';
import { creerArchive } from './candidates.mjs';
import { creerCompteur, creerPaliers, normaliserProximite } from './proximite.mjs';
import { SCROLLABLE as SCROLLABLE_KEYS } from '../engine/characteristics.mjs';

/**
 * Penalite appliquee par item dont les conditions d'equipement ne sont pas
 * remplies. Elle reste finie pour garder un gradient : un build qui porte un
 * seul item interdit doit pouvoir evoluer vers un build valide.
 */
export const INVALID_ITEM_PENALTY = 1e6;

/**
 * Penalite appliquee par maximum absolu franchi. Elle reste finie pour la
 * meme raison que la penalite d'item interdit : le solveur doit garder un
 * chemin d'amelioration.
 */
export const MAX_VIOLATION_PENALTY = 1e6;

/**
 * Penalite par piece a changer au-dela de la limite demandee.
 *
 * Elle reste finie, et plus faible que les autres : un build qui change une
 * piece de trop doit pouvoir evoluer vers un build conforme, et un build
 * conforme mais irrealisable reste pire qu'un build simplement trop cher.
 */
export const CHANGEMENT_PENALTY = 1e5;

/** Reglages par defaut, alignes sur un solveur interactif. */
export const DEFAULT_OPTIONS = Object.freeze({
  populationSize: 200,
  maxGenerations: 2500,
  eliteCount: 8,
  tournamentSize: 5,
  mutationRate: 0.15,
  crossoverRate: 0.9,
  /** Arret anticipe apres ce nombre de generations sans progres. */
  stagnationLimit: 300,
  seed: 0,
  /** Part de mutations tirees dans la tete du classement plutot qu'au hasard. */
  guidedMutationRate: 0.6,
  /** Taille de la tete de classement utilisee par une mutation orientee. */
  guidedPoolSize: 40,
  /**
   * Generations entre deux descentes locales sur le meilleur individu.
   * Mesure du 2026-08-31, budget de 10 s par graine sur 20 graines : une
   * descente etroite et frequente (3 / 35) rend 2951 la ou une descente
   * large et rare (20 / 60) rendait 2684. Le croisement explore, la descente
   * affine ; c'est elle qui produit le score, il faut la lancer souvent.
   */
  localSearchEvery: 3,
  /** Nombre de parcours d'emplacements par descente. */
  localSearchPasses: 2,
  /**
   * Pieces essayees par emplacement pendant une descente periodique.
   * Une descente etroite vaut mieux qu'une large : a temps egal, essayer
   * 35 pieces par case et redescendre souvent bat 60 pieces et descendre
   * rarement (3023 contre 2874 sur 12 graines).
   */
  localSearchCandidates: 35,
  /** Vrai pour laisser le solveur repartir les points de caracteristique. */
  optimiserPoints: false,
  /** Generations entre deux repartitions des points. */
  allocationEvery: 15,
  /** Generations de stagnation avant une injection d'immigrants. */
  immigrantsAfter: 25,
  /** Part de la population remplacee par une injection. */
  immigrantsShare: 0.25,
  /** Nombre de builds distincts gardes a cote du gagnant. */
  candidatsGardes: 8,
});

/**
 * Generateur pseudo aleatoire deterministe (mulberry32).
 * Un tirage reproductible facilite les tests et la comparaison de resultats.
 * @param {number} seed
 * @returns {() => number}
 */
export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Nombre maximal de resultats gardes par le cache d'evaluation.
 * L'eviction retire l'entree la plus ancienne (ordre d'insertion du Map).
 */
const CACHE_EVALUATIONS = 4096;

/** Options de score de la boucle chaude : pas de detail par condition. */
const SANS_DETAILS = Object.freeze({ details: false });

/** Options de score des resultats rendus : detail complet. */
const AVEC_DETAILS = Object.freeze({ details: true });

/**
 * Prepare la fonction d'evaluation d'un genome.
 *
 * L'evaluation passe par un cache par genome : les elites et les doublons
 * reviennent souvent d'une generation a l'autre. Le cache DOIT etre vide par
 * `evaluate.invalidate()` quand la repartition des points change, sans quoi
 * il rendrait des scores perimes.
 *
 * `evaluate.incremental()` cree un evaluateur par delta pour la recherche
 * locale : `noter(genome)` rend le meme resultat que `evaluate(genome)`,
 * `rebaser(genome)` fige la base des deltas.
 *
 * @param {object} context
 * @returns {(genome: number[]) => {score: number, stats: any, detail: any}}
 */
export function createEvaluator({ pools, setById, level, porteur, scrolls, passives, profile, objective }) {
  // L'attaque d'une arme se construit une seule fois par arme rencontree.
  const attaques = new Map();

  // Proximite avec le stuff porte en jeu : le compteur se prepare une fois,
  // la boucle chaude ne fait plus que compter.
  const proximite = normaliserProximite(objective.proximite);
  const compterChangements = proximite ? creerCompteur(proximite) : null;
  const spellsAvecArme = (items) => {
    const spells = objective.spells ?? [];
    if (!objective.useWeapon) return spells;
    const arme = items.find((item) => item.slot === 'arme');
    if (!arme) return spells;
    if (!attaques.has(arme.id)) {
      attaques.set(arme.id, weaponAttack(arme, { maitrise: objective.maitriseArme !== false }));
    }
    const attaque = attaques.get(arme.id);
    return attaque ? [...spells, attaque] : spells;
  };

  // Note un build deja agrege : score des sorts et penalites.
  // « details » reste faux : la boucle ne lit que le score, et le detail par
  // condition coutait un objet par condition et par evaluation.
  const noterBuild = (items, stats, invalid, options = SANS_DETAILS) => {
    const spells = spellsAvecArme(items);
    // Sans arme comptee, l'objectif passe tel quel : une copie par evaluation
    // pour rien pesait sur le ramasse-miettes.
    const cible = spells === objective.spells ? objective : { ...objective, spells };
    const detail = scoreBuild(stats, cible, options);
    const violations = maxViolations(objective.conditions, stats);

    // Pieces a acheter pour porter ce build. Le compte sert deux fois : il
    // penalise ce qui depasse la limite, et il range le build dans son palier.
    const changements = compterChangements
      ? compterChangements(idsDe(items))
      : 0;
    const enTrop = proximite ? Math.max(0, changements - proximite.max) : 0;

    // Un item interdit ou un maximum franchi rend le build irrealisable en jeu.
    const score = detail.score
      - invalid.length * INVALID_ITEM_PENALTY
      - violations.length * MAX_VIOLATION_PENALTY
      - enTrop * CHANGEMENT_PENALTY;

    return { score, stats, detail, items, invalid, violations, changements };
  };

  const cache = new Map();

  const evaluate = function evaluate(genome) {
    const cle = genome.join(',');
    const connu = cache.get(cle);
    if (connu) return connu;

    const items = decode(genome, pools);
    const { stats, invalid } = computeBuild(
      { items, level, allocation: porteur.allocation, scrolls, passives, profile }, setById,
    );
    const resultat = noterBuild(items, stats, invalid);

    if (cache.size >= CACHE_EVALUATIONS) cache.delete(cache.keys().next().value);
    cache.set(cle, resultat);
    return resultat;
  };

  // Les resultats rendus a l'appelant portent le detail par condition, que la
  // boucle ne calcule pas. Le cache garde la version allegee : ce chemin la
  // contourne, il ne sert qu'une poignee de fois par recherche.
  evaluate.complet = (genome, allocation = porteur.allocation) => {
    const items = decode(genome, pools);
    const { stats, invalid } = computeBuild(
      { items, level, allocation, scrolls, passives, profile }, setById,
    );
    return noterBuild(items, stats, invalid, AVEC_DETAILS);
  };

  evaluate.invalidate = () => { cache.clear(); };
  evaluate.incremental = () => {
    const delta = createIncrementalBuild({ pools, setById, level, porteur, scrolls, passives, profile });
    return {
      noter: (genome) => {
        const { stats, items, invalid } = delta.calculer(genome);
        return noterBuild(items, stats, invalid);
      },
      rebaser: (genome) => delta.rebaser(genome),
    };
  };
  evaluate.spellsAvecArme = spellsAvecArme;
  evaluate.proximite = proximite;
  return evaluate;
}

/**
 * Identifiants des pieces d'un build, cases vides ecartees.
 * @param {any[]} items
 * @returns {number[]}
 */
function idsDe(items) {
  const ids = [];
  for (const item of items) if (item) ids.push(item.id);
  return ids;
}

/**
 * Reapplique les verrous sur une graine issue du build courant.
 * @param {number[]} graine Modifiee en place.
 */
function applyLocksSurGraine(graine, locks, layout, pools) {
  if (!locks || locks.size === 0) return;
  repair(graine, layout, pools, locks);
}

/**
 * Selectionne un parent par tournoi.
 * @param {{genome: number[], score: number}[]} population
 * @param {number} size
 * @param {() => number} random
 */
function tournament(population, size, random) {
  let best = population[Math.floor(random() * population.length)];
  for (let i = 1; i < size; i += 1) {
    const challenger = population[Math.floor(random() * population.length)];
    if (challenger.score > best.score) best = challenger;
  }
  return best;
}

/**
 * Croise deux genomes case par case.
 * @param {number[]} a
 * @param {number[]} b
 * @param {() => number} random
 * @returns {number[]}
 */
function crossover(a, b, random) {
  const child = new Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    child[i] = random() < 0.5 ? a[i] : b[i];
  }
  return child;
}

/**
 * Applique des mutations sur un genome.
 * @param {number[]} genome Modifie en place.
 * @param {any[][]} pools
 * @param {number} rate
 * @param {() => number} random
 */
function mutate(genome, pools, rate, random, guidage = null) {
  for (let i = 0; i < genome.length; i += 1) {
    if (random() > rate) continue;

    const pool = pools[i];
    if (pool.length === 0) {
      genome[i] = EMPTY;
      continue;
    }

    // Une mutation vide parfois la case pour explorer les builds incomplets.
    if (random() < 0.08) {
      genome[i] = EMPTY;
      continue;
    }

    // Une mutation orientee pioche dans la tete du classement : les pieces
    // qui servent le mieux les conditions. Le reste du temps elle tire au
    // hasard, ce qui preserve l'exploration.
    const rangs = guidage?.rankings?.[i];
    if (rangs && rangs.length > 0 && random() < guidage.rate) {
      const tete = Math.min(guidage.size, rangs.length);
      genome[i] = rangs[Math.floor(random() * tete)];
      continue;
    }

    genome[i] = Math.floor(random() * pool.length);
  }
  return genome;
}

/**
 * Secoue un genome : deux a quatre cases changent d'un coup.
 *
 * Le tirage suit le meme guidage que les mutations orientees : la piece de
 * remplacement vient le plus souvent de la tete du classement.
 *
 * @param {number[]} genome Non modifie.
 * @returns {number[]} Une copie secouee.
 */
function secouer(genome, pools, random, guidage, locks = null, force = 0) {
  const copie = [...genome];
  const nb = 2 + Math.floor(random() * 3) + force;

  for (let coup = 0; coup < nb; coup += 1) {
    const cellule = Math.floor(random() * copie.length);
    if (locks?.has(cellule) || pools[cellule].length === 0) continue;

    const rangs = guidage?.rankings?.[cellule];
    if (rangs && rangs.length > 0 && random() < 0.7) {
      const tete = Math.min(guidage.size, rangs.length);
      copie[cellule] = rangs[Math.floor(random() * tete)];
    } else {
      copie[cellule] = Math.floor(random() * pools[cellule].length);
    }
  }

  return copie;
}

/**
 * Lance la recherche du meilleur build.
 *
 * @param {object} input
 * @param {any[]} input.items Catalogue d'items.
 * @param {Map<number, any>} input.setById Panoplies indexees.
 * @param {number} input.level Niveau du personnage.
 * @param {object} input.objective Conditions, sorts et mode de recherche.
 * @param {Record<string, number>} [input.allocation]
 * @param {Record<string, boolean>} [input.scrolls]
 * @param {Map<number, Record<string, number>>} [input.passives] Passifs actifs.
 * @param {number[]} [input.lockedIds] Items imposes dans le build.
 * @param {Set<number>} [input.banned]
 * @param {Set<string>} [input.allowedSlots]
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 * @param {(progress: {generation: number, best: number}) => void} [onProgress]
 * @returns {{items: any[], stats: any, score: number, detail: any, generations: number}}
 */
/**
 * Prepare tout ce qu'une recherche reutilise d'une vague a l'autre.
 *
 * Les pools, les verrous, l'evaluateur et les classements ne dependent que de
 * la demande, jamais du tirage. Le navigateur cherche par vagues de quelques
 * dizaines de generations : sans ce contexte, chaque vague refaisait ce
 * travail, dont le classement des pieces qui coute a lui seul un dixieme du
 * temps d'une vague. Le cache d'evaluation survit aussi aux vagues.
 *
 * Gardez un contexte tant que la demande ne change pas — meme catalogue, meme
 * niveau, meme objectif, memes bannis et memes verrous. Au moindre changement,
 * preparez-en un neuf : le contexte ne se remet pas a jour tout seul.
 *
 * @param {object} input Meme forme que l'entree de `solve`.
 * @returns {object} Contexte a passer dans `input.contexte`.
 */
export function preparerRecherche(input) {
  const {
    items, setById, level, objective,
    allocation = {}, scrolls = {}, passives = null, profile = {},
    lockedIds = [], banned = new Set(), allowedSlots = null,
  } = input;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Catalogue vide : aucun item a proposer au solveur.');
  }
  if (!objective || !Array.isArray(objective.conditions)) {
    throw new Error('Objectif invalide : la liste des conditions est absente.');
  }

  // Les bornes de l'arme voyagent dans l'objectif : il traverse deja le fil
  // de calcul sans plomberie supplementaire.
  const { layout, pools } = buildPools(items, {
    level, banned, allowedSlots, armeContraintes: objective.arme ?? null,
  });

  // Les items imposes occupent leur case avant toute evolution.
  const lockedItems = lockedIds
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean);
  const { cells: locks, missing: unplaced } = planLocks(layout, pools, lockedItems);

  // La repartition des points vit dans un porteur : le solveur peut la faire
  // evoluer en cours de route, l'evaluation lit toujours la version courante.
  const porteur = { allocation: { ...allocation } };
  const evaluate = createEvaluator({ pools, setById, level, porteur, scrolls, passives, profile, objective });

  // Repartit les points au service du meilleur genome, puis rejoue les scores
  // de la population : tous les individus se comparent a points egaux.
  /**
   * Meilleure repartition des points pour un genome donne, sans rien changer.
   *
   * Les points valent ce que le stuff en fait : deux builds proches en score
   * n'investissent pas au meme endroit. Chaque build merite donc sa propre
   * repartition, calculee sur ses seules pieces.
   *
   * @param {number[]} genome
   * @returns {Record<string, number>}
   */
  const allocationPour = (genome) => {
    const itemsRef = decode(genome, pools);
    const { stats: raw } = aggregate({ items: itemsRef, level, allocation: {}, scrolls, passives }, setById);
    // L'arme du build de reference compte dans les degats vises par les points.
    const { allocation } = optimiserAllocation({
      raw, level, objective: { ...objective, spells: evaluate.spellsAvecArme(itemsRef) },
    });
    return allocation;
  };

  const repartirPoints = (reference) => {
    const proposee = allocationPour(reference.genome);

    const changee = SCROLLABLE_KEYS.some((c) => (proposee[c] ?? 0) !== (porteur.allocation[c] ?? 0));
    if (!changee) return false;

    porteur.allocation = proposee;
    // Les scores en cache dependent des points : ils sont tous perimes.
    evaluate.invalidate();
    return true;
  };

  // Classement des pieces par interet pour l'objectif entier : conditions
  // posees et degats des sorts retenus. Il sert aux mutations orientees comme
  // a la descente locale.
  const rankings = buildRankings(pools, objective);
  const panoplies = indexerPanoplies(pools);

  return {
    layout, pools, locks, unplaced, porteur, evaluate, repartirPoints, allocationPour, rankings,
    contexteLocal: {
      layout, pools, rankings, evaluate, evaluateur: evaluate.incremental(), panoplies, locks,
    },
  };
}

/** Vrai quand deux repartitions de points investissent la meme chose. */
function memeAllocation(a, b) {
  return SCROLLABLE_KEYS.every((c) => (a[c] ?? 0) === (b[c] ?? 0));
}

/** Vrai quand deux genomes portent exactement les memes pieces aux memes cases. */
function memeGenome(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function solve(input, options = {}, onProgress) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const { allocation = {}, seedGenomes = [], seedItems = [] } = input;

  const random = createRandom(settings.seed);
  const prepare = input.contexte ?? preparerRecherche(input);
  const {
    layout, pools, locks, unplaced, porteur, evaluate, repartirPoints, allocationPour,
    rankings, contexteLocal,
  } = prepare;

  // Un contexte reutilise garde la repartition de la vague precedente. Quand
  // l'appelant en impose une autre, les scores en cache sont perimes.
  if (input.contexte && !memeAllocation(porteur.allocation, allocation)) {
    porteur.allocation = { ...allocation };
    evaluate.invalidate();
  }

  const guidage = { rankings, rate: settings.guidedMutationRate, size: settings.guidedPoolSize };

  // Les builds distincts croises en chemin : le gagnant n'est pas toujours
  // celui que le joueur veut porter.
  // La diversite se juge sur les pieces portees : deux anneaux echanges de
  // case donnent le meme build aux yeux du joueur.
  const archive = creerArchive({
    taille: settings.candidatsGardes,
    identite: (genome) => decode(genome, pools).map((item) => item.id).sort((a, b) => a - b),
  });

  // Population initiale. Les genomes recus d'un tour precedent ouvrent la
  // marche : c'est ainsi que les fils se transmettent leurs trouvailles.
  // Le build deja porte par l'utilisateur entre aussi dans la population :
  // le solveur ne peut alors que l'egaler ou le battre.
  let population = [];
  if (Array.isArray(seedItems) && seedItems.length > 0) {
    const graine = genomeFromItems(layout, pools, seedItems);
    applyLocksSurGraine(graine, locks, layout, pools);
    population.push({ genome: graine, score: evaluate(graine).score });
  }
  for (const graine of seedGenomes.slice(0, settings.populationSize)) {
    const copie = repair([...graine], layout, pools, locks);
    population.push({ genome: copie, score: evaluate(copie).score });
  }
  // Les graines essaiment : une partie de la population part de leurs copies
  // mutees plutot que du hasard, pour garder leurs acquis d'une vague a l'autre.
  const nbGraines = population.length;
  if (nbGraines > 0) {
    const nbMutants = Math.floor((settings.populationSize - nbGraines) / 2);
    for (let i = 0; i < nbMutants; i += 1) {
      const source = population[Math.floor(random() * nbGraines)].genome;
      const genome = mutate([...source], pools, 0.3, random, guidage);
      repair(genome, layout, pools, locks);
      population.push({ genome, score: evaluate(genome).score });
    }
  }
  while (population.length < settings.populationSize) {
    const genome = randomGenome(layout, pools, random, 0.9, locks);
    population.push({ genome, score: evaluate(genome).score });
  }
  population.sort((a, b) => b.score - a.score);

  let best = population[0];
  let stagnation = 0;
  let generation = 0;

  // Paliers de proximite : le meilleur build pour chaque nombre de pieces a
  // changer. Ils ne se collectent que quand une reference est posee.
  const proximite = evaluate.proximite;
  const paliers = proximite ? creerPaliers(proximite) : null;
  const noterPalier = (genome) => {
    if (!paliers) return;
    const vue = evaluate(genome);
    paliers.proposer(genome, vue.score, vue.changements);
  };
  let descentes = 0;
  let echecsSecousse = 0;

  // Historique du meilleur score, pour tracer la courbe d'evolution.
  const history = [best.score];

  for (; generation < settings.maxGenerations; generation += 1) {
    // Les points de caracteristique suivent le meilleur build du moment.
    if (settings.optimiserPoints && generation % settings.allocationEvery === 0) {
      if (repartirPoints(best)) {
        population = population.map((individu) => ({
          genome: individu.genome, score: evaluate(individu.genome).score,
        }));
        population.sort((a, b) => b.score - a.score);
        if (population[0].score > best.score) stagnation = 0;
        best = population[0];
      }
    }

    const next = population.slice(0, settings.eliteCount).map((individual) => ({ ...individual }));

    while (next.length < settings.populationSize) {
      const parentA = tournament(population, settings.tournamentSize, random);
      const parentB = tournament(population, settings.tournamentSize, random);

      let genome = random() < settings.crossoverRate
        ? crossover(parentA.genome, parentB.genome, random)
        : [...parentA.genome];

      genome = mutate(genome, pools, settings.mutationRate, random, guidage);
      genome = repair(genome, layout, pools, locks);

      next.push({ genome, score: evaluate(genome).score });
    }

    next.sort((a, b) => b.score - a.score);
    population = next;

    // Les elites de chaque generation nourrissent les paliers : un build qui
    // ne gagnera jamais la course peut tres bien etre le meilleur a deux
    // pieces changees. L'evaluation passe par le cache, la lecture est libre.
    if (paliers) {
      for (let i = 0; i < settings.eliteCount && i < population.length; i += 1) {
        noterPalier(population[i].genome);
      }
    }

    if (population[0].score > best.score) {
      best = population[0];
      archive.proposer(best.genome, best.score);
      stagnation = 0;
    } else {
      stagnation += 1;
    }

    // Quand le score n'avance plus, une injection remplace la queue de la
    // population : moitie tirages neufs, moitie copies fortement mutees des
    // meilleurs. L'elite reste en place, le score ne peut pas reculer.
    if (settings.immigrantsAfter > 0 && stagnation > 0
      && stagnation % settings.immigrantsAfter === 0) {
      const nb = Math.max(1, Math.floor(settings.populationSize * settings.immigrantsShare));
      for (let i = 0; i < nb; i += 1) {
        const position = settings.populationSize - 1 - i;
        if (position < settings.eliteCount) break;

        let genome;
        if (i % 2 === 0) {
          genome = randomGenome(layout, pools, random, 0.9, locks);
        } else {
          const source = population[Math.floor(random() * settings.eliteCount)].genome;
          genome = mutate([...source], pools, 0.4, random, guidage);
          repair(genome, layout, pools, locks);
        }
        population[position] = { genome, score: evaluate(genome).score };
      }
      population.sort((a, b) => b.score - a.score);
    }

    // La descente locale affine le meilleur individu, puis les tours suivants
    // le secouent avant de redescendre : quelques cases changent d'un coup,
    // la descente repare le reste. Ce coup de pied traverse les vallees de
    // penalite qu'un remplacement d'une seule piece ne peut pas franchir.
    if (settings.localSearchEvery > 0 && generation % settings.localSearchEvery === 0) {
      let depart = best.genome;
      if (descentes > 0) {
        // La secousse grossit quand les essais echouent en serie : le bassin
        // courant est epuise, il faut sauter plus loin.
        depart = secouer(best.genome, pools, random, guidage, locks, Math.min(5, echecsSecousse));
        repair(depart, layout, pools, locks);
      }
      descentes += 1;

      const affine = improve(depart, contexteLocal, {
        maxPasses: settings.localSearchPasses,
        candidatesPerSlot: settings.localSearchCandidates,
      });
      // Une descente finit toujours sur un optimum local : meme perdante,
      // elle rend un build abouti, donc un candidat credible.
      archive.proposer(affine.genome, affine.score);
      if (affine.score > best.score) {
        best = { genome: affine.genome, score: affine.score };
        population[0] = { ...best };
        stagnation = 0;
        echecsSecousse = 0;
      } else if (affine.score > population[population.length - 1].score) {
        // Un essai perdant mais correct rejoint la population : il porte
        // parfois la piece qui manquait a un croisement futur.
        population[population.length - 1] = { genome: affine.genome, score: affine.score };
        echecsSecousse += 1;
      } else {
        echecsSecousse += 1;
      }
    }

    history.push(best.score);
    onProgress?.({ generation, best: best.score });
    if (stagnation >= settings.stagnationLimit) break;
  }

  // Une derniere descente, plus profonde, avant de rendre le resultat.
  const dernier = improve(best.genome, contexteLocal, { maxPasses: 4, candidatesPerSlot: 120 });
  if (dernier.score > best.score) best = { genome: dernier.genome, score: dernier.score };

  // Les points se recalent une derniere fois sur le build retenu.
  if (settings.optimiserPoints) repartirPoints(best);

  const final = evaluate.complet(best.genome);
  archive.proposer(best.genome, final.score);
  for (const individu of population.slice(0, 40)) {
    archive.proposer(individu.genome, individu.score);
  }

  // La population finale passe une derniere fois par les paliers : c'est la
  // qu'elle est la plus riche, et un palier bas peut n'avoir jamais ete elite.
  if (paliers) {
    for (const individu of population) noterPalier(individu.genome);
  }

  // Chaque candidat repart avec de quoi etre compare : ses pieces, son score,
  // le detail de ses conditions et sa propre repartition de points.
  //
  // Cette repartition n'est pas un detail de confort. Note avec les points du
  // gagnant, un candidat aux pieces differentes manquait des conditions qu'il
  // savait tenir : il paraissait mauvais, et le porter le laissait en defaut.
  const decrire = (genome) => {
    const allocation = memeGenome(genome, best.genome)
      ? porteur.allocation
      : allocationPour(genome);
    const vue = evaluate.complet(genome, allocation);
    return {
      genome: [...genome],
      itemIds: vue.items.map((item) => item.id),
      score: vue.score,
      damage: vue.detail.damage,
      satisfied: vue.detail.satisfied,
      unmet: vue.detail.unmet,
      stats: vue.stats,
      allocation: { ...allocation },
      changements: vue.changements,
    };
  };

  const candidats = archive.liste().map(({ genome }) => decrire(genome));

  // Chaque palier se decrit comme un candidat : le joueur le porte du meme
  // clic. Le gagnant et les candidats rejoignent d'abord les pretendants —
  // sans eux, un palier pouvait annoncer moins que le build deja montre.
  let parPalier = [];
  if (paliers) {
    for (const candidat of [...candidats, decrire(best.genome)]) {
      paliers.proposer(candidat.genome, candidat.score, candidat.changements);
    }

    // Les pretendants se departagent sur leur score definitif, celui de leur
    // propre repartition de points : c'est le seul que le joueur lira.
    const definitifs = new Map();
    const noter = (genome) => {
      const cle = genome.join(',');
      if (!definitifs.has(cle)) definitifs.set(cle, decrire(genome));
      return definitifs.get(cle).score;
    };

    parPalier = paliers.liste(noter).map(({ genome, changements }) => ({
      ...definitifs.get(genome.join(',')),
      changements,
    }));
  }

  return {
    items: final.items,
    stats: final.stats,
    score: final.score,
    allocation: { ...porteur.allocation },
    detail: final.detail,
    invalid: final.invalid,
    violations: final.violations,
    unplaced,
    history,
    candidats,
    paliers: parPalier,
    // Les meilleurs genomes repartent vers les autres fils.
    topGenomes: population.slice(0, 16).map((individu) => individu.genome),
    generations: generation,
  };
}

export { SEARCH_MODES };
