/**
 * Coordination des fils de calcul du solveur.
 *
 * Le coordinateur lance plusieurs fils independants, chacun avec sa propre
 * graine, puis retient le meilleur build produit. Cette approche par ilots
 * explore davantage l'espace de recherche qu'une population unique.
 */
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { creerArchive } from './candidates.mjs';

/** Nombre maximal de fils, pour ne pas saturer la machine. */
export const MAX_THREADS = 8;

/** Nombre de vagues par defaut : entre deux vagues, les fils s'echangent leurs builds. */
export const DEFAULT_WAVES = 4;

/** Genomes repris d'un autre fil au depart d'une vague. */
const MIGRANTS_PAR_FIL = 6;

/**
 * Repartit les meilleurs genomes de la vague precedente entre les fils.
 *
 * Chaque fil recoit les trouvailles de ses voisins plutot que les siennes :
 * sans cela il repartirait sur sa propre piste et resterait dans son optimum.
 *
 * @param {any[]} resultats Resultats de la vague, un par fil.
 * @param {number} fils
 * @returns {number[][][]} Genomes de depart, par fil.
 */
export function repartirMigrants(resultats, fils) {
  const parFil = [];

  for (let i = 0; i < fils; i += 1) {
    const migrants = [];
    // Le fil reprend d'abord son propre meilleur, pour ne rien perdre.
    const sien = resultats[i]?.topGenomes?.[0];
    if (sien) migrants.push(sien);

    // Puis il recoit ceux des voisins, en tournant.
    for (let ecart = 1; ecart < resultats.length; ecart += 1) {
      const voisin = resultats[(i + ecart) % resultats.length];
      for (const genome of (voisin?.topGenomes ?? []).slice(0, 2)) {
        if (migrants.length >= MIGRANTS_PAR_FIL) break;
        migrants.push(genome);
      }
      if (migrants.length >= MIGRANTS_PAR_FIL) break;
    }

    parFil.push(migrants);
  }

  return parFil;
}

/**
 * Nombre de fils retenu par defaut : la moitie des coeurs disponibles.
 * @returns {number}
 */
export function defaultThreadCount() {
  const cores = Math.max(1, cpus().length);
  return Math.min(MAX_THREADS, Math.max(1, Math.floor(cores / 2)));
}

/**
 * Cree un fil de calcul persistant.
 *
 * Le fil charge le catalogue une seule fois puis traite les requetes de vague
 * l'une apres l'autre : c'est le fonctionnement du navigateur, et le seul qui
 * donne des mesures de temps fideles.
 *
 * @param {URL} url
 * @param {object} config Configuration fixe transmise par workerData.
 * @returns {{vivant: boolean, demander: (message: object) => Promise<any>, arreter: () => void}}
 */
function creerFil(url, config) {
  const worker = new Worker(url, { workerData: config });
  const fil = { vivant: true };

  worker.on('exit', () => { fil.vivant = false; });

  fil.demander = (message) => new Promise((resolve, reject) => {
    if (!fil.vivant) {
      reject(new Error('Fil de calcul arrete.'));
      return;
    }

    const nettoyer = () => {
      worker.off('message', surMessage);
      worker.off('error', surErreur);
      worker.off('exit', surExit);
    };
    const surMessage = (reponse) => {
      nettoyer();
      if (reponse?.ok) resolve(reponse);
      else reject(new Error(reponse?.message ?? 'Fil de calcul en echec.'));
    };
    const surErreur = (error) => { nettoyer(); reject(error); };
    const surExit = (code) => {
      nettoyer();
      reject(new Error(`Fil de calcul arrete avec le code ${code}.`));
    };

    worker.on('message', surMessage);
    worker.on('error', surErreur);
    worker.on('exit', surExit);
    worker.postMessage(message);
  });

  fil.arreter = () => worker.terminate();
  return fil;
}

/**
 * Lance la recherche sur plusieurs fils et renvoie le meilleur build.
 *
 * @param {object} input
 * @param {number} input.level
 * @param {object} input.objective
 * @param {Record<string, number>} [input.allocation]
 * @param {Record<string, boolean>} [input.scrolls]
 * @param {object} [input.passivesConfig]
 * @param {number[]} [input.bannedIds]
 * @param {string[]} [input.allowedSlots]
 * @param {object} [options] Reglages du solveur, dont threadCount et waves.
 * @returns {Promise<{best: any, runs: any[], threads: number}>}
 */
export async function solveParallel(input, options = {}) {
  const { threadCount, waves, ...solverOptions } = options;
  const threads = Math.min(
    MAX_THREADS,
    Math.max(1, Number.isFinite(threadCount) ? Math.floor(threadCount) : defaultThreadCount()),
  );

  if (!input?.objective) {
    throw new Error('Objectif absent : impossible de lancer la recherche.');
  }

  const url = new URL('./worker.mjs', import.meta.url);
  const baseSeed = Number.isFinite(solverOptions.seed) ? solverOptions.seed : 1;

  const nbVagues = Math.max(1, Math.floor(waves ?? DEFAULT_WAVES));
  const totalGenerations = solverOptions.maxGenerations ?? 2500;
  const parVague = Math.max(20, Math.floor(totalGenerations / nbVagues));

  let migrants = new Array(threads).fill(null).map(() => []);
  let runs = [];
  const failures = [];
  const historique = new Array(threads).fill(null).map(() => []);

  // Les fils naissent une fois et vivent toutes les vagues.
  const fils = new Array(threads).fill(null).map(() => creerFil(url, input));

  try {
    for (let vague = 0; vague < nbVagues; vague += 1) {
      const tasks = [];
      for (let i = 0; i < threads; i += 1) {
        // Une graine distincte par fil et par vague garde des explorations variees.
        tasks.push(fils[i].demander({
          type: 'vague',
          seedGenomes: migrants[i],
          options: { ...solverOptions, maxGenerations: parVague },
          seed: baseSeed + i * 7919 + vague * 104729,
        }));
      }

      const settled = await Promise.allSettled(tasks);

      const resultats = [];
      for (let i = 0; i < settled.length; i += 1) {
        const issue = settled[i];
        if (issue.status === 'fulfilled') {
          resultats[i] = issue.value;
          historique[i].push(...(issue.value.history ?? []));
        } else {
          failures.push(issue.reason?.message ?? String(issue.reason));
        }
      }

      const aboutis = resultats.filter(Boolean);
      if (aboutis.length === 0) {
        throw new Error(`Tous les fils ont echoue. Premiere cause : ${failures[0] ?? 'inconnue'}`);
      }

      runs = aboutis;
      if (vague < nbVagues - 1) migrants = repartirMigrants(resultats, threads);
    }
  } finally {
    for (const fil of fils) fil.arreter();
  }

  // La courbe couvre toutes les vagues, pas seulement la derniere.
  runs = runs.map((run, i) => ({ ...run, history: historique[i] ?? run.history }));
  runs.sort((a, b) => b.score - a.score);

  // Les candidats des fils se fondent dans une archive commune.
  const archive = creerArchive({ identite: (ids) => [...ids].sort((a, b) => a - b) });
  for (const run of runs) {
    for (const candidat of run.candidats ?? []) {
      archive.proposer(candidat.itemIds, candidat.score, candidat);
    }
  }

  return {
    best: runs[0],
    runs,
    threads,
    waves: nbVagues,
    failures,
    candidats: archive.liste().map((entree) => entree.detail),
  };
}
