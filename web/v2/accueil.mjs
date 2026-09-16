/**
 * Ecran vide : la seule question posee avant de montrer quoi que ce soit.
 *
 * L'ancien ecran demandait huit reglages avant de rendre un premier resultat.
 * Celui-ci en demande un, et il est le seul que le joueur connaisse deja sans
 * rien apprendre de l'outil : sa classe.
 *
 * Le choix n'ouvre pas un formulaire de plus. Il pose le niveau 190, garde les
 * caracteristiques comme cible faute de sorts, et lance la recherche. Le
 * joueur voit un stuff avant d'avoir compris un seul mot du vocabulaire.
 */
import { el } from '../render.mjs';
import { CLASSES, emblemeDeClasse } from '../classes.mjs';

/**
 * Remplit la grille des classes.
 *
 * @param {HTMLElement} racine
 * @param {(classe: number) => void} onChoix
 */
export function renderClasses(racine, onChoix) {
  racine.replaceChildren(...CLASSES.map((classe) => el('button', {
    class: 'classe', type: 'button', title: classe.fr,
    onClick: () => onChoix(classe.id),
  },
    // L'embleme, pas le personnage : dix-neuf silhouettes en pied se
    // ressemblent a cette taille, alors qu'un joueur reconnait son embleme
    // d'un coup d'oeil — c'est celui du jeu.
    el('img', { src: emblemeDeClasse(classe.id), alt: '', decoding: 'async', loading: 'lazy' }),
    el('span', { text: classe.fr }))));
}
