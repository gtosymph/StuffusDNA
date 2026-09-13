/**
 * Ce que l'etat demande au moteur : sorts, attaques, objectif et filtres.
 *
 * Toutes ces fonctions lisent un etat et rendent une valeur, sans rien
 * garder ni rien toucher. Le solveur, le score affiche et les panneaux
 * d'analyse passent par ici : ils comptent ainsi les memes attaques, et un
 * reglage change une seule fois.
 */
import { STAT_KEYS } from '../src/data/stats.mjs';
import { computeBuild } from '../src/engine/build.mjs';
import { normaliserMenace } from '../src/engine/defense.mjs';
import { weaponAttack } from '../src/engine/damage.mjs';
import { normalizePassives } from '../src/data/passives.mjs';
import { configPassifsDefaut } from '../src/data/passives-defaults.mjs';
import { scoreBuild, SEARCH_MODES } from '../src/solver/score.mjs';

/**
 * Applique les options aux lignes des sorts.
 * Comme sur RoxxSolver, un coup compte en melee quand l'option distance
 * est decochee : le jeu applique toujours l'une des deux familles.
 *
 * @param {any} etat
 * @returns {any[]}
 */
export function sortsCalcules(etat) {
  const range = etat.options.distance ? 'distance' : 'melee';
  return etat.sorts.map((sort) => {
    // Cible telefrag : le bonus immediat (Horloge, Rayon Obscur) s'ajoute
    // aux degats de base de la premiere ligne.
    const bonus = etat.options.cibleTelefrag ? sort.telefragCible?.bonusImmediat ?? 0 : 0;

    return {
      ...sort,
      // Une ligne differee touche aux tours suivants. Elle reste dans le sort
      // pour rester lisible, et le moteur decide de la compter ou non : le
      // sort porte le choix, la ligne ne porte que le fait.
      compterDiffere: etat.options.toursSuivants === true,
      lines: sort.lines
        .map((ligne, rang) => ({
          ...ligne,
          ...(bonus > 0 && rang === 0 ? {
            min: ligne.min + bonus,
            max: ligne.max + bonus,
            critMin: (ligne.critMin ?? ligne.min) + bonus,
            critMax: (ligne.critMax ?? ligne.max) + bonus,
          } : {}),
          range,
          source: 'sort',
        })),
    };
  });
}

/** Passifs par defaut, prepares une seule fois. */
let passifsMemo = null;

/**
 * Passifs actifs selon l'option.
 * @param {any} etat
 */
export function passifsActifs(etat) {
  if (!etat.options.passifs) return null;
  passifsMemo ??= normalizePassives(configPassifsDefaut(), new Set(STAT_KEYS)).passives;
  return passifsMemo;
}

/** Classe et sexe du personnage, tels que le moteur les lit. */
export function profilDe(etat) {
  return { classe: etat.classe, sexe: etat.sexe };
}

/**
 * Attaque de l'arme equipee, si l'option la compte dans les degats.
 * @param {any} etat
 */
export function attaqueArme(etat) {
  if (!etat.options.arme) return null;
  const arme = etat.equipped.get('arme:0');
  if (!arme) return null;
  // La portee de l'arme suit l'arme (melee sauf arme a distance), comme
  // dans le calcul de reference ; l'option distance ne touche que les sorts.
  return weaponAttack(arme, { maitrise: etat.options.maitriseArme });
}

/**
 * Sorts et attaque d'arme comptes dans le score affiche.
 * @param {any} etat
 */
export function attaquesAffichees(etat) {
  const attaque = attaqueArme(etat);
  return attaque ? [...sortsCalcules(etat), attaque] : sortsCalcules(etat);
}

/**
 * Build du personnage tel qu'il est pose.
 *
 * @param {any} etat
 * @param {{setById: Map<number, any>}|null} catalogue
 */
export function buildCourant(etat, catalogue) {
  if (!catalogue) return null;
  return computeBuild(
    {
      items: [...etat.equipped.values()],
      level: etat.niveau,
      allocation: etat.allocation,
      scrolls: etat.scrolls,
      passives: passifsActifs(etat),
      profile: profilDe(etat),
      menace: menaceDe(etat),
    },
    catalogue.setById,
  );
}

/**
 * Modele d'adversaire tire des reglages.
 *
 * Il sert aux points de vie effectifs : sans lui, une resistance ne se compare
 * a rien. Le reglage voyage avec l'objectif, parce que le solveur, la fiche de
 * personnage et la courbe doivent lire la meme valeur.
 *
 * @param {any} etat
 */
export function menaceDe(etat) {
  return normaliserMenace({
    coup: etat.options.menaceCoup,
    plafond: etat.options.menacePlafond,
    position: etat.options.menacePosition !== false,
  });
}

/**
 * Objectif remis au solveur.
 * @param {any} etat
 */
