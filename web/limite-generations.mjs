/**
 * Quand une recherche doit s'arreter d'elle-meme.
 *
 * Le solveur ne converge pas : il ameliore de moins en moins, et il le fait
 * indefiniment. Laisse seul, il tourne toute la nuit sur un ordinateur
 * portable pour gagner trois points de degats — et c'est le joueur qui paie,
 * en ventilateur et en batterie, sans que rien ne le lui dise.
 *
 * Une limite de generations rend ce cout visible et reglable. Elle se compte
 * DEPUIS LE LANCEMENT, pas depuis le debut des temps : une reprise a la
 * generation 40 000 avec une limite de 20 000 s'arrete a 60 000. Compter
 * autrement ferait qu'un deuxieme clic sur « Chercher » ne chercherait rien.
 *
 * Le module ne connait ni le DOM ni le solveur : il ne sait que compter.
 */

/** Limite d'un joueur qui n'a rien regle. Une nuit de calcul en dix minutes. */
export const LIMITE_DEFAUT = 20000;

/** Valeur qui dit « ne t'arrete jamais ». */
export const SANS_LIMITE = 0;

/** Limite la plus basse qu'un reglage accepte : en dessous, rien ne converge. */
export const LIMITE_MIN = 500;

/** Limite la plus haute qu'un reglage accepte. */
export const LIMITE_MAX = 1000000;

/**
 * Rend une limite utilisable a partir de ce que porte un champ.
 *
 * Un champ de nombre rend une chaine, parfois vide, parfois « 12,5 », parfois
 * « -3 ». Aucune de ces trois ne doit arreter une recherche au premier tour ni
 * la laisser courir : le champ vide et le zero veulent dire « sans limite »,
 * tout le reste se ramene dans les bornes.
 *
 * @param {unknown} valeur
 * @returns {number} Nombre entier de generations, ou 0 pour « sans limite ».
 */
export function normaliserLimite(valeur) {
  if (valeur === '' || valeur === null || valeur === undefined) return LIMITE_DEFAUT;
  const nombre = Math.trunc(Number(valeur));
  if (!Number.isFinite(nombre) || nombre <= 0) return SANS_LIMITE;
  return Math.min(LIMITE_MAX, Math.max(LIMITE_MIN, nombre));
}

/**
 * Vrai quand la recherche en cours a fait son compte.
 *
 * @param {number} faites Generations passees DEPUIS le lancement.
 * @param {number} limite Sortie de `normaliserLimite`.
 * @returns {boolean}
 */
export function limiteAtteinte(faites, limite) {
  if (!Number.isFinite(limite) || limite <= 0) return false;
  return Number(faites) >= limite;
}

const nombreLisible = (n) => n.toLocaleString('fr-FR');

/**
 * Ce que l'outil dit quand il s'arrete tout seul.
 *
 * Un arret sans explication se lit comme une panne. La phrase nomme la
 * limite, et rappelle que rien n'est perdu : la recherche reprend ou elle en
 * est.
 *
 * @param {number} limite
 * @returns {string}
 */
export function phraseArretAuto(limite) {
  return `Arrêt automatique après ${nombreLisible(limite)} générations. `
    + 'Le meilleur stuff trouve est garde : « Chercher » repart d\'ici, et la '
    + 'limite se règle dans les réglages du moteur.';
}
