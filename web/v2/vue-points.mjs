/**
 * La feuille de repartition des points.
 *
 * Les points sont une ENTREE de la recherche, pas une consequence : ils
 * decident de ce que le personnage vaut avant le premier objet. Mais ils se
 * reglent rarement — une fois par personnage, deux si l'on change d'avis.
 * Un volet permanent leur donnerait une place qu'ils n'occupent pas.
 *
 * Une feuille leur laisse la largeur qu'il faut pour six curseurs, six
 * parchemins et six limites, et rend l'ecran ensuite.
 *
 * Elle se redessine elle-meme apres chaque geste, sans passer par le rendu de
 * l'application : un curseur qu'on tire emet a chaque pixel, et refaire tout
 * l'ecran a chaque pixel le rendrait poussif.
 */
import { el } from '../render.mjs';
import { renderPoints } from '../points-panel.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { ALLOCATION_VIDE } from '../reglages.mjs';

let racine = null;
let libererFocus = null;

/** Ferme la feuille. */
export function fermerPoints() {
  if (!racine) return;
  racine.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/** Vrai quand la feuille est ouverte. */
export const pointsOuverts = () => Boolean(racine) && !racine.hidden;

/**
 * Ouvre la feuille des points.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {(patch: object) => void} liens.setEtat
 * @param {() => Record<string, number>|null} liens.lireStats
 */
export function ouvrirPoints({ lireEtat, setEtat, lireStats }) {
  if (!racine) {
    racine = el('div', { class: 'feuille-fond', hidden: true, onClick: (ev) => {
      if (ev.target === racine) fermerPoints();
    } });
    document.body.append(racine);
  }

  const corps = el('div', { class: 'points' });

  /** Change un reglage, puis redessine la seule feuille. */
  const regler = (patch) => { setEtat(patch); dessiner(); };

  function dessiner() {
    const etat = lireEtat();

    renderPoints(corps, { ...etat, stats: lireStats() }, {
      onPoints: (cle, valeur) => regler({
        allocation: { ...lireEtat().allocation, [cle]: Math.max(0, valeur) },
      }),
      onScroll: (cle, actif) => regler({
        scrolls: { ...lireEtat().scrolls, [cle]: actif },
      }),
      onLimite: (cle, valeur) => regler({
        limites: {
          ...lireEtat().limites,
          [cle]: valeur === null ? null : Math.max(0, valeur),
        },
      }),
      onReset: () => regler({ allocation: { ...ALLOCATION_VIDE } }),
    });
  }

  racine.replaceChildren(el('div', {
    class: 'feuille large', role: 'dialog', 'aria-modal': 'true',
    'aria-label': 'Répartir mes points',
  },
    el('div', { class: 'feuille-tete' },
      el('h2', { text: 'Répartir mes points' }),
      el('div', { class: 'pousse' }),
      el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
        onClick: fermerPoints })),
    el('div', { class: 'feuille-corps' }, corps,
      el('p', { class: 'aide',
        text: 'Un parchemin monte la caractéristique de 100 sans coûter de point. '
          + 'Une limite empeche la recherche d\'aller au-delà ; elle ne bride '
          + 'jamais votre saisie.' })),
  ));

  dessiner();
  racine.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(racine);
}
