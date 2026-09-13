/**
 * Orchestration de l'interface.
 *
 * L'etat reste immuable : chaque changement produit un nouvel objet. Ce
 * module le garde, l'enregistre et le montre ; ce qu'il en derive vit dans
 * objectif.mjs, ce qui le change dans equipement.mjs, ce qui le range dans
 * etat-stockage.mjs, et la recherche dans recherche.mjs.
 */
import { loadCatalog } from './catalog-web.mjs';
import { avatarDeClasse, CLASSES, emblemeDeClasse, nomDeClasse } from './classes.mjs';
import { ajouterSimulation } from './simulations.mjs';
import { installerSimulations } from './simulations-panel.mjs';
import { paliersUtiles, renderPaliers, renderReglageProximite } from './proximite-panel.mjs';
import { renderSurvie } from './survie-panel.mjs';
import { renderAnalyse } from './analyse-panel.mjs';
import { defaultThreadCount } from './solver-client.mjs';
import * as vue from './render.mjs';
import * as plan from './layout.mjs';
import { loadSpells } from './spells-data.mjs';
import { fermerFiche, ouvrirFiche } from './item-panel.mjs';
import { renderPoints } from './points-panel.mjs';
import { fermerPicker, ouvrirPicker } from './spell-picker.mjs';
import { cacherBulle } from './hover-card.mjs';
import { chargerSet, enleverSet, enregistrerSet, lireSets } from './presets.mjs';
import {
  ALLOCATION_VIDE, etatInitial, GROUPES_OPTIONS, LIBELLES_OPTIONS, optionsAffichees,
} from './reglages.mjs';
import { reprendreEtat, sauverEtat } from './etat-stockage.mjs';
import {
  attaqueArme, buildCourant, cibleAffichee, itemsFiltres, objectif,
  passifsActifs, profilDe, scoreAffiche, sortsCalcules, valeurDeReference,
} from './objectif.mjs';
import { enrichirSorts } from './sorts-migration.mjs';
import * as geste from './equipement.mjs';
import { instantane, patchDepuisSimulation } from './instantane.mjs';
import { creerRecherche } from './recherche.mjs';

import { STATS, STAT_LABELS } from '../src/data/stats.mjs';
import { STAT_DEGATS } from '../src/solver/score.mjs';
import { renderObjectifs } from './objectifs-panel.mjs';
import { axeDe } from '../src/solver/survie.mjs';
import { availablePoints } from '../src/engine/characteristics.mjs';
import { computeSpellDetail } from '../src/engine/damage.mjs';
import { ajouterLigne, enleverLigne, modifierLigne } from '../src/data/spell-lines.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

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
  lireEtat: () => etat,
  setEtat,
  appliquer,
  message,
  garderSimulation: () => garderSimulation({ siNouvelle: true, silencieux: true }),
});

/** Pose un build rendu par le solveur, points de caracteristique compris. */
function appliquer(resultat) {
  setEtat(geste.appliquerBuild(etat, resultat, catalogue.itemById));
}

/* ---------------------------------------------------------- Equipement --- */

function equiper(item) {
  const patch = geste.equiper(etat, item);
  if (patch) setEtat(patch);
}

function bannir(item) {
  const { patch, bannie } = geste.basculerBanni(etat, item);
  setEtat(patch);
  message(bannie
    ? `« ${item.fr} » est bannie : le solveur ne la proposera plus.`
    : `« ${item.fr} » est de nouveau proposee au solveur.`, 'info');
}

function verrouiller(item) {
  const { patch, verrouillee } = geste.basculerVerrou(etat, item);
  setEtat(patch);
  message(verrouillee
    ? `« ${item.fr} » est verrouillee : le solveur la garde dans chaque build.`
    : `« ${item.fr} » est deverrouillee.`, 'info');
}

function retirer(cle) {
  setEtat(geste.retirer(etat, cle));
}

