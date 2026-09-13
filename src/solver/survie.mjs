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

/** Largeur d'une tranche. */
export const PAS_ENDURANCE = 250;

/** Statistique qui porte l'endurance dans les statistiques derivees. */
export const STAT_ENDURANCE = 'pdvEffectifs';

/** Cle de condition qui porte les degats totaux. */
export const STAT_DEGATS = 'degatsTotaux';

/**
 * Axe de la courbe.
 *
 * Un axe dit trois choses : sur quoi la courbe tranche (`cle`), ce qu'elle
 * maximise dans chaque tranche (`valeur`), et quelle condition du joueur elle
 * met de cote — celle qui parle justement de l'axe (`conditions`).
 *
 * Les deux axes sont symetriques. En mode degats, la courbe tranche
 * l'endurance et maximise les degats : « si je lache 500 pdv effectifs, je
 * gagne combien ? ». En mode endurance, elle tranche les degats et maximise
 * l'endurance : « si j'accepte 200 degats de moins, je tiens combien de plus ? ».
 */
export const AXE_ENDURANCE = Object.freeze({
  cle: 'endurance',
  valeur: 'damage',
  stat: STAT_ENDURANCE,
  pas: PAS_ENDURANCE,
  conditions: Object.freeze(['vitalite', 'pdv', STAT_ENDURANCE]),
});

/** Axe du mode « maximiser les pdv effectifs ». */
export const AXE_DEGATS = Object.freeze({
  cle: 'damage',
  valeur: 'endurance',
  stat: STAT_DEGATS,
  pas: PAS_ENDURANCE,
  conditions: Object.freeze([STAT_DEGATS]),
});

/**
 * Axe qui correspond a un mode de recherche.
 * @param {string} [mode]
 */
export function axeDe(mode) {
  return mode === 'endurance' ? AXE_DEGATS : AXE_ENDURANCE;
}

/** Vrai quand la condition parle de l'axe lui-meme. */
const surLAxe = (stat, axe) => axe.conditions.includes(stat);

/**
 * Tranche d'une valeur d'axe.
 * @param {number} valeur
 * @param {number} [pas]
 */
export function trancheDe(valeur, pas = PAS_ENDURANCE) {
  return Math.floor(valeur / pas);
}

/**
 * Le meme objectif, sans les conditions qui parlent de l'axe.
 *
 * La repartition des points d'un palier se calcule sur cet objectif : sinon
 * elle remonterait la vitalite jusqu'a la condition, et la courbe ne
 * montrerait jamais ce que rapportent les points laches.
 *
 * @param {{conditions: any[]}} objective
 * @param {typeof AXE_ENDURANCE} [axe]
 */
export function sansConditionsDAxe(objective, axe = AXE_ENDURANCE) {
  return {
    ...objective,
    conditions: (objective.conditions ?? []).filter((c) => !surLAxe(c.stat, axe)),
  };
}

/**
 * Meme chose sur l'axe de l'endurance : le nom que l'ancien code attend.
 * @param {{conditions: any[]}} objective
 */
export function sansConditionsDeVie(objective) {
  return sansConditionsDAxe(objective, AXE_ENDURANCE);
}

/**
 * Vrai quand un build tient tout ce qu'on lui demande, l'axe mis a part.
 *
 * Un manque sur l'axe est justement ce que la courbe mesure ; un manque de PA
 * n'a rien a y faire.
 *
 * @param {{invalid: any[], violations: {stat: string}[], detail: {unmet: {stat: string}[]}}} vue
 * @param {typeof AXE_ENDURANCE} [axe]
 */
export function estTenable(vue, axe = AXE_ENDURANCE) {
  if ((vue.invalid?.length ?? 0) > 0) return false;
  if ((vue.violations ?? []).some((v) => !surLAxe(v.stat, axe))) return false;
  return !(vue.detail?.unmet ?? []).some((u) => !surLAxe(u.stat, axe));
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
export function creerPaliersSurvie({ pas = PAS_ENDURANCE, garde = 2, axe = AXE_ENDURANCE } = {}) {
  /** @type {Map<number, {genome: number[], damage: number, endurance: number, cle: string}[]>} */
  const pretendants = new Map();

  const valide = (mesure) => Number.isFinite(mesure?.[axe.valeur])
    && Number.isFinite(mesure?.[axe.cle]) && mesure[axe.cle] >= 0;

  return {
    /**
     * Propose un build a sa tranche.
     * @param {number[]} genome
     * @param {{damage: number, endurance: number}} mesure Mesure provisoire.
     */
    proposer(genome, mesure) {
      if (!valide(mesure)) return;

      const tranche = trancheDe(mesure[axe.cle], pas);
      const liste = pretendants.get(tranche) ?? [];
      const cle = genome.join(',');
      if (liste.some((entree) => entree.cle === cle)) return;

      liste.push({ genome: [...genome], damage: mesure.damage, endurance: mesure.endurance, cle });
      liste.sort((a, b) => b[axe.valeur] - a[axe.valeur]);
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

          const tranche = trancheDe(description[axe.cle], pas);
          const connu = meilleurs.get(tranche);
          if (!connu || description[axe.valeur] > connu[axe.valeur]) {
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
export function frontiereSurvie(paliers, axe = AXE_ENDURANCE) {
  const tries = [...paliers].sort((a, b) => b[axe.cle] - a[axe.cle]);

  const gardes = [];
  let plafond = Number.NEGATIVE_INFINITY;
  for (const palier of tries) {
    if (!(palier[axe.valeur] > plafond)) continue;
    plafond = palier[axe.valeur];
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
export function noteSousPlafond(vue, plafond, pente, axe = AXE_ENDURANCE) {
  if (!estTenable(vue, axe)) return -1e9 + vue.score;
  const sur = axe === AXE_DEGATS
    ? { tranche: vue.detail?.damage ?? 0, note: vue.stats?.[STAT_ENDURANCE] ?? 0 }
    : { tranche: vue.stats?.[STAT_ENDURANCE] ?? 0, note: vue.detail?.damage ?? 0 };
  const exces = Math.max(0, sur.tranche - plafond);
  return sur.note - exces * pente;
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
export function aConditionDAxe(objective, axe = AXE_ENDURANCE) {
  return (objective?.conditions ?? [])
    .some((c) => surLAxe(c.stat, axe) && Number(c.target) > 0);
}

/**
 * Meme chose sur l'axe de l'endurance : le nom que l'ancien code attend.
 * @param {{conditions?: any[]}} objective
 */
export function aConditionDeVie(objective) {
  return aConditionDAxe(objective, AXE_ENDURANCE);
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
export function objectifDeTranche(objective, tranche, pas = PAS_ENDURANCE, axe = AXE_ENDURANCE) {
  const sansAxe = sansConditionsDAxe(objective, axe);
  return {
    ...sansAxe,
    conditions: [
      ...sansAxe.conditions,
      { stat: axe.stat, target: 0, max: (tranche + 1) * pas - 1, absolute: true, weight: 1 },
    ],
  };
}
