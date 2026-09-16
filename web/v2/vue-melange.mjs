/**
 * Le reglage du mode « les deux », dans le volet de gauche.
 *
 * Le curseur et la courbe se touchent, parce qu'ils sont deux vues du meme
 * reglage. On tire le curseur, le marqueur glisse sur la courbe ; on clique la
 * courbe, le curseur suit. Separes, ni l'un ni l'autre ne se comprend.
 *
 * Le curseur ne montre pas son pourcentage. « 62 % de degats » ne se decide
 * pas : ce qui se decide, c'est « 1 200 degats contre 4 200 pdv effectifs ».
 * Le pourcentage est le moyen, pas la question.
 *
 * Le bloc ne se reconstruit QUE si la courbe a change. Tirer le curseur pose
 * un nouvel etat, donc redessine l'application entiere : reconstruire le
 * curseur a ce moment-la l'arracherait des doigts du joueur au premier pixel.
 */
import { el } from '../render.mjs';
import { lignesSurvie, palierRetenu } from '../survie-panel.mjs';
import { dessinerCourbe, pointLePlusProche } from '../courbe-survie.mjs';
import { AXE_ENDURANCE } from '../../src/solver/survie.mjs';
import { consequenceDe, partPourPalier } from './melange.mjs';

const nombre = (n) => Math.round(n).toLocaleString('fr-FR');

/** Pas du curseur : cent crans suffisent, et chacun se voit sur la courbe. */
const CRANS = 100;

/** Ce qui est monte dans la page, pour ne pas le refaire sans raison. */
let monte = null;

/** Deux courbes sont la meme si elles portent les memes paliers. */
const signatureDe = (lignes) => lignes
  .map((l) => `${l.palier.damage}/${l.palier.endurance}`).join('|');

/**
 * Dessine le reglage du melange.
 *
 * @param {HTMLElement} racine
 * @param {object} liens
 * @param {any[]} liens.paliers Paliers rendus par la derniere recherche.
 * @param {{damage: number, endurance: number, pdv: number}|null} liens.porte
 * @param {number} liens.part Part des degats courante.
 * @param {(part: number) => void} liens.onPart
 */
export function renderMelange(racine, { paliers, porte, part, onPart }) {
  const lignes = lignesSurvie(paliers ?? [], porte, AXE_ENDURANCE);
  const signature = signatureDe(lignes);

  if (!monte || monte.racine !== racine || monte.signature !== signature) {
    monte = construire(racine, lignes, signature, onPart);
  }
  monte.majPart(part, lignes);
}

/** Monte le bloc une fois, et rend de quoi le mettre a jour. */
function construire(racine, lignes, signature, onPart) {
  const curseur = el('input', {
    type: 'range', class: 'melange-curseur',
    min: '0', max: String(CRANS), value: '50',
    'aria-label': 'Part des degats',
    onInput: (ev) => onPart(Number(ev.target.value) / CRANS),
  });

  // Sans recherche, il n'y a pas de courbe : le curseur reste utile, mais il
  // ne peut rien promettre. Mieux vaut le dire que montrer un cadre vide.
  if (lignes.length === 0) {
    racine.replaceChildren(curseur,
      el('div', { class: 'melange-bornes' },
        el('span', { text: 'encaisser' }), el('span', { text: 'frapper' })),
      el('p', { class: 'aide',
        text: 'Lancez une recherche : la courbe montrera ce que chaque reglage '
          + 'vous coute et vous rapporte.' }));

    return {
      racine, signature,
      majPart: (part) => { curseur.value = String(Math.round((part ?? 0.5) * CRANS)); },
    };
  }

  const consequence = el('div', { class: 'consequence' });
  const toile = el('canvas', { class: 'melange-courbe', height: '120' });

  racine.replaceChildren(consequence, curseur,
    el('div', { class: 'melange-bornes' },
      el('span', { text: 'encaisser' }), el('span', { text: 'frapper' })),
    toile,
    el('p', { class: 'aide',
      text: 'Chaque point est le meilleur stuff a ce niveau d\'encaisse. '
        + 'Cliquez-en un pour y regler le curseur.' }));

  let traces = [];

  /** Point sous la souris, ou null. Il n'existe que le temps du survol. */
  let survole = null;

  /** Rang du point le plus proche du curseur, dans le repere de la toile. */
  const sous = (ev) => {
    const cadre = toile.getBoundingClientRect();
    return pointLePlusProche(traces, ev.clientX - cadre.left, ev.clientY - cadre.top);
  };

  /*
   * Le survol n'est pas une decoration.
   *
   * La courbe se cliquait deja, mais rien ne le disait : la souris passait
   * sur un point sans qu'il bouge, et le trace passait pour une image. Le
   * point grossit sous le curseur et la consequence suit — c'est la seule
   * chose qui apprend qu'on peut le prendre.
   */
  toile.addEventListener('mousemove', (ev) => {
    const point = sous(ev);
    const rang = point ? point.rang : null;
    if (rang === survole) return;
    survole = rang;
    toile.style.cursor = rang === null ? 'default' : 'pointer';
    redessiner();
  });

  toile.addEventListener('mouseleave', () => {
    if (survole === null) return;
    survole = null;
    redessiner();
  });

  toile.addEventListener('click', (ev) => {
    const point = sous(ev);
    if (!point) return;
    const nouvelle = partPourPalier(lignes, point.rang);
    if (nouvelle !== null) onPart(nouvelle);
  });

  /** Dernier etat montre, pour pouvoir redessiner au seul survol. */
  let vue = { courantes: lignes, retenu: null };

  /** Ce que montre la consequence : le point survole prime sur le retenu. */
  function majConsequence() {
    const rang = survole ?? vue.retenu;
    const quoi = consequenceDe(vue.courantes, rang);
    consequence.classList.toggle('survolee', survole !== null);
    consequence.replaceChildren(...(quoi ? [
      el('span', {}, el('b', { class: 'n', text: nombre(quoi.degats) }),
        el('em', { text: 'degats' })),
      el('span', {}, el('b', { class: 'n', text: nombre(quoi.endurance) }),
        el('em', { text: 'pdv effectifs' })),
    ] : []));
  }

  /**
   * Redessine le trace.
   *
   * Le canvas n'a sa taille qu'une fois pose dans la page : dessiner avant
   * donnerait un trace de zero pixel de large.
   */
  function redessiner() {
    majConsequence();
    requestAnimationFrame(() => {
      traces = dessinerCourbe(toile, {
        lignes: vue.courantes, axe: AXE_ENDURANCE, retenu: vue.retenu, survole,
        libelles: { x: 'pdv effectifs', y: 'degats' },
      });
    });
  }

  /** Met a jour ce qui depend du curseur, sans toucher au curseur lui-meme. */
  function majPart(part, courantes = lignes) {
    curseur.value = String(Math.round((part ?? 0.5) * CRANS));
    vue = { courantes, retenu: palierRetenu(courantes, part) };
    redessiner();
  }

  return { racine, signature, majPart };
}