/** Bannit d'un coup toutes les pieces qui passent les filtres du catalogue. */
function bannirResultats() {
  const cibles = itemsFiltres(etat, catalogue).filter((item) => !etat.bannis.has(item.id));
  if (cibles.length === 0) {
    message('Aucune piece a bannir dans ces resultats.', 'info');
    return;
  }
  setEtat(geste.bannirPieces(etat, cibles));
  message(`${cibles.length} piece(s) bannie(s). « Autoriser » sur ces memes filtres annule.`, 'info');
}

/** Autorise de nouveau toutes les pieces bannies qui passent les filtres. */
function autoriserResultats() {
  const cibles = itemsFiltres(etat, catalogue).filter((item) => etat.bannis.has(item.id));
  if (cibles.length === 0) {
    message('Aucune piece bannie dans ces resultats.', 'info');
    return;
  }
  setEtat(geste.autoriserPieces(etat, cibles));
  message(`${cibles.length} piece(s) de nouveau autorisee(s).`, 'info');
}

/** Marque comme possedees les pieces qui passent les filtres, ou les enleve. */
function posseder(actif) {
  const cibles = itemsFiltres(etat, catalogue)
    .filter((item) => etat.possedees.has(item.id) !== actif);
  if (cibles.length === 0) {
    message(actif
      ? 'Toutes ces pieces sont deja marquees comme possedees.'
      : 'Aucune piece possedee dans ces resultats.', 'info');
    return;
  }
  setEtat(geste.posseder(etat, cibles, actif));
  message(actif
    ? `${cibles.length} piece(s) marquee(s) comme possedees : elles ne coutent plus d'achat.`
    : `${cibles.length} piece(s) enlevee(s) de votre banque.`, 'info');
}

/** Met une piece dans l'inventaire, ou l'en enleve. */
function basculerPossedee(item) {
  const avait = etat.possedees.has(item.id);
  setEtat(geste.posseder(etat, [item], !avait));
  message(avait
    ? `${item.fr} enlevee de votre inventaire.`
    : `${item.fr} ajoutee a votre inventaire : elle ne compte plus comme un achat.`, 'info');
}

/* --------------------------------------------------- Stuff de reference --- */

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
  recherche.porterAlaMain({ itemIds: etat.reference.itemIds });
  message('Stuff de reference repose.', 'info');
}

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

  montrerCandidats(stats);
  montrerProximite();
  montrerSurvie(stats);
  montrerAnalyse(stats);

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
  if (stats) montrerScore(scoreAffiche(etat, stats), build);
}

