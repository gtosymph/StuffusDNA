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

/**
 * Signature d'une courbe : deux courbes sont la meme si elles portent les
 * memes paliers, dans le meme ordre.
 *
 * Elle decide si le bloc du curseur se reconstruit. La question compte : tirer
 * le curseur pose un nouvel etat, donc redessine l'application entiere, et
 * reconstruire le curseur a ce moment-la l'arracherait des doigts du joueur au
 * premier pixel.
 *
 * @param {{palier: {damage: number, endurance: number}}[]} lignes
 * @returns {string}
 */
export const signatureCourbe = (lignes) => (lignes ?? [])
  .map((l) => `${l?.palier?.damage}/${l?.palier?.endurance}`).join('|');

/**
 * Les deux pourcentages ecrits sous le curseur.
 *
 * Ils expliquent la place du marqueur, ils ne la decident pas : ce qui se
 * decide reste « 1 200 degats contre 4 200 pdv effectifs ». Sans eux, deux
 * reglages voisins retiennent le meme stuff et rien ne dit ou l'on se trouve
 * entre les deux.
 *
 * @param {number|null|undefined} part Part des degats, dans [0, 1].
 * @returns {{frapper: number, encaisser: number}} Deux entiers dont la somme
 *   fait toujours cent : deux arrondis separes donneraient 55 et 46.
 */
export function bornesEnPourcent(part) {
  // `Number(null)` vaut zero, et zero est un reglage legitime : sans ce
  // premier tri, une part absente s'afficherait « 0 % frapper », ce qui se
  // lit comme un choix que personne n'a fait.
  const brut = part === null || part === undefined ? Number.NaN : Number(part);
  const sure = Number.isFinite(brut) ? Math.min(MAX, Math.max(MIN, brut)) : 0.5;
  const frapper = Math.round(sure * 100);
  return { frapper, encaisser: 100 - frapper };
}

/**
 * Ce qu'un clic sur un point de la courbe doit poser.
 *
 * La courbe montre des stuffs : chaque point EST un stuff entier, avec ses
 * pieces et sa repartition de points. Deplacer le seul curseur laissait le
 * joueur devant le meme personnage qu'avant son clic, sans rien qui dise ou
 * etait passe le stuff qu'il venait de designer.
 *
 * Deux cas echappent a la regle :
 *
 *   - le stuff PORTE figure dans la courbe. Le reposer ne ferait rien, et il
 *     ne porte pas toujours la liste de ses pieces ;
 *   - un palier sans `itemIds` ne peut pas se poser. Il reste cliquable, mais
 *     seul le curseur bouge.
 *
 * Le reglage suit le stuff dans les deux cas ou il existe : sans lui, la
 * prochaine recherche viserait encore l'ancien compromis et reprendrait le
 * stuff choisi.
 *
 * @param {{palier: any, porte: boolean}[]} lignes
 * @param {number} rang
 * @returns {{part: number|null, palier: any|null}|null} Null quand le rang ne
 *   designe aucune ligne.
 */
export function choixAuClic(lignes, rang) {
  const ligne = (lignes ?? [])[rang];
  if (!ligne) return null;

  const part = partPourPalier(lignes, rang);
  const posable = !ligne.porte && Array.isArray(ligne.palier?.itemIds);
  return { part, palier: posable ? ligne.palier : null };
}
