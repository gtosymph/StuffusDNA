/**
 * Icones des statistiques.
 * Les codes courts proviennent du jeu de ressources repris de dofopti.
 */

/** Code d'icone pour chaque statistique du moteur. */
const CODE_PAR_STAT = Object.freeze({
  pdv: 'vit', vitalite: 'vit', sagesse: 'sa', force: 'str', intelligence: 'int',
  chance: 'cha', agilite: 'agi', puissance: 'pui',

  pa: 'pa', pm: 'pm', po: 'po', critique: 'cri', initiative: 'ini',
  prospection: 'pp', invocations: 'inv',

  fuite: 'fui', tacle: 'tac', esquivePa: 'pap', esquivePm: 'pmp',
  retraitPa: 'par', retraitPm: 'pmr', pods: 'pod', soins: 'so',

  dommages: 'do', dommagesNeutre: 'don', dommagesTerre: 'dot', dommagesFeu: 'dof',
  dommagesEau: 'doe', dommagesAir: 'doa', dommagesCritiques: 'doc', dommagesPoussee: 'dop',

  pctDommagesFinaux: 'do', pctDommagesArmes: 'dpa', pctDommagesSorts: 'dps',
  pctDommagesMelee: 'dpm', pctDommagesDistance: 'dpd',

  resNeutre: 'ren', resTerre: 'ret', resFeu: 'ref', resEau: 'ree', resAir: 'rea',
  resCritique: 'rec', resPoussee: 'rep',

  pctResNeutre: 'rpn', pctResTerre: 'rpt', pctResFeu: 'rpf', pctResEau: 'rpe',
  pctResAir: 'rpa', pctResMelee: 'rpm', pctResDistance: 'rpd',
});

/**
 * Chemin de l'icone d'une statistique, ou null si aucune ne convient.
 * @param {string} stat
 * @returns {string | null}
 */
export function iconeStat(stat) {
  const code = CODE_PAR_STAT[stat];
  return code ? `assets/stats/${code}.png` : null;
}

/** Couleur d'element, pour les pastilles de sort. */
export const COULEUR_ELEMENT = Object.freeze({
  neutre: '#b9a88a', terre: '#b98a4a', feu: '#e0644c',
  eau: '#4aa6e0', air: '#63c98a',
});

/** Icone officielle de l'element d'une ligne de degats. */
const STAT_ELEMENT = Object.freeze({
  neutre: 'dommagesNeutre',
  terre: 'dommagesTerre',
  feu: 'dommagesFeu',
  eau: 'dommagesEau',
  air: 'dommagesAir',
});

/**
 * Chemin de l'icone d'un element, ou null si l'element est inconnu.
 * @param {string} element
 */
export function iconeElement(element) {
  const stat = STAT_ELEMENT[element];
  return stat ? iconeStat(stat) : null;
}