/** Fiche d'une piece, avec les gestes qu'elle admet. */
function ficheDe(item, extra = {}) {
  return ouvrirFiche(item, {
    onBan: () => bannir(item),
    onLock: () => verrouiller(item),
    onPosseder: () => basculerPossedee(item),
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
    (item) => ficheDe(item, { onEquip: () => equiper(item) }), etat.bannis, etat.possedees);

  const listeBannis = piecesDe(etat.bannis);
  $('compte-bannis').textContent = String(listeBannis.length);
  vue.renderBannis($('bannis'), listeBannis, bannir);

  const listePossedees = piecesDe(etat.possedees);
  $('compte-possedees').textContent = String(listePossedees.length);
  vue.renderBannis($('possedees'), listePossedees, (item) => basculerPossedee(item), {
    vide: 'Aucune piece marquee. Filtrez le catalogue, puis « J\'ai ces pieces ».',
    aide: 'cliquez pour l\'enlever de votre banque',
  });
}

function renderStats(build, stats) {
  const suivies = new Set(etat.conditions.map((c) => c.stat));
  const options = { suivies, onPick: suivreStat };

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
  const voirPiece = (cle, item) => ficheDe(item, { onRemove: () => retirer(cle), stats });
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
  $('mode-recherche').value = etat.mode;
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
    onPick: (piece) => ficheDe(piece, { onEquip: () => equiper(piece) }),
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

function montrerScore(detail, build) {
  const noeud = $('score');
  noeud.textContent = nombre(Math.round(detail.score));
  noeud.className = `score ${detail.satisfied ? 'pos' : 'neg'}`;
  // Sans sort ni arme, le score ne mesure pas des degats mais la marge prise
  // sur les conditions : l'annoncer « degats totaux » trompait la lecture.
  const mode = objectif(etat).mode;
  const enDegats = mode === SEARCH_MODES.DAMAGE;
  const enEndurance = mode === SEARCH_MODES.ENDURANCE;
  $('score-libelle').textContent = detail.satisfied
    ? (enDegats ? 'Degats totaux'
      : (enEndurance ? 'Pdv effectifs' : 'Marge sur les conditions'))
    : 'Conditions non satisfaites';

  const invalides = build?.invalid?.length ?? 0;
  const marge = (enDegats || enEndurance) ? '' : ' Le score somme ce que le build depasse.';
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

/** Montre ce que chaque piece apporte, ou investir, et quoi remplacer. */
function montrerAnalyse(stats) {
  const bloc = $('bloc-analyse');
  bloc.hidden = !stats || etat.equipped.size === 0;
  if (bloc.hidden) return;

  renderAnalyse({ apports: $('apports'), sensibilite: $('sensibilite'), remplacements: $('remplacements') }, {
    etat, catalogue, stats, cible: cibleAffichee(etat), tenu: scoreAffiche(etat, stats).satisfied,
    contexte: {
      level: etat.niveau, allocation: etat.allocation, scrolls: etat.scrolls,
      passives: passifsActifs(etat), profile: profilDe(etat), setById: catalogue.setById,
    },
    onRemplacer: (proposition) => {
      setEtat(geste.remplacer(etat, proposition.actuel, proposition.remplacant));
      message(`${proposition.remplacant.fr} posee`
        + `${proposition.actuel ? ` a la place de ${proposition.actuel.fr}` : ''}.`, 'info');
    },
  });
}

/** Montre les paliers « proche de mon stuff », avec ce qu'il faut acheter. */
function montrerProximite() {
  renderReglageProximite($('reglage-proximite'), {
    reference: etat.reference,
    max: etat.changementsMax,
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
  const reference = valeurDeReference(etat, catalogue);

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
      recherche.porterAlaMain(palier);
      message(`Build porte : ${palier.changements} piece(s) a acheter, `
        + `${nombre(Math.floor(palier.damage))} de degats.`, 'info');
    },
  });
}

/**
 * Montre la courbe degats contre points de vie.
 * @param {Record<string, number>|null} stats Statistiques du build porte.
 */
function montrerSurvie(stats) {
  const bloc = $('bloc-survie');
  const paliers = etat.survie ?? [];
  const mode = objectif(etat).mode;
  // L'axe suit le mode, et le titre du bloc avec lui. Le titre se pose meme
  // quand le bloc est cache : il doit etre juste des qu'il se montre.
  const axe = axeDe(mode);
  $('titre-survie').textContent = axe.cle === 'endurance'
    ? 'Degats ou survie'
    : 'Survie ou degats';

  // Le bloc n'a de sens qu'avec des degats a compter : en mode
  // caracteristiques, il n'y a rien a echanger contre de la vie.
  bloc.hidden = paliers.length === 0 || mode === SEARCH_MODES.STATS;
  if (bloc.hidden) return;

  const porte = stats
    ? { pdv: stats.pdv, endurance: stats.pdvEffectifs, damage: scoreAffiche(etat, stats).damage }
    : null;
  const montrees = renderSurvie($('survie'), paliers, {
    axe,
    porte,
    portees: new Set([...etat.equipped.values()].map((piece) => piece.id)),
    itemById: catalogue.itemById,
    onPorter: (palier) => {
      recherche.porterAlaMain(palier);
      // Un palier sous la condition de vie la laisse en defaut : le joueur
      // l'a choisi, mais il doit le lire tout de suite.
      const tenu = palier.stats ? scoreAffiche(etat, palier.stats).satisfied : true;
      const manque = axe.cle === 'endurance' ? 'Votre condition de vie' : 'Votre condition de degats';
      message(`Build porte : ${nombre(Math.floor(palier.pdv))} points de vie, `
        + `${nombre(Math.floor(palier.endurance))} une fois les resistances comptees, `
        + `${nombre(Math.floor(palier.damage))} de degats.`
        + (tenu ? '' : ` ${manque} n'est plus tenue : baissez-la si ce build vous convient.`),
      tenu ? 'info' : 'alerte');
    },
  });
  $('compte-survie').textContent = String(montrees);
}

/** Montre les autres builds trouves, avec ce qu'il faut changer pour chacun. */
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
  const porte = stats ? scoreAffiche(etat, stats) : null;

  vue.renderCandidats($('candidats'), candidats, {
    portes,
    itemById: catalogue.itemById,
    porte,
    onPorter: (candidat) => {
      recherche.porterAlaMain(candidat);
      message(`Build remplace par un candidat a ${nombre(Math.floor(candidat.score))}.`, 'info');
    },
  });
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

/* ------------------------------------------------------------ Liaison --- */

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

  $('mode-recherche').addEventListener('change', (ev) => {
    const mode = ev.target.value;
    setEtat({ mode });
    if (mode !== 'caracteristiques' && etat.sorts.length === 0 && !etat.options.arme) {
      message('Aucun sort ni arme : la recherche n\'a aucun degat a compter. '
        + 'Choisissez des sorts, ou revenez aux caracteristiques.', 'alerte');
    }
  });

  $('enlever-sorts').addEventListener('click', () => setEtat({ sorts: [] }));

  $('choisir-sorts').addEventListener('click', () => {
    const classe = classesSorts?.find((c) => c.id === etat.classe) ?? null;
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
        const sorts = [...etat.sorts.filter((s) => !ids.has(s.id)), ...nouveaux];
        // Premier sort pose alors que la recherche visait les
        // caracteristiques : le joueur veut des degats, pas un rappel.
        const bascule = etat.mode === 'caracteristiques' && sorts.length > 0;
        setEtat({ sorts, ...(bascule ? { mode: 'degats' } : {}) });
        if (bascule) message('La recherche maximise maintenant les degats.', 'info');
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

  $('lancer').addEventListener('click', () => recherche.lancer());
  $('recommencer').addEventListener('click', () => recherche.lancer({ deZero: true }));
  $('arreter').addEventListener('click', () => recherche.arreter());
}

/**
 * Branche les trois boutons d'un jeu enregistre.
 * @param {'sorts'|'conditions'} nature
 * @param {string} idListe
 * @param {() => any} lire Contenu courant a enregistrer.
 * @param {(contenu: any) => void} poser Applique un contenu repris.
 */
function brancherSets(nature, idListe, lire, poser) {
  $(`garder-${nature}`).addEventListener('click', () => {
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

  $(`charger-${nature}`).addEventListener('click', () => {
    const nom = $(idListe).value;
    const contenu = nom ? chargerSet(nature, nom) : null;
    if (!contenu) {
      message(`Aucun jeu de ${nature} a reprendre.`, 'erreur');
      return;
    }
    poser(contenu);
    message(`Jeu de ${nature} « ${nom} » repris.`, 'info');
  });

  $(`oublier-${nature}`).addEventListener('click', () => {
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
  // Les degats totaux se posent en condition comme une statistique, alors
  // qu'ils sortent du calcul des sorts : ils n'ont leur place ni dans STATS
  // ni dans le filtre du catalogue, seulement ici.
  $('nouvelle-condition').replaceChildren(
    ...STATS.map((s) => vue.el('option', { value: s.key, text: s.fr })),
    vue.el('option', { value: STAT_DEGATS, text: STAT_LABELS[STAT_DEGATS] }));
  $('filtre-stat').replaceChildren(
    vue.el('option', { value: '', text: 'statistique…' }),
    ...STATS.map((s) => vue.el('option', { value: s.key, text: s.fr })));
  brancher();
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
