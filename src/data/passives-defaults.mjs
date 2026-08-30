/**
 * Passifs en combat par defaut des Dofus et objets legendaires.
 *
 * Les valeurs proviennent de la table utilisee par RoxxSolver (version 1.4.0),
 * extraite de leurs donnees publiques le 2026-08-30. Chaque entree donne
 * l'apport par defaut du passif ; certains passifs dependent du combat
 * (valeur entre min et max), la valeur par defaut reste alors prudente.
 */

/** Apport par defaut de chaque passif, par identifiant d'item. */
export const PASSIFS_DEFAUT = Object.freeze(new Map([
  [739, { fr: 'Dofus Turquoise', stats: { pctDommagesFinaux: 8 } }],
  [694, { fr: 'Dofus Pourpre', stats: { pctDommagesFinaux: 3 } }],
  [29136, { fr: 'Dofus Sylvestre', stats: { puissance: 48 } }],
  [8698, { fr: 'Dofus Nebuleux', stats: { pctDommagesFinaux: 5 } }],
  [6980, { fr: 'Dofus Vulbis', stats: { tacle: 20 } }],
  [31794, { fr: 'Dofoozbz', stats: { pctDommagesFinaux: 4 } }],
  [7754, { fr: 'Dofus Ocre', stats: { fuite: 20 } }],
  [26066, { fr: 'Dofus du Cauchemar', stats: { puissance: 50 } }],
  [32121, { fr: 'Clairvoyance de Meriana', stats: { retraitPa: 10, retraitPm: 10 } }],
  [32114, { fr: "Ardeur d'Oto Mustam", stats: { pctDommagesFinaux: 2 } }],
  [20366, { fr: 'Courage de Dame Jhessica', stats: { pctDommagesSorts: 1 } }],
  [20365, { fr: 'Audace de Dodge', stats: { pm: 1, critique: 10 } }],
  [20363, { fr: 'Bottes de Mille Lieues', stats: { pm: 1 } }],
  [20362, { fr: 'Noblesse de Jahash Jurgen', stats: {
    pctResTerre: 4, pctResAir: 4, pctResEau: 4, pctResFeu: 4, pctResNeutre: 4,
  } }],
  [20359, { fr: 'Couronne de Bram Barbe-Monde', stats: { pctDommagesFinaux: 2 } }],
  [20358, { fr: 'Trompe-la-Mort', stats: { pctDommagesFinaux: 7 } }],
  [32117, { fr: 'Jugement de Thanatena', stats: { pctDommagesFinaux: 4 } }],
  [20356, { fr: 'Plume de Buhorado', stats: { dommagesPoussee: 20 } }],
]));

/**
 * Construit la configuration de passifs a partir des valeurs par defaut.
 * @returns {Record<number, {enabled: boolean, stats: Record<string, number>}>}
 */
export function configPassifsDefaut() {
  const config = {};
  for (const [id, passif] of PASSIFS_DEFAUT) {
    config[id] = { enabled: true, stats: { ...passif.stats } };
  }
  return config;
}

/**
 * Apport passif d'un item, ou null s'il n'en porte pas.
 * @param {number} itemId
 */
export function passifDe(itemId) {
  return PASSIFS_DEFAUT.get(itemId) ?? null;
}
