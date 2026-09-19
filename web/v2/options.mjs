/**
 * Ou vit chaque option de calcul.
 *
 * Vingt cases a cocher dans un bloc « Options » posent toutes la meme question
 * au joueur : « dois-je m'en occuper ? ». La reponse n'est pas la meme pour
 * toutes, et le bloc ne la donne jamais.
 *
 * Le critere qui les separe tient en une phrase :
 *
 *   une option qui change ce qu'un nombre VEUT DIRE se lit a cote de ce
 *   nombre ; les autres vivent dans les reglages.
 *
 * « Degats a distance » ne regle pas un detail : elle decide si le 947 affiche
 * parle de votre jeu ou de celui d'un autre. La lire ailleurs que sous le 947,
 * c'est laisser quelqu'un lire un chiffre faux sans savoir pourquoi.
 */

/** Options qui definissent ce que « Degats » veut dire. */
export const PRES_DES_DEGATS = Object.freeze(['arme', 'distance']);

/** Options qui definissent ce que « Pdv effectifs » veut dire. */
export const PRES_DES_PDV = Object.freeze(['menaceCoup', 'menacePlafond', 'menacePosition']);

/**
 * Options qui ne parlent que de l'enchainement des sorts choisis.
 *
 * Elles ne reglent pas le calcul en general : elles disent dans quel ordre,
 * et combien de fois, LES SORTS DE LA LISTE partent. Leur place est donc
 * contre cette liste, pas dans un panneau ou rien ne rappelle qu'il existe
 * des sorts.
 */
export const PRES_DES_SORTS = Object.freeze([
  'combo', 'paReserves', 'comboElements', 'comboUnLancer',
]);

/** Toutes celles qui vivent ailleurs que dans les reglages. */
const AILLEURS = new Set([...PRES_DES_DEGATS, ...PRES_DES_PDV, ...PRES_DES_SORTS]);

/**
 * Range les options affichees selon l'endroit ou elles se lisent.
 *
 * @param {{cle: string}[]} options Sortie de `optionsAffichees`.
 * @returns {{degats: any[], pdv: any[], sorts: any[], reglages: any[]}}
 */
export function rangerOptions(options) {
  const parCle = new Map((options ?? []).map((o) => [o.cle, o]));
  const prendre = (cles) => cles.map((cle) => parCle.get(cle)).filter(Boolean);

  return {
    degats: prendre(PRES_DES_DEGATS),
    pdv: prendre(PRES_DES_PDV),
    sorts: prendre(PRES_DES_SORTS),
    // Tout le reste part dans les reglages, y compris une option ajoutee
    // depuis : une option nouvelle doit se voir quelque part, jamais nulle
    // part.
    reglages: (options ?? []).filter((o) => !AILLEURS.has(o.cle)),
  };
}

/**
 * Ce que le bouton de l'enchainement dit sans qu'on l'ouvre.
 *
 * Un bouton qui porte toujours le meme libelle oblige a l'ouvrir pour savoir
 * ou en est le reglage. Celui-ci dit d'abord ce qui compte — chaque sort une
 * fois, ou le meilleur enchainement — puis les restrictions posees dessus.
 *
 * @param {Record<string, any>} options Valeurs de l'etat.
 * @returns {string}
 */
export function resumeCombo(options) {
  const valeurs = options ?? {};
  if (!valeurs.combo) return 'Chaque sort une fois';

  const restrictions = [];
  const reserves = Math.max(0, Math.trunc(Number(valeurs.paReserves) || 0));
  if (reserves > 0) restrictions.push(`${reserves} PA gardés`);
  const elements = Math.max(0, Math.trunc(Number(valeurs.comboElements) || 0));
  if (elements > 0) restrictions.push(`${elements} éléments au moins`);
  if (valeurs.comboUnLancer) restrictions.push('1 lancer par sort');

  return restrictions.length === 0
    ? 'Meilleur enchaînement'
    : `Meilleur enchaînement · ${restrictions.join(' · ')}`;
}
