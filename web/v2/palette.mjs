/**
 * La palette de pieces.
 *
 * Chercher une piece est une tache ponctuelle, pas une reference constante :
 * cela ne merite pas un quart de l'ecran en permanence. L'ancien ecran y
 * consacrait une colonne entiere plus deux blocs — « pieces bannies » et
 * « pieces possedees » — qui ne servaient qu'a defaire ce qu'on avait fait
 * dans la colonne.
 *
 * Tout cela tient dans une palette que `⌘K` ouvre et que `Echap` ferme. Les
 * trois reglages par piece — interdire, toujours garder, je l'ai deja — se
 * prennent sur la fiche de la piece, la ou on la regarde.
 *
 * La palette se construit UNE FOIS par ouverture ; seule la grille se
 * redessine ensuite. Tout reconstruire a chaque frappe replacerait le curseur
 * a la fin du champ, et corriger une lettre au milieu d'un mot deviendrait
 * impossible.
 *
 * Le filtrage n'est pas refait ici : `itemsFiltres` decide, la palette montre.
 */
import { el, renderCatalogue, renderOnglets } from '../render.mjs';
import { itemsFiltres } from '../objectif.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { STATS } from '../../src/data/stats.mjs';

let racine = null;
let libererFocus = null;

/** Vrai quand la palette est ouverte. */
export const paletteOuverte = () => Boolean(racine) && !racine.hidden;

/** Ferme la palette. */
export function fermerPalette() {
  if (!racine) return;
  racine.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/** Bascule la palette : la meme touche l'ouvre et la referme. */
export function basculerPalette(liens) {
  if (paletteOuverte()) fermerPalette();
  else ouvrirPalette(liens);
}

/**
 * Ouvre la palette.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {() => any} liens.lireCatalogue
 * @param {(patch: object) => void} liens.setEtat
 * @param {(item: any) => void} liens.onPiece Ce qu'un clic sur une piece fait.
 */
export function ouvrirPalette({ lireEtat, lireCatalogue, setEtat, onPiece }) {
  if (!racine) {
    racine = el('div', { class: 'palette-fond', hidden: true, onClick: (ev) => {
      if (ev.target === racine) fermerPalette();
    } });
    document.body.append(racine);
  }

  const depart = lireEtat();
  const grille = el('div', { class: 'palette-grille' });
  const compte = el('p', { class: 'aide' });
  const onglets = el('div', { class: 'palette-onglets' });

  /** Redessine la grille et les onglets, sans toucher aux champs de saisie. */
  function rafraichir() {
    const etat = lireEtat();
    renderOnglets(onglets, etat.filtre,
      (cle, type) => { setEtat({ filtre: cle, filtreType: type }); rafraichir(); },
      etat.filtreType);
    renderCatalogue(grille, compte, itemsFiltres(etat, lireCatalogue()), onPiece,
      etat.bannis, etat.possedees);
  }

  const champ = el('input', {
    type: 'search', id: 'palette-recherche', placeholder: 'Chercher une pièce…',
    value: depart.recherche, autocomplete: 'off',
    onInput: (ev) => { setEtat({ recherche: ev.target.value }); rafraichir(); },
  });

  const poserFiltreStat = (patch) => {
    setEtat({ filtreStat: { ...lireEtat().filtreStat, ...patch } });
    rafraichir();
  };

  const { stat, op, valeur } = depart.filtreStat;
  const filtres = el('div', { class: 'palette-filtres' },
    el('select', { onChange: (ev) => poserFiltreStat({ stat: ev.target.value }) },
      el('option', { value: '', text: 'statistique…' }),
      ...STATS.map((s) => el('option', {
        value: s.key, ...(s.key === stat ? { selected: true } : {}), text: s.fr,
      }))),
    el('select', { onChange: (ev) => poserFiltreStat({ op: ev.target.value }) },
      ...[['>=', '≥'], ['<=', '≤']].map(([v, signe]) => el('option', {
        value: v, ...(v === op ? { selected: true } : {}), text: signe,
      }))),
    el('input', {
      type: 'number', class: 'n', value: String(valeur),
      onChange: (ev) => poserFiltreStat({ valeur: Number(ev.target.value) || 0 }),
    }),
    el('label', { class: 'option',
      title: 'Ne garder que les trophées dont la condition demande moins de trois bonus' },
      el('input', {
        type: 'checkbox', ...(depart.filtrePk ? { checked: true } : {}),
        onChange: (ev) => { setEtat({ filtrePk: ev.target.checked }); rafraichir(); },
      }),
      ' Bonus de panoplie < 3'));

  racine.replaceChildren(el('div', {
    class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Toutes les pièces',
  },
    el('div', { class: 'palette-tete' }, champ,
      el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
        onClick: fermerPalette })),
    onglets,
    filtres,
    grille,
    el('div', { class: 'palette-pied' }, compte,
      el('span', { class: 'aide',
        text: 'Cliquez une pièce pour la poser. Sa fiche porte : interdire, '
          + 'toujours garder, je l\'ai déjà.' })),
  ));

  rafraichir();
  racine.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(racine);
  champ.focus();
  champ.setSelectionRange(champ.value.length, champ.value.length);

  return { rafraichir };
}
