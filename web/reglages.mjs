/**
 * Reglages de depart et options de calcul de l'application.
 *
 * Tout ce qui decrit l'etat AVANT que le joueur n'y touche vit ici : les
 * conditions proposees, les options avec leur aide, et l'etat initial. Le
 * reste de l'application ne connait que des valeurs, jamais des libelles.
 */

/** Conditions proposees au demarrage. */
export const CONDITIONS_DEPART = Object.freeze([
  { stat: 'pa', target: 12, weight: 500, max: 12, absolute: false },
  { stat: 'pm', target: 6, weight: 500, max: null, absolute: false },
  { stat: 'vitalite', target: 4000, weight: 1, max: null, absolute: false },
  { stat: 'critique', target: 50, weight: 50, max: 100, absolute: false },
]);

/** Options de calcul proposees. */
export const OPTIONS = Object.freeze([
  { cle: 'distance', libelle: 'Degats a distance',
    aide: 'Coche : les coups comptent a distance. Decoche : ils comptent en melee.' },
  { cle: 'arme', libelle: 'Degats de l\'arme',
    aide: 'Ajoute les degats de l\'arme equipee au total optimise.\n'
      + 'L\'arme frappe autant de fois que ses utilisations par tour.' },
  { cle: 'armePaMin', libelle: 'PA de l\'arme (min)', type: 'nombre', min: 0, max: 12,
    aide: 'Le solveur ne propose que des armes qui coutent au moins ce nombre de PA.\n'
      + 'Zero : aucune limite. Une arme chere frappe fort : ce plancher ecarte\n'
      + 'les petites armes quand les PA sont la pour elle.' },
  { cle: 'armePaMax', libelle: 'PA de l\'arme (max)', type: 'nombre', min: 0, max: 12,
    aide: 'Le solveur ne propose que des armes qui coutent au plus ce nombre de PA.\n'
      + 'Zero : aucune limite. Une arme chere prend le tour aux sorts.' },
  { cle: 'armeLancersMin', libelle: 'Lancers de l\'arme (min)', type: 'nombre', min: 0, max: 4,
    aide: 'Le solveur ne propose que des armes qui frappent au moins ce nombre\n'
      + 'de fois par tour. Zero ou un : aucune limite.' },
  { cle: 'armePortee', libelle: 'Portee de l\'arme', type: 'liste',
    choix: [
      { valeur: '', nom: 'Indifferente' },
      { valeur: 'melee', nom: 'Corps a corps' },
      { valeur: 'distance', nom: 'A distance' },
    ],
    aide: 'Le solveur ne propose que des armes de cette portee.\n'
      + 'Une arme de portee superieure a une case frappe a distance :\n'
      + 'arcs, baguettes et dagues longues. Le calcul suit deja l\'arme choisie,\n'
      + 'ce reglage ne fait que restreindre le choix.' },
  { cle: 'armePorteeMin', libelle: 'Portee de l\'arme (min)', type: 'nombre', min: 0, max: 20,
    aide: 'Le solveur ne propose que des armes qui atteignent au moins ce nombre\n'
      + 'de cases. Trois pour une arme qui frappe jusqu\'a 3 PO.\n'
      + 'Zero : aucune limite.' },
  { cle: 'armeElementsMin', libelle: 'Elements de l\'arme (min)', type: 'nombre', min: 0, max: 5,
    aide: 'Le solveur ne propose que des armes qui frappent au moins ce nombre\n'
      + 'd\'elements differents. Trois pour une arme feu, eau et air.\n'
      + 'Zero : aucune limite.' },
  { cle: 'armeElementsMax', libelle: 'Elements de l\'arme (max)', type: 'nombre', min: 0, max: 5,
    aide: 'Le solveur ne propose que des armes qui frappent au plus ce nombre\n'
      + 'd\'elements differents. Un pour une arme mono-element, qui profite\n'
      + 'pleinement d\'une seule caracteristique. Zero : aucune limite.' },
  { cle: 'maitriseArme', libelle: 'Maitrise d\'arme',
    aide: 'Compte le bonus de maitrise d\'arme : de 300 a 360 de puissance\n'
      + 'sur les coups d\'arme, selon le taux critique.' },
  { cle: 'passifs', libelle: 'Passifs Dofus & Legendaires',
    aide: 'Compte les passifs en combat des Dofus et objets legendaires' },
  { cle: 'cibleTelefrag', libelle: 'Cible telefrag (Xelor)',
    aide: 'Compte les bonus des sorts quand la cible est telefrag :\n'
      + 'Horloge et Rayon Obscur frappent plus fort, Fletrissement monte a chaque\n'
      + 'lancer, Ralentissement vole 1 PA (dans le combo).' },
  { cle: 'toursSuivants', libelle: 'Sorts des tours suivants',
    aide: 'Compte les degats qui touchent aux tours suivants (Gousset, Sablier de Xelor,\n'
      + 'Fleche Devorante…). Decoche : seuls les degats du tour courant comptent.' },
  { cle: 'combo', libelle: 'Optimisateur de combo de sorts',
    aide: 'Choisit le meilleur enchainement de lancers sous le budget de PA du build.\n'
      + 'Le premier lancer d\'un sort qui genere un telefrag rend 2 PA.' },
  { cle: 'paReserves', libelle: 'PA a enlever', type: 'nombre', min: 0, max: 11,
    aide: 'PA gardes hors du combo (deplacement, sorts utilitaires).\n'
      + 'Exemple : 12 PA et 2 PA enleves donnent un budget de 10 PA.' },
  { cle: 'comboElements', libelle: 'Elements distincts (min)', type: 'nombre', min: 0, max: 4,
    aide: 'Le combo doit toucher au moins ce nombre d\'elements differents.\n'
      + 'Si le budget ne le permet pas, le combo couvre le maximum possible.' },
  { cle: 'comboUnLancer', libelle: '1 seul lancer par sort',
    aide: 'Coche : le combo lance chaque sort au plus une fois.\n'
      + 'La case « 1 max au combo » d\'un sort donne la meme limite, sort par sort.' },
  { cle: 'menaceCoup', libelle: 'Coup de reference', type: 'nombre', min: 50, max: 2000,
    aide: 'Degats bruts du coup type que vous prenez. Il sert a peser vos\n'
      + 'resistances fixes dans les « Pdv effectifs » : 30 de resistance fixe\n'
      + 'enleve 10 % d\'un coup de 300, mais 20 % d\'un coup de 150.\n'
      + 'Baissez-le si vous prenez beaucoup de petits coups.' },
  { cle: 'menacePlafond', libelle: 'Plafond de resistance (%)', type: 'nombre', min: 0, max: 100,
    aide: 'Le jeu plafonne chaque resistance en pourcentage a 50 pour un joueur.\n'
      + 'Au-dela, le calcul ignore le surplus. Montez-le a 60 si vous voulez\n'
      + 'garder une marge contre les vulnerabilites.' },
  { cle: 'menacePosition', libelle: 'Compter melee et distance',
    aide: 'Compte vos resistances melee et distance, moitie chacune : votre\n'
      + 'adversaire frappe tantot au contact, tantot de loin.\n'
      + 'Decoche : seuls les cinq elements comptent.' },
]);

