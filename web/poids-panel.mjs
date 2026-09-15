/**
 * Reglage de la part des degats, en mode mixte.
 *
 * Un curseur muet ne dit rien : « 65 % » ne se traduit pas tout seul en
 * decision de jeu. Le panneau nomme donc chaque zone du curseur, et dit ce
 * que le reglage echange — combien de pour cent d'endurance paie un pour cent
 * de degats laches.
 *
 * Le calcul vit dans des fonctions pures ; le rendu ne fait que les montrer.
 */
import { el } from './render.mjs';
import { normaliserPart, tauxDechange } from '../src/solver/score.mjs';

/**
 * Zones nommees du curseur.
 *
 * Les deux bornes sont les modes purs : le mixte les contient, il ne s'ajoute
 * pas a cote d'eux. Entre les deux, les noms decrivent une facon de jouer, pas
 * un nombre.
 */
export const REPERES = Object.freeze([
  Object.freeze({ part: 0, nom: 'Pdv effectifs seuls' }),
  Object.freeze({ part: 0.25, nom: 'Defensif' }),
  Object.freeze({ part: 0.5, nom: 'Equilibre' }),
  Object.freeze({ part: 0.75, nom: 'Offensif' }),
  Object.freeze({ part: 1, nom: 'Degats seuls' }),
]);

/** Pas du curseur, en part. Cinq pour cent suffisent a sentir l'effet. */
export const PAS_CURSEUR = 0.05;

/** Nom de la zone la plus proche d'une part. */
function nomDe(part) {
  let proche = REPERES[0];
  for (const repere of REPERES) {
    if (Math.abs(repere.part - part) < Math.abs(proche.part - part)) proche = repere;
  }
  return proche.nom;
}

/**
 * Etat du reglage, pret a montrer.
 *
 * @param {unknown} brut Part des degats, telle qu'elle vient de l'etat.
 * @returns {{part: number, pourcent: number, nom: string, taux: number}}
 */
export function vueDePart(brut) {
  const part = normaliserPart(brut);
  return {
    part,
    pourcent: Math.round(part * 100),
    nom: nomDe(part),
    taux: tauxDechange(part),
  };
}

/** Un nombre a une decimale, a la francaise. */
const decimale = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/**
 * Ce que le reglage echange, en une phrase.
 *
 * @param {unknown} brut Part des degats.
 * @returns {string}
 */
export function echangeLisible(brut) {
  const { part, taux } = vueDePart(brut);

  // Aux bornes, le mode est pur : il n'y a plus d'echange a decrire.
  if (part >= 1) return 'La recherche juge les degats seuls.';
  if (part <= 0) return 'La recherche juge les pdv effectifs seuls.';

  return `1 % de degats laches vaut ${decimale(taux)} % de pdv effectifs gagnes.`;
}

/**
 * Remplit le reglage.
 *
 * @param {HTMLElement} racine
 * @param {{part: unknown, onChanger: (part: number) => void}} options
 */
export function renderPoids(racine, { part, onChanger }) {
  const vue = vueDePart(part);

  const curseur = el('input', {
    type: 'range', min: '0', max: '1', step: String(PAS_CURSEUR),
    value: String(vue.part), class: 'curseur-poids',
    'aria-label': 'Part des degats dans le score',
    onInput: (ev) => onChanger(Number(ev.target.value)),
  });

  racine.replaceChildren(
    el('div', { class: 'poids-tete' },
      el('span', { class: 'poids-nom', text: vue.nom }),
      el('span', { class: 'poids-valeur', text: `${vue.pourcent} % degats` })),
    curseur,
    el('div', { class: 'poids-reperes' },
      REPERES.map((repere) => el('button', {
        class: `mini poids-repere ${repere.part === vue.part ? 'actif' : ''}`.trim(),
        type: 'button', text: `${Math.round(repere.part * 100)} %`,
        title: repere.nom,
        onClick: () => onChanger(repere.part),
      }))),
    el('p', { class: 'note', text: echangeLisible(vue.part) }),
  );
}
