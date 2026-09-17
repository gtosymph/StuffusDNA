/**
 * La visite guidee a l'ecran : une lucarne, une bulle, deux fleches.
 *
 * La lucarne n'est pas un trou decoupe dans un voile : c'est un cadre vide
 * dont l'ombre portee fait dix mille pixels. Le voile est donc l'ombre de la
 * lucarne, et il suit la commande montree sans qu'aucun calcul ne decoupe
 * quoi que ce soit. Un habillage clair l'eclaircit tout seul, puisque la
 * couleur vient de la meme variable que les feuilles.
 *
 * Le voile ne laisse pas passer les clics : pendant la visite, l'ecran se
 * lit, il ne se manipule pas. Montrer une commande ET laisser appuyer dessus
 * ferait bouger la page sous la bulle qui la decrit.
 */
import { el } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { avancer, etapesVisibles, visiteFaite } from './visite.mjs';

/** Marge autour de la commande montree, en pixels. */
const MARGE = 6;

/** Place qu'il faut sous la commande pour poser la bulle dessous. */
const PLACE_BULLE = 190;

let racine = null;
let libererFocus = null;
let suivre = null;

/** Vrai quand la visite est en cours. */
export const visiteOuverte = () => racine !== null;

/** Ferme la visite, et note qu'elle a ete vue. */
export function fermerVisite() {
  if (!racine) return;
  // La visite se DEFAIT au lieu de se cacher : chaque ouverture reconstruit
  // ses etapes selon l'ecran du moment, et un vieux fond garde dans la page
  // reprendrait les clics sous celui qui vient de s'ouvrir.
  racine.remove();
  racine = null;
  if (suivre) {
    window.removeEventListener('resize', suivre);
    window.removeEventListener('scroll', suivre, true);
    suivre = null;
  }
  libererFocus?.();
  libererFocus = null;
  visiteFaite();
}

/**
 * Ouvre le volet de gauche quand la commande visee s'y cache.
 *
 * Sur telephone les deux volets sont replies derriere une case a cocher. Une
 * etape qui vise « Regler mes minimums » montrerait alors une lucarne sur du
 * vide. La case se coche donc avant de mesurer.
 *
 * @param {Element} cible
 */
function ouvrirLeVolet(cible) {
  const volet = cible.closest('.volet-gauche, .volet-droit');
  if (!volet) return;
  const tiroir = document.getElementById(
    volet.classList.contains('volet-gauche') ? 'tiroir-gauche' : 'tiroir-droit');
  // La case n'existe a l'ecran que sur telephone : ailleurs, la cocher ne
  // ferait que replier un volet deja ouvert.
  if (tiroir instanceof HTMLInputElement && tiroir.offsetParent !== null) tiroir.checked = true;
}

/**
 * Ouvre la visite guidee.
 *
 * @param {object} [liens]
 * @param {(texte: string) => void} [liens.message]
 */
export function ouvrirVisite({ message } = {}) {
  const etapes = etapesVisibles((cible) => {
    const noeud = document.querySelector(cible);
    return noeud instanceof HTMLElement && noeud.closest('[hidden]') === null;
  });

  if (etapes.length === 0) {
    message?.('La visite n\'a rien a montrer sur cet ecran.');
    return;
  }

  const lucarne = el('div', { class: 'visite-lucarne' });
  const titre = el('h2', { class: 'visite-titre' });
  const texte = el('p', { class: 'visite-texte' });
  const compte = el('span', { class: 'visite-compte n' });
  const precedent = el('button', { class: 'btn fantome', type: 'button', text: 'Precedent',
    onClick: () => aller(-1) });
  const suivant = el('button', { class: 'btn premier', type: 'button', text: 'Suivant',
    onClick: () => aller(1) });

  const bulle = el('div', { class: 'visite-bulle', role: 'dialog', 'aria-modal': 'true',
    'aria-label': 'Visite guidee' },
    titre, texte,
    el('div', { class: 'visite-pied' },
      compte,
      el('div', { class: 'pousse' }),
      el('button', { class: 'btn fantome', type: 'button', text: 'Quitter',
        onClick: fermerVisite }),
      precedent, suivant));

  racine = el('div', { class: 'visite-fond' }, lucarne, bulle);
  document.body.append(racine);

  let index = 0;

  /** Pose la lucarne et la bulle sur l'etape courante. */
  function poser() {
    const etape = etapes[index];
    const cible = document.querySelector(etape.cible);

    titre.textContent = etape.titre;
    texte.textContent = etape.texte;
    compte.textContent = `${index + 1} / ${etapes.length}`;
    precedent.disabled = index === 0;
    suivant.textContent = index === etapes.length - 1 ? 'Terminer' : 'Suivant';

    if (!(cible instanceof HTMLElement)) return placerAuMilieu();
    ouvrirLeVolet(cible);
    cible.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const cadre = cible.getBoundingClientRect();
    // Une commande repliee ou hors flux ne mesure rien : la bulle se pose
    // alors au milieu, sans lucarne, plutot que sur un point de l'angle.
    if (cadre.width === 0 || cadre.height === 0) return placerAuMilieu();

    lucarne.hidden = false;
    lucarne.style.left = `${cadre.left - MARGE}px`;
    lucarne.style.top = `${cadre.top - MARGE}px`;
    lucarne.style.width = `${cadre.width + MARGE * 2}px`;
    lucarne.style.height = `${cadre.height + MARGE * 2}px`;

    // Dessous par defaut, dessus quand le bas de l'ecran ne suffit plus.
    const dessous = window.innerHeight - cadre.bottom > PLACE_BULLE;
    bulle.style.top = dessous ? `${cadre.bottom + MARGE * 2}px` : '';
    bulle.style.bottom = dessous ? '' : `${window.innerHeight - cadre.top + MARGE * 2}px`;

    const largeur = bulle.offsetWidth || 320;
    const gauche = Math.min(
      Math.max(12, cadre.left + cadre.width / 2 - largeur / 2),
      window.innerWidth - largeur - 12);
    bulle.style.left = `${gauche}px`;
    bulle.style.transform = '';
    return undefined;
  }

  /** Bulle au centre, sans lucarne : la commande ne se montre pas. */
  function placerAuMilieu() {
    lucarne.hidden = true;
    bulle.style.top = '50%';
    bulle.style.bottom = '';
    bulle.style.left = '50%';
    bulle.style.transform = 'translate(-50%, -50%)';
    return undefined;
  }

  /** Va d'un pas, ou termine quand le dernier pas est demande. */
  function aller(pas) {
    if (pas > 0 && index === etapes.length - 1) return fermerVisite();
    index = avancer(index, pas, etapes.length);
    return poser();
  }

  racine.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); aller(1); }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); aller(-1); }
  });

  // La page bouge sous la lucarne des qu'on defile ou qu'on redimensionne :
  // sans cela, le cadre reste ou la commande n'est plus.
  suivre = () => poser();
  window.addEventListener('resize', suivre);
  window.addEventListener('scroll', suivre, true);

  poser();
  libererFocus = piegerFocus(racine);
  suivant.focus();
}