/** Options numeriques qui n'ont de sens que quand le combo est actif. */
const OPTIONS_DU_COMBO = new Set(['paReserves', 'comboElements']);

/** Options qui n'ont de sens que quand les degats de l'arme comptent. */
const OPTIONS_DE_L_ARME = new Set([
  'armePaMin', 'armePaMax', 'armeLancersMin', 'armePortee', 'armePorteeMin',
  'armeElementsMin', 'armeElementsMax',
]);

/**
 * Options telles que le panneau les montre : valeur courante et etat grise.
 *
 * @param {Record<string, any>} options Valeurs de l'etat.
 * @returns {any[]}
 */
export function optionsAffichees(options) {
  return OPTIONS.map((o) => ({
    ...o,
    actif: options[o.cle],
    // Le champ des PA reserves ne sert que quand le combo est actif.
    ...(OPTIONS_DU_COMBO.has(o.cle) ? { inactif: !options.combo } : {}),
    // Les bornes de l'arme ne servent que si l'arme compte dans les degats.
    ...(OPTIONS_DE_L_ARME.has(o.cle) ? { inactif: !options.arme } : {}),
  }));
}

/** Libelle de chaque option, par cle : les simulations les lisent ainsi. */
export const LIBELLES_OPTIONS = Object.freeze(
  Object.fromEntries(OPTIONS.map((o) => [o.cle, o.libelle])),
);

/** Six caracteristiques a une meme valeur. */
const parCaracteristique = (valeur) => ({
  vitalite: valeur, sagesse: valeur, force: valeur,
  intelligence: valeur, chance: valeur, agilite: valeur,
});

/** Repartition des points sans aucun investissement. */
export const ALLOCATION_VIDE = Object.freeze(parCaracteristique(0));

/**
 * Etat d'un visiteur qui arrive pour la premiere fois.
 *
 * Une fabrique et non une constante : l'etat porte des Map et des Set, qu'un
 * gel ne protegerait pas.
 */
export function etatInitial() {
  return {
    niveau: 190, classe: 5, sexe: 0,
    filtre: null, filtreType: null, recherche: '', filtrePk: false,
    equipped: new Map(),
    posees: new Set(),
    bannis: new Set(),
    verrous: new Set(),
    /** Pieces que le joueur possede deja : les porter ne coute aucun achat. */
    possedees: new Set(),
    /**
     * Stuff porte en jeu, fige d'un clic. Il sert de point de comparaison et ne
     * bouge pas quand on essaie une proposition : sans cela, porter un candidat
     * remettrait le compte des pieces a changer a zero.
     */
    reference: null,
    /** Pieces que le solveur peut demander d'acheter, au plus. Zero : aucune. */
    changementsMax: 0,
    filtreStat: { stat: '', op: '>=', valeur: 0 },
    conditions: [...CONDITIONS_DEPART],
    sorts: [],
    /** Autres builds distincts rendus par la derniere recherche. */
    candidats: [],
    /** Meilleur build pour chaque nombre de pieces a acheter. */
    paliers: [],
    /** Build le plus fort pour chaque tranche de points de vie. */
    survie: [],
    options: {
      distance: false, arme: false, maitriseArme: true, passifs: true, toursSuivants: false,
      cibleTelefrag: false,
      combo: false, paReserves: 0, comboElements: 0, comboUnLancer: false,
      // Bornes imposees aux armes que le solveur peut proposer. Zero : aucune.
      armePaMin: 0, armePaMax: 0, armeLancersMin: 0,
      armePortee: '', armePorteeMin: 0,
      armeElementsMin: 0, armeElementsMax: 0,
      // Modele d'adversaire qui sert aux points de vie effectifs.
      menaceCoup: 300, menacePlafond: 50, menacePosition: true,
    },
    allocation: { ...ALLOCATION_VIDE },
    // Valeur maximale que la recherche investit par caracteristique. `null` dit
    // « aucune limite » ; zero est une vraie limite, qui interdit d'investir.
    // Elle borne le curseur, pas son cout en points, et laisse libre ce que
    // l'equipement apporte. Elle bride le solveur, jamais la saisie a la main.
    limites: parCaracteristique(null),
    scrolls: parCaracteristique(false),
  };
}
