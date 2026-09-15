/**
 * Piege de focus pour les fenetres modales.
 *
 * Une fenetre posee par-dessus la page prend le clavier, ou elle ne sert a
 * rien. Sans piege, la tabulation sort derriere la fenetre : le curseur se
 * promene dans une page que l'utilisateur ne voit plus, active des boutons
 * qu'il ne lit pas, et rien ne le ramene sans la souris.
 *
 * Le module ne fait que deux choses : garder le clavier dans la fenetre tant
 * qu'elle est ouverte, et rendre le focus a l'element qui l'avait avant.
 */

/**
 * Elements qui peuvent recevoir le focus au clavier.
 *
 * « tabindex="-1" » est exclu volontairement : il marque justement un element
 * que l'on atteint par programme, jamais par tabulation.
 */
const FOCALISABLES = [
  'a[href]', 'button', 'input', 'select', 'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Element a focaliser apres celui-ci.
 *
 * @param {any[]} elements Elements focalisables, dans l'ordre du document.
 * @param {any} actuel Element qui porte le focus, ou null.
 * @param {boolean} versArriere Vrai pour Maj+Tab.
 * @returns {any|null} Element suivant, ou null quand la fenetre est vide.
 */
export function prochainFocus(elements, actuel, versArriere) {
  if (elements.length === 0) return null;

  const rang = elements.indexOf(actuel);
  // Le focus vient d'ailleurs : la fenetre le reprend par son bord d'entree.
  if (rang === -1) return versArriere ? elements[elements.length - 1] : elements[0];

  const pas = versArriere ? -1 : 1;
  return elements[(rang + pas + elements.length) % elements.length];
}

/**
 * Garde le clavier dans une fenetre, jusqu'a sa fermeture.
 *
 * @param {HTMLElement} fenetre Racine de la fenetre modale.
 * @returns {() => void} Fonction qui libere le clavier et rend le focus.
 */
export function piegerFocus(fenetre) {
  const venait = document.activeElement;

  const surTouche = (ev) => {
    if (ev.key !== 'Tab') return;

    // La liste se relit a chaque frappe : une fenetre peut se remplir apres
    // son ouverture, ou desactiver un bouton en cours de route.
    const elements = [...fenetre.querySelectorAll(FOCALISABLES)]
      .filter((e) => !e.disabled && e.offsetParent !== null);

    const suivant = prochainFocus(elements, document.activeElement, ev.shiftKey);
    if (!suivant) return;

    ev.preventDefault();
    suivant.focus();
  };

  fenetre.addEventListener('keydown', surTouche);

  // Le premier element prend le focus : sans cela, la premiere tabulation
  // partirait du haut de la page, derriere la fenetre.
  const premier = fenetre.querySelector(FOCALISABLES);
  if (premier) premier.focus();

  return () => {
    fenetre.removeEventListener('keydown', surTouche);
    // Le focus revient d'ou il venait : l'utilisateur reprend sa lecture au
    // bouton qui a ouvert la fenetre, pas en haut de la page.
    if (venait && typeof venait.focus === 'function') venait.focus();
  };
}
