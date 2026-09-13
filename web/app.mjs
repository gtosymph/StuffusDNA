/**
 * Orchestration de l'interface.
 * L'etat reste immuable : chaque changement produit un nouvel objet.
 */
import { loadCatalog } from './catalog-web.mjs';
import { avatarDeClasse, CLASSES, classeConnue, emblemeDeClasse, nomDeClasse } from './classes.mjs';
import { ajouterSimulation } from './simulations.mjs';
import { installerSimulations } from './simulations-panel.mjs';
import { paliersUtiles, renderPaliers, renderReglageProximite } from './proximite-panel.mjs';
import { defaultThreadCount, runSearch } from './solver-client.mjs';
import { normaliserIntensite } from '../src/solver/intensite.mjs';
import { CLES, ecrireJson, lireJson } from './stockage.mjs';
import * as vue from './render.mjs';
import * as plan from './layout.mjs';
import { dessinerEvolution } from './chart.mjs';
import { loadSpells, versSortMoteur } from './spells-data.mjs';
import { fermerFiche, ouvrirFiche } from './item-panel.mjs';
import { renderPoints } from './points-panel.mjs';
import { fermerPicker, ouvrirPicker } from './spell-picker.mjs';
import { cacherBulle } from './hover-card.mjs';
import { chargerSet, enleverSet, enregistrerSet, lireSets } from './presets.mjs';

import { SLOTS } from '../src/data/slots.mjs';
import { STATS, STAT_KEYS, STAT_LABELS } from '../src/data/stats.mjs';
import { computeBuild } from '../src/engine/build.mjs';
import { availablePoints } from '../src/engine/characteristics.mjs';
import { computeSpellDetail, weaponAttack } from '../src/engine/damage.mjs';
import { normalizePassives } from '../src/data/passives.mjs';
import { ajouterLigne, enleverLigne, modifierLigne } from '../src/data/spell-lines.mjs';
import { configPassifsDefaut } from '../src/data/passives-defaults.mjs';
import { scoreBuild, SEARCH_MODES } from '../src/solver/score.mjs';
import { apportsPieces, sensibiliteStats } from '../src/solver/explain.mjs';

const $ = (id) => document.getElementById(id);

/** Conditions proposees au demarrage. */
const CONDITIONS_DEPART = [
  { stat: 'pa', target: 12, weight: 500, max: 12, absolute: false },
  { stat: 'pm', target: 6, weight: 500, max: null, absolute: false },
  { stat: 'vitalite', target: 4000, weight: 1, max: null, absolute: false },
  { stat: 'critique', target: 50, weight: 50, max: 100, absolute: false },
];

/** Sort propose au demarrage. */
const SORT_DEPART = {
  name: 'Sort principal', apCost: 4, castsPerTurn: 2, baseCrit: 0,
  lines: [{ element: 'feu', min: 20, max: 24, critMin: 24, critMax: 28, source: 'sort', range: null }],
};

/** Options de calcul proposees. */
const OPTIONS = [
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
];

/** Options numeriques qui n'ont de sens que quand le combo est actif. */
const OPTIONS_DU_COMBO = new Set(['paReserves', 'comboElements']);

/** Options qui n'ont de sens que quand les degats de l'arme comptent. */
const OPTIONS_DE_L_ARME = new Set([
  'armePaMin', 'armePaMax', 'armeLancersMin', 'armePortee', 'armePorteeMin',
  'armeElementsMin', 'armeElementsMax',
]);

let etat = {
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
  conditions: CONDITIONS_DEPART,
  sorts: [],
  /** Autres builds distincts rendus par la derniere recherche. */
  candidats: [],
  /** Meilleur build pour chaque nombre de pieces a acheter. */
  paliers: [],
  options: {
    distance: false, arme: false, maitriseArme: true, passifs: true, toursSuivants: false,
    cibleTelefrag: false,
    combo: false, paReserves: 0, comboElements: 0, comboUnLancer: false,
    // Bornes imposees aux armes que le solveur peut proposer. Zero : aucune.
    armePaMin: 0, armePaMax: 0, armeLancersMin: 0,
    armePortee: '', armePorteeMin: 0,
    armeElementsMin: 0, armeElementsMax: 0,
  },
  allocation: { vitalite: 0, sagesse: 0, force: 0, intelligence: 0, chance: 0, agilite: 0 },
  // Valeur maximale que la recherche investit par caracteristique. `null` dit
  // « aucune limite » ; zero est une vraie limite, qui interdit d'investir.
  // Elle borne le curseur, pas son cout en points, et laisse libre ce que
  // l'equipement apporte. Elle bride le solveur, jamais la saisie a la main.
  limites: {
    vitalite: null, sagesse: null, force: null,
    intelligence: null, chance: null, agilite: null,
  },
  scrolls: { vitalite: false, sagesse: false, force: false, intelligence: false, chance: false, agilite: false },
};

let catalogue = null;
let classesSorts = null;
let recherche = null;
/**
 * Promesse de la boucle de recherche en cours.
 *
 * Elle se resout quand la boucle a fini son menage, donc apres « recherche =
 * null ». Un depart de zero l'attend : sans cela, il relancerait avant que la
 * boucle precedente ait rendu la main, et le nouveau depart serait refuse.
 */
/**
 * Vrai tant que le personnage suit le meilleur build de la recherche.
 *
 * Chaque vague qui ameliore le score repose son build sur le personnage. Un
 * joueur qui porte une proposition a la main pendant ce temps voyait son
 * choix efface a la vague suivante : le bouton « Porter » paraissait inerte.
 * Un choix a la main arrete donc le suivi jusqu'a la prochaine recherche.
 */
let suiviAuto = true;

let boucle = null;
/** Numero du dernier depart demande : il departage deux clics rapproches. */
let departs = 0;
/** Historique du score par fil, pour la courbe. */
let historiques = [];
/** Vrai pendant une recherche : la courbe se redessine a chaque avancee. */
let rechercheEnCours = false;

/** Nombre d'etats gardes pour l'annulation. */
const ETATS_GARDES = 30;

/**
 * Etats precedents, du plus ancien au plus recent.
 *
 * L'etat est immuable : garder les versions precedentes suffit a tout
 * annuler, sans code special par action. « Vider », « Bannir les resultats »
 * et « Recommencer » deviennent ainsi reversibles, sans demander confirmation
 * a chaque fois.
 */
const passe = [];

const setEtat = (patch) => {
  passe.push(etat);
  if (passe.length > ETATS_GARDES) passe.shift();
  etat = { ...etat, ...patch };
  sauverEtat();
  render();
};

/** Revient a l'etat precedent, s'il y en a un. */
function annuler() {
  const precedent = passe.pop();
  if (!precedent) {
    message('Rien a annuler.', 'info');
    return;
  }
  etat = precedent;
  sauverEtat();
  render();
}

/** Cle de l'etat persistant dans le navigateur. */
const CLE_ETAT = CLES.etat;

/**
 * Version du format des limites de caracteristique.
 *
 * La version 1 se servait de zero pour dire « aucune limite ». La version 2
 * distingue les deux demandes : le champ vide ne borne rien, zero interdit
 * d'investir. Sans cette marque, un etat range par l'ancienne version
 * fermerait les six caracteristiques d'un coup.
 */
const VERSION_LIMITES = 2;

/**
 * Remet les limites d'un etat range au format courant.
 *
 * @param {any} data Etat lu du rangement.
 * @returns {Record<string, number|null>}
 */
function migrerLimites(data) {
  if (data.limitesVersion >= VERSION_LIMITES) return data.limites;

  // Version 1 : les zeros voulaient dire « aucune limite ».
  const migrees = {};
  for (const [cle, valeur] of Object.entries(data.limites)) {
    migrees[cle] = Number(valeur) > 0 ? Number(valeur) : null;
  }
  return migrees;
}

