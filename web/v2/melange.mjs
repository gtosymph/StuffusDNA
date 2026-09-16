/**
 * Le curseur du mode mixte, et la courbe sous lui.
 *
 * Les deux sont la MEME chose vue deux fois : le curseur regle la part des
 * degats, la courbe montre ou cette part vous mene. Separes, aucun des deux ne
 * se comprend — c'est le defaut de l'ancien ecran, ou deux metres les
 * separaient.
 *
 * `palierRetenu` sait deja aller du curseur vers la courbe. Ce module fait le
 * chemin inverse : cliquer un point de la courbe doit poser la part qui le
 * choisit, sans quoi la courbe ne sert qu'a regarder.
 *
 * Le calcul n'est pas un balayage. Le score mixte vaut e * (d/e)^p ; son
 * logarithme, ln e + p (ln d - ln e), est une DROITE en p. Chaque palier est
 * donc une droite, et celui que le curseur retient est celui qui passe au
 * dessus des autres : chaque palier gagne sur un intervalle, borne par ses
 * intersections avec les autres droites. On rend le milieu de cet intervalle,
 * le point le plus loin des deux bascules voisines.
 */

/** Part des degats admise, bornes comprises. */
const MIN = 0;
const MAX = 1;

/**
 * Un palier utilisable : les deux mesures strictement positives.
 *
 * Le score mixte vaut zero des qu'une mesure s'annule — un build qui ne frappe
 * pas ne vaut rien, quelle que soit sa resistance. Ces paliers ne gagnent
 * jamais, et leur logarithme n'existe pas.
 */
const utilisable = (p) => Number(p?.damage) > 0 && Number(p?.endurance) > 0;

/**
 * Part des degats qui fait gagner un palier donne.
 *
 * @param {{palier: {damage: number, endurance: number}}[]} lignes
 * @param {number} rang Rang de la ligne visee.
 * @returns {number|null} Part dans [0, 1], ou null si ce palier ne gagne jamais.
 */
export function partPourPalier(lignes, rang) {
  const cible = lignes?.[rang]?.palier;
  if (!utilisable(cible)) return null;

  // Chaque palier devient la droite p -> ordonnee + pente * p.
  const droite = (p) => ({
    ordonnee: Math.log(p.endurance),
    pente: Math.log(p.damage) - Math.log(p.endurance),
  });

  const moi = droite(cible);
  let bas = MIN;
  let haut = MAX;

  for (let i = 0; i < lignes.length; i += 1) {
    if (i === rang) continue;
    const autre = lignes[i].palier;
    if (!utilisable(autre)) continue;

    const lui = droite(autre);
    const dOrdonnee = moi.ordonnee - lui.ordonnee;
    const dPente = moi.pente - lui.pente;

    // Deux droites paralleles ne se croisent pas : soit je suis au-dessus
    // partout, soit nulle part.
    if (dPente === 0) {
      if (dOrdonnee <= 0) return null;
      continue;
    }

    const croisement = -dOrdonnee / dPente;
    if (dPente > 0) bas = Math.max(bas, croisement);
    else haut = Math.min(haut, croisement);
  }

  if (!(haut > bas)) return null;

  // Le milieu, pas une borne : sur une borne, le moindre arrondi bascule sur
  // le palier voisin, et le clic semble avoir vise a cote.
  return Math.min(MAX, Math.max(MIN, (bas + haut) / 2));
}

/**
 * Ce que la part courante donne, pour le montrer a cote du curseur.
 *
 * Le curseur ne montre pas son pourcentage : « 62 % de degats » ne se decide
 * pas. Il montre ce que le reglage coute et ce qu'il rapporte, et c'est cela
 * que le joueur arbitre.
 *
 * @param {{palier: {damage: number, endurance: number}}[]} lignes
 * @param {number|null} rang Rang retenu, tel que `palierRetenu` le rend.
 * @returns {{degats: number, endurance: number}|null}
 */
export function consequenceDe(lignes, rang) {
  const palier = lignes?.[rang ?? -1]?.palier;
  if (!palier) return null;
  return {
    degats: Number(palier.damage) || 0,
    endurance: Number(palier.endurance) || 0,
  };
}
