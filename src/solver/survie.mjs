/**
 * Compromis entre degats et survie.
 *
 * Le solveur rend le build qui frappe le plus fort sous les conditions. Le
 * joueur, lui, hesite : « si je lache 500 points de vie, je gagne combien ? ».
 * Personne ne veut relancer une recherche par valeur de vitalite pour le
 * savoir. Ce module range donc chaque build croise pendant la recherche dans
 * une tranche d'endurance, et garde le plus fort de chaque tranche.
 *
 * L'axe n'est pas la vie brute mais l'ENDURANCE : les points de vie effectifs,
 * resistances comprises (voir src/engine/defense.mjs). Deux builds a trois
 * mille points de vie ne tiennent pas le meme temps si l'un porte vingt pour
 * cent de resistance ; l'endurance les departage, et le solveur peut enfin
 * echanger de la vitalite contre de la resistance.
 *
 * Un build entre dans une tranche s'il tient tout SAUF la vie : un manque de
 * vitalite est justement ce que la courbe mesure, un manque de PA n'a rien a
 * y faire.
 */

/** Largeur d'une tranche d'endurance. */
export const PAS_ENDURANCE = 250;

/** Conditions qui parlent de la vie : la courbe les met de cote. */
const STATS_DE_VIE = new Set(['vitalite', 'pdv', 'pdvEffectifs']);

/** Statistique sur laquelle la courbe trace son axe. */
export const STAT_ENDURANCE = 'pdvEffectifs';

/**
 * Tranche d'une endurance.
 * @param {number} endurance
 * @param {number} [pas]
 */
export function trancheDe(endurance, pas = PAS_ENDURANCE) {
  return Math.floor(endurance / pas);
}

/**
 * Le meme objectif, sans les conditions qui parlent de la vie.
 *
 * La repartition des points d'un palier de survie se calcule sur cet
 * objectif : sinon elle remonterait la vitalite jusqu'a la condition, et la
 * courbe ne montrerait jamais ce que rapportent les points laches.
 *
 * @param {{conditions: any[]}} objective
 */
export function sansConditionsDeVie(objective) {
  return {
    ...objective,
    conditions: (objective.conditions ?? []).filter((c) => !STATS_DE_VIE.has(c.stat)),
  };
}

/**
 * Vrai quand un build tient tout ce qu'on lui demande, la vie mise a part.
 *
 * @param {{invalid: any[], violations: {stat: string}[], detail: {unmet: {stat: string}[]}}} vue
 */
export function estTenable(vue) {
  if ((vue.invalid?.length ?? 0) > 0) return false;
  if ((vue.violations ?? []).some((v) => !STATS_DE_VIE.has(v.stat))) return false;
  return !(vue.detail?.unmet ?? []).some((u) => !STATS_DE_VIE.has(u.stat));
}

/**
 * Meilleur build pour chaque tranche de points de vie.
 *
 * Chaque tranche garde plusieurs pretendants : la mesure vue pendant la
 * recherche est provisoire, elle depend de la repartition des points du
 * moment. Les pretendants se departagent a la fin, sur leur description
 * definitive — qui peut aussi les changer de tranche, quand leur propre
 * repartition investit en vitalite.
 *
 * @param {{pas?: number, garde?: number}} [reglage]
 */
export function creerPaliersSurvie({ pas = PAS_ENDURANCE, garde = 2 } = {}) {
  /** @type {Map<number, {genome: number[], damage: number, endurance: number, cle: string}[]>} */
  const pretendants = new Map();

  const valide = (mesure) => Number.isFinite(mesure?.damage)
    && Number.isFinite(mesure?.endurance) && mesure.endurance >= 0;

  return {
    /**
     * Propose un build a sa tranche.
     * @param {number[]} genome
     * @param {{damage: number, endurance: number}} mesure Mesure provisoire.
     */
    proposer(genome, mesure) {
      if (!valide(mesure)) return;

      const tranche = trancheDe(mesure.endurance, pas);
      const liste = pretendants.get(tranche) ?? [];
      const cle = genome.join(',');
      if (liste.some((entree) => entree.cle === cle)) return;

      liste.push({ genome: [...genome], damage: mesure.damage, endurance: mesure.endurance, cle });
      liste.sort((a, b) => b.damage - a.damage);
      if (liste.length > garde) liste.length = garde;
      pretendants.set(tranche, liste);
    },

    /**
     * Meilleur build de chaque tranche, de la vie la plus basse a la plus haute.
     *
     * `decrire` rend la description definitive d'un genome, au moins
     * `{damage, endurance}` ; tout ce qu'elle porte en plus passe dans le
     * palier. La tranche se relit sur cette description : c'est elle que le
     * joueur portera.
     *
     * @param {(genome: number[]) => {damage: number, endurance: number}} [decrire]
     */
    liste(decrire = null) {
      const meilleurs = new Map();
      for (const liste of pretendants.values()) {
        for (const pretendant of liste) {
          const description = decrire
            ? decrire(pretendant.genome)
            : { damage: pretendant.damage, endurance: pretendant.endurance };
          if (!valide(description)) continue;

          const tranche = trancheDe(description.endurance, pas);
          const connu = meilleurs.get(tranche);
          if (!connu || description.damage > connu.damage) {
            meilleurs.set(tranche, { ...description, genome: pretendant.genome, tranche });
          }
        }
      }
      return [...meilleurs.values()].sort((a, b) => a.tranche - b.tranche);
    },
  };
}

