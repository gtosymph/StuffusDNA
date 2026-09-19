/**
 * « ••• » : tout ce que le quai du telephone ne porte pas.
 *
 * Le quai garde les quatre gestes d'un tour de recherche. Les autres — vider,
 * signaler, la visite, les reglages, le profil, le cafe — se font une fois par
 * seance, pas une fois par minute : ils n'ont rien a faire sous le pouce en
 * permanence, mais tout a se trouver du premier coup quand on les cherche.
 *
 * Cette feuille ne fabrique AUCUNE commande. Chaque ligne appuie sur le vrai
 * bouton, celui de la barre du haut. Deux boutons pour un meme geste
 * laisseraient deux etats a tenir d'accord — un « Vider » grise ici et vif
 * la-bas — et ce genre d'ecart se voit toujours au pire moment.
 */
import { el } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';

let racine = null;
let libererFocus = null;

/** Ferme la feuille. */
export function fermerPlus() {
  if (!racine) return;
  racine.remove();
  racine = null;
  libererFocus?.();
  libererFocus = null;
}

/** Vrai quand la feuille est ouverte. */
export const plusOuvert = () => racine !== null;

/**
 * Les lignes de la feuille, dans l'ordre ou on les cherche.
 *
 * `cible` nomme le bouton de la barre a actionner. Un bouton absent fait
 * disparaitre sa ligne : mieux vaut une ligne en moins qu'une ligne morte.
 */
const LIGNES = Object.freeze([
  { cible: 'vider', nom: 'Vider le stuff', aide: 'Enleve toutes les pièces portées' },
  { cible: 'partager', nom: 'Partager', aide: 'Un lien, ou l\'envoi vers Dofusbook' },
  { cible: 'signaler', nom: 'Signaler', aide: 'Un défaut, une idée' },
  { cible: 'visite', nom: 'Visite guidée', aide: 'A quoi sert chaque écran' },
  { cible: 'reglages', nom: 'Reglages', aide: 'Calcul, moteur et habillage' },
  { cible: 'kofi', nom: 'Offrir un café', aide: 'Le site est gratuit et sans publicité' },
]);

/**
 * Ouvre la feuille.
 *
 * @param {object} [liens]
 * @param {readonly {cible: string, nom: string, aide: string}[]} [liens.lignes]
 */
export function ouvrirPlus({ lignes = LIGNES } = {}) {
  fermerPlus();

  const choix = lignes.map((ligne) => {
    const bouton = document.getElementById(ligne.cible);
    if (!bouton) return null;
    return el('button', {
      class: 'plus-ligne', type: 'button',
      onClick: () => { fermerPlus(); bouton.click(); },
    },
      el('span', { class: 'plus-nom', text: ligne.nom }),
      el('span', { class: 'plus-aide', text: ligne.aide }));
  }).filter(Boolean);

  racine = el('div', { class: 'feuille-fond', onClick: (ev) => {
    if (ev.target === racine) fermerPlus();
  } },
    el('div', { class: 'feuille', role: 'dialog', 'aria-modal': 'true',
      'aria-label': 'Toutes les commandes' },
      el('div', { class: 'feuille-tete' },
        el('h2', { text: 'Commandes' }),
        el('div', { class: 'pousse' }),
        el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
          onClick: fermerPlus })),
      el('div', { class: 'feuille-corps' }, el('div', { class: 'plus-lignes' }, choix))));

  document.body.append(racine);
  libererFocus = piegerFocus(racine);
  racine.querySelector('.plus-ligne')?.focus();
}
