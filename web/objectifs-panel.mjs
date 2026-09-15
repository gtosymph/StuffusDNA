/**
 * Panneau « A viser » : les deux mesures qui decident d'un build.
 *
 * Tout le reste d'une fiche — force, sagesse, resistance feu — n'est qu'un
 * moyen. Deux nombres seulement disent si un build tient la route : ce qu'il
 * envoie (les degats totaux) et ce qu'il encaisse (les pdv effectifs). La
 * recherche en maximise un et borne l'autre ; ce panneau met les deux en tete
 * et laisse choisir lequel joue quel role.
 *
 * Chaque ligne porte donc deux gestes : cliquer la valeur pour en faire une
 * condition, ou demander a la recherche de la maximiser.
 */
import { el } from './render.mjs';
import { iconeStat } from './icons.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

/** Mode qui maximise les deux mesures a la fois. */
const MODE_MIXTE = SEARCH_MODES.MIXTE;

const nombre = (v) => Math.round(v).toLocaleString('fr-FR');

/** Les deux mesures, et le mode de recherche qui maximise chacune. */
export const MESURES_VISEES = Object.freeze([
  { stat: 'degatsTotaux', libelle: 'Degats totaux', mode: 'degats' },
  { stat: 'pdvEffectifs', libelle: 'Pdv effectifs', mode: 'endurance' },
]);

/**
 * Etat de chaque ligne du panneau.
 *
 * @param {{degatsTotaux: number, pdvEffectifs: number}} valeurs
 * @param {string} mode Mode de recherche choisi par le joueur.
 * @param {Set<string>|string[]} conditions Statistiques deja sous condition.
 * @returns {{stat: string, libelle: string, valeur: number, maximisee: boolean,
 *            enCondition: boolean, mode: string}[]}
 */
export function lignesObjectifs(valeurs, mode, conditions) {
  const posees = conditions instanceof Set ? conditions : new Set(conditions ?? []);

  return MESURES_VISEES.map((mesure) => ({
    stat: mesure.stat,
    libelle: mesure.libelle,
    mode: mesure.mode,
    valeur: Number(valeurs?.[mesure.stat]) || 0,
    // La mesure que la recherche maximise n'a pas a etre bornee par une
    // condition : elle monte deja aussi haut que possible. Le mode mixte les
    // maximise toutes les deux, dans la proportion reglee par le joueur.
    maximisee: mode === mesure.mode || mode === MODE_MIXTE,
    enCondition: posees.has(mesure.stat),
  }));
}

/**
 * Remplit le panneau.
 *
 * @param {HTMLElement} racine
 * @param {object} options
 * @param {{degatsTotaux: number, pdvEffectifs: number}|null} options.valeurs
 * @param {string} options.mode
 * @param {Set<string>|string[]} options.conditions
 * @param {(stat: string, valeur: number) => void} options.onCondition
 * @param {(mode: string) => void} options.onMaximiser
 */
export function renderObjectifs(racine, options) {
  const { valeurs, mode, conditions, onCondition, onMaximiser } = options;

  if (!valeurs) {
    racine.replaceChildren(el('p', { class: 'note', text: 'Catalogue en cours de chargement…' }));
    return;
  }

  const ligne = (vue) => {
    const icone = iconeStat(vue.stat);
    const titre = vue.enCondition
      ? `${vue.libelle} — deja dans les conditions`
      : `${vue.libelle} — cliquez pour en faire une condition`;

    return el('div', { class: `objectif ${vue.maximisee ? 'maximisee' : ''}`.trim() },
      el('button', {
        class: `objectif-mesure ${vue.enCondition ? 'suivie' : ''}`.trim(),
        type: 'button', title: titre,
        onClick: () => onCondition(vue.stat, vue.valeur),
      },
        icone ? el('img', { src: icone, alt: '', decoding: 'async' }) : null,
        el('span', { class: 'objectif-nom', text: vue.libelle }),
        el('strong', { class: 'objectif-valeur', text: nombre(vue.valeur) })),

      vue.maximisee
        ? el('span', { class: 'objectif-marque', title: 'La recherche maximise cette mesure',
            text: 'maximise' })
        : el('button', { class: 'mini', type: 'button',
            title: `La recherche maximisera ${vue.libelle.toLowerCase()}`,
            text: 'Maximiser', onClick: () => onMaximiser(vue.mode) }));
  };

  racine.replaceChildren(
    ...lignesObjectifs(valeurs, mode, conditions).map(ligne),
    el('p', { class: 'note',
      text: 'La recherche maximise une mesure et borne l\'autre. Cliquez un nombre '
        + 'pour en faire une condition, a partir de sa valeur actuelle.' }),
  );
}
