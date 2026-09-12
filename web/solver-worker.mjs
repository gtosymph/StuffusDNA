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

  let allocation = request.allocation ?? {};
  let graines = [];
  let totalGenerations = 0;
  let meilleur = null;
  let vague = 0;

  while (!arretDemande) {
    const apports = migrants.splice(0, 8);
    const debut = totalGenerations;
    const departVague = Date.now();

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

    const resume = resumer(result);
    if (!meilleur || resume.score > meilleur.score) meilleur = resume;

    self.postMessage({
      type: 'vague',
      seed: request.seed,
      generation: totalGenerations,
      best: meilleur.score,
      // La premiere valeur d'une vague repete la derniere de la precedente.
      history: vague === 0 ? result.history : result.history.slice(1),
      resume,
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
