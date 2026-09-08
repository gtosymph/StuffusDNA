/**
 * Calcul des degats d'un coup, selon les regles de Dofus.
 *
 * Un coup se calcule en plusieurs temps :
 *   1. base * (100 + caracteristique + puissance) / 100 + degats fixes,
 *      arrondi vers le bas ;
 *   2. les familles de pourcentages (sorts/armes, melee/distance, finaux)
 *      s'appliquent EN MULTIPLICATIF, avec un seul arrondi vers le bas final.
 *
 * L'ordre des arrondis vient du calcul de reference de RoxxSolver (fonction
 * de degats de son affichage) : h = floor(base * f + fixes) puis
 * h = floor(h * v * b * y). Verifie a l'unite pres sur un build reel.
 */
import { ELEMENT_CHARACTERISTIC } from '../data/stats.mjs';

/** Statistique de degats fixes associee a chaque element. */
const FLAT_DAMAGE_STAT = Object.freeze({
  neutre: 'dommagesNeutre',
  terre: 'dommagesTerre',
  feu: 'dommagesFeu',
  eau: 'dommagesEau',
  air: 'dommagesAir',
});

/** Facteur multiplicatif d'un pourcentage de degats, plancher a -100. */
function percentFactor(percent) {
  return (100 + Math.max(percent ?? 0, -100)) / 100;
}

/**
 * Applique les familles de pourcentages, dans l'ordre du jeu.
 *
 * Les trois familles composent un seul produit, arrondi une seule fois :
 * c'est l'arrondi du calcul de reference.
 *
 * @param {number} scaled Degats apres caracteristique et degats fixes.
 * @param {Record<string, number>} stats
 * @param {{source: 'sort' | 'arme', range: 'melee' | 'distance' | null}} context
 * @returns {number}
 */
function applyPercentFamilies(scaled, stats, context) {
  let facteur = percentFactor(context.source === 'arme'
    ? stats.pctDommagesArmes : stats.pctDommagesSorts);

  if (context.range === 'melee') facteur *= percentFactor(stats.pctDommagesMelee);
  else if (context.range === 'distance') facteur *= percentFactor(stats.pctDommagesDistance);

  facteur *= percentFactor(stats.pctDommagesFinaux);

  return Math.floor(Math.floor(scaled) * facteur);
}

/** Bornes du bonus de puissance de la maitrise d'arme. */
const MAITRISE_MIN = 300;
const MAITRISE_MAX = 360;

/**
 * Bonus de puissance de la maitrise d'arme, selon le taux critique.
 *
 * Formule du calcul de reference : le bonus glisse de 300 a 360 avec
 * T = clamp(5 + critique, 0, 100) / 100. Il ne s'applique qu'aux coups
 * d'arme, quand l'option est active.
 *
 * @param {Record<string, number>} stats
 * @returns {number}
 */
export function maitriseArmeBonus(stats) {
  const taux = Math.max(0, Math.min(100, 5 + (stats.critique ?? 0))) / 100;
  return Math.floor(MAITRISE_MIN * (1 - taux) + MAITRISE_MAX * taux);
}

/**
 * Calcule les degats d'un coup unique.
 *
 * @param {object} hit
 * @param {string} hit.element Element du coup, ou "poussee".
 * @param {number} hit.base Valeur de base du coup.
 * @param {boolean} [hit.critical] Vrai pour un coup critique.
 * @param {'sort' | 'arme'} [hit.source] Origine du coup.
 * @param {'melee' | 'distance' | null} [hit.range] Portee du coup.
 * @param {boolean} [hit.maitrise] Vrai pour un coup d'arme sous maitrise.
 * @param {Record<string, number>} stats Statistiques du personnage.
 * @returns {number} Degats infliges, arrondis vers le bas.
 */
