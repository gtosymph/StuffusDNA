/**
 * Orchestration de l'interface.
 *
 * L'etat reste immuable : chaque changement produit un nouvel objet. Ce
 * module le garde, l'enregistre et le montre ; ce qu'il en derive vit dans
 * objectif.mjs, ce qui le change dans equipement.mjs et gestes-*.mjs, ce qui
 * le range dans etat-stockage.mjs, la recherche dans recherche.mjs, les
 * panneaux de resultat dans resultats-panel.mjs, et les liaisons de commandes
 * dans branchements.mjs.
 *
 * Ce qui reste ici est ce qui ne se delegue pas : la garde de l'etat, son
 * historique pour l'annulation, et le rendu qui les montre.
 */
import { loadCatalog } from './catalog-web.mjs';
import { avatarDeClasse, CLASSES, emblemeDeClasse, nomDeClasse } from './classes.mjs';
import { ajouterSimulation } from './simulations.mjs';
import { installerSimulations } from './simulations-panel.mjs';
import { renderPoids } from './poids-panel.mjs';
import { defaultThreadCount } from './solver-client.mjs';
import * as vue from './render.mjs';
import * as plan from './layout.mjs';
import { loadSpells } from './spells-data.mjs';
import { ouvrirFiche } from './item-panel.mjs';
import { renderPoints } from './points-panel.mjs';
import { enregistrerSet, lireSets } from './presets.mjs';
import {
  ALLOCATION_VIDE, etatInitial, GROUPES_OPTIONS, LIBELLES_OPTIONS, optionsAffichees,
} from './reglages.mjs';
import { reprendreEtat, sauverEtat } from './etat-stockage.mjs';
import {
  attaqueArme, buildCourant, itemsFiltres, scoreAffiche, sortsCalcules,
} from './objectif.mjs';
import { enrichirSorts } from './sorts-migration.mjs';
import { appliquerBuild } from './equipement.mjs';
import { instantane, patchDepuisSimulation } from './instantane.mjs';
import { creerRecherche } from './recherche.mjs';
import { creerGestesCatalogue } from './gestes-catalogue.mjs';
import { creerGestesReference } from './gestes-reference.mjs';
import { creerResultats } from './resultats-panel.mjs';
import { brancher } from './branchements.mjs';

import { STATS, STAT_LABELS } from '../src/data/stats.mjs';
import { STAT_DEGATS } from '../src/solver/score.mjs';
import { renderObjectifs } from './objectifs-panel.mjs';
import { availablePoints } from '../src/engine/characteristics.mjs';
import { computeSpellDetail } from '../src/engine/damage.mjs';
import { ajouterLigne, enleverLigne, modifierLigne } from '../src/data/spell-lines.mjs';

const $ = (id) => document.getElementById(id);

const nombre = (n) => n.toLocaleString('fr-FR');

let etat = etatInitial();

let catalogue = null;
let classesSorts = null;

/** Panneau des simulations, installe une fois le document pret. */
let panneauSimulations = null;

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

const lireEtat = () => etat;
const lireCatalogue = () => catalogue;

const setEtat = (patch) => {
  passe.push(etat);
  if (passe.length > ETATS_GARDES) passe.shift();
  etat = { ...etat, ...patch };
  sauverEtat(etat);
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
  sauverEtat(etat);
  render();
}

function message(texte, type = 'info') {
  $('message').replaceChildren(texte ? vue.el('div', { class: `message ${type}`, text: texte }) : '');
}

/* ------------------------------------------------------------ Recherche --- */

const recherche = creerRecherche({
  $,
  lireEtat,
  setEtat,
  appliquer,
  message,
  garderSimulation: () => garderSimulation({ siNouvelle: true, silencieux: true }),
});

/** Pose un build rendu par le solveur, points de caracteristique compris. */
function appliquer(resultat) {
  setEtat(appliquerBuild(etat, resultat, catalogue.itemById));
}

/* ------------------------------------------------------------- Gestes --- */

const gestes = creerGestesCatalogue({ lireEtat, lireCatalogue, setEtat, message });

const gestesReference = creerGestesReference({
  lireEtat, setEtat, message, nomDeClasse,
  lireRecherche: () => recherche,
});

const resultats = creerResultats({
  $, lireEtat, lireCatalogue, setEtat, message,
  lireRecherche: () => recherche,
  reference: gestesReference,
  sortsDuCombo,
  garderCombo,
});

/* ------------------------------------------------- Conditions et sorts --- */

