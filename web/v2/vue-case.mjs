/**
 * « Laquelle je remplace ? »
 *
 * Une amulette a une case : la poser ne pose aucune question. Un anneau en a
 * deux, un dofus ou un trophee en a six. Quand elles sont toutes prises,
 * l'outil ecrasait TOUJOURS la derniere — le joueur voyait un dofus
 * disparaitre et ne savait meme pas lequel.
 *
 * Cette feuille ne s'ouvre que dans ce cas precis : famille a plusieurs
 * cases, toutes occupees, et la piece n'est pas deja portee. Tant qu'une case
 * est libre, la piece s'y pose sans rien demander — une question dont la
 * reponse est evidente est une gene, pas un service.
 */
import { el } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { casesDeLaFamille } from '../equipement.mjs';

let racine = null;
let libererFocus = null;

/** Ferme la feuille. */
export function fermerCase() {
  if (!racine) return;
  racine.remove();
  racine = null;
  libererFocus?.();
  libererFocus = null;
}

/** Vrai quand la feuille est ouverte. */
export const caseOuverte = () => racine !== null;

/**
 * Demande quelle case remplacer.
 *
 * @param {object} liens
 * @param {any} liens.etat
 * @param {any} liens.item Piece a poser.
 * @param {(cle: string) => void} liens.onChoisir
 */
export function ouvrirCase({ etat, item, onChoisir }) {
  fermerCase();

  const cases = casesDeLaFamille(etat, item);
  const nom = (piece) => piece?.fr ?? piece?.name ?? 'case vide';

  const choix = cases.map(({ cle, porte }, rang) => el('button', {
    class: 'case-choix', type: 'button',
    onClick: () => { onChoisir(cle); fermerCase(); },
  },
    el('span', { class: 'case-rang n', text: String(rang + 1) }),
    porte?.img ? el('img', { src: porte.img, alt: '', decoding: 'async' }) : null,
    el('span', { class: 'case-nom', text: nom(porte) }),
    el('span', { class: 'case-geste', text: porte ? 'Remplacer' : 'Poser ici' })));

  racine = el('div', { class: 'feuille-fond', onClick: (ev) => {
    if (ev.target === racine) fermerCase();
  } },
    el('div', { class: 'feuille', role: 'dialog', 'aria-modal': 'true',
      'aria-label': 'Quelle piece remplacer' },
      el('div', { class: 'feuille-tete' },
        el('h2', { text: 'Quelle piece remplacer ?' }),
        el('div', { class: 'pousse' }),
        el('button', { class: 'btn fantome', type: 'button', text: 'Annuler',
          onClick: fermerCase })),
      el('div', { class: 'feuille-corps' },
        el('p', { class: 'aide',
          text: `Toutes les cases de cette famille sont prises. « ${nom(item)} » `
            + 'prendra la place de celle que vous designez.' }),
        el('div', { class: 'cases-choix' }, choix))));

  document.body.append(racine);
  libererFocus = piegerFocus(racine);
  racine.querySelector('.case-choix')?.focus();
}