export function computeHit(hit, stats) {
  const { element, base, critical = false, source = 'sort', range = null, maitrise = false } = hit;

  if (!Number.isFinite(base) || base <= 0) return 0;

  // Les degats de poussee suivent une regle propre, sans caracteristique.
  if (element === 'poussee') {
    return Math.max(0, Math.floor(base + (stats.dommagesPoussee ?? 0)));
  }

  const characteristic = ELEMENT_CHARACTERISTIC[element];
  if (!characteristic) {
    throw new Error(`Element inconnu: "${element}"`);
  }

  let power = (stats[characteristic] ?? 0) + (stats.puissance ?? 0);
  if (maitrise && source === 'arme') power += maitriseArmeBonus(stats);

  let flat = (stats[FLAT_DAMAGE_STAT[element]] ?? 0) + (stats.dommages ?? 0);
  if (critical) flat += stats.dommagesCritiques ?? 0;

  const scaled = (base * (100 + power)) / 100 + flat;
  const total = applyPercentFamilies(scaled, stats, { source, range });

  return Math.max(0, total);
}

/**
 * Taux de coup critique effectif, en fraction de 1.
 * Le bonus propre au sort s'ajoute au taux du personnage, sans depasser 100 %.
 * @param {Record<string, number>} stats
 * @param {number} [spellCritBonus]
 * @returns {number}
 */
export function criticalRate(stats, spellCritBonus = 0) {
  const percent = (stats.critique ?? 0) + spellCritBonus;
  return Math.min(100, Math.max(0, percent)) / 100;
}

/**
 * Calcule une ligne de degats : coup normal, coup critique et moyenne.
 * @param {object} line
 * @param {string} line.element
 * @param {number} line.min Valeur de base minimale.
 * @param {number} line.max Valeur de base maximale.
 * @param {number} [line.critMin] Base minimale en coup critique.
 * @param {number} [line.critMax] Base maximale en coup critique.
 * @param {'sort' | 'arme'} [line.source]
 * @param {'melee' | 'distance' | null} [line.range]
 * @param {Record<string, number>} stats
 * @param {number} [critRate] Taux critique en fraction de 1.
 * @returns {{normal: number, critical: number, average: number}}
 */
export function computeLine(line, stats, critRate = criticalRate(stats)) {
  const { element, min, max, source = 'sort', range = null, maitrise = false } = line;
  const critMin = line.critMin ?? min;
  const critMax = line.critMax ?? max;

  const normal = computeHit(
    { element, base: (min + max) / 2, critical: false, source, range, maitrise },
    stats,
  );
  const critical = computeHit(
    { element, base: (critMin + critMax) / 2, critical: true, source, range, maitrise },
    stats,
  );

  const rate = Math.min(1, Math.max(0, critRate));
  return { normal, critical, average: normal * (1 - rate) + critical * rate };
}

/**
 * Calcule les degats moyens d'un sort compose de plusieurs lignes.
 *
 * Le total d'un sort additionne ses lignes, pour UN lancer : c'est la valeur
 * de la fiche du sort en jeu. `parTour` donne le total multiplie par le
 * nombre de lancers par tour.
 *
 * @param {object} spell
 * @param {any[]} spell.lines
 * @param {number} [spell.castsPerTurn] Lancers par tour.
 * @param {number} [spell.baseCrit] Bonus de critique propre au sort.
 * @param {number} [spell.apCost] Cout en points d'action.
 * @param {Record<string, number>} stats
 * @returns {{normal: number, critical: number, average: number, perAp: number|null}}
 */
export function computeSpell(spell, stats) {
  const lines = Array.isArray(spell.lines) ? spell.lines : [];
  const rate = criticalRate(stats, spell.baseCrit ?? 0);

  let normal = 0;
  let critical = 0;
  let average = 0;

  for (const line of lines) {
    const result = computeLine(line, stats, rate);
    normal += result.normal;
    critical += result.critical;
    average += result.average;
  }

  const casts = Number.isFinite(spell.castsPerTurn) && spell.castsPerTurn > 0
    ? spell.castsPerTurn : 1;
  const apCost = Number.isFinite(spell.apCost) && spell.apCost > 0 ? spell.apCost : null;

  return {
    normal,
    critical,
    average,
    casts,
    parTour: average * casts,
    perAp: apCost ? average / apCost : null,
  };
}

