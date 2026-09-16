/**
 * La feuille des minimums.
 *
 * Le volet de gauche montre ce que chaque minimum vaut et s'il est tenu :
 * c'est ce qu'on regarde tout le temps. Le REGLER demande quatre champs par
 * ligne — l'objectif, le poids, le maximum, l'absolu — et quatre champs sur
 * trois cents pixels de large ne se saisissent pas.
 *
 * Les quatre champs ne disent pas la meme chose, et la feuille est le seul
 * endroit ou on a la place de le dire :
 *
 *   - l'OBJECTIF est la valeur a tenir ;
 *   - le POIDS dit ce qu'une unite manquante coute au score. A 1, c'est une
 *     preference ; a 500, c'est un couperet ;
 *   - le MAXIMUM borne ce que le solveur investit au-dela ;
 *   - l'ABSOLU rend ce maximum infranchissable.
 */
import { el, renderConditions } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { STATS, STAT_LABELS } from '../../src/data/stats.mjs';
import { STAT_DEGATS } from '../../src/solver/condition-value.mjs';

let racine = null;
let libererFocus = null;

/** Ferme la feuille. */
export function fermerMinimums() {
  if (!racine) return;
  racine.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/** Vrai quand la feuille est ouverte. */
export const minimumsOuverts = () => Boolean(racine) && !racine.hidden;

/**
 * Ce qu'un minimum vaut a sa creation.
 *
 * Le poids 1 en fait une preference, pas un couperet : le solveur la tiendra
 * s'il peut. C'est le reglage le moins surprenant pour qui vient d'ajouter
 * une ligne sans encore savoir ce que le poids veut dire.
 */
export const MINIMUM_NEUF = (stat) => ({
  stat, target: 0, weight: 1, max: null, absolute: false,
});

/**
 * Ouvre la feuille des minimums.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {(patch: object) => void} liens.setEtat
 * @param {(texte: string, type?: string) => void} liens.message
 * @param {() => {stats: Record<string, number>|null, degats: number}} liens.lireMesures
 */
export function ouvrirMinimums({ lireEtat, setEtat, message, lireMesures }) {
  if (!racine) {
    racine = el('div', { class: 'feuille-fond', hidden: true, onClick: (ev) => {
      if (ev.target === racine) fermerMinimums();
    } });
    document.body.append(racine);
  }

  const corps = el('tbody');
  const choix = el('select', { id: 'nouveau-minimum' });
  const regler = (patch) => { setEtat(patch); dessiner(); };

  /** Ajoute un minimum, si la statistique n'en porte pas deja un. */
  function ajouter() {
    const etat = lireEtat();
    const stat = choix.value;
    if (etat.conditions.some((c) => c.stat === stat)) {
      message(`Un minimum porte deja sur « ${STAT_LABELS[stat] ?? stat} ».`, 'erreur');
      return;
    }
    regler({ conditions: [...etat.conditions, MINIMUM_NEUF(stat)] });
  }

  function dessiner() {
    const etat = lireEtat();
    const { stats, degats } = lireMesures();

    renderConditions(corps, etat.conditions, stats, STAT_LABELS, {
      degats,
      onChange: (index, cle, valeur) => regler({
        conditions: etat.conditions.map((c, i) => (i === index ? { ...c, [cle]: valeur } : c)),
      }),
      onRemove: (index) => regler({
        conditions: etat.conditions.filter((_, i) => i !== index),
      }),
    });

    // La liste d'ajout ne propose que ce qui n'est pas deja pose : offrir un
    // choix qui sera refuse au clic suivant n'aide personne.
    const posees = new Set(etat.conditions.map((c) => c.stat));
    const libres = [
      ...STATS.filter((s) => !posees.has(s.key)).map((s) => [s.key, s.fr]),
      ...(posees.has(STAT_DEGATS) ? [] : [[STAT_DEGATS, STAT_LABELS[STAT_DEGATS]]]),
    ];
    const garde = choix.value;
    choix.replaceChildren(...(libres.length === 0
      ? [el('option', { value: '', text: 'toutes les mesures sont posees' })]
      : libres.map(([cle, nom]) => el('option', { value: cle, text: nom }))));
    if (garde && libres.some(([cle]) => cle === garde)) choix.value = garde;
    choix.disabled = libres.length === 0;
  }

  racine.replaceChildren(el('div', {
    class: 'feuille large', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mes minimums',
  },
    el('div', { class: 'feuille-tete' },
      el('h2', { text: 'Au minimum' }),
      el('div', { class: 'pousse' }),
      el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
        onClick: fermerMinimums })),

    el('div', { class: 'feuille-corps' },
      el('table', { class: 'conditions' },
        // Les largeurs vivent dans la feuille de style ; ces colonnes ne
        // servent qu'a designer laquelle est laquelle.
        // Les classes portent un prefixe : « etat » nomme deja la pastille
        // d'un minimum dans le socle, et un « col » peint TOUTE sa colonne.
        el('colgroup', {},
          el('col', { class: 'col-nom' }),
          el('col', { class: 'col-chiffre' }),
          el('col', { class: 'col-chiffre' }),
          el('col', { class: 'col-chiffre' }),
          el('col', { class: 'col-courte' }),
          el('col', { class: 'col-atteint' }),
          el('col', { class: 'col-courte' })),
        el('thead', {}, el('tr', {},
          el('th', { text: 'Mesure' }),
          el('th', { text: 'Objectif' }),
          el('th', { text: 'Poids' }),
          el('th', { text: 'Max' }),
          el('th', { text: 'Abs' }),
          el('th', { text: 'Atteint' }),
          el('th', { text: '' }))),
        corps),

      el('div', { class: 'rangee-ajout' }, choix,
        el('button', { class: 'btn', type: 'button', text: 'Ajouter', onClick: ajouter })),

      el('p', { class: 'aide' },
        'Le ', el('b', { text: 'poids' }), ' dit ce qu\'une unite manquante coute au '
        + 'score : a 1 c\'est une preference, a 500 un couperet. Le ',
        el('b', { text: 'maximum' }), ' borne ce que le solveur investit au-dela ; ',
        el('b', { text: 'Abs' }), ' le rend infranchissable.'),
    ),
  ));

  dessiner();
  racine.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(racine);
}