/** Enregistre l'etat courant : un rechargement ne perd plus le travail. */
function sauverEtat() {
  ecrireJson(CLE_ETAT, {
    niveau: etat.niveau, classe: etat.classe, sexe: etat.sexe,
    conditions: etat.conditions, sorts: etat.sorts, options: etat.options,
    allocation: etat.allocation, scrolls: etat.scrolls,
    limites: etat.limites, limitesVersion: VERSION_LIMITES,
    bannis: [...etat.bannis],
    possedees: [...etat.possedees],
    reference: etat.reference,
    changementsMax: etat.changementsMax,
    verrous: [...etat.verrous],
    equipped: [...etat.equipped.entries()].map(([cle, piece]) => [cle, piece.id]),
    posees: [...etat.posees],
  });
}

/** Cle du dernier resultat de recherche dans le navigateur. */
const CLE_RESULTAT = CLES.resultat;

/** Nombre maximal de points de courbe gardes par fil dans le navigateur. */
const POINTS_GARDES = 600;

/** Delai minimal entre deux dessins du graphe pendant une recherche. */
const INTERVALLE_GRAPHE_MS = 250;

/** Delai minimal entre deux enregistrements de la courbe pendant une recherche. */
const INTERVALLE_ENREGISTREMENT_MS = 3000;

/**
 * Enregistre la courbe et le compteur : un rechargement garde le resultat.
 * Les courbes sont echantillonnees pour rester legeres.
 */
function sauverResultat(generationMax, fils) {
  ecrireJson(CLE_RESULTAT, {
    generationMax,
    fils,
    intensite: $('intensite').value,
    historiques: historiques.map(({ seed, history }) => {
      const pas = Math.max(1, Math.ceil(history.length / POINTS_GARDES));
      const points = [];
      for (let i = 0; i < history.length; i += pas) points.push(history[i]);
      if (history.length > 0 && points[points.length - 1] !== history[history.length - 1]) {
        points.push(history[history.length - 1]);
      }
      return { seed, history: points };
    }),
  });
}

/** Reprend le dernier resultat de recherche enregistre. */
function reprendreResultat() {
  const data = lireJson(CLE_RESULTAT, null);
  if (!data || !Array.isArray(data.historiques)) return;

  historiques = data.historiques.filter((h) => Array.isArray(h?.history));
  if (Number.isFinite(data.fils) && data.fils >= 1) $('fils').value = String(data.fils);
  if (data.intensite != null) $('intensite').value = String(data.intensite);
  if (Number.isFinite(data.generationMax) && data.generationMax > 0) {
    $('compteur-generations').textContent =
      `generation ${data.generationMax.toLocaleString('fr-FR')} — en pause`;
  }
}

/** Reprend l'etat enregistre, une fois le catalogue disponible. */
function reprendreEtat() {
  const data = lireJson(CLE_ETAT, null);
  if (!data || typeof data !== 'object') return;

  const equipped = new Map();
  for (const [cle, id] of data.equipped ?? []) {
    const piece = catalogue.itemById.get(id);
    if (piece) equipped.set(cle, piece);
  }

  etat = {
    ...etat,
    ...(Number.isFinite(data.niveau) ? { niveau: data.niveau } : {}),
    ...(Number.isFinite(data.classe) ? { classe: classeConnue(data.classe) } : {}),
    ...(Number.isFinite(data.sexe) ? { sexe: data.sexe } : {}),
    ...(Array.isArray(data.conditions) ? { conditions: data.conditions } : {}),
    ...(Array.isArray(data.sorts) ? { sorts: data.sorts } : {}),
    ...(data.options ? { options: { ...etat.options, ...data.options } } : {}),
    ...(data.allocation ? { allocation: { ...etat.allocation, ...data.allocation } } : {}),
    ...(data.scrolls ? { scrolls: { ...etat.scrolls, ...data.scrolls } } : {}),
    ...(data.limites ? { limites: { ...etat.limites, ...migrerLimites(data) } } : {}),
    ...(Array.isArray(data.bannis) ? { bannis: new Set(data.bannis) } : {}),
    ...(Array.isArray(data.possedees) ? { possedees: new Set(data.possedees) } : {}),
    ...(data.reference?.itemIds ? { reference: data.reference } : {}),
    ...(Number.isFinite(data.changementsMax) ? { changementsMax: data.changementsMax } : {}),
    ...(Array.isArray(data.verrous) ? { verrous: new Set(data.verrous) } : {}),
    equipped,
    posees: new Set(data.posees ?? []),
  };

  $('niveau').value = String(etat.niveau);
  $('classe').value = String(etat.classe);
  $('sexe').value = String(etat.sexe);
}

function message(texte, type = 'info') {
  $('message').replaceChildren(texte ? vue.el('div', { class: `message ${type}`, text: texte }) : '');
}

/**
 * Applique les options aux lignes des sorts.
 * Comme sur RoxxSolver, un coup compte en melee quand l'option distance
 * est decochee : le jeu applique toujours l'une des deux familles.
 */
