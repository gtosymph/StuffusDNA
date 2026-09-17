/**
 * Les pictogrammes de la barre du haut.
 *
 * Ils sont dessines ici, pas pris dans une police. Un caractere comme « ⚙ »
 * sort a la taille du texte, avec le dessin que le systeme veut bien lui
 * donner : sur une machine il a des dents, sur une autre c'est un soleil.
 * Un trace vectoriel a la meme forme partout et suit la couleur du bouton.
 *
 * Chaque dessin tient dans un carre de vingt-quatre. Les contours se peignent
 * a la couleur courante ; les formes pleines aussi. Aucun ne porte de
 * couleur en dur : un habillage clair les rend sombres sans rien changer ici.
 */

const NS = 'http://www.w3.org/2000/svg';

/**
 * Traces des pictogrammes.
 *
 * `plein` dit si la forme se remplit — un triangle de lecture, un carre
 * d'arret — ou si elle se dessine au trait.
 */
const DESSINS = Object.freeze({
  /** Lecture : le triangle du depart. */
  play: { plein: true, d: 'M8 5.6v12.8L19 12z' },

  /** Pause : deux barres. */
  pause: { plein: true, d: 'M7.5 5.5h3.4v13H7.5zM13.1 5.5h3.4v13h-3.4z' },

  /** Arret : le carre plein, aux coins a peine adoucis. */
  stop: { plein: true, d: 'M6.8 6.8h10.4v10.4H6.8z' },

  /** Corbeille : couvercle, cuve, deux stries. */
  poubelle: {
    plein: false,
    d: 'M4.8 6.6h14.4M9.6 6.6V4.9h4.8v1.7M6.6 6.6l.9 12.2a1.2 1.2 0 0 0 1.2 1.1h6.6a1.2 1.2 0 0 0 1.2-1.1l.9-12.2M10.2 10v6.4M13.8 10v6.4',
  },

  /** Retour en arriere : la fleche qui revient sur ses pas. */
  annuler: { plein: false, d: 'M4.4 9.6h9.2a5.2 5.2 0 0 1 0 10.4H8.8M4.4 9.6l4-4M4.4 9.6l4 4' },

  /**
   * Partage : trois points relies.
   *
   * Le dessin habituel de ce geste. Un maillon de chaine dirait « lien » et
   * non « donner a quelqu'un », et l'ecran propose les deux : le lien de la
   * page, et l'envoi vers Dofusbook.
   */
  partage: {
    plein: false,
    d: 'M17.5 2.9a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z'
      + 'M6.5 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z'
      + 'M17.5 15.9a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z'
      + 'M8.8 10.8l6.4-3.7M8.8 13.2l6.4 3.7',
  },

  /**
   * Boussole : le cercle, et l'aiguille qui montre une direction.
   *
   * Un point d'interrogation dirait « aide », c'est-a-dire un texte a lire.
   * La visite ne se lit pas : elle emmene d'une commande a la suivante, et
   * c'est cela que l'aiguille annonce.
   */
  boussole: {
    plein: false,
    d: 'M12 2.8a9.2 9.2 0 1 0 0 18.4 9.2 9.2 0 0 0 0-18.4Z'
      + 'M15.6 8.4l-2 5.2-5.2 2 2-5.2 5.2-2Z',
  },

  /**
   * Engrenage : le moyeu, et huit dents posees en couronne.
   *
   * Les dents sont ecrites une a une plutot que calculees : un trace fige se
   * lit et se corrige, alors qu'une boucle qui fabrique du chemin oblige a
   * l'executer de tete pour savoir a quoi elle ressemble.
   */
  engrenage: {
    plein: false,
    d: 'M12 8.9A3.1 3.1 0 1 0 12 15.1 3.1 3.1 0 0 0 12 8.9Z'
      + 'M12 2.6l1.1 2.2a7.6 7.6 0 0 1 1.9.8l2.3-.8 1.9 1.9-.8 2.3a7.6 7.6 0 0 1 .8 1.9l2.2 1.1-2.2 1.1a7.6 7.6 0 0 1-.8 1.9l.8 2.3-1.9 1.9-2.3-.8a7.6 7.6 0 0 1-1.9.8L12 21.4l-1.1-2.2a7.6 7.6 0 0 1-1.9-.8l-2.3.8-1.9-1.9.8-2.3a7.6 7.6 0 0 1-.8-1.9L2.6 12l2.2-1.1a7.6 7.6 0 0 1 .8-1.9l-.8-2.3 1.9-1.9 2.3.8a7.6 7.6 0 0 1 1.9-.8Z',
  },
});

/**
 * Rend un pictogramme.
 *
 * @param {keyof typeof DESSINS} nom
 * @returns {SVGElement|null} Null quand le nom est inconnu : un bouton sans
 *   image vaut mieux qu'un bouton casse.
 */
export function icone(nom) {
  const dessin = DESSINS[nom];
  if (!dessin) return null;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `pictogramme ${dessin.plein ? 'plein' : 'trait'}`);

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', dessin.d);
  svg.append(path);
  return svg;
}

/** Noms disponibles, pour les tests et pour savoir ce qui existe. */
export const PICTOGRAMMES = Object.freeze(Object.keys(DESSINS));

/** Vrai quand ce nom porte une forme pleine plutot qu'un trace au trait. */
export const estPlein = (nom) => DESSINS[nom]?.plein === true;