export function objectif(etat) {
  const enDegats = etat.sorts.length > 0 || etat.options.arme;
  return {
    conditions: etat.conditions,
    // Modele d'adversaire : il decide de la valeur en vie d'une resistance,
    // donc de tout l'axe « degats ou survie ».
    menace: menaceDe(etat),
    spells: sortsCalcules(etat),
    // Le solveur ajoute lui-meme l'attaque de l'arme de chaque build essaye.
    useWeapon: etat.options.arme,
    maitriseArme: etat.options.maitriseArme,
    // Bornes du choix des armes : elles ecartent les armes trop cheres ou
    // trop lentes avant toute evaluation.
    arme: etat.options.arme
      ? {
        paMin: etat.options.armePaMin,
        paMax: etat.options.armePaMax,
        lancersMin: etat.options.armeLancersMin,
        portee: etat.options.armePortee,
        porteeMin: etat.options.armePorteeMin,
        elementsMin: etat.options.armeElementsMin,
        elementsMax: etat.options.armeElementsMax,
      }
      : null,
    combo: etat.options.combo
      ? {
        actif: true,
        reserve: Math.max(0, Number(etat.options.paReserves) || 0),
        elementsMin: Math.max(0, Number(etat.options.comboElements) || 0),
        unLancer: Boolean(etat.options.comboUnLancer),
        cibleTelefrag: Boolean(etat.options.cibleTelefrag),
      }
      : null,
    // Plafonds d'investissement : ils bornent la repartition automatique des
    // points, jamais ce que le joueur saisit lui-meme.
    limites: etat.limites,
    // Proximite avec le stuff porte en jeu. Sans reference figee, le champ
    // reste absent et le solveur cherche librement, comme avant.
    proximite: etat.reference
      ? {
        reference: etat.reference.itemIds,
        possedees: [...etat.possedees],
        // Zero ne veut pas dire « aucun changement » ici : c'est le reglage
        // laisse au repos. La limite ne s'applique qu'a partir de un.
        max: etat.changementsMax > 0 ? etat.changementsMax : null,
      }
      : null,
    mode: enDegats ? SEARCH_MODES.DAMAGE : SEARCH_MODES.STATS,
  };
}

/**
 * Objectif du score affiche : le meme que le solveur, arme equipee comprise.
 * @param {any} etat
 */
export function cibleAffichee(etat) {
  return { ...objectif(etat), spells: attaquesAffichees(etat) };
}

/**
 * Score du build pose, avec les attaques affichees.
 * @param {any} etat
 * @param {Record<string, number>} stats
 */
export function scoreAffiche(etat, stats) {
  return scoreBuild(stats, cibleAffichee(etat));
}

/**
 * Pieces du catalogue qui passent les filtres, de la plus haute a la plus basse.
 *
 * @param {any} etat
 * @param {{items: any[]}|null} catalogue
 * @returns {any[]}
 */
export function itemsFiltres(etat, catalogue) {
  if (!catalogue) return [];
  const terme = etat.recherche.trim().toLowerCase();
  const { stat, op, valeur } = etat.filtreStat;

  return catalogue.items
    .filter((item) => {
      if (item.level > etat.niveau) return false;
      if (etat.filtre && item.slot !== etat.filtre) return false;
      if (etat.filtreType && item.typeFr !== etat.filtreType) return false;
      // Trophees majeurs : leur condition exige moins de trois bonus de panoplie.
      if (etat.filtrePk && !/Pk<3/.test(item.criteria ?? '')) return false;
      if (terme && !item.fr.toLowerCase().includes(terme)) return false;
      // Filtre par statistique : ">= 1 PA" garde les pieces qui donnent 1 PA ou plus.
      if (stat) {
        const porte = item.stats?.[stat] ?? 0;
        if (op === '>=' ? porte < valeur : porte > valeur) return false;
      }
      return true;
    })
    .sort((a, b) => b.level - a.level || a.fr.localeCompare(b.fr, 'fr'));
}

/**
 * Ce que vaut le stuff de reference, avec les reglages du moment.
 *
 * Il se recalcule a chaque rendu : une condition ajoutee ou un sort change
 * modifie ce que vaut le stuff porte, et le gain annonce avec.
 *
 * Le detail rendu porte les DEGATS a part du score. C'est necessaire : le
 * score vaut les degats quand les conditions tiennent, et moins la penalite
 * quand elles tombent. Soustraire un score de defaut d'un score de degats
 * annoncait des gains de plusieurs milliers de points qui ne voulaient rien
 * dire. Les degats, eux, se comparent toujours.
 *
 * @param {any} etat
 * @param {{itemById: Map<number, any>, setById: Map<number, any>}} catalogue
 * @returns {{score: number, damage: number, satisfied: boolean}|null}
 */
export function valeurDeReference(etat, catalogue) {
  if (!etat.reference || !catalogue) return null;
  const items = etat.reference.itemIds
    .map((id) => catalogue.itemById.get(id))
    .filter(Boolean);
  if (items.length === 0) return null;

  const { stats } = computeBuild({
    items, level: etat.niveau, allocation: etat.allocation, scrolls: etat.scrolls,
    passives: passifsActifs(etat), profile: profilDe(etat),
  }, catalogue.setById);

  const detail = scoreAffiche(etat, stats);
  return { score: detail.score, damage: detail.damage, satisfied: detail.satisfied };
}
