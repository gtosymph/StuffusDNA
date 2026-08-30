/**
 * Calcul des degats d'un coup, selon les regles de Dofus.
 *
 * Un coup se calcule en plusieurs temps :
 *   1. base * (100 + caracteristique + puissance) / 100 + degats fixes
 *   2. chaque famille de pourcentages s'applique ensuite EN MULTIPLICATIF,
 *      avec un arrondi vers le bas entre chaque etape :
 *      sorts/armes, puis melee/distance, puis dommages finaux.
 *
 * La composition multiplicative avec arrondis intermediaires a ete verifiee
 * contre RoxxSolver sur un build reel : 415 -> 439 et 476 -> 504 avec
 * 6 % Dommages Sorts et 6 % Dommages Melee (ecarts exacts a l'unite).
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

/**
 * Applique un pourcentage de degats, avec l'arrondi vers le bas du jeu.
 * @param {number} value
 * @param {number} percent
 * @returns {number}
 */
function applyPercent(value, percent) {
  return Math.floor((value * (100 + Math.max(percent ?? 0, -100))) / 100);
}

/**
 * Applique les familles de pourcentages, dans l'ordre du jeu.
 * @param {number} scaled Degats apres caracteristique et degats fixes.
 * @param {Record<string, number>} stats
 * @param {{source: 'sort' | 'arme', range: 'melee' | 'distance' | null}} context
 * @returns {number}
 */
function applyPercentFamilies(scaled, stats, context) {
  let total = scaled;

  total = applyPercent(total, context.source === 'arme'
    ? stats.pctDommagesArmes : stats.pctDommagesSorts);

  if (context.range === 'melee') total = applyPercent(total, stats.pctDommagesMelee);
  else if (context.range === 'distance') total = applyPercent(total, stats.pctDommagesDistance);
  else total = Math.floor(total);

  return applyPercent(total, stats.pctDommagesFinaux);
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
 * @param {Record<string, number>} stats Statistiques du personnage.
 * @returns {number} Degats infliges, arrondis vers le bas.
 */
export function computeHit(hit, stats) {
  const { element, base, critical = false, source = 'sort', range = null } = hit;

  if (!Number.isFinite(base) || base <= 0) return 0;

  // Les degats de poussee suivent une regle propre, sans caracteristique.
  if (element === 'poussee') {
    return Math.max(0, Math.floor(base + (stats.dommagesPoussee ?? 0)));
  }

  const characteristic = ELEMENT_CHARACTERISTIC[element];
  if (!characteristic) {
    throw new Error(`Element inconnu: "${element}"`);
  }

  const power = (stats[characteristic] ?? 0) + (stats.puissance ?? 0);

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
  const { element, min, max, source = 'sort', range = null } = line;
  const critMin = line.critMin ?? min;
  const critMax = line.critMax ?? max;

  const normal = computeHit(
    { element, base: (min + max) / 2, critical: false, source, range },
    stats,
  );
  const critical = computeHit(
    { element, base: (critMin + critMax) / 2, critical: true, source, range },
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
 *
 * @param {any} item Arme du catalogue, avec ses lignes de degats.
 * @returns {any | null} Sort equivalent, ou null si l'item n'est pas une arme.
 */
export function weaponAttack(item) {
  if (!item || item.slot !== 'arme') return null;
  const lignes = Array.isArray(item.weapon) ? item.weapon.filter((l) => l.max > 0) : [];
  if (lignes.length === 0) return null;

  const range = (item.range ?? 1) > 1 ? 'distance' : 'melee';
  const bonus = item.critBonus ?? 0;

  return {
    id: `arme:${item.id}`,
    name: item.fr,
    icon: item.img ?? null,
    apCost: item.apCost ?? null,
    castsPerTurn: item.usesPerTurn ?? 1,
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
    const { element, min, max, source = 'sort', range = null } = line;
    const critMin = line.critMin ?? min;
    const critMax = line.critMax ?? max;

    const ligne = {
      element,
      normalMin: computeHit({ element, base: min, source, range }, stats),
      normalMax: computeHit({ element, base: max, source, range }, stats),
      critMin: computeHit({ element, base: critMin, critical: true, source, range }, stats),
      critMax: computeHit({ element, base: critMax, critical: true, source, range }, stats),
    };

    bornes.normalMin += ligne.normalMin;
    bornes.normalMax += ligne.normalMax;
    bornes.critMin += ligne.critMin;
    bornes.critMax += ligne.critMax;
    parLigne.push(ligne);
  }

  return { ...moyennes, ...bornes, parLigne, critRate: rate };
}
