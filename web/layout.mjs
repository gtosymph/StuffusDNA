/**
 * Organisation des panneaux : quelles statistiques, dans quel ordre, et
 * quels emplacements de chaque cote du personnage.
 */

/** Statistiques du panneau "Principales", lues deux par ligne. */
export const PRINCIPALES = Object.freeze([
  ['pdv', 'Pdv'], ['initiative', 'Initiative'],
  ['prospection', 'Prospection'], ['critique', '% Critique'],
  ['pa', 'PA'], ['invocations', 'Invocations'],
  ['pm', 'PM'], ['po', 'PO'],
]);

/** Statistiques du panneau "Caracteristiques". */
export const CARACTERISTIQUES = Object.freeze([
  ['vitalite', 'Vitalite'], ['sagesse', 'Sagesse'],
  ['force', 'Force'], ['intelligence', 'Intelligence'],
  ['chance', 'Chance'], ['agilite', 'Agilite'],
  ['puissance', 'Puissance'], ['pctDommagesFinaux', '% Dommages finaux'],
]);

/** Statistiques du panneau "Secondaires". */
export const SECONDAIRES = Object.freeze([
  ['fuite', 'Fuite'], ['tacle', 'Tacle'],
  ['esquivePa', 'Esquive PA'], ['retraitPa', 'Retrait PA'],
  ['esquivePm', 'Esquive PM'], ['retraitPm', 'Retrait PM'],
  ['pods', 'Pods'], ['soins', 'Soins'],
]);

/**
 * Statistiques du panneau "Dommages", dans l'ordre de lecture.
 *
 * Le panneau se met sur deux paires par ligne quand la place le permet, et sur
 * une seule quand la colonne se resserre. La liste suit donc un ordre lineaire :
 * lue a la file ou par rangees de deux, elle garde ses groupes ensemble.
 *
 * Trois groupes se suivent : les dommages fixes par element, les dommages fixes
 * lies au coup, puis les pourcentages.
 */
export const DOMMAGES = Object.freeze([
  ['dommages', 'Dommages'], ['dommagesNeutre', 'Dommages Neutre'],
  ['dommagesTerre', 'Dommages Terre'], ['dommagesFeu', 'Dommages Feu'],
  ['dommagesEau', 'Dommages Eau'], ['dommagesAir', 'Dommages Air'],
  ['dommagesCritiques', 'Dommages Critiques'], ['dommagesPoussee', 'Dommages Poussee'],
  ['pctDommagesArmes', '% Dommages Armes'], ['pctDommagesSorts', '% Dommages Sorts'],
  ['pctDommagesMelee', '% Dommages Melee'], ['pctDommagesDistance', '% Dommages Distance'],
]);

/** Statistiques du panneau "Resistances". */
export const RESISTANCES = Object.freeze([
  ['resNeutre', 'Res. Neutre'], ['pctResNeutre', '% Res. Neutre'],
  ['resTerre', 'Res. Terre'], ['pctResTerre', '% Res. Terre'],
  ['resFeu', 'Res. Feu'], ['pctResFeu', '% Res. Feu'],
  ['resEau', 'Res. Eau'], ['pctResEau', '% Res. Eau'],
  ['resAir', 'Res. Air'], ['pctResAir', '% Res. Air'],
  ['resCritique', 'Res. Critique'], ['pctResMelee', '% Res. Melee'],
  ['resPoussee', 'Res. Poussee'], ['pctResDistance', '% Res. Distance'],
]);

/** Cases posees a gauche du personnage, de haut en bas. */
export const SLOTS_GAUCHE = Object.freeze([
  'amulette:0', 'cape:0', 'anneau:0', 'ceinture:0', 'bottes:0',
]);

/** Cases posees a droite du personnage, de haut en bas. */
export const SLOTS_DROITE = Object.freeze([
  'chapeau:0', 'arme:0', 'anneau:1', 'bouclier:0', 'monture:0',
]);

/** Cases de la rangee basse. */
export const SLOTS_ARTEFACTS = Object.freeze([
  'artefact:0', 'artefact:1', 'artefact:2', 'artefact:3', 'artefact:4', 'artefact:5',
]);

/** Libelle court de chaque case. */
export const LIBELLE_CASE = Object.freeze({
  'amulette:0': 'Amulette', 'cape:0': 'Cape', 'anneau:0': 'Anneau 1',
  'ceinture:0': 'Ceinture', 'bottes:0': 'Bottes', 'chapeau:0': 'Chapeau',
  'arme:0': 'Arme', 'anneau:1': 'Anneau 2', 'bouclier:0': 'Bouclier',
  'monture:0': 'Monture / Familier',
  'artefact:0': 'Dofus 1', 'artefact:1': 'Dofus 2', 'artefact:2': 'Dofus 3',
  'artefact:3': 'Dofus 4', 'artefact:4': 'Dofus 5', 'artefact:5': 'Dofus 6',
});
