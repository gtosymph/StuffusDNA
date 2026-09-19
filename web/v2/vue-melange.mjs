/**
 * Le reglage du mode « les deux », dans le volet de gauche.
 *
 * Le curseur et la courbe se touchent, parce qu'ils sont deux vues du meme
 * reglage. On tire le curseur, le marqueur glisse sur la courbe ; on clique la
 * courbe, le curseur suit. Separes, ni l'un ni l'autre ne se comprend.
 *
 * Le curseur montre son pourcentage sous les deux bornes. Il ne se decide
 * pas — ce qui se decide, c'est « 1 200 degats contre 4 200 pdv effectifs » —
 * mais sans lui le point retenu tombe du ciel : deux reglages voisins peuvent
 * retenir le meme stuff, et rien ne disait ou on se trouvait entre les deux.
 * Le chiffre explique la place du marqueur, pas l'inverse.
 *
 * LE CURSEUR VA DANS LE MEME SENS QUE LA COURBE. L'axe horizontal du trace
 * porte les pdv effectifs, qui montent vers la droite. Un curseur dont la
 * droite voulait dire « frapper » faisait donc glisser le marqueur vers la
 * GAUCHE quand on le poussait a droite : les deux vues du meme reglage se
 * contredisaient a chaque geste. Ici la droite veut dire « encaisser », comme
 * sur la courbe, et le marqueur suit le pouce.
 *
 * Le bloc ne se reconstruit QUE si la courbe a change. Tirer le curseur pose
 * un nouvel etat, donc redessine l'application entiere : reconstruire le
 * curseur a ce moment-la l'arracherait des doigts du joueur au premier pixel.
 */
import { el } from '../render.mjs';
import { lignesSurvie, palierRetenu } from '../survie-panel.mjs';
import { dessinerCourbe, pointLePlusProche } from '../courbe-survie.mjs';
import { AXE_ENDURANCE } from '../../src/solver/survie.mjs';
import {
  bornesEnPourcent, choixAuClic, consequenceDe, rangDuPalier, signatureCourbe,
} from './melange.mjs';

const nombre = (n) => Math.round(n).toLocaleString('fr-FR');

/** Pas du curseur : cent crans suffisent, et chacun se voit sur la courbe. */
const CRANS = 100;

/** Ce qui est monte dans la page, pour ne pas le refaire sans raison. */
let monte = null;

/**
 * Dessine le reglage du melange.
 *
 * @param {HTMLElement} racine
 * @param {object} liens
 * @param {any[]} liens.paliers Paliers rendus par la derniere recherche.
 * @param {{damage: number, endurance: number, pdv: number}|null} liens.porte
 * @param {number} liens.part Part des degats courante.
 * @param {(part: number) => void} liens.onPart
 * @param {(palier: any, part: number) => void} liens.onChoisir Pose le stuff
 *   d'un point de la courbe, et le reglage qui le designe.
 */
export function renderMelange(racine, { paliers, porte, part, onPart, onChoisir }) {
  const lignes = lignesSurvie(paliers ?? [], porte, AXE_ENDURANCE);
  const signature = signatureCourbe(lignes);

  if (!monte || monte.racine !== racine || monte.signature !== signature) {
    monte = construire(racine, lignes, signature, onPart, onChoisir);
  }
  monte.majPart(part, lignes);
}

