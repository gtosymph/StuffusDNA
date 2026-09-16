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

/** Toutes celles qui vivent a cote d'un nombre. */
const PRES_D_UN_NOMBRE = new Set([...PRES_DES_DEGATS, ...PRES_DES_PDV]);

/**
 * Range les options affichees selon l'endroit ou elles se lisent.
 *
 * @param {{cle: string}[]} options Sortie de `optionsAffichees`.
 * @returns {{degats: any[], pdv: any[], reglages: any[]}}
 */
export function rangerOptions(options) {
  const parCle = new Map((options ?? []).map((o) => [o.cle, o]));
  const prendre = (cles) => cles.map((cle) => parCle.get(cle)).filter(Boolean);

  return {
    degats: prendre(PRES_DES_DEGATS),
    pdv: prendre(PRES_DES_PDV),
    // Tout le reste part dans les reglages, y compris une option ajoutee
    // depuis : une option nouvelle doit se voir quelque part, jamais nulle
    // part.
    reglages: (options ?? []).filter((o) => !PRES_D_UN_NOMBRE.has(o.cle)),
  };
}