/** Ajoute une condition sur une statistique, si elle n'y est pas deja. */
function suivreStat(stat, valeurConnue = null) {
  if (etat.conditions.some((c) => c.stat === stat)) {
    message(`Une condition porte deja sur "${STAT_LABELS[stat]}".`, 'info');
    return;
  }
  // Les degats totaux sortent du calcul des sorts : l'appelant les connait,
  // les statistiques du build non.
  const actuel = valeurConnue ?? buildCourant(etat, catalogue)?.stats?.[stat] ?? 0;
  // L'objectif part de la valeur atteinte : a l'utilisateur de la relever.
  setEtat({ conditions: [...etat.conditions, {
    stat, target: Math.max(0, Math.round(actuel)), weight: 1, max: null, absolute: false,
  }] });
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

/** Sorts retenus par le combo, au format de la liste. */
function sortsDuCombo(combo) {
  const parId = new Map(etat.sorts.map((s) => [s.id, s]));
  // Chaque sort prend le nombre de lancers que le combo lui a donne, dans
  // « repeats » : c'est ce champ que les degats comptent, combo decoche
  // compris. « castsPerTurn » reste la limite du jeu, elle n'est pas touchee.
  // L'attaque de l'arme ne se transpose pas, elle n'est pas un sort.
  return combo.lancers
    .map((lancer) => {
      const base = parId.get(lancer.id);
      return base ? { ...base, repeats: lancer.lancers } : null;
    })
    .filter(Boolean);
}

/** Enregistre les sorts d'un combo comme un jeu nomme. */
function garderCombo(combo) {
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
}

/* ----------------------------------------------------------- Rendu --- */

function render() {
  const build = buildCourant(etat, catalogue);
  const stats = build?.stats ?? null;

  // Les champs du personnage suivent l'etat, et pas seulement l'inverse :
  // « Annuler » et la remise d'une simulation le changent sans saisie. Le
  // champ en cours de frappe est laisse tranquille.
  for (const [id, valeur] of [['niveau', etat.niveau], ['classe', etat.classe], ['sexe', etat.sexe]]) {
    const champ = $(id);
    if (champ !== document.activeElement && champ.value !== String(valeur)) champ.value = String(valeur);
  }

  renderCatalogue();
  renderStats(build, stats);
  renderPersonnage(stats);
  renderConditionsEtSorts(stats);

  resultats.montrerCandidats(stats);
  resultats.montrerProximite();
  resultats.montrerSurvie(stats);
  resultats.montrerAnalyse(stats);

  $('annuler').disabled = passe.length === 0;

  renderPoints($('points'), { ...etat, stats }, {
    onPoints: (cle, valeur) => setEtat({ allocation: { ...etat.allocation, [cle]: Math.max(0, valeur) } }),
    onScroll: (cle, actif) => setEtat({ scrolls: { ...etat.scrolls, [cle]: actif } }),
    onLimite: (cle, valeur) => setEtat({
      limites: { ...etat.limites, [cle]: valeur === null ? null : Math.max(0, valeur) },
    }),
    onReset: () => setEtat({ allocation: { ...ALLOCATION_VIDE } }),
  });

  renderPanoplies(build);

  vue.renderOptions($('options'), optionsAffichees(etat.options),
    (cle, actif) => setEtat({ options: { ...etat.options, [cle]: actif } }),
    GROUPES_OPTIONS);

  remplirListesSets();
  recherche.dessiner();

  // Le score affiche compte les memes attaques que le solveur, arme comprise.
  if (stats) resultats.montrerScore(scoreAffiche(etat, stats), build);
}

/** Fiche d'une piece, avec les gestes qu'elle admet. */
function ficheDe(item, extra = {}) {
  return ouvrirFiche(item, {
    onBan: () => gestes.bannir(item),
    onLock: () => gestes.verrouiller(item),
    onPosseder: () => gestes.basculerPossedee(item),
    banni: etat.bannis.has(item.id),
    verrouille: etat.verrous.has(item.id),
    possedee: etat.possedees.has(item.id),
    ...extra,
  });
}

/** Liste triee des pieces d'un ensemble d'identifiants. */
function piecesDe(ids) {
  return [...ids]
    .map((id) => catalogue?.itemById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.fr.localeCompare(b.fr, 'fr'));
}

function renderCatalogue() {
  vue.renderOnglets($('onglets-slot'), etat.filtre,
    (key, type) => setEtat({ filtre: key, filtreType: type ?? null }), etat.filtreType);
  vue.renderCatalogue($('grille-items'), $('compte-items'), itemsFiltres(etat, catalogue),
    (item) => ficheDe(item, { onEquip: () => gestes.equiper(item) }), etat.bannis, etat.possedees);

  const listeBannis = piecesDe(etat.bannis);
  $('compte-bannis').textContent = String(listeBannis.length);
  vue.renderBannis($('bannis'), listeBannis, gestes.bannir);

  const listePossedees = piecesDe(etat.possedees);
  $('compte-possedees').textContent = String(listePossedees.length);
  vue.renderBannis($('possedees'), listePossedees, (item) => gestes.basculerPossedee(item), {
    vide: 'Aucune piece marquee. Filtrez le catalogue, puis « J\'ai ces pieces ».',
    aide: 'cliquez pour l\'enlever de votre banque',
  });
}

function renderStats(build, stats) {
  const suivies = new Set(etat.conditions.map((c) => c.stat));
  const options = { suivies, onPick: suivreStat };

  // Le mode vit avec les deux mesures qu'il arbitre : il dit laquelle la
  // recherche pousse, elles disent ou en est le build.
  $('mode-recherche').value = etat.mode;

  // Le curseur n'a de sens qu'en mode mixte : ailleurs, la part vaut zero ou
  // un, et le montrer laisserait croire qu'il change quelque chose.
  const poids = $('poids');
  poids.hidden = etat.mode !== 'mixte';
  if (!poids.hidden) {
    renderPoids(poids, {
      part: etat.partDegats,
      onChanger: (part) => setEtat({ partDegats: part }),
    });
  }

  renderObjectifs($('objectifs'), {
    valeurs: stats
      ? { pdvEffectifs: stats.pdvEffectifs ?? 0, degatsTotaux: scoreAffiche(etat, stats).damage }
      : null,
    mode: etat.mode,
    conditions: suivies,
    onCondition: (stat, valeur) => suivreStat(stat, valeur),
    onMaximiser: (mode) => {
      setEtat({ mode });
      message(mode === 'endurance'
        ? 'La recherche maximise maintenant les pdv effectifs.'
        : 'La recherche maximise maintenant les degats.', 'info');
    },
  });
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
}

function renderPersonnage(stats) {
  const voirPiece = (cle, item) => ficheDe(item, { onRemove: () => gestes.retirer(cle), stats });
  for (const [id, cases] of [
    ['slots-gauche', plan.SLOTS_GAUCHE], ['slots-droite', plan.SLOTS_DROITE],
    ['slots-artefacts', plan.SLOTS_ARTEFACTS],
  ]) {
    vue.renderCases($(id), cases, etat.equipped, etat.posees, voirPiece, etat.verrous, stats);
  }

  // L'avatar vient des planches de l'encyclopedie Dofus 3, pas du composeur
  // de look d'Ankama : depuis Dofus 3 celui-ci rend le corps sans la tete.
  const image = $('avatar-image');
  const avatar = avatarDeClasse(etat.classe, etat.sexe);
  if (image.getAttribute('src') !== avatar) image.src = avatar;
  image.alt = nomDeClasse(etat.classe);
  image.hidden = false;
  $('avatar-note').textContent = `${etat.equipped.size} / 16 pieces`;
}

function renderConditionsEtSorts(stats) {
  $('compte-conditions').textContent = String(etat.conditions.length);
  vue.renderConditions($('corps-conditions'), etat.conditions, stats, STAT_LABELS, {
    onChange: changerCondition,
    onRemove: (i) => setEtat({ conditions: etat.conditions.filter((_, j) => j !== i) }),
    degats: stats ? scoreAffiche(etat, stats).damage : 0,
  });

  $('compte-sorts').textContent = String(etat.sorts.length);
  const enleverSort = (i) => setEtat({ sorts: etat.sorts.filter((_, j) => j !== i) });
  vue.renderPuceSorts($('grille-sorts'), etat.sorts, enleverSort);

  const degats = stats ? sortsCalcules(etat).map((s) => computeSpellDetail(s, stats)) : null;
  vue.renderSorts($('liste-sorts'), etat.sorts, degats, {
    onChange: changerSort,
    onRemove: enleverSort,
    onAjouterLigne: (i) => changerLignes(i, ajouterLigne),
    onEnleverLigne: (i, rang) => changerLignes(i, (sort) => enleverLigne(sort, rang)),
    compterDiffere: etat.options.toursSuivants === true,
  });

  const arme = attaqueArme(etat);
  vue.renderArme($('carte-arme'), arme, arme && stats ? computeSpellDetail(arme, stats) : null);
}

function renderPanoplies(build) {
  // Le compte que les trophees verifient : (pieces − 1) par panoplie.
  $('compte-bonus').textContent = String((build?.sets ?? [])
    .reduce((n, s) => n + Math.max(0, s.pieces - 1), 0));
  vue.renderPanoplies($('panoplies'), build?.sets ?? [], catalogue?.setById ?? new Map(), STAT_LABELS, {
    itemById: catalogue?.itemById ?? new Map(),
    equippedIds: new Set([...etat.equipped.values()].map((p) => p.id)),
    onPick: (piece) => ficheDe(piece, { onEquip: () => gestes.equiper(piece) }),
  });
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

/* ------------------------------------------------ Simulations gardees --- */

/**
 * Range le build porte dans la liste des simulations.
 * @param {{siNouvelle?: boolean, silencieux?: boolean}} [choix]
 */
function garderSimulation(choix = {}) {
  const build = buildCourant(etat, catalogue);
  if (!build) {
    message('Rien a garder : le catalogue n\'est pas encore charge.', 'info');
    return;
  }
  const releve = instantane(etat, build, scoreAffiche(etat, build.stats));

  let ajoutee = null;
  try {
    ({ ajoutee } = ajouterSimulation(releve, { siNouvelle: choix.siNouvelle }));
  } catch (erreur) {
    message(erreur.message, 'erreur');
    return;
  }

  panneauSimulations?.rafraichir();
  if (choix.silencieux || !ajoutee) return;
  message(`Simulation gardee a ${nombre(Math.floor(ajoutee.score))} degats.`, 'info');
}

/**
 * Remet une simulation en place : build, reglages et pieces bannies.
 *
 * Le retour passe par setEtat, donc « Annuler » defait la remise : reprendre
 * un ancien essai ne perd jamais celui en cours.
 */
function restaurerSimulation(simulation) {
  if (!catalogue) return;
  const { patch, manquantes } = patchDepuisSimulation(etat, simulation, catalogue.itemById);
  setEtat(patch);
  message(manquantes === 0
    ? 'Simulation remise en place. « Annuler » revient au build d\'avant.'
    : `Simulation remise en place. ${manquantes} piece(s) introuvable(s) au catalogue.`,
  manquantes === 0 ? 'info' : 'erreur');
}

/* ----------------------------------------------------------- Demarrage --- */

async function main() {
  $('fils').value = String(defaultThreadCount());
  $('classe').replaceChildren(...CLASSES.map((c) => vue.el('option', {
    value: String(c.id), ...(c.id === etat.classe ? { selected: true } : {}), text: c.fr })));
  // Les degats totaux se posent en condition comme une statistique, alors
  // qu'ils sortent du calcul des sorts : ils n'ont leur place ni dans STATS
  // ni dans le filtre du catalogue, seulement ici.
  $('nouvelle-condition').replaceChildren(
    ...STATS.map((s) => vue.el('option', { value: s.key, text: s.fr })),
    vue.el('option', { value: STAT_DEGATS, text: STAT_LABELS[STAT_DEGATS] }));
  $('filtre-stat').replaceChildren(
    vue.el('option', { value: '', text: 'statistique…' }),
    ...STATS.map((s) => vue.el('option', { value: s.key, text: s.fr })));

  brancher({
    $, lireEtat, setEtat, message, annuler, render, gestes, recherche,
    lireClassesSorts: () => classesSorts,
    remplirListesSets,
  });
  message('Chargement du catalogue…', 'info');

  try {
    [catalogue, classesSorts] = await Promise.all([loadCatalog(), loadSpells()]);
    etat = reprendreEtat(etat, catalogue);
    recherche.reprendre();

    // Les sorts d'une version passee se remettent au format courant.
    const { sorts, changes } = enrichirSorts(etat.sorts, classesSorts, etat.niveau);
    if (changes) {
      etat = { ...etat, sorts };
      sauverEtat(etat);
    }

    const nbSorts = classesSorts.reduce((n, c) => n + c.spells.length, 0);
    $('etiquette-items').textContent = `${nombre(catalogue.items.length)} items · ${nbSorts} sorts`;
    panneauSimulations = installerSimulations($('simulations'), {
      compteur: $('compte-simulations'),
      itemById: () => catalogue?.itemById ?? new Map(),
      libelles: STAT_LABELS,
      // Les options se lisent par leur libelle, pas par leur cle interne.
      libellesOptions: LIBELLES_OPTIONS,
      nomDeClasse,
      embleme: emblemeDeClasse,
      onRestaurer: restaurerSimulation,
      onFiger: gestesReference.figerSimulation,
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
