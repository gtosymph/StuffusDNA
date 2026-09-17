/**
 * La fiche du personnage, dans le volet d'inspection.
 *
 * Deux listes, pas une. « L'essentiel » sert a DECIDER : les deux mesures qui
 * tranchent, puis les minimums que le joueur a lui-meme poses, puis de quoi
 * completer. Une exigence en defaut s'y voit sans la chercher, parce qu'elle
 * est dans les premieres lignes par construction.
 *
 * « Tout voir » sert a RETROUVER une statistique qu'on connait deja, et on la
 * cherche la ou le jeu l'a mise. Cette liste suit donc les familles du jeu,
 * dans l'ordre du jeu, jamais l'ordre de la premiere.
 *
 * Chaque ligne est une porte : la cliquer garde au moins la valeur atteinte.
 */
import {
  CARACTERISTIQUES, DOMMAGES, PRINCIPALES, RESISTANCES, SECONDAIRES,
} from '../layout.mjs';

/** Les familles de la fiche, dans l'ordre ou le jeu les montre. */
export const FAMILLES = Object.freeze([
  ['Principales', PRINCIPALES],
  ['Caracteristiques', CARACTERISTIQUES],
  ['Secondaires', SECONDAIRES],
  ['Dommages', DOMMAGES],
  ['Resistances', RESISTANCES],
]);

/**
 * Les resistances, appariees par element.
 *
 * Le jeu donne deux nombres par element : ce qui est retire au coup, et ce
 * qui en est retranche en pourcentage. Ils ne se lisent JAMAIS l'un sans
 * l'autre — « 120 » ne veut rien dire sans le « 15 % » qui l'accompagne — et
 * les montrer sur deux lignes obligeait a les rapprocher de tete, dix fois de
 * suite. Une ligne par element, deux colonnes de chiffres.
 *
 * Quelques mesures n'ont qu'une moitie : la resistance critique et la poussee
 * n'existent qu'en brut, la melee et la distance qu'en pourcentage. Elles
 * gardent leur ligne, avec une seule colonne remplie.
 */
export const RESISTANCES_APPARIEES = Object.freeze([
  ['Neutre', 'resNeutre', 'pctResNeutre'],
  ['Terre', 'resTerre', 'pctResTerre'],
  ['Feu', 'resFeu', 'pctResFeu'],
  ['Eau', 'resEau', 'pctResEau'],
  ['Air', 'resAir', 'pctResAir'],
  ['Critique', 'resCritique', null],
  ['Poussee', 'resPoussee', null],
  ['Melee', null, 'pctResMelee'],
  ['Distance', null, 'pctResDistance'],
]);

/**
 * Les lignes de la famille « Resistances », une par element.
 *
 * @param {Record<string, number>} stats
 * @param {Set<string>} minimums
 */
function lignesResistances(stats, minimums) {
  return RESISTANCES_APPARIEES
    .filter(([, brut, pct]) => stats?.[brut] !== undefined || stats?.[pct] !== undefined)
    .map(([libelle, brut, pct]) => ({
      // La ligne se clique pour poser un minimum : elle vise le brut quand il
      // existe, sinon le pourcentage. C'est la seule mesure qu'elle porte.
      cle: brut ?? pct,
      libelle,
      valeur: Number(stats?.[brut]) || 0,
      pourcent: pct && stats?.[pct] !== undefined ? Number(stats[pct]) || 0 : null,
      sansBrut: !brut,
      sousMinimum: minimums.has(brut) || minimums.has(pct),
    }));
}

/** Ce que l'on montre pour completer l'essentiel, quand il reste de la place. */
const APPOINT = Object.freeze(['pa', 'pm', 'pdv', 'critique', 'puissance', 'initiative']);

/** Lignes montrees au plus dans l'essentiel : au-dela, on subit la liste. */
const ESSENTIEL_MAX = 8;

/**
 * Les lignes de « tout voir », groupees par famille.
 *
 * Une famille dont aucune statistique n'est connue disparait : un intitule
 * seul, sans ligne dessous, se lit comme un defaut d'affichage.
 *
 * @param {Record<string, number>} stats
 * @param {Set<string>} minimums Statistiques deja sous minimum.
 * @returns {({famille: string}|{cle: string, libelle: string, valeur: number,
 *            sousMinimum: boolean})[]}
 */
export function lignesCompletes(stats, minimums = new Set()) {
  return FAMILLES.flatMap(([famille, paires]) => {
    const dedans = famille === 'Resistances'
      ? lignesResistances(stats, minimums)
      : paires
        .filter(([cle]) => stats?.[cle] !== undefined)
        .map(([cle, libelle]) => ({
          cle, libelle,
          valeur: Number(stats[cle]) || 0,
          sousMinimum: minimums.has(cle),
        }));
    return dedans.length ? [{ famille }, ...dedans] : [];
  });
}

/**
 * Les lignes de l'essentiel : ce qui decide, puis ce que le joueur a demande.
 *
 * L'ordre n'est pas un gout. Les deux mesures decident toujours, donc elles
 * ouvrent. Les minimums viennent ensuite parce qu'ils sont la seule chose que
 * le joueur a dite lui-meme. L'appoint ne remplit que la place qui reste.
 *
 * @param {Record<string, number>} stats
 * @param {string[]} minimums Statistiques sous minimum, dans l'ordre de pose.
 * @param {{degats: number|null, pdvEffectifs: number}} mesures
 */
export function lignesEssentielles(stats, minimums, mesures) {
  const libelle = (cle) => LIBELLES.get(cle) ?? cle;

  const tetes = [
    { cle: 'degatsTotaux', libelle: 'Degats', valeur: mesures.degats, muet: mesures.degats === null },
    { cle: 'pdvEffectifs', libelle: 'Pdv effectifs', valeur: mesures.pdvEffectifs },
  ];

  const vus = new Set(['degatsTotaux', 'pdvEffectifs', ...minimums]);
  const exigences = minimums
    .filter((cle) => stats?.[cle] !== undefined)
    .map((cle) => ({ cle, libelle: libelle(cle), valeur: Number(stats[cle]) || 0, exigee: true }));

  const place = Math.max(0, ESSENTIEL_MAX - tetes.length - exigences.length);
  const appoint = APPOINT
    .filter((cle) => !vus.has(cle) && stats?.[cle] !== undefined)
    .slice(0, place)
    .map((cle) => ({ cle, libelle: libelle(cle), valeur: Number(stats[cle]) || 0 }));

  return [
    ...tetes,
    ...(exigences.length ? [{ famille: 'vos exigences' }, ...exigences] : []),
    ...(appoint.length ? [{ famille: 'puis' }, ...appoint] : []),
  ];
}

/** Libelle de chaque statistique, tire des familles : une seule source. */
const LIBELLES = new Map(FAMILLES.flatMap(([, paires]) => paires));
