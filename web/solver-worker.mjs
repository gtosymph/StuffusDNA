/**
 * Fil de calcul du solveur, cote navigateur.
 *
 * Le fil travaille par vagues : chaque vague enchaine quelques dizaines de
 * generations, puis rend la main un instant. Cette pause laisse passer les
 * messages du fil principal : l'ordre d'arret et les genomes migrants venus
 * des autres fils. La recherche continue tant que l'ordre d'arret n'arrive pas.
 */
import { loadCatalog } from './catalog-web.mjs';
import { normalizePassives } from '../src/data/passives.mjs';
import { STAT_KEYS } from '../src/data/stats.mjs';
import { preparerRecherche, solve } from '../src/solver/genetic.mjs';
import { creerArchive } from '../src/solver/candidates.mjs';
import { reposApresVague } from '../src/solver/intensite.mjs';
import {
  aConditionDAxe, axeDe, objectifDeTranche, STAT_ENDURANCE, trancheDe, tranchesAVisiter,
} from '../src/solver/survie.mjs';

/**
 * Generations par vague : le compromis entre reactivite et debit.
 *
 * Une vague ne rend la main qu'une fois finie : c'est elle qui fixe le delai
 * de reponse a la Pause et le rythme des echanges entre fils. Mesure du
 * 2026-08-31 dans le navigateur : 20 generations coutent environ une seconde
 * sur un objectif avec arme, plusieurs fois plus quand tous les fils se
 * partagent les coeurs.
 */
const GENERATIONS_PAR_VAGUE = 20;

/**
 * Une vague sur ce nombre part explorer une tranche de vie sous le gagnant.
 *
 * La recherche ordinaire ne descend jamais sous la condition de vie : un
 * build qui lache la vie pour frapper plus fort est penalise et disparait.
 * La courbe « degats ou survie » a pourtant besoin de ces builds, et une
 * descente locale reste dix pour cent sous ce que le moteur genetique trouve.
 * Une vague dediee, sous un plafond de vie, lui rend sa pleine force.
 */
const VAGUES_PAR_TRANCHE = 4;

/** Tranches visitees sous celle du gagnant, en tournant. */
const TRANCHES_VISITEES = 4;

/** Le catalogue ne se charge qu'une fois par fil. */
let catalogPromise = null;

/** Vrai quand le fil principal a demande l'arret. */
let arretDemande = false;

/** Genomes recus des autres fils, injectes a la prochaine vague. */
let migrants = [];

/** Resume compact d'un resultat de vague, pour le fil principal. */
function resumer(result) {
  return {
    score: result.score,
    itemIds: result.items.map((item) => item.id),
    allocation: result.allocation,
    stats: result.stats,
    penalty: result.detail.penalty,
    damage: result.detail.damage,
    satisfied: result.detail.satisfied,
    unmet: result.detail.unmet,
  };
}

