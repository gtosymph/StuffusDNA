/**
 * Edition des lignes de degats d'un sort.
 *
 * Un sort porte une ou plusieurs lignes : le Pendule frappe deux fois, une
 * arme empoisonnee ajoute une ligne d'un autre element. Le catalogue ne
 * couvre pas tous les cas de jeu (etats, dommages ajoutes par un allie,
 * sort maison) : ces fonctions laissent le joueur composer ses propres
 * lignes, dans le meme element ou dans un autre.
 *
 * Toutes rendent un nouveau sort : le sort d'origine ne change jamais.
 */

/** Elements acceptes sur une ligne de degats. */
export const ELEMENTS = Object.freeze(['neutre', 'terre', 'feu', 'eau', 'air']);

/** Champs numeriques d'une ligne. */
const CHAMPS_NOMBRE = Object.freeze(['min', 'max', 'critMin', 'critMax']);

/** Ligne servant de depart quand le sort n'en porte aucune. */
export const LIGNE_VIDE = Object.freeze({
  element: 'neutre', min: 0, max: 0, critMin: 0, critMax: 0, source: 'sort', range: null,
});

/**
 * Ramene une ligne a sa forme complete.
 *
 * Les plages critiques absentes reprennent la plage normale, comme dans le
 * moteur de calcul. Les valeurs restent des entiers positifs.
 *
 * @param {object} ligne
 * @returns {object} Nouvelle ligne.
 */
export function normaliserLigne(ligne) {
  const source = ligne ?? {};
  const min = entierPositif(source.min);
  const max = entierPositif(source.max);

  return {
    ...source,
    element: ELEMENTS.includes(source.element) ? source.element : LIGNE_VIDE.element,
    min,
    max,
    critMin: entierPositif(source.critMin ?? min),
    critMax: entierPositif(source.critMax ?? max),
    source: source.source ?? 'sort',
    range: source.range ?? null,
  };
}

/**
 * Ajoute une ligne de degats a la fin du sort.
 *
 * La nouvelle ligne reprend la derniere, que le joueur n'a plus qu'a
 * corriger. Elle ne herite pas du delai : une ligne ajoutee frappe le tour
 * meme, sinon elle disparaitrait de l'affichage sans explication.
 *
 * @param {object} sort
 * @returns {object} Nouveau sort.
 */
export function ajouterLigne(sort) {
  const lignes = sort?.lines ?? [];
  const modele = lignes.length > 0 ? lignes[lignes.length - 1] : LIGNE_VIDE;
  const { differe, ...sansDelai } = normaliserLigne(modele);

  return { ...sort, lines: [...lignes, sansDelai] };
}

/**
 * Enleve une ligne de degats.
 *
 * Un sort garde toujours au moins une ligne : sans ligne il ne se calcule
 * plus, et le joueur n'aurait aucun moyen d'en remettre une.
 *
 * @param {object} sort
 * @param {number} rang
 * @returns {object} Nouveau sort.
 */
export function enleverLigne(sort, rang) {
  const lignes = sort?.lines ?? [];
  if (lignes.length <= 1 || rang < 0 || rang >= lignes.length) return { ...sort };

  return { ...sort, lines: lignes.filter((_, i) => i !== rang) };
}

/**
 * Change un champ d'une ligne de degats.
 *
 * Une valeur refusee laisse la ligne intacte : l'interface n'affiche jamais
 * un element inconnu ni des degats negatifs.
 *
 * @param {object} sort
 * @param {number} rang
 * @param {string} champ
 * @param {string|number} valeur
 * @returns {object} Nouveau sort.
 */
export function modifierLigne(sort, rang, champ, valeur) {
  const lignes = sort?.lines ?? [];
  if (rang < 0 || rang >= lignes.length) return { ...sort };

  const corrigee = corriger(lignes[rang], champ, valeur);
  if (!corrigee) return { ...sort };

  return { ...sort, lines: lignes.map((ligne, i) => (i === rang ? corrigee : ligne)) };
}

/**
 * Applique un champ a une ligne, ou rend null si la valeur ne convient pas.
 * @param {object} ligne
 * @param {string} champ
 * @param {string|number} valeur
 * @returns {object|null}
 */
function corriger(ligne, champ, valeur) {
  if (champ === 'element') {
    if (!ELEMENTS.includes(valeur)) return null;
    return { ...ligne, element: valeur };
  }

  if (CHAMPS_NOMBRE.includes(champ)) {
    return { ...ligne, [champ]: entierPositif(valeur) };
  }

  return null;
}

/**
 * Entier positif le plus proche, zero si la valeur n'est pas un nombre.
 * @param {any} valeur
 * @returns {number}
 */
function entierPositif(valeur) {
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return 0;
  return Math.max(0, Math.floor(nombre));
}