/**
 * Reduit les paliers a ce qui vaut l'echange.
 *
 * Lue de l'endurance la plus haute a la plus basse, la courbe ne garde qu'un
 * palier qui frappe PLUS fort que tous ceux qui tiennent plus longtemps :
 * lacher de la survie sans rien gagner n'a aucun sens. A degats egaux,
 * l'endurance la plus haute gagne.
 *
 * @param {{endurance: number, damage: number}[]} paliers
 * @returns {{endurance: number, damage: number}[]} De la plus haute endurance a la plus basse.
 */
export function frontiereSurvie(paliers) {
  const tries = [...paliers].sort((a, b) => b.endurance - a.endurance);

  const gardes = [];
  let plafond = Number.NEGATIVE_INFINITY;
  for (const palier of tries) {
    if (!(palier.damage > plafond)) continue;
    plafond = palier.damage;
    gardes.push(palier);
  }
  return gardes;
}

/**
 * Note d'un build pour la descente vers une tranche de vie.
 *
 * Sous le plafond, la note vaut les degats : la descente les maximise. Au
 * dessus, chaque point d'endurance en trop coute `pente` degats : la descente
 * est ainsi attiree vers le plafond au lieu de l'ignorer, ce qu'une penalite
 * fixe lui aurait laisse faire. Un build qui ne tient pas le reste passe sous
 * tout build tenable, et garde son score pour se departager des autres casses.
 *
 * @param {any} vue Evaluation du solveur.
 * @param {number} plafond Endurance a ne pas depasser.
 * @param {number} pente Degats perdus par point d'endurance en trop.
 */
export function noteSousPlafond(vue, plafond, pente) {
  if (!estTenable(vue)) return -1e9 + vue.score;
  const exces = Math.max(0, (vue.stats?.[STAT_ENDURANCE] ?? 0) - plafond);
  return (vue.detail?.damage ?? 0) - exces * pente;
}

/**
 * Tranches a visiter sous celle du gagnant, la plus proche d'abord.
 * @param {number} trancheGagnant
 * @param {number} nombre
 * @returns {number[]}
 */
export function tranchesAVisiter(trancheGagnant, nombre) {
  const tranches = [];
  for (let t = trancheGagnant - 1; t >= 0 && tranches.length < nombre; t -= 1) tranches.push(t);
  return tranches;
}

/**
 * Vrai quand l'objectif demande de la vie : c'est alors qu'un compromis existe.
 * @param {{conditions?: any[]}} objective
 */
export function aConditionDeVie(objective) {
  return (objective?.conditions ?? []).some((c) => STATS_DE_VIE.has(c.stat) && Number(c.target) > 0);
}

/**
 * Objectif d'une vague dediee a une tranche d'endurance.
 *
 * La condition de vie du joueur laisse place a un plafond absolu : le solveur
 * cherche alors le build le plus fort qui reste SOUS la tranche, ce que la
 * recherche ordinaire ne fait jamais. Le reste de l'objectif ne bouge pas.
 *
 * @param {object} objective
 * @param {number} tranche
 * @param {number} [pas]
 */
export function objectifDeTranche(objective, tranche, pas = PAS_ENDURANCE) {
  const sansVie = sansConditionsDeVie(objective);
  return {
    ...sansVie,
    conditions: [
      ...sansVie.conditions,
      { stat: STAT_ENDURANCE, target: 0, max: (tranche + 1) * pas - 1, absolute: true, weight: 1 },
    ],
  };
}