async function chercher(request) {
  catalogPromise ??= loadCatalog();
  const catalog = await catalogPromise;
  const { passives } = normalizePassives(request.passivesConfig, new Set(STAT_KEYS));

  const base = {
    items: catalog.items,
    setById: catalog.setById,
    level: request.level,
    scrolls: request.scrolls,
    passives,
    profile: request.profile,
    banned: new Set(request.bannedIds ?? []),
    lockedIds: request.lockedIds ?? [],
    seedItems: (request.currentItemIds ?? [])
      .map((id) => catalog.itemById.get(id))
      .filter(Boolean),
    allowedSlots: request.allowedSlots ? new Set(request.allowedSlots) : null,
    objective: request.objective,
  };

  // La demande ne bouge pas d'une vague a l'autre : pools, verrous,
  // classements et cache d'evaluation se preparent une seule fois. Le
  // classement des pieces coute a lui seul un dixieme du temps d'une vague.
  const contexte = preparerRecherche(base);

  // Les candidats se cumulent sur toute la recherche : chaque vague repart
  // avec une archive neuve, celle-ci garde la memoire de toutes les vagues.
  const archive = creerArchive({ identite: (ids) => [...ids].sort((a, b) => a - b) });

  // Les paliers de proximite se cumulent sur toute la recherche : chaque
  // vague en rend sa lecture, celle-ci garde le meilleur de chaque palier.
  const paliers = new Map();

  // Les paliers de survie aussi : pour chaque tranche de points de vie, le
  // build le plus fort vu au fil des vagues.
  const survie = new Map();

  let allocation = request.allocation ?? {};
  let graines = [];
  let totalGenerations = 0;
  let meilleur = null;
  let vague = 0;

  // Contexte et graines propres a chaque tranche visitee : ils se preparent
  // une fois et se gardent d'une visite a l'autre.
  const tranches = new Map();
  let visites = 0;
  // L'axe suit le mode : tranches d'endurance en mode degats, tranches de
  // degats en mode endurance.
  const axe = axeDe(request.objective?.mode);
  const survieUtile = aConditionDAxe(request.objective, axe);

  /**
   * Explore une tranche de vie sous le gagnant : une vague ordinaire, sous un
   * autre objectif. Seuls ses paliers de survie reviennent ; son gagnant ne
   * repond pas a la demande du joueur et ne touche ni au personnage ni aux
   * candidats.
   */
  const explorerTranche = (tranche) => {
    if (!tranches.has(tranche)) {
      const objective = objectifDeTranche(request.objective, tranche, axe.pas, axe);
      tranches.set(tranche, {
        objective, contexte: preparerRecherche({ ...base, objective }), graines: [], allocation: {},
      });
    }
    const piste = tranches.get(tranche);

    const result = solve(
      { ...base, objective: piste.objective, allocation: piste.allocation, contexte: piste.contexte,
        seedGenomes: [...graines, ...piste.graines] },
      {
        ...request.options,
        maxGenerations: GENERATIONS_PAR_VAGUE,
        stagnationLimit: Number.POSITIVE_INFINITY,
        optimiserPoints: true,
        seed: (request.seed + 104729 * (visites + 1)) >>> 0,
      },
    );
    piste.graines = result.topGenomes;
    piste.allocation = result.allocation ?? piste.allocation;

    // Ce qui se trouve sous le plafond sert aussi la recherche principale :
    // un build qui tient la condition de vie de justesse y passe parfois
    // mieux que par le chemin ordinaire. Ses meilleurs genomes rejoignent
    // les migrants, la prochaine vague les juge sur le vrai objectif.
    migrants.push(...result.topGenomes.slice(0, 4));

    for (const palier of result.survie ?? []) {
      const connu = survie.get(palier.tranche);
      if (!connu || palier[axe.valeur] > connu[axe.valeur]) survie.set(palier.tranche, palier);
    }
  };

  while (!arretDemande) {
    const apports = migrants.splice(0, 8);
    const debut = totalGenerations;
    const departVague = Date.now();

    // Une vague sur quatre part sous le gagnant, des qu'un gagnant existe.
    if (survieUtile && meilleur && vague % VAGUES_PAR_TRANCHE === VAGUES_PAR_TRANCHE - 1) {
      const courant = axe.cle === 'damage'
        ? (meilleur.damage ?? 0)
        : (meilleur.stats[STAT_ENDURANCE] ?? 0);
      const aVisiter = tranchesAVisiter(trancheDe(courant, axe.pas), TRANCHES_VISITEES);
      if (aVisiter.length > 0) {
        explorerTranche(aVisiter[visites % aVisiter.length]);
        visites += 1;
        vague += 1;
        const repos = reposApresVague(Date.now() - departVague, request.intensite);
        await new Promise((resolve) => setTimeout(resolve, repos));
        continue;
      }
    }

    const result = solve(
      { ...base, allocation, seedGenomes: [...graines, ...apports], contexte },
      {
        ...request.options,
        maxGenerations: GENERATIONS_PAR_VAGUE,
        stagnationLimit: Number.POSITIVE_INFINITY,
        optimiserPoints: true,
        seed: (request.seed + vague * 7919) >>> 0,
      },
      (progress) => {
        if ((debut + progress.generation) % 5 === 0) {
          self.postMessage({
            type: 'progress', seed: request.seed,
            generation: debut + progress.generation, best: progress.best,
          });
        }
      },
    );

    totalGenerations += GENERATIONS_PAR_VAGUE;
    graines = result.topGenomes;
    allocation = result.allocation ?? allocation;

    for (const candidat of result.candidats ?? []) {
      archive.proposer(candidat.itemIds, candidat.score, candidat);
    }

    for (const palier of result.paliers ?? []) {
      const connu = paliers.get(palier.changements);
      if (!connu || palier.score > connu.score) paliers.set(palier.changements, palier);
    }

    for (const palier of result.survie ?? []) {
      const connu = survie.get(palier.tranche);
      if (!connu || palier[axe.valeur] > connu[axe.valeur]) survie.set(palier.tranche, palier);
    }

    const resume = resumer(result);
    if (!meilleur || resume.score > meilleur.score) meilleur = resume;

    /*
     * La vague porte les paliers, pas seulement le score.
     *
     * Le trace « degats ou survie » se construit a partir d'eux. Tant qu'ils
     * n'arrivaient qu'a la fin, la courbe restait celle de la recherche
     * PRECEDENTE pendant toute la nouvelle : le joueur lancait, attendait
     * plusieurs minutes, et ne voyait rien bouger.
     *
     * Ce sont deux frontieres, une entree par tranche : quelques dizaines de
     * lignes, envoyees une fois par seconde et par fil. L'archive des
     * candidats, elle, reste pour la fin — elle n'a pas de taille promise.
     */
    self.postMessage({
      type: 'vague',
      seed: request.seed,
      generation: totalGenerations,
      best: meilleur.score,
      // La premiere valeur d'une vague repete la derniere de la precedente.
      history: vague === 0 ? result.history : result.history.slice(1),
      resume,
      paliers: [...paliers.values()].sort((a, b) => a.changements - b.changements),
      survie: [...survie.values()].sort((a, b) => a.tranche - b.tranche),
      topGenomes: result.topGenomes.slice(0, 4),
    });

    vague += 1;
    // La pause laisse le fil traiter l'ordre d'arret et les migrants. Sa
    // duree suit l'intensite demandee : c'est elle qui menage le processeur.
    const repos = reposApresVague(Date.now() - departVague, request.intensite);
    await new Promise((resolve) => setTimeout(resolve, repos));
  }

  self.postMessage({
    type: 'done',
    seed: request.seed,
    generations: totalGenerations,
    candidats: archive.liste().map((entree) => entree.detail),
    paliers: [...paliers.values()].sort((a, b) => a.changements - b.changements),
    survie: [...survie.values()].sort((a, b) => a.tranche - b.tranche),
    ...(meilleur ?? { score: Number.NEGATIVE_INFINITY }),
  });
}

self.addEventListener('message', (event) => {
  const message = event.data;

  if (message.type === 'stop') { arretDemande = true; return; }
  if (message.type === 'migrants') { migrants.push(...(message.genomes ?? [])); return; }

  if (message.type === 'start') {
    arretDemande = false;
    migrants = [];
    chercher(message.request).catch((error) => {
      self.postMessage({ type: 'error', seed: message.request?.seed, message: error.message });
    });
  }
});
