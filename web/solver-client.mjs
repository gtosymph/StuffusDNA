/**
 * Pilotage des fils de calcul cote navigateur.
 *
 * Le client lance plusieurs fils qui cherchent sans limite de generations.
 * Il fait circuler les meilleurs genomes entre les fils apres chaque vague,
 * et rend le meilleur build quand l'utilisateur met la recherche en pause.
 */

import { creerArchive } from '../src/solver/candidates.mjs';

/** Nombre de fils propose par defaut, selon le processeur. */
export function defaultThreadCount() {
  const cores = Math.max(1, navigator.hardwareConcurrency || 2);
  return Math.min(8, Math.max(1, Math.floor(cores / 2)));
}

/**
 * Delai accorde aux fils pour rendre leur resultat apres l'ordre d'arret.
 *
 * Un fil ne lit ses messages qu'entre deux vagues : il faut donc laisser
 * finir la vague en cours. Sous plusieurs fils qui se partagent les coeurs,
 * une vague peut demander plusieurs secondes.
 */
const DELAI_ARRET_MS = 20000;

/**
 * Lance une recherche continue sur plusieurs fils.
 *
 * @param {object} request Donnees transmises a chaque fil.
 * @param {object} options
 * @param {number} options.threads Nombre de fils.
 * @param {(info: {seed: number, generation: number, best: number}) => void} [options.onProgress]
 * @param {(vague: {seed: number, generation: number, best: number, history: number[], resume: any}) => void} [options.onWave]
 * @returns {{promise: Promise<any>, stop: () => void, abandon: () => void}}
 */
/**
 * Fond les paliers de tous les fils en une seule frontiere.
 *
 * Chaque fil rend sa propre lecture des paliers. Le joueur n'en veut qu'une :
 * pour chaque nombre de pieces a changer, le meilleur build trouve par un fil
 * quelconque.
 *
 * @param {any[]} runs
 * @returns {any[]}
 */
function fusionnerPaliers(runs) {
  const meilleurs = new Map();
  for (const run of runs) {
    for (const palier of run.paliers ?? []) {
      const connu = meilleurs.get(palier.changements);
      if (!connu || palier.score > connu.score) meilleurs.set(palier.changements, palier);
    }
  }

  // Aucune reduction ici : l'interface decide de ce qu'elle montre, et les
  // paliers qui ne gagnent rien lui servent d'alternatives a valeur egale.
  return [...meilleurs.values()].sort((a, b) => a.changements - b.changements);
}

/**
 * Fond les paliers de survie de tous les fils : pour chaque tranche de points
 * de vie, le build le plus fort qu'un fil quelconque ait trouve. Aucune
 * reduction ici non plus : la frontiere se prend a l'affichage.
 *
 * @param {any[]} runs
 * @returns {any[]}
 */
function fusionnerSurvie(runs) {
  const meilleurs = new Map();
  for (const run of runs) {
    for (const palier of run.survie ?? []) {
      const connu = meilleurs.get(palier.tranche);
      if (!connu || palier.damage > connu.damage) meilleurs.set(palier.tranche, palier);
    }
  }
  return [...meilleurs.values()].sort((a, b) => a.tranche - b.tranche);
}

export function runSearch(request, { threads, onProgress, onWave }) {
  const fils = [];
  let arretEnvoye = false;
  let stopper = null;
  let abandonner = null;
  // Une recherche close ne rappelle plus personne : ni le suivi des vagues,
  // ni la conclusion. Un abandon coupe les fils au milieu d'une vague, et
  // les messages deja partis ne doivent pas repeindre l'interface.
  let close = false;

  const promise = new Promise((resolve, reject) => {
    const resultats = [];
    // Meilleur build vu en cours de route, par fil : si un fil tarde a rendre
    // son resultat final, son travail n'est pas perdu pour autant.
    const derniersResumes = new Map();
    let vivants = threads;
    let minuteur = null;

    const conclure = () => {
      if (close) return;
      close = true;
      clearTimeout(minuteur);
      for (const { worker } of fils) worker.terminate();

      // Aucun resultat final : le meilleur des vagues recues fait foi.
      const retenus = resultats.length > 0 ? resultats : [...derniersResumes.values()];
      if (retenus.length === 0) {
        reject(new Error('Aucun fil n\'a rendu de resultat.'));
        return;
      }
      retenus.sort((a, b) => b.score - a.score);

      // Les fils explorent des pistes differentes : leurs candidats se
      // fondent dans une seule archive, sans doublon de composition.
      const archive = creerArchive({ identite: (ids) => [...ids].sort((a, b) => a - b) });
      for (const run of retenus) {
        for (const candidat of run.candidats ?? []) {
          archive.proposer(candidat.itemIds, candidat.score, candidat);
        }
      }

      resolve({
        best: retenus[0],
        runs: retenus,
        candidats: archive.liste().map((entree) => entree.detail),
        paliers: fusionnerPaliers(retenus),
        survie: fusionnerSurvie(retenus),
      });
    };

    const terminerFil = () => {
      vivants -= 1;
      if (vivants === 0) conclure();
    };

    for (let i = 0; i < threads; i += 1) {
      const seed = 1 + i * 7919;
      const worker = new Worker(new URL('./solver-worker.mjs', import.meta.url), { type: 'module' });
      fils.push({ worker, seed });

      worker.addEventListener('message', (event) => {
        if (close) return;
        const message = event.data;

        if (message.type === 'progress') {
          onProgress?.(message);
          return;
        }

        if (message.type === 'vague') {
          onWave?.(message);
          const connu = derniersResumes.get(message.seed);
          if (message.resume && (!connu || message.resume.score > connu.score)) {
            derniersResumes.set(message.seed, message.resume);
          }
          // Les meilleurs genomes du fil partent chez les autres.
          if (Array.isArray(message.topGenomes) && message.topGenomes.length > 0) {
            for (const autre of fils) {
              if (autre.seed === message.seed) continue;
              autre.worker.postMessage({ type: 'migrants', genomes: message.topGenomes });
            }
          }
          return;
        }

        if (message.type === 'done') {
          if (Number.isFinite(message.score)) resultats.push(message);
          terminerFil();
          return;
        }

        if (message.type === 'error') {
          // Un fil en echec ne doit pas arreter les autres.
          onProgress?.({ seed: message.seed, failed: true, message: message.message });
          terminerFil();
        }
      });

      worker.addEventListener('error', (event) => {
        if (close) return;
        worker.terminate();
        onProgress?.({ seed, failed: true, message: event.message });
        terminerFil();
      });

      worker.postMessage({ type: 'start', request: { ...request, seed } });
    }

    stopper = () => {
      if (arretEnvoye) return;
      arretEnvoye = true;
      for (const { worker } of fils) worker.postMessage({ type: 'stop' });
      // Un fil qui ne repond pas dans le delai n'empeche pas la conclusion.
      minuteur = setTimeout(conclure, DELAI_ARRET_MS);
    };

    // L'abandon ne demande rien aux fils : il les coupe. La pause attend leur
    // meilleur build parce qu'on veut le garder ; un depart de zero le jette
    // de toute facon, et faire patienter l'utilisateur vingt secondes pour un
    // resultat qu'on ecrase n'a pas de sens.
    abandonner = () => {
      if (close) return;
      close = true;
      clearTimeout(minuteur);
      for (const { worker } of fils) worker.terminate();
      resolve({ abandonnee: true, best: null, runs: [], candidats: [], paliers: [], survie: [] });
    };
  });

  return { promise, stop: () => stopper?.(), abandon: () => abandonner?.() };
}
