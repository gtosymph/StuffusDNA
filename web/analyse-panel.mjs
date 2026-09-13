/**
 * Bloc « Analyse du build » : apports, sensibilite et remplacements.
 *
 * Trois lectures du meme build : ce que chaque piece vaut, quelle
 * statistique paie encore, et quelle piece acheter pour chaque case. Le
 * bloc ne connait pas l'etat de l'application : il recoit ce qu'il montre.
 */
import * as vue from './render.mjs';
import { renderRemplacements } from './remplacements-panel.mjs';
import { STAT_LABELS } from '../src/data/stats.mjs';
import { apportsPieces, sensibiliteStats } from '../src/solver/explain.mjs';
import { meilleursRemplacements } from '../src/solver/remplacements.mjs';

/** Dernier calcul des remplacements, et la signature du build qui l'a produit. */
let memo = { signature: '', propositions: [] };

/**
 * Meilleurs remplacements du build pose, calcules seulement quand il change.
 *
 * Le calcul essaie cinq mille pieces en une cinquantaine de millisecondes :
 * rien pour un clic, trop pour chaque lettre tapee dans la recherche. La
 * signature couvre tout ce qui pese sur le resultat, et rien d'autre.
 */
function remplacementsMemo(pieces, etat, catalogue, contexte) {
  const signature = JSON.stringify([
    pieces.map((piece) => piece.id), etat.niveau, etat.allocation, etat.scrolls, etat.classe, etat.sexe,
    etat.conditions, etat.sorts.map((sort) => sort.id), etat.options, [...etat.bannis],
  ]);
  if (memo.signature !== signature) {
    memo = {
      signature,
      propositions: meilleursRemplacements(pieces, { ...contexte, catalogue: catalogue.items, bannis: etat.bannis }),
    };
  }
  return memo.propositions;
}

/**
 * Remplit les trois sections du bloc.
 *
 * @param {{apports: HTMLElement, sensibilite: HTMLElement, remplacements: HTMLElement}} racines
 * @param {object} donnees
 * @param {any} donnees.etat
 * @param {{items: any[], itemById: Map<number, any>}} donnees.catalogue
 * @param {Record<string, number>} donnees.stats Statistiques du build pose.
 * @param {object} donnees.cible Objectif du score affiche.
 * @param {boolean} donnees.tenu Vrai quand le build tient ses conditions.
 * @param {object} donnees.contexte Niveau, points, parchemins, passifs, profil, panoplies.
 * @param {(proposition: any) => void} donnees.onRemplacer
 */
export function renderAnalyse(racines, { etat, catalogue, stats, cible, tenu, contexte, onRemplacer }) {
  const pieces = [...etat.equipped.values()];
  const complet = { ...contexte, objective: cible };

  vue.renderAnalyse(racines.apports, racines.sensibilite, {
    apports: apportsPieces(pieces, complet),
    sensibilite: sensibiliteStats(stats, cible),
    itemById: catalogue.itemById,
    libelles: STAT_LABELS,
  });

  renderRemplacements(racines.remplacements, remplacementsMemo(pieces, etat, catalogue, complet), {
    tenu, onEquiper: onRemplacer,
  });
}
