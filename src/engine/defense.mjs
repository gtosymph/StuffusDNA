/**
 * Points de vie effectifs : les resistances traduites en vie.
 *
 * Le solveur compare des nombres. Tant que la resistance reste un pourcentage
 * a part, elle ne pese rien face a de la vitalite, et la courbe « Degats ou
 * survie » ignore la moitie de ce qui garde un personnage debout. Ce module
 * ramene tout sur la meme echelle : combien de degats bruts le personnage
 * encaisse avant de tomber.
 *
 * La regle du jeu, verifiee contre le tutoriel officiel : un coup subi vaut
 * (degats - resistance fixe) x (1 - resistance en pourcentage). La fixe part
 * en premier, le pourcentage ensuite.
 *
 * Deux hypotheses, assumees et reglables :
 *
 * 1. L'adversaire frappe uniformement dans les cinq elements. Le modele prend
 *    donc la moyenne des cinq coups. Une resistance dans un seul element ne
 *    vaut qu'un cinquieme de sa valeur : c'est juste en donjon, severe face a
 *    un adversaire unique.
 * 2. La resistance fixe n'a de valeur que face a un coup de taille connue.
 *    Le coup de reference vaut trois cents degats par defaut ; le baisser
 *    donne plus de poids aux resistances fixes.
 */
import { ELEMENTS } from '../data/stats.mjs';

/** Cle de resistance fixe par element, calculee une fois. */
const RES_FIXE = Object.freeze(ELEMENTS.map(
  (element) => `res${element[0].toUpperCase()}${element.slice(1)}`,
));

/** Cle de resistance en pourcentage par element. */
const RES_PCT = Object.freeze(ELEMENTS.map(
  (element) => `pctRes${element[0].toUpperCase()}${element.slice(1)}`,
));

/**
 * Reduction minimale admise.
 *
 * Une resistance fixe superieure au coup de reference annulerait le coup, et
 * les points de vie effectifs partiraient a l'infini. Le plancher garde la
 * mesure finie : au mieux, le personnage encaisse cinquante fois sa vie.
 */
export const REDUCTION_PLANCHER = 0.02;

/** Modele d'adversaire par defaut. */
export const MENACE_DEFAUT = Object.freeze({
  /** Degats bruts du coup de reference, avant toute reduction. */
  coup: 300,
  /** Plafond du jeu sur les resistances en pourcentage. */
  plafond: 50,
  /** Compter les resistances melee et distance, moitie chacune. */
  position: true,
});

/**
 * Complete un reglage partiel, et refuse les valeurs qui n'ont pas de sens.
 *
 * @param {{coup?: number, plafond?: number, position?: boolean}} [brut]
 * @returns {{coup: number, plafond: number, position: boolean}} Fige.
 */
export function normaliserMenace(brut = null) {
  if (!brut) return MENACE_DEFAUT;

  const coup = Number(brut.coup);
  const plafond = Number(brut.plafond);

  return Object.freeze({
    coup: Number.isFinite(coup) && coup > 0 ? coup : MENACE_DEFAUT.coup,
    plafond: Number.isFinite(plafond) && plafond >= 0 ? plafond : MENACE_DEFAUT.plafond,
    position: brut.position !== false,
  });
}

/**
 * Part d'un coup brut qui touche encore le personnage.
 *
 * Un resultat de 0,8 veut dire que le personnage prend quatre cinquiemes des
 * degats. Au-dessus de un, il est vulnerable.
 *
 * @param {Record<string, number>} stats Statistiques agregees.
 * @param {{coup: number, plafond: number, position: boolean}} [menace]
 * @returns {number} Strictement positif.
 */
export function reductionSubie(stats, menace = MENACE_DEFAUT) {
  const { coup, plafond } = menace;

  let total = 0;
  for (let i = 0; i < RES_FIXE.length; i += 1) {
    const fixe = stats[RES_FIXE[i]] ?? 0;
    const pct = Math.min(plafond, stats[RES_PCT[i]] ?? 0) / 100;
    total += Math.max(0, coup - fixe) * (1 - pct);
  }

  let reduction = total / (RES_FIXE.length * coup);

  if (menace.position) {
    const melee = Math.min(plafond, stats.pctResMelee ?? 0);
    const distance = Math.min(plafond, stats.pctResDistance ?? 0);
    reduction *= 1 - (melee + distance) / 200;
  }

  return Math.max(REDUCTION_PLANCHER, reduction);
}

/**
 * Degats bruts encaisses avant de tomber.
 *
 * @param {number} pdv Points de vie reels.
 * @param {Record<string, number>} stats Statistiques agregees.
 * @param {{coup: number, plafond: number, position: boolean}} [menace]
 * @returns {number} Entier.
 */
export function pdvEffectifs(pdv, stats, menace = MENACE_DEFAUT) {
  const vie = Number(pdv);
  if (!Number.isFinite(vie) || vie <= 0) return 0;
  return Math.round(vie / reductionSubie(stats, menace));
}