/**
 * Construit l'attaque propre d'une arme, au format d'un sort.
 *
 * Le coup critique d'une arme ajoute son bonus critique a chaque ligne.
 * Une arme dont la portee depasse un compte comme un coup a distance.
 * L'arme frappe `repeats` fois par tour (ses utilisations par tour), et la
 * maitrise d'arme s'applique par defaut, comme dans le calcul de reference.
 *
 * @param {any} item Arme du catalogue, avec ses lignes de degats.
 * @param {{maitrise?: boolean}} [options]
 * @returns {any | null} Sort equivalent, ou null si l'item n'est pas une arme.
 */
export function weaponAttack(item, options = {}) {
  if (!item || item.slot !== 'arme') return null;
  const lignes = Array.isArray(item.weapon) ? item.weapon.filter((l) => l.max > 0) : [];
  if (lignes.length === 0) return null;

  const { maitrise = true } = options;
  const range = (item.range ?? 1) > 1 ? 'distance' : 'melee';
  const bonus = item.critBonus ?? 0;
  const utilisations = Number(item.usesPerTurn) > 0 ? Number(item.usesPerTurn) : 1;

  return {
    id: `arme:${item.id}`,
    name: item.fr,
    icon: item.img ?? null,
    apCost: item.apCost ?? null,
    castsPerTurn: utilisations,
    repeats: utilisations,
    baseCrit: item.critProbability ?? 0,
    arme: true,
    lines: lignes.map((ligne) => ({
      element: ligne.element,
      min: ligne.min,
      max: ligne.max,
      critMin: ligne.min + bonus,
      critMax: ligne.max + bonus,
      source: 'arme',
      range,
      ...(maitrise ? { maitrise: true } : {}),
    })),
  };
}

/**
 * Detail complet d'un sort : plages de degats, moyennes et taux critique.
 *
 * Les plages viennent d'un calcul borne par borne (minimum et maximum de
 * chaque ligne). Les moyennes restent celles de computeSpell.
 *
 * @param {any} spell
 * @param {Record<string, number>} stats
 */
export function computeSpellDetail(spell, stats) {
  const lines = Array.isArray(spell.lines) ? spell.lines : [];
  const moyennes = computeSpell(spell, stats);
  const rate = criticalRate(stats, spell.baseCrit ?? 0);

  const bornes = { normalMin: 0, normalMax: 0, critMin: 0, critMax: 0 };
  const parLigne = [];

  for (const line of lines) {
    const { element, min, max, source = 'sort', range = null, maitrise = false } = line;
    const critMin = line.critMin ?? min;
    const critMax = line.critMax ?? max;

    const ligne = {
      element,
      normalMin: computeHit({ element, base: min, source, range, maitrise }, stats),
      normalMax: computeHit({ element, base: max, source, range, maitrise }, stats),
      critMin: computeHit({ element, base: critMin, critical: true, source, range, maitrise }, stats),
      critMax: computeHit({ element, base: critMax, critical: true, source, range, maitrise }, stats),
    };

    bornes.normalMin += ligne.normalMin;
    bornes.normalMax += ligne.normalMax;
    bornes.critMin += ligne.critMin;
    bornes.critMax += ligne.critMax;
    parLigne.push(ligne);
  }

  // « casts » dit ce que le tour permet ; « comptes » dit ce que le score
  // additionne vraiment. Les deux different des qu'un combo, ou la main, a
  // fixe un nombre de lancers plus bas que la limite du jeu.
  const comptes = Number.isFinite(spell.repeats) && spell.repeats > 0
    ? Math.floor(spell.repeats) : 1;

  return {
    ...moyennes, ...bornes, parLigne, critRate: rate,
    comptes, total: moyennes.average * comptes,
  };
}