function sortsCalcules() {
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

/** Passifs actifs selon l'option, prepares une seule fois. */
let passifsMemo = null;
function passifsActifs() {
  if (!etat.options.passifs) return null;
  passifsMemo ??= normalizePassives(configPassifsDefaut(), new Set(STAT_KEYS)).passives;
  return passifsMemo;
}

/** Attaque de l'arme equipee, si l'option la compte dans les degats. */
function attaqueArme() {
  if (!etat.options.arme) return null;
  const arme = etat.equipped.get('arme:0');
  if (!arme) return null;
  // La portee de l'arme suit l'arme (melee sauf arme a distance), comme
  // dans le calcul de reference ; l'option distance ne touche que les sorts.
  return weaponAttack(arme, { maitrise: etat.options.maitriseArme });
}

/** Sorts et attaque d'arme comptes dans le score affiche. */
function attaquesAffichees() {
  const attaque = attaqueArme();
  return attaque ? [...sortsCalcules(), attaque] : sortsCalcules();
}

/**
 * Rafraichit les sorts enregistres avant la refonte des donnees.
 *
 * Ces sorts se reconnaissent a l'absence du champ exclusiveGroup. Leurs
 * lignes de degats venaient de l'ancienne source, qui doublait certaines
 * lignes : le catalogue corrige fait foi. Un sort deja a jour reste intact,
 * modifications de l'utilisateur comprises.
 */
function enrichirSorts() {
  const complet = (s) => s.exclusiveGroup !== undefined && s.telefragCible !== undefined;
  if (etat.sorts.every(complet)) return;
  refreshSortsAnciens();
  completerTelefrag();
  sauverEtat();
}

/**
 * Complete les bonus « cible telefrag » des sorts enregistres avant leur
 * extraction, sans toucher au reste de leur definition.
 */
function completerTelefrag() {
  const parId = new Map();
  for (const classe of classesSorts ?? []) {
    for (const s of classe.spells ?? []) parId.set(s.id, s);
  }

  etat.sorts = etat.sorts.map((sort) => {
    if (sort.telefragCible !== undefined) return sort;

    const catalogue = parId.get(sort.id);
    const accessibles = (catalogue?.variants ?? []).filter((v) => v.level <= etat.niveau);
    const variante = accessibles[accessibles.length - 1];

    return { ...sort, telefragCible: variante?.telefragCible ?? null };
  });
}

/** Reconstruit chaque sort d'avant la refonte depuis le catalogue corrige. */
function refreshSortsAnciens() {
  const parId = new Map();
  for (const classe of classesSorts ?? []) {
    for (const s of classe.spells ?? []) parId.set(s.id, s);
  }

  etat.sorts = etat.sorts.map((ancien) => {
    if (ancien.exclusiveGroup !== undefined) return ancien;

    const catalogue = parId.get(ancien.id);
    if (!catalogue) return { ...ancien, exclusiveGroup: null };

    // Variante la plus haute accessible au niveau du personnage.
    const accessibles = (catalogue.variants ?? []).filter((v) => v.level <= etat.niveau);
    const variante = accessibles[accessibles.length - 1]
      ?? (catalogue.variants ?? [])[0];
    if (!variante) return { ...ancien, exclusiveGroup: catalogue.exclusiveGroup ?? null };

    return versSortMoteur({ ...catalogue, ...variante, critRate: variante.critRate });
  });
}

/** Classe choisie dans le catalogue de sorts. */
function classeCourante() {
  return classesSorts?.find((c) => c.id === etat.classe) ?? null;
}

/** Ajoute une condition sur une statistique, si elle n'y est pas deja. */
function suivreStat(stat) {
  if (etat.conditions.some((c) => c.stat === stat)) {
    message(`Une condition porte deja sur "${STAT_LABELS[stat]}".`, 'info');
    return;
  }
  const actuel = buildCourant()?.stats?.[stat] ?? 0;
  // L'objectif part de la valeur atteinte : a l'utilisateur de la relever.
  setEtat({ conditions: [...etat.conditions, {
    stat, target: Math.max(0, Math.round(actuel)), weight: 1, max: null, absolute: false,
  }] });
}

function buildCourant() {
  if (!catalogue) return null;
  return computeBuild(
    {
      items: [...etat.equipped.values()],
      level: etat.niveau,
      allocation: etat.allocation,
      scrolls: etat.scrolls,
      passives: passifsActifs(),
      profile: { classe: etat.classe, sexe: etat.sexe },
    },
    catalogue.setById,
  );
}

function objectif() {
  const enDegats = etat.sorts.length > 0 || etat.options.arme;
  return {
    conditions: etat.conditions,
    spells: sortsCalcules(),
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

function itemsFiltres() {
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

/** Bannit d'un coup toutes les pieces qui passent les filtres du catalogue. */
function bannirResultats() {
  const cibles = itemsFiltres().filter((item) => !etat.bannis.has(item.id));
  if (cibles.length === 0) {
    message('Aucune piece a bannir dans ces resultats.', 'info');
    return;
  }

  const bannis = new Set(etat.bannis);
  const verrous = new Set(etat.verrous);
  const equipped = new Map(etat.equipped);
  const posees = new Set(etat.posees);

  for (const item of cibles) {
    bannis.add(item.id);
    verrous.delete(item.id);
    for (const [cle, piece] of equipped) {
      if (piece.id === item.id) { equipped.delete(cle); posees.delete(cle); }
    }
  }

  setEtat({ bannis, verrous, equipped, posees });
  message(`${cibles.length} piece(s) bannie(s). « Autoriser » sur ces memes filtres annule.`, 'info');
}

/** Autorise de nouveau toutes les pieces bannies qui passent les filtres. */
/**
 * Marque comme possedees les pieces qui passent les filtres.
 *
 * Une piece possedee dort en banque : la porter ne demande aucun achat, et
 * elle ne compte donc pas dans les pieces a changer.
 */
function posseder(actif) {
  const cibles = itemsFiltres()
    .filter((item) => etat.possedees.has(item.id) !== actif);
  if (cibles.length === 0) {
    message(actif
      ? 'Toutes ces pieces sont deja marquees comme possedees.'
      : 'Aucune piece possedee dans ces resultats.', 'info');
    return;
  }

  const possedees = new Set(etat.possedees);
  for (const item of cibles) {
    if (actif) possedees.add(item.id);
    else possedees.delete(item.id);
  }
  setEtat({ possedees });
  message(actif
    ? `${cibles.length} piece(s) marquee(s) comme possedees : elles ne coutent plus d'achat.`
    : `${cibles.length} piece(s) enlevee(s) de votre banque.`, 'info');
}

/**
 * Met une piece dans l'inventaire, ou l'en enleve.
 *
 * @param {any} item
 */
function basculerPossedee(item) {
  const possedees = new Set(etat.possedees);
  const avait = possedees.has(item.id);
  if (avait) possedees.delete(item.id);
  else possedees.add(item.id);

  setEtat({ possedees });
  message(avait
    ? `${item.fr} enlevee de votre inventaire.`
    : `${item.fr} ajoutee a votre inventaire : elle ne compte plus comme un achat.`, 'info');
}

/** Enleve une piece de celles que le joueur possede. */
function oublierPossedee(id) {
  const possedees = new Set(etat.possedees);
  possedees.delete(id);
  setEtat({ possedees });
}

/* ------------------------------------------------ Stuff de reference --- */

/**
 * Fige le build pose comme stuff porte en jeu.
 *
 * Le piege est de figer un build que le solveur vient de trouver : il est deja
 * le meilleur connu, aucun achat ne le battra, et le panneau n'a plus rien a
 * dire. La reference n'a de sens que sur le stuff VRAIMENT porte en jeu.
 */
function figerReference() {
  const itemIds = [...etat.equipped.values()].map((piece) => piece.id);
  if (itemIds.length === 0) {
    message('Posez d\'abord les pieces que vous portez en jeu.', 'alerte');
    return;
  }

  // Un build pose par le solveur ne porte aucune piece marquee « a la main ».
  const duSolveur = etat.posees.size === 0 && (etat.candidats ?? []).length > 0;

  setEtat({ reference: { itemIds, date: new Date().toISOString() } });
  message(duSolveur
    ? `Stuff de reference fige : ${itemIds.length} piece(s). Attention, ce build `
      + 'vient du solveur : aucun achat ne le battra. Posez votre stuff de jeu '
      + 'et figez-le de nouveau pour voir ce que chaque achat rapporterait.'
    : `Stuff de reference fige : ${itemIds.length} piece(s). `
      + 'Le solveur compte maintenant ce que chaque build demande d\'acheter.',
  duSolveur ? 'alerte' : 'info');
}

/** Enleve la reference : le solveur cherche de nouveau librement. */
function oublierReference() {
  setEtat({ reference: null, paliers: [] });
  message('Reference enlevee. Le solveur cherche de nouveau sans contrainte d\'achat.', 'info');
}

/** Repose le stuff de reference sur le personnage. */
function reprendreReference() {
  if (!etat.reference) return;
  porterAlaMain({ itemIds: etat.reference.itemIds });
  message('Stuff de reference repose.', 'info');
}

function autoriserResultats() {
  const cibles = itemsFiltres().filter((item) => etat.bannis.has(item.id));
  if (cibles.length === 0) {
    message('Aucune piece bannie dans ces resultats.', 'info');
    return;
  }
  const bannis = new Set(etat.bannis);
  for (const item of cibles) bannis.delete(item.id);
  setEtat({ bannis });
  message(`${cibles.length} piece(s) de nouveau autorisee(s).`, 'info');
}

/** Pose une piece dans la premiere case libre qui l'accepte. */
function equiper(item) {
  const slot = SLOTS.find((s) => s.key === item.slot);
  if (!slot) return;

  const equipped = new Map(etat.equipped);
  const posees = new Set(etat.posees);

  for (const [cle, piece] of equipped) {
    if (piece.id === item.id) { equipped.delete(cle); posees.delete(cle); }
  }

  let cible = null;
  for (let i = 0; i < slot.capacity; i += 1) {
    const cle = `${slot.key}:${i}`;
    if (!equipped.has(cle)) { cible = cle; break; }
  }
  cible ??= `${slot.key}:${slot.capacity - 1}`;

  equipped.set(cible, item);
  posees.add(cible);

  // Une arme a deux mains libere le bouclier, et reciproquement.
  if (item.slot === 'arme' && item.twoHanded) { equipped.delete('bouclier:0'); posees.delete('bouclier:0'); }
  if (item.slot === 'bouclier' && equipped.get('arme:0')?.twoHanded) {
    equipped.delete('arme:0'); posees.delete('arme:0');
  }

  setEtat({ equipped, posees });
}

/** Bannit une piece : le solveur ne la propose plus. Une piece portee tombe. */
function bannir(item) {
  const bannis = new Set(etat.bannis);
  const equipped = new Map(etat.equipped);
  const posees = new Set(etat.posees);

  if (bannis.has(item.id)) {
    bannis.delete(item.id);
    setEtat({ bannis });
    message(`« ${item.fr} » est de nouveau proposee au solveur.`, 'info');
    return;
  }

  bannis.add(item.id);
  const verrous = new Set(etat.verrous);
  verrous.delete(item.id);
  for (const [cle, piece] of equipped) {
    if (piece.id === item.id) { equipped.delete(cle); posees.delete(cle); }
  }
  setEtat({ bannis, verrous, equipped, posees });
  message(`« ${item.fr} » est bannie : le solveur ne la proposera plus.`, 'info');
}

/**
 * Verrouille une piece : elle reste dans le build, le solveur la garde.
 * Une piece verrouillee mais absente est d'abord equipee.
 */
function verrouiller(item) {
  const verrous = new Set(etat.verrous);

  if (verrous.has(item.id)) {
    verrous.delete(item.id);
    setEtat({ verrous });
    message(`« ${item.fr} » est deverrouillee.`, 'info');
    return;
  }

  verrous.add(item.id);
  const portee = [...etat.equipped.values()].some((p) => p.id === item.id);
  if (!portee) equiper(item);
  setEtat({ verrous });
  message(`« ${item.fr} » est verrouillee : le solveur la garde dans chaque build.`, 'info');
}

function retirer(cle) {
  const equipped = new Map(etat.equipped);
  const posees = new Set(etat.posees);
  const verrous = new Set(etat.verrous);
  const piece = equipped.get(cle);
  if (piece) verrous.delete(piece.id);
  equipped.delete(cle);
  posees.delete(cle);
  setEtat({ equipped, posees, verrous });
}

function changerCondition(index, cle, valeur) {
  const conditions = etat.conditions.map((c, i) => {
    if (i !== index) return c;
    if (cle === 'max') return { ...c, max: Number.isFinite(valeur) && valeur > 0 ? valeur : null };
    return { ...c, [cle]: valeur };
  });
  setEtat({ conditions });
}

/** Champs d'un sort qui comptent des lancers : jamais moins d'un. */
const LANCERS_MINIMUM = new Set(['repeats', 'castsPerTurn']);

function changerSort(index, cle, valeur) {
  const sorts = etat.sorts.map((sort, i) => {
    if (i !== index) return sort;
    // Un sort lance zero fois n'a pas de sens : le calcul retomberait sur
    // un lancer, et le champ montrerait un autre nombre que le total.
    if (LANCERS_MINIMUM.has(cle)) return { ...sort, [cle]: Math.max(1, Number(valeur) || 1) };
    if (!cle.startsWith('line.')) return { ...sort, [cle]: valeur };
    // "line.<rang>.<champ>" modifie une ligne de degats precise.
    const [, rang, champ] = cle.split('.');
    return modifierLigne(sort, Number(rang), champ, valeur);
  });
  setEtat({ sorts });
}

/**
 * Remplace un sort de la liste par sa version transformee.
 * @param {number} index
 * @param {(sort: any) => any} transformer
 */
function changerLignes(index, transformer) {
  setEtat({ sorts: etat.sorts.map((sort, i) => (i === index ? transformer(sort) : sort)) });
}

function render() {
  const build = buildCourant();
  const stats = build?.stats ?? null;

  // Les champs du personnage suivent l'etat, et pas seulement l'inverse :
  // « Annuler » et la remise d'une simulation le changent sans saisie. Le
  // champ en cours de frappe est laisse tranquille.
  for (const [id, valeur] of [['niveau', etat.niveau], ['classe', etat.classe], ['sexe', etat.sexe]]) {
    const champ = $(id);
    if (champ !== document.activeElement && champ.value !== String(valeur)) champ.value = String(valeur);
  }

  vue.renderOnglets($('onglets-slot'), etat.filtre,
    (key, type) => setEtat({ filtre: key, filtreType: type ?? null }), etat.filtreType);
  vue.renderCatalogue($('grille-items'), $('compte-items'), itemsFiltres(),
    (item) => ouvrirFiche(item, {
      onEquip: () => equiper(item),
      onBan: () => bannir(item),
      onLock: () => verrouiller(item),
      onPosseder: () => basculerPossedee(item),
      banni: etat.bannis.has(item.id),
      verrouille: etat.verrous.has(item.id),
      possedee: etat.possedees.has(item.id),
    }), etat.bannis, etat.possedees);

  const listeBannis = [...etat.bannis]
    .map((id) => catalogue?.itemById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.fr.localeCompare(b.fr, 'fr'));
  $('compte-bannis').textContent = String(listeBannis.length);
  vue.renderBannis($('bannis'), listeBannis, bannir);

  const listePossedees = [...etat.possedees]
    .map((id) => catalogue?.itemById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.fr.localeCompare(b.fr, 'fr'));
  $('compte-possedees').textContent = String(listePossedees.length);
  vue.renderBannis($('possedees'), listePossedees, (item) => oublierPossedee(item.id), {
    vide: 'Aucune piece marquee. Filtrez le catalogue, puis « J\'ai ces pieces ».',
    aide: 'cliquez pour l\'enlever de votre banque',
  });

  const suivies = new Set(etat.conditions.map((c) => c.stat));
  const options = { suivies, onPick: suivreStat };
  vue.renderPaires($('stats-principales'), plan.PRINCIPALES, stats, options);
  vue.renderPaires($('stats-caracteristiques'), plan.CARACTERISTIQUES, stats, options);
  vue.renderPaires($('stats-secondaires'), plan.SECONDAIRES, stats, options);
  vue.renderPaires($('stats-dommages'), plan.DOMMAGES, stats, options);
  vue.renderPaires($('stats-resistances'), plan.RESISTANCES, stats, options);

  const bilan = build?.allocation;
  const total = availablePoints(etat.niveau);
  $('points-utilises').textContent = bilan
    ? `${bilan.spent} / ${total} points depenses`
    : `${total} points au niveau ${etat.niveau}`;
  $('points-restants').textContent = bilan ? `${bilan.remaining} restants` : `${total} restants`;

  const voirPiece = (cle, item) => ouvrirFiche(item, {
    onRemove: () => retirer(cle),
    onBan: () => bannir(item),
    onLock: () => verrouiller(item),
    onPosseder: () => basculerPossedee(item),
    banni: etat.bannis.has(item.id),
    verrouille: etat.verrous.has(item.id),
    possedee: etat.possedees.has(item.id),
    stats,
  });
  vue.renderCases($('slots-gauche'), plan.SLOTS_GAUCHE, etat.equipped, etat.posees, voirPiece, etat.verrous, stats);
  vue.renderCases($('slots-droite'), plan.SLOTS_DROITE, etat.equipped, etat.posees, voirPiece, etat.verrous, stats);
  vue.renderCases($('slots-artefacts'), plan.SLOTS_ARTEFACTS, etat.equipped, etat.posees, voirPiece, etat.verrous, stats);

  // L'avatar vient des planches de l'encyclopedie Dofus 3, pas du composeur
  // de look d'Ankama : depuis Dofus 3 celui-ci rend le corps sans la tete.
  const image = $('avatar-image');
  const avatar = avatarDeClasse(etat.classe, etat.sexe);
  if (image.getAttribute('src') !== avatar) image.src = avatar;
  image.alt = nomDeClasse(etat.classe);
  image.hidden = false;
  $('avatar-note').textContent = `${etat.equipped.size} / 16 pieces`;

  $('compte-conditions').textContent = String(etat.conditions.length);
  vue.renderConditions($('corps-conditions'), etat.conditions, stats, STAT_LABELS, {
    onChange: changerCondition,
    onRemove: (i) => setEtat({ conditions: etat.conditions.filter((_, j) => j !== i) }),
  });

  $('compte-sorts').textContent = String(etat.sorts.length);

  vue.renderPuceSorts($('grille-sorts'), etat.sorts,
    (i) => setEtat({ sorts: etat.sorts.filter((_, j) => j !== i) }));

  const degats = stats ? sortsCalcules().map((s) => computeSpellDetail(s, stats)) : null;
  vue.renderSorts($('liste-sorts'), etat.sorts, degats, {
    onChange: changerSort,
    onRemove: (i) => setEtat({ sorts: etat.sorts.filter((_, j) => j !== i) }),
    onAjouterLigne: (i) => changerLignes(i, ajouterLigne),
    onEnleverLigne: (i, rang) => changerLignes(i, (sort) => enleverLigne(sort, rang)),
    compterDiffere: etat.options.toursSuivants === true,
  });

  const arme = attaqueArme();
  vue.renderArme($('carte-arme'), arme, arme && stats ? computeSpellDetail(arme, stats) : null);

  montrerCandidats(stats);
  montrerProximite(stats);
  montrerAnalyse(build, stats);

  $('annuler').disabled = passe.length === 0;

  renderPoints($('points'), { ...etat, stats }, {
    onPoints: (cle, valeur) => setEtat({ allocation: { ...etat.allocation, [cle]: Math.max(0, valeur) } }),
    onScroll: (cle, actif) => setEtat({ scrolls: { ...etat.scrolls, [cle]: actif } }),
    onLimite: (cle, valeur) => setEtat({
      limites: { ...etat.limites, [cle]: valeur === null ? null : Math.max(0, valeur) },
    }),
    onReset: () => setEtat({
      allocation: { vitalite: 0, sagesse: 0, force: 0, intelligence: 0, chance: 0, agilite: 0 },
    }),
  });

  // Le compte que les trophees verifient : (pieces − 1) par panoplie.
  $('compte-bonus').textContent = String((build?.sets ?? [])
    .reduce((n, s) => n + Math.max(0, s.pieces - 1), 0));
  vue.renderPanoplies($('panoplies'), build?.sets ?? [], catalogue?.setById ?? new Map(), STAT_LABELS, {
    itemById: catalogue?.itemById ?? new Map(),
    equippedIds: new Set([...etat.equipped.values()].map((p) => p.id)),
    onPick: (piece) => ouvrirFiche(piece, {
      onEquip: () => equiper(piece),
      onBan: () => bannir(piece),
      onLock: () => verrouiller(piece),
      banni: etat.bannis.has(piece.id),
      verrouille: etat.verrous.has(piece.id),
    }),
  });

  vue.renderOptions($('options'), OPTIONS.map((o) => ({
    ...o,
    actif: etat.options[o.cle],
    // Le champ des PA reserves ne sert que quand le combo est actif.
    ...(OPTIONS_DU_COMBO.has(o.cle) ? { inactif: !etat.options.combo } : {}),
    // Les bornes de l'arme ne servent que si l'arme compte dans les degats.
    ...(OPTIONS_DE_L_ARME.has(o.cle) ? { inactif: !etat.options.arme } : {}),
  })),
    (cle, actif) => setEtat({ options: { ...etat.options, [cle]: actif } }));

  remplirListesSets();
  dessinerEvolution($('graphe'), historiques, { enCours: rechercheEnCours });

  // Le score affiche compte les memes attaques que le solveur, arme comprise.
  if (stats) montrerScore(scoreBuild(stats, { ...objectif(), spells: attaquesAffichees() }), build);
}

/** Remplit les listes deroulantes des jeux enregistres. */
function remplirListesSets() {
  for (const [nature, id] of [['sorts', 'sets-sorts'], ['conditions', 'sets-conditions']]) {
    const noeud = $(id);
    const choisi = noeud.value;
    const jeux = lireSets(nature);

    noeud.replaceChildren(...(jeux.length === 0
      ? [vue.el('option', { value: '', text: 'aucun jeu enregistre' })]
      : jeux.map((j) => vue.el('option', { value: j.nom, text: j.nom }))));

    if (choisi && jeux.some((j) => j.nom === choisi)) noeud.value = choisi;
  }
}

function montrerScore(detail, build) {
  const noeud = $('score');
  noeud.textContent = Math.round(detail.score).toLocaleString('fr-FR');
  noeud.className = `score ${detail.satisfied ? 'pos' : 'neg'}`;
  // Sans sort ni arme, le score ne mesure pas des degats mais la marge prise
  // sur les conditions : l'annoncer « degats totaux » trompait la lecture.
  const enDegats = objectif().mode === SEARCH_MODES.DAMAGE;
  $('score-libelle').textContent = detail.satisfied
    ? (enDegats ? 'Degats totaux' : 'Marge sur les conditions')
    : 'Conditions non satisfaites';

  const invalides = build?.invalid?.length ?? 0;
  const marge = enDegats ? '' : ' Le score somme ce que le build depasse.';
  $('score-note').textContent = detail.satisfied
    ? `Toutes les conditions sont tenues.${marge}${invalides ? ` ${invalides} piece(s) non equipable(s).` : ''}`
    : `${detail.unmet.length} condition(s) en defaut.${invalides ? ` ${invalides} piece(s) non equipable(s).` : ''}`;

  vue.renderCombo($('carte-combo'), detail.combo ?? null, {
    onAppliquer: (combo) => {
      const sorts = sortsDuCombo(combo);
      if (sorts.length === 0) return;
      setEtat({ sorts });
      message(`La liste des sorts reprend le combo : ${sorts.length} sort(s).`, 'info');
    },
    onGarder: (combo) => {
      const sorts = sortsDuCombo(combo);
      if (sorts.length === 0) return;
      const nom = window.prompt('Nom du jeu de sorts :', 'combo');
      if (nom === null) return;
      try {
        enregistrerSet('sorts', nom, sorts);
        remplirListesSets();
        $('sets-sorts').value = nom.trim();
        message(`Jeu de sorts « ${nom.trim()} » enregistre depuis le combo.`, 'info');
      } catch (error) {
        message(error.message, 'erreur');
      }
    },
  });
}

/**
 * Sorts retenus par le combo, au format de la liste.
 *
 * Chaque sort prend le nombre de lancers que le combo lui a donne, dans
 * « repeats » : c'est ce champ que les degats comptent, combo decoche
 * compris. « castsPerTurn » reste la limite du jeu, elle n'est pas touchee.
 *
 * L'attaque de l'arme ne se transpose pas, elle n'est pas un sort : ses
 * lancers se reglent sur sa propre carte.
 */
function sortsDuCombo(combo) {
  const parId = new Map(etat.sorts.map((s) => [s.id, s]));

  return combo.lancers
    .map((lancer) => {
      const base = parId.get(lancer.id);
      return base ? { ...base, repeats: lancer.lancers } : null;
    })
    .filter(Boolean);
}

/**
 * Lance une recherche continue.
 * @param {{deZero?: boolean}} [choix] deZero : population neuve, sans le
 *   build courant en graine — pour repartir apres un changement de reglages.
 */
async function lancer(choix = {}) {
  if (!catalogue) return;
  const deZero = choix.deZero === true;

  const jeton = (departs += 1);

  // Une recherche tourne deja. « Lancer » n'a alors rien a dire, mais
  // « Recommencer » veut justement couper celle-ci pour repartir de zero.
  if (recherche) {
    if (!deZero) return;
    recherche.abandon();
    await boucle;
    // Deux clics rapproches attendent la meme boucle : seul le dernier part.
    if (jeton !== departs) return;
  }

  let finBoucle;
  boucle = new Promise((resolve) => { finBoucle = resolve; });

  // Une recherche neuve rend la main au solveur et efface ses propositions :
  // celles d'avant repondaient a d'autres reglages, les garder a l'ecran
  // ferait porter un build qui ne correspond plus a ce qui est demande.
  suiviAuto = true;
  if ((etat.candidats ?? []).length > 0 || (etat.paliers ?? []).length > 0) {
    setEtat({ candidats: [], paliers: [] });
  }

  const fils = Math.max(1, Math.min(8, Number($('fils').value) || 1));
  const intensite = normaliserIntensite($('intensite').value);

  $('lancer').disabled = true;
  // « Recommencer » reste actif : il coupe la recherche en cours et repart.
  $('recommencer').disabled = false;
  $('arreter').disabled = false;
  message(deZero ? 'Nouvelle recherche, population neuve.' : '');
  $('etat-fils').replaceChildren();

  rechercheEnCours = true;

  const suivi = new Map();
  // Chaque fil accumule sa courbe, vague apres vague. Une reprise repart des
  // courbes existantes : le graphe continue au lieu de se remettre a zero.
  const courbes = new Map();
  let decalage = 0;
  if (deZero) {
    historiques = [];
  } else {
    for (const { seed, history } of historiques) courbes.set(seed, [...history]);
    for (const { history } of historiques) decalage = Math.max(decalage, history.length - 1);
  }

  // Meilleur score deja applique a l'interface : le build ne bouge que s'il monte.
  let meilleurApplique = Number.NEGATIVE_INFINITY;
  let dernierGraphe = 0;
  let dernierEnregistrement = 0;
  let generationMax = decalage;
  $('compteur-generations').textContent = decalage > 0
    ? `reprise a la generation ${decalage.toLocaleString('fr-FR')}…`
    : 'demarrage…';

  const montrerFils = () => {
    $('etat-fils').replaceChildren(...[...suivi.values()].map((p) => vue.el('div', { class: 'fil' },
      vue.el('span', { text: `fil ${p.seed}` }),
      vue.el('span', { class: 'valeur', text: p.failed ? 'echec' : Math.round(p.best ?? 0).toLocaleString('fr-FR') }),
    )));
  };

  recherche = runSearch(
    {
      level: etat.niveau,
      allocation: etat.allocation,
      scrolls: etat.scrolls,
      passivesConfig: etat.options.passifs ? configPassifsDefaut() : null,
      profile: { classe: etat.classe, sexe: etat.sexe },
      bannedIds: [...etat.bannis],
      lockedIds: [...etat.verrous],
      // Une reprise seme le build courant ; un depart de zero ne seme rien.
      currentItemIds: deZero ? [] : [...etat.equipped.values()].map((piece) => piece.id),
      objective: objectif(),
      intensite,
      options: { populationSize: 160 },
    },
    {
      threads: fils,
      onProgress: (info) => {
        suivi.set(info.seed, { ...suivi.get(info.seed), ...info });
        montrerFils();
      },
      onWave: (vague) => {
        suivi.set(vague.seed, { seed: vague.seed, best: vague.best });
        generationMax = Math.max(generationMax, decalage + vague.generation);
        $('compteur-generations').textContent =
          `generation ${generationMax.toLocaleString('fr-FR')} — en cours`;

        // La courbe du fil s'allonge de la vague ecoulee.
        if (!courbes.has(vague.seed)) courbes.set(vague.seed, []);
        courbes.get(vague.seed).push(...(vague.history ?? []));
        historiques = [...courbes.entries()].map(([seed, history]) => ({ seed, history }));
        montrerFils();

        // Chaque fil rend une vague par seconde environ. Repeindre le graphe
        // et reecrire les courbes a chaque fois occupait le fil principal
        // pour rien : l'oeil ne suit pas, et l'enregistrement traverse tout
        // l'historique. Les deux se font donc au rythme qui se voit.
        const maintenant = Date.now();
        if (maintenant - dernierGraphe >= INTERVALLE_GRAPHE_MS) {
          dernierGraphe = maintenant;
          dessinerEvolution($('graphe'), historiques, { enCours: true });
        }
        if (maintenant - dernierEnregistrement >= INTERVALLE_ENREGISTREMENT_MS) {
          dernierEnregistrement = maintenant;
          sauverResultat(generationMax, fils);
        }

        // Le meilleur build du moment s'applique en direct au personnage,
        // tant que le joueur n'a pas pose son propre choix.
        if (suiviAuto && vague.resume && vague.resume.score > meilleurApplique) {
          meilleurApplique = vague.resume.score;
          appliquer(vague.resume);
        }
      },
    },
  );

  try {
    const { best, candidats, paliers, abandonnee } = await recherche.promise;
    // Un abandon jette la recherche : rien a appliquer, rien a garder.
    if (abandonnee) return;
    if (suiviAuto && best.score > meilleurApplique) appliquer(best);
    if (Array.isArray(candidats)) setEtat({ candidats });
    if (Array.isArray(paliers)) setEtat({ paliers });
    // Une recherche mise en pause laisse une trace : c'est la version que
    // l'on voudra comparer au prochain essai.
    garderSimulation({ siNouvelle: true, silencieux: true });
    message(`Recherche en pause apres ${generationMax.toLocaleString('fr-FR')} generations sur ${fils} fil(s).`, 'info');
    $('compteur-generations').textContent =
      `generation ${generationMax.toLocaleString('fr-FR')} — en pause`;
  } catch (error) {
    message(`La recherche a echoue : ${error.message}`, 'erreur');
  } finally {
    recherche = null;
    rechercheEnCours = false;
    $('lancer').disabled = false;
    $('recommencer').disabled = false;
    $('arreter').disabled = true;
    dessinerEvolution($('graphe'), historiques, { enCours: false });
    sauverResultat(generationMax, fils);
    finBoucle();
  }
}

/**
 * Montre ce que chaque piece apporte et ou investir pour gagner des degats.
 *
 * @param {any|null} build Build courant, deja calcule.
 * @param {Record<string, number>|null} stats
 */
function montrerAnalyse(build, stats) {
  const bloc = $('bloc-analyse');
  const pieces = [...etat.equipped.values()];
  bloc.hidden = !stats || pieces.length === 0;
  if (bloc.hidden) return;

  const cible = { ...objectif(), spells: attaquesAffichees() };

  vue.renderAnalyse($('apports'), $('sensibilite'), {
    apports: apportsPieces(pieces, {
      level: etat.niveau,
      allocation: etat.allocation,
      scrolls: etat.scrolls,
      passives: passifsActifs(),
      profile: { classe: etat.classe, sexe: etat.sexe },
      setById: catalogue.setById,
      objective: cible,
    }),
    sensibilite: sensibiliteStats(stats, cible),
    itemById: catalogue.itemById,
    libelles: STAT_LABELS,
  });
}

/**
 * Montre les autres builds trouves, avec ce qu'il faut changer pour chacun.
 * @param {Record<string, number>|null} stats Statistiques du build porte.
 */
function montrerProximite(stats) {
  renderReglageProximite($('reglage-proximite'), {
    reference: etat.reference,
    max: etat.changementsMax,
    possedees: etat.possedees,
    possedees: etat.possedees.size,
    portees: etat.equipped.size,
  }, {
    onFiger: figerReference,
    onOublier: oublierReference,
    onReprendre: reprendreReference,
    onMax: (valeur) => setEtat({ changementsMax: valeur }),
  });

  const paliers = etat.reference ? (etat.paliers ?? []) : [];

  // Le gain se lit face au stuff de reference, jamais face au build pose :
  // c'est l'achat qui se decide, pas l'essai en cours.
  const reference = etat.reference && catalogue ? valeurDeReference() : null;

  // Le compteur annonce ce que le joueur verra : les paliers qui n'apportent
  // rien ne se montrent pas, ils ne doivent pas se compter non plus.
  $('compte-paliers').textContent = String(paliersUtiles(paliers, reference).length);

  renderPaliers($('paliers'), paliers, {
    reference,
    itemById: catalogue?.itemById ?? new Map(),
    piecesReference: etat.reference?.itemIds ?? [],
    max: etat.changementsMax,
    possedees: etat.possedees,
    onPorter: (palier) => {
      porterAlaMain(palier);
      message(`Build porte : ${palier.changements} piece(s) a acheter, `
        + `${Math.floor(palier.damage).toLocaleString('fr-FR')} de degats.`, 'info');
    },
  });
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
 * @returns {{score: number, damage: number, satisfied: boolean}|null}
 */
function valeurDeReference() {
  const items = etat.reference.itemIds
    .map((id) => catalogue.itemById.get(id))
    .filter(Boolean);
  if (items.length === 0) return null;

  const { stats } = computeBuild({
    items, level: etat.niveau, allocation: etat.allocation, scrolls: etat.scrolls,
    passives: passifsActifs(), profile: { classe: etat.classe, sexe: etat.sexe },
  }, catalogue.setById);

  const detail = scoreBuild(stats, { ...objectif(), spells: attaquesAffichees() });
  return { score: detail.score, damage: detail.damage, satisfied: detail.satisfied };
}

function montrerCandidats(stats) {
  const bloc = $('bloc-candidats');
  const candidats = etat.candidats ?? [];
  bloc.hidden = candidats.length === 0;
  $('compte-candidats').textContent = String(candidats.length);
  if (candidats.length === 0) return;

  const portes = new Set([...etat.equipped.values()].map((piece) => piece.id));
  // Le build porte sert de point de comparaison : ses degats et l'etat de ses
  // conditions, pas son score — celui-ci change d'echelle selon qu'elles
  // tiennent ou non.
  const porte = stats
    ? scoreBuild(stats, { ...objectif(), spells: attaquesAffichees() })
    : null;

  vue.renderCandidats($('candidats'), candidats, {
    portes,
    itemById: catalogue.itemById,
    porte,
    onPorter: (candidat) => {
      porterAlaMain(candidat);
      message(`Build remplace par un candidat a ${Math.floor(candidat.score).toLocaleString('fr-FR')}.`, 'info');
    },
  });
}

/** Pose le build trouve par le solveur, points de caracteristique compris. */
/**
 * Pose un build choisi a la main, et arrete le suivi de la recherche.
 *
 * @param {any} resultat
 */
function porterAlaMain(resultat) {
  const enCours = suiviAuto && recherche !== null;
  suiviAuto = false;
  appliquer(resultat);
  if (enCours) {
    message('Le personnage ne suit plus la recherche : votre choix reste en place. '
      + 'Le prochain lancement rend la main au solveur.', 'info');
  }
}

function appliquer(resultat) {
  const equipped = new Map();
  const restant = new Map(SLOTS.map((s) => [s.key, s.capacity]));

  for (const id of resultat.itemIds) {
    const item = catalogue.itemById.get(id);
    if (!item) continue;
    const libre = restant.get(item.slot) ?? 0;
    if (libre <= 0) continue;
    const slot = SLOTS.find((s) => s.key === item.slot);
    equipped.set(`${item.slot}:${slot.capacity - libre}`, item);
    restant.set(item.slot, libre - 1);
  }

  // Les pieces viennent du solveur : aucune n'est marquee comme posee a la main.
  // La repartition des points suit le build : elle evolue avec les generations.
  setEtat({
    equipped,
    posees: new Set(),
    verrous: new Set([...etat.verrous].filter((id) =>
      [...equipped.values()].some((piece) => piece.id === id))),
    ...(resultat.allocation ? { allocation: { ...etat.allocation, ...resultat.allocation } } : {}),
  });
}

/* ------------------------------------------------ Simulations gardees --- */

/** Panneau des simulations, installe une fois le document pret. */
let panneauSimulations = null;

/**
 * Instantane du moment : de quoi revenir exactement a cet etat.
 *
 * Les pieces partent avec leur emplacement : sans lui, deux anneaux ne se
 * remettent pas a la meme place. Les statistiques partent entieres, pour que
 * la comparaison de deux simulations n'ait rien a recalculer.
 *
 * @returns {any|null} Instantane, ou null tant que le catalogue manque.
 */
function instantane() {
  const build = buildCourant();
  if (!build) return null;

  const detail = scoreBuild(build.stats, { ...objectif(), spells: attaquesAffichees() });

  return {
    nom: '',
    niveau: etat.niveau, classe: etat.classe, sexe: etat.sexe,
    score: detail.score,
    tenu: detail.satisfied,
    manquantes: detail.unmet?.length ?? 0,
    pieces: [...etat.equipped.entries()].map(([cle, piece]) => ({ cle, id: piece.id })),
    stats: { ...build.stats },
    conditions: etat.conditions,
    sorts: etat.sorts,
    options: etat.options,
    allocation: etat.allocation,
    scrolls: etat.scrolls,
    limites: etat.limites,
    bannis: [...etat.bannis],
    verrous: [...etat.verrous],
  };
}

/**
 * Range le build porte dans la liste des simulations.
 *
 * @param {{siNouvelle?: boolean, silencieux?: boolean}} [choix]
 */
function garderSimulation(choix = {}) {
  const releve = instantane();
  if (!releve) {
    message('Rien a garder : le catalogue n\'est pas encore charge.', 'info');
    return;
  }

  let ajoutee = null;
  try {
    ({ ajoutee } = ajouterSimulation(releve, { siNouvelle: choix.siNouvelle }));
  } catch (erreur) {
    message(erreur.message, 'erreur');
    return;
  }

  panneauSimulations?.rafraichir();
  if (choix.silencieux || !ajoutee) return;
  message(`Simulation gardee a ${Math.floor(ajoutee.score).toLocaleString('fr-FR')} degats.`, 'info');
}

/**
 * Remet une simulation en place : build, reglages et pieces bannies.
 *
 * Le retour passe par setEtat, donc « Annuler » defait la remise : reprendre
 * un ancien essai ne perd jamais celui en cours.
 *
 * @param {any} simulation
 */
function restaurerSimulation(simulation) {
  if (!catalogue) return;

  const equipped = new Map();
  let manquantes = 0;
  for (const { cle, id } of simulation.pieces ?? []) {
    const piece = catalogue.itemById.get(id);
    if (piece) equipped.set(cle, piece);
    else manquantes += 1;
  }

  setEtat({
    niveau: simulation.niveau ?? etat.niveau,
    classe: classeConnue(simulation.classe),
    sexe: simulation.sexe ?? etat.sexe,
    equipped,
    // Les pieces viennent d'un instantane, aucune n'est posee a la main.
    posees: new Set(),
    conditions: simulation.conditions ?? etat.conditions,
    sorts: simulation.sorts ?? etat.sorts,
    options: { ...etat.options, ...(simulation.options ?? {}) },
    allocation: { ...etat.allocation, ...(simulation.allocation ?? {}) },
    scrolls: { ...etat.scrolls, ...(simulation.scrolls ?? {}) },
    limites: { ...etat.limites, ...(simulation.limites ?? {}) },
    bannis: new Set(simulation.bannis ?? []),
    verrous: new Set(simulation.verrous ?? []),
    candidats: [],
  });

  message(manquantes === 0
    ? 'Simulation remise en place. « Annuler » revient au build d\'avant.'
    : `Simulation remise en place. ${manquantes} piece(s) introuvable(s) au catalogue.`,
  manquantes === 0 ? 'info' : 'erreur');
}

function brancher() {
  $('niveau').addEventListener('change', (e) =>
    setEtat({ niveau: Math.max(1, Math.min(200, Number(e.target.value) || 1)) }));
  $('classe').addEventListener('change', (e) => setEtat({ classe: Number(e.target.value) }));
  $('sexe').addEventListener('change', (e) => setEtat({ sexe: Number(e.target.value) }));
  $('recherche').addEventListener('input', (e) => setEtat({ recherche: e.target.value }));
  $('filtre-pk').addEventListener('change', (e) => setEtat({ filtrePk: e.target.checked }));

  $('filtre-stat').addEventListener('change', (e) =>
    setEtat({ filtreStat: { ...etat.filtreStat, stat: e.target.value } }));
  $('filtre-op').addEventListener('change', (e) =>
    setEtat({ filtreStat: { ...etat.filtreStat, op: e.target.value } }));
  $('filtre-valeur').addEventListener('input', (e) =>
    setEtat({ filtreStat: { ...etat.filtreStat, valeur: Number(e.target.value) || 0 } }));
  $('bannir-resultats').addEventListener('click', bannirResultats);
  $('autoriser-resultats').addEventListener('click', autoriserResultats);
  $('posseder-resultats').addEventListener('click', () => posseder(true));
  $('oublier-possedees').addEventListener('click', () => posseder(false));
  $('vider').addEventListener('click', () => setEtat({ equipped: new Map(), posees: new Set() }));
  $('annuler').addEventListener('click', annuler);

  window.addEventListener('keydown', (ev) => {
    // Echap ferme ce qui est ouvert par-dessus la page.
    if (ev.key === 'Escape') {
      fermerFiche();
      fermerPicker();
      cacherBulle();
      return;
    }

    // Ctrl+Z, ou Cmd+Z sur Mac : le geste attendu partout ailleurs.
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
      const cible = ev.target;
      // Dans un champ de saisie, le navigateur annule le texte lui-meme.
      if (cible instanceof HTMLInputElement || cible instanceof HTMLTextAreaElement) return;
      ev.preventDefault();
      annuler();
    }
  });

  $('ajouter-condition').addEventListener('click', () => {
    const stat = $('nouvelle-condition').value;
    if (etat.conditions.some((c) => c.stat === stat)) {
      message(`Une condition porte deja sur "${STAT_LABELS[stat]}".`, 'erreur');
      return;
    }
    setEtat({ conditions: [...etat.conditions, { stat, target: 0, weight: 1, max: null, absolute: false }] });
  });

  $('enlever-sorts').addEventListener('click', () => setEtat({ sorts: [] }));

  $('choisir-sorts').addEventListener('click', () => {
    const classe = classeCourante();
    if (!classe) {
      message('Sorts indisponibles pour cette classe.', 'erreur');
      return;
    }
    ouvrirPicker({
      classe,
      niveau: etat.niveau,
      pris: new Set(etat.sorts.map((s) => s.id)),
      onAjouter: (sort) => setEtat({
        sorts: [...etat.sorts.filter((s) => s.id !== sort.id), sort],
      }),
      // Ajout en masse : un seul rendu pour toute la liste.
      onAjouterPlusieurs: (nouveaux) => {
        const ids = new Set(nouveaux.map((s) => s.id));
        setEtat({ sorts: [...etat.sorts.filter((s) => !ids.has(s.id)), ...nouveaux] });
      },
      onEnlever: (id) => setEtat({ sorts: etat.sorts.filter((s) => s.id !== id) }),
    });
  });

  brancherSets('sorts', 'sets-sorts', () => etat.sorts, (contenu) => setEtat({ sorts: contenu }));
  brancherSets('conditions', 'sets-conditions', () => etat.conditions, (contenu) => setEtat({ conditions: contenu }));

  document.querySelector('.colonne-perso')?.addEventListener('mouseleave', cacherBulle);
  window.addEventListener('scroll', cacherBulle, { passive: true });

  // Le graphe se dessine dans un canvas : il ne suit pas la cascade CSS.
  // Un changement de theme demande donc un nouveau rendu.
  window.addEventListener('copyroxx:theme', () => render());

  $('lancer').addEventListener('click', () => lancer());
  $('recommencer').addEventListener('click', () => lancer({ deZero: true }));
  $('arreter').addEventListener('click', () => {
    // La pause laisse chaque fil rendre son meilleur build avant de conclure.
    $('arreter').disabled = true;
    message('Mise en pause…', 'info');
    recherche?.stop();
  });
}

/**
 * Branche les trois boutons d'un jeu enregistre.
 * @param {'sorts'|'conditions'} nature
 * @param {string} idListe
 * @param {() => any} lire Contenu courant a enregistrer.
 * @param {(contenu: any) => void} poser Applique un contenu repris.
 */
function brancherSets(nature, idListe, lire, poser) {
  const suffixe = nature;

  $(`garder-${suffixe}`).addEventListener('click', () => {
    const nom = window.prompt(`Nom du jeu de ${nature} :`, $(idListe).value || '');
    if (nom === null) return;
    try {
      enregistrerSet(nature, nom, lire());
      remplirListesSets();
      $(idListe).value = nom.trim();
      message(`Jeu de ${nature} « ${nom.trim()} » enregistre.`, 'info');
    } catch (error) {
      message(error.message, 'erreur');
    }
  });

  $(`charger-${suffixe}`).addEventListener('click', () => {
    const nom = $(idListe).value;
    const contenu = nom ? chargerSet(nature, nom) : null;
    if (!contenu) {
      message(`Aucun jeu de ${nature} a reprendre.`, 'erreur');
      return;
    }
    poser(contenu);
    message(`Jeu de ${nature} « ${nom} » repris.`, 'info');
  });

  $(`oublier-${suffixe}`).addEventListener('click', () => {
    const nom = $(idListe).value;
    if (!nom) return;
    enleverSet(nature, nom);
    remplirListesSets();
    message(`Jeu de ${nature} « ${nom} » enleve.`, 'info');
  });
}

async function main() {
  $('fils').value = String(defaultThreadCount());
  $('classe').replaceChildren(...CLASSES.map((c) => vue.el('option', {
    value: String(c.id), ...(c.id === etat.classe ? { selected: true } : {}), text: c.fr })));
  $('nouvelle-condition').replaceChildren(...STATS.map((s) => vue.el('option', { value: s.key, text: s.fr })));
  $('filtre-stat').replaceChildren(
    vue.el('option', { value: '', text: 'statistique…' }),
    ...STATS.map((s) => vue.el('option', { value: s.key, text: s.fr })));
  brancher();
  message('Chargement du catalogue…', 'info');

  try {
    [catalogue, classesSorts] = await Promise.all([loadCatalog(), loadSpells()]);
    reprendreEtat();
    reprendreResultat();
    enrichirSorts();
    const nbSorts = classesSorts.reduce((n, c) => n + c.spells.length, 0);
    $('etiquette-items').textContent =
      `${catalogue.items.length.toLocaleString('fr-FR')} items · ${nbSorts} sorts`;
    panneauSimulations = installerSimulations($('simulations'), {
      compteur: $('compte-simulations'),
      itemById: () => catalogue?.itemById ?? new Map(),
      libelles: STAT_LABELS,
      // Les options se lisent par leur libelle, pas par leur cle interne.
      libellesOptions: Object.fromEntries(OPTIONS.map((o) => [o.cle, o.libelle])),
      nomDeClasse,
      embleme: emblemeDeClasse,
      onRestaurer: restaurerSimulation,
      onGarder: () => garderSimulation(),
      onMessage: (texte) => message(texte, 'info'),
    });
    message('');
    render();
  } catch (error) {
    message(`Catalogue indisponible : ${error.message}`, 'erreur');
  }
}

main();