/** Monte le bloc une fois, et rend de quoi le mettre a jour. */
function construire(racine, lignes, signature, onPart, onChoisir) {
  /**
   * Le palier pose au dernier clic, ou null.
   *
   * Il prime sur le palier que le curseur retient, et c'est necessaire : tous
   * les points de la courbe ne se laissent pas retenir. Un palier creuse —
   * sous la corde tendue entre ses voisins — ne gagne pour AUCUN reglage.
   * Cliquer un tel point posait bien son stuff, mais le reglage tombait a la
   * moitie faute de mieux, et la moitie designe un tout autre stuff : le
   * point clique virait au cyan, un point sans rapport virait a l'ambre, et
   * la bande annoncait les chiffres de ce dernier pendant que le message
   * annoncait ceux du premier.
   *
   * On garde donc le PALIER, pas son rang : poser un stuff recalcule la
   * courbe et fait glisser les rangs.
   */
  let choisi = null;

  // Le cran lu est une part d'ENCAISSE : la part des degats est son
  // complement. Tout le reste de l'application raisonne en part de degats,
  // la conversion tient donc en un seul endroit, ici.
  const curseur = el('input', {
    type: 'range', class: 'melange-curseur',
    min: '0', max: String(CRANS), value: '50',
    'aria-label': 'Équilibre entre frapper et encaisser',
    onInput: (ev) => {
      // Regler, c'est reprendre la main : le point pose au clic precedent
      // cesse d'etre celui qu'on montre.
      choisi = null;
      onPart(1 - (Number(ev.target.value) / CRANS));
    },
  });

  // Sans recherche, il n'y a pas de courbe : le curseur reste utile, mais il
  // ne peut rien promettre. Mieux vaut le dire que montrer un cadre vide.
  const bornes = el('div', { class: 'melange-bornes' },
    el('span', {}, el('b', { class: 'n' }), ' frapper'),
    el('span', {}, 'encaisser ', el('b', { class: 'n' })));

  /** Ecrit les deux pourcentages sous le curseur, dans le sens du trace. */
  const majBornes = (part) => {
    const { frapper, encaisser } = bornesEnPourcent(part);
    const [gauche, droite] = bornes.querySelectorAll('b');
    gauche.textContent = `${frapper} %`;
    droite.textContent = `${encaisser} %`;
  };

  if (lignes.length === 0) {
    racine.replaceChildren(curseur, bornes,
      el('p', { class: 'aide',
        text: 'Lancez une recherche : la courbe montrera ce que chaque réglage '
          + 'vous coûte et vous rapporte.' }));

    return {
      racine, signature,
      majPart: (part) => {
        curseur.value = String(CRANS - Math.round((part ?? 0.5) * CRANS));
        majBornes(part);
      },
    };
  }

  const consequence = el('div', { class: 'consequence' });
  const toile = el('canvas', { class: 'melange-courbe', height: '120' });

  racine.replaceChildren(consequence, curseur, bornes, toile,
    el('p', { class: 'aide',
      text: 'Chaque point est le meilleur stuff à ce niveau d\'encaisse. '
        + 'Cliquez-en un pour le porter.' }));

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

  /*
   * Un clic pose le stuff, il ne bouge pas seulement le curseur.
   *
   * La courbe montre des stuffs : chaque point EST un stuff entier, avec ses
   * pieces et sa repartition de points. Deplacer le seul curseur laissait le
   * joueur devant le meme personnage qu'avant son clic, sans rien qui dise ou
   * etait passe le stuff qu'il venait de designer.
   *
   * Le reglage suit dans le meme geste : sans lui, la prochaine recherche
   * viserait encore l'ancien compromis et reprendrait le stuff choisi.
   */
  toile.addEventListener('click', (ev) => {
    const point = sous(ev);
    if (!point) return;
    const choix = choixAuClic(vue.courantes, point.rang);
    if (!choix) return;

    if (onChoisir && choix.palier) {
      choisi = choix.palier;
      // La part part telle quelle, nulle comprise : inventer un reglage pour
      // un palier qu'aucun reglage ne retient revient a designer un autre
      // stuff que celui qu'on vient de poser.
      onChoisir(choix.palier, choix.part);
      return;
    }
    if (choix.part !== null) { choisi = null; onPart(choix.part); }
  });

  /** Dernier etat montre, pour pouvoir redessiner au seul survol. */
  let vue = { courantes: lignes, retenu: null };

  /**
   * Le point que la courbe marque et que la bande annonce.
   *
   * Trois reponses possibles, dans cet ordre : ce que le pointeur designe,
   * ce que le dernier clic a pose, ce que le curseur retient. Le clic passe
   * devant le curseur parce qu'il est plus recent et plus precis — et parce
   * qu'un palier creuse n'a pas de reglage qui le retienne.
   */
  const rangMontre = () => survole ?? rangDuPalier(vue.courantes, choisi) ?? vue.retenu;

  /** Ce que montre la consequence : le point survole prime sur le retenu. */
  function majConsequence() {
    const rang = rangMontre();
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
        lignes: vue.courantes, axe: AXE_ENDURANCE, retenu: rangMontre(), survole,
        libelles: { x: 'pdv effectifs', y: 'degats' },
      });
    });
  }

  /** Met a jour ce qui depend du curseur, sans toucher au curseur lui-meme. */
  function majPart(part, courantes = lignes) {
    curseur.value = String(CRANS - Math.round((part ?? 0.5) * CRANS));
    majBornes(part);
    vue = { courantes, retenu: palierRetenu(courantes, part) };
    redessiner();
  }

  return { racine, signature, majPart };
}
