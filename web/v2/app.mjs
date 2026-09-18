/**
 * Orchestration de v2.
 *
 * v2 est une seconde coquille, pas un second outil. Le moteur, l'etat, la
 * recherche et les panneaux viennent de `src/` et de `web/` sans copie : ce
 * module ne fait que poser une autre mise en page par-dessus, et se branche
 * aux modules de v1 par le pont. Tant que les deux ecrans vivent cote a cote,
 * une correction dans le moteur profite aux deux le meme jour.
 *
 * Ce qui lui appartient en propre : l'ecran vide, les trois volets, et l'ordre
 * dans lequel un debutant rencontre les concepts. Le reste est emprunte.
 */
import { loadCatalog } from '../catalog-web.mjs';
import { loadSpells } from '../spells-data.mjs';
import { avatarDeClasse, nomDeClasse } from '../classes.mjs';
import {
  el, renderArme, renderCandidats, renderCases, renderCombo, renderOptions,
  renderPanoplies,
} from '../render.mjs';
import { SLOTS_ARTEFACTS, SLOTS_DROITE, SLOTS_GAUCHE } from '../layout.mjs';
import { etatInitial, optionsAffichees } from '../reglages.mjs';
import { etatRange, reprendreEtat, sauverEtat } from '../etat-stockage.mjs';
import { adopter, reglageDuFragment, resume } from '../partage-lien.mjs';
import {
  buildCourant, cibleAffichee, passifsActifs, profilDe, scoreAffiche, sortsCalcules,
  valeurDeReference,
} from '../objectif.mjs';
import { appliquerBuild } from '../equipement.mjs';
import { enrichirSorts } from '../sorts-migration.mjs';
import { creerRecherche } from '../recherche.mjs';
import { ouvrirFiche } from '../item-panel.mjs';
import { iconeStat } from '../icons.mjs';
import { SEARCH_MODES } from '../../src/solver/score.mjs';
import { STAT_LABELS } from '../../src/data/stats.mjs';
import { conditionValue } from '../../src/solver/condition-value.mjs';

import { creerGestesCatalogue } from '../gestes-catalogue.mjs';
import { creerGestesSorts } from '../gestes-sorts.mjs';
import { brancherSets } from '../branchements.mjs';
import { enregistrerSet, lireSets } from '../presets.mjs';
import { installerSimulations } from '../simulations-panel.mjs';
import { ajouterSimulation } from '../simulations.mjs';
import { instantane, patchDepuisSimulation } from '../instantane.mjs';
import { emblemeDeClasse } from '../classes.mjs';
import { LIBELLES_OPTIONS } from '../reglages.mjs';
import { attaqueArme } from '../objectif.mjs';
import { computeSpellDetail } from '../../src/engine/damage.mjs';
import { creerGestesReference } from '../gestes-reference.mjs';

import { creerPont } from './pont.mjs';
import { icone } from './icones.mjs';
import { renderClasses } from './accueil.mjs';
import { lignesCompletes, lignesEssentielles } from './fiche.mjs';
import { garderSignature, reglagesChanges, reprendreSignature } from './peremption.mjs';
import { ouvrirIdentite } from './identite.mjs';
import { basculerPalette, fermerPalette, paletteOuverte } from './palette.mjs';
import { comparaisonOuverte, fermerComparaison, ouvrirComparaison } from './vue-comparaison.mjs';
import { FAMILLES } from './fiche.mjs';
import { fermerPoints, ouvrirPoints, pointsOuverts } from './vue-points.mjs';
import { renderMelange } from './vue-melange.mjs';
import { fermerReglages, ouvrirReglages, reglagesOuverts } from './vue-reglages.mjs';
import {
  fermerPartage, ouvrirPartage, partageOuvert, proposerReglage,
} from './vue-partage.mjs';
import { rangerOptions, resumeCombo } from './options.mjs';
import { creerCadence } from './cadence.mjs';
import { caseOuverte, fermerCase, ouvrirCase } from './vue-case.mjs';
import {
  basculer, classesDeVolets, garderVolets, LARGEUR_ETROITE, lireVolets, ouvertureDepart,
} from './volets.mjs';
import { comboOuvert, fermerCombo, ouvrirCombo } from './vue-combo.mjs';
import { visiteAfaire } from './visite.mjs';
import { fermerVisite, ouvrirVisite, visiteOuverte } from './vue-visite.mjs';
import { fermerSignaler, ouvrirSignaler, signalerOuvert } from './vue-signaler.mjs';
import { VERSION_LUE } from '../version.mjs';
import { fermerMinimums, minimumsOuverts, MINIMUM_NEUF, ouvrirMinimums } from './vue-minimums.mjs';
import { paliersUtiles, renderPaliers, renderReglageProximite } from '../proximite-panel.mjs';
import { renderAnalyse } from '../analyse-panel.mjs';
import { equiperDans, remplacer, remplacementAuChoix } from '../equipement.mjs';

const { $, muets } = creerPont({ racine: document, fabrique: (t) => document.createElement(t) });

const nombre = (n) => Math.round(n).toLocaleString('fr-FR');

let etat = etatInitial();
let catalogue = null;
let classesSorts = null;

/** Vrai tant que le joueur n'a pas choisi sa classe : l'ecran vide tient. */
let vierge = true;

/** Vrai quand « tout voir » remplace l'essentiel dans le volet d'inspection. */
let toutVoir = false;

/**
 * Stuffs coches pour la comparaison, d'ou qu'ils viennent.
 *
 * Une seule table pour les trois listes : on compare un stuff trouve avec un
 * palier d'achat et un essai garde, ce qu'aucune des trois ne permettait
 * separement. La cle est l'OBJET lui-meme — deux stuffs peuvent porter le
 * meme score sans etre le meme stuff — et la valeur dit d'ou il vient.
 */
const choisis = new Map();

/** Oublie les coches dont l'objet n'est plus a l'ecran. */
function nettoyerChoisis(vivants) {
  for (const objet of choisis.keys()) if (!vivants.has(objet)) choisis.delete(objet);
}

/** Coche ou decoche un stuff, d'ou qu'il vienne. */
function basculerChoisi(objet, nom) {
  if (choisis.has(objet)) choisis.delete(objet);
  else choisis.set(objet, { nom });
  render();
}

/**
 * Reglages qui valaient au dernier lancement, ou null si aucun n'a eu lieu.
 *
 * Il sert a dire que ce qui est a l'ecran repond a une question precedente.
 * Oublier de relancer apres un reglage etait la vraie gene, pas le clic.
 */
let signatureLancement = null;

/**
 * Vrai quand la prochaine recherche doit repartir d'une population neuve.
 *
 * Couper une recherche tue les fils : ce qu'ils avaient en main n'existe plus.
 * Le prochain depart repart donc de zero quoi qu'il arrive, et le bouton n'a
 * plus de raison d'annoncer « Relancer » — il n'y a plus rien a relancer.
 * Sans cet indicateur, la seule facon de faire repartir de zero etait de
 * laisser la peremption allumee, ce qui gardait le mot « Relancer » a l'ecran
 * apres un arret.
 */
let repartDeZero = false;

/** Panneau des essais gardes, installe une fois le catalogue charge. */
let panneauSimulations = null;

const lireEtat = () => etat;

/** Nombre d'etats gardes pour l'annulation. */
const ETATS_GARDES = 30;

/**
 * Etats precedents, du plus ancien au plus recent.
 *
 * L'etat est immuable : garder les versions precedentes suffit a tout
 * annuler, sans une ligne de code par action. « Vider », « Interdire » et
 * « Remettre a zero » deviennent ainsi reversibles, et aucun d'eux n'a besoin
 * de demander confirmation.
 */
const passe = [];

function setEtat(patch) {
  passe.push(etat);
  if (passe.length > ETATS_GARDES) passe.shift();
  etat = { ...etat, ...patch };
  sauverEtat(etat);
  render();
}

/** Revient a l'etat precedent, s'il y en a un. */
function annuler() {
  const precedent = passe.pop();
  if (!precedent) {
    message('Rien a annuler.');
    return;
  }
  etat = precedent;
  sauverEtat(etat);
  render();
}

/** Enleve toutes les pieces portees. L'annulation les repose. */
function vider() {
  setEtat({ equipped: new Map(), posees: new Set() });
  message('Toutes les pieces sont enlevees. Ctrl+Z les repose.');
}

function message(texte, type = 'info') {
  const zone = $('message');
  zone.textContent = texte ?? '';
  zone.className = `message-v2 ${texte ? type : ''}`.trim();
}

/* --------------------------------------------------------------- Recherche --- */

const recherche = creerRecherche({
  $, lireEtat, setEtat, message,
  appliquer: (resultat, aussi = null) => setEtat(
    { ...appliquerBuild(etat, resultat, catalogue.itemById), ...(aussi ?? {}) }),
  garderSimulation: () => garderSimulation({ siNouvelle: true, silencieux: true }),
});

/* ------------------------------------------------------------------ Modes --- */

/**
 * Les trois objectifs proposes.
 *
 * « Caracteristiques » n'y figure pas : ce n'est plus un choix dans une liste,
 * c'est l'etat dans lequel l'outil se met quand il n'a aucun degat a compter.
 * Le joueur ne le choisit jamais, il le constate.
 */
const OBJECTIFS = Object.freeze([
  [SEARCH_MODES.DAMAGE, 'Frapper fort'],
  [SEARCH_MODES.ENDURANCE, 'Encaisser'],
  [SEARCH_MODES.MIXTE, 'Les deux'],
]);

/** Vrai quand aucun sort n'est pose : tout ce qui parle de degats se tait. */
const sansSorts = () => sortsCalcules(etat).length === 0;

/* ----------------------------------------------------------------- Rendu --- */

/*
 * L'ecran se repeint au rythme de l'oeil, jamais sous un doigt pose.
 *
 * Voir `cadence.mjs` : pendant une recherche, le meilleur build s'applique
 * des qu'il s'ameliore, et chaque application remplacait des noeuds au milieu
 * d'un clic. Le clic se perdait.
 */
const cadence = creerCadence({
  peindre: () => peindre(),
  // Une image d'ecran est le bon moment pour peindre — sauf qu'un onglet en
  // arriere-plan n'en produit aucune. La page s'ouvrait alors vide, et le
  // restait jusqu'a ce qu'on vienne la regarder. Le compte a rebours prend le
  // relais : le premier des deux qui arrive peint, le second ne fait rien.
  planifier: (suite) => {
    let fait = false;
    const uneSeuleFois = () => { if (fait) return; fait = true; suite(); };
    requestAnimationFrame(uneSeuleFois);
    setTimeout(uneSeuleFois, 120);
  },
});

const render = () => cadence.demander();

window.addEventListener('pointerdown', cadence.enfoncer, true);
window.addEventListener('pointerup', cadence.relacher, true);
// Un doigt qui sort de l'ecran ne leve jamais : sans cela, l'ecran resterait
// fige jusqu'au prochain clic.
window.addEventListener('pointercancel', cadence.relacher, true);

function peindre() {
  if (vierge) return;

  const build = buildCourant(etat, catalogue);
  const stats = build?.stats ?? {};
  const bilan = build ? scoreAffiche(etat, stats) : null;
  const degats = sansSorts() ? null : (Number(bilan?.damage) || 0);

  renderIdentite();
  renderPlateau(stats);
  renderVerdict(stats, degats);
  renderObjectif();
  renderMelangeOuPas(bilan, stats);
  renderSorts();
  renderAvoir(stats, degats);
  renderTrouves(bilan);
  renderProximite();
  renderComparer();
  renderPanoplie(build);
  renderAnalyseDuStuff(bilan, stats);
  renderInspecteur(stats, degats);
  renderScore(bilan);
  renderCombo($('carte-combo'), bilan?.combo ?? null, {
    onAppliquer: (combo) => {
      const sorts = sortsDuCombo(combo);
      if (sorts.length === 0) return;
      setEtat({ sorts });
      message(`La liste des sorts reprend le combo : ${sorts.length} sort(s).`);
    },
    onGarder: garderCombo,
  });
  const arme = attaqueArme(etat);
  renderArme($('carte-arme'), arme, arme && stats ? computeSpellDetail(arme, stats) : null);
  renderFraicheur();
  renderArret();
}

/**
 * Le bouton de droite : arreter la recherche, ou revenir en arriere.
 *
 * Les deux gestes ne cohabitent pas. Pendant une recherche, revenir en
 * arriere n'a aucun sens : le solveur repose son build a chaque amelioration,
 * et l'etat d'avant serait efface dans la seconde. Le bouton porte donc le
 * geste qui a un sens a ce moment-la, et le DIT — son dessin et son libelle
 * changent ensemble, rien ne se decide en silence.
 *
 * Ctrl+Z reste l'annulation en toutes circonstances.
 */
function renderArret() {
  const bouton = $('annuler');
  const cherche = recherche.tourne();

  bouton.disabled = cherche ? false : passe.length === 0;
  bouton.title = cherche
    ? 'Coupe la recherche net. Contrairement a la pause, elle ne rend rien : '
      + 'ce que les fils avaient en main est perdu.'
    : 'Annule la derniere action (Ctrl+Z)';
  bouton.replaceChildren(
    icone(cherche ? 'stop' : 'annuler'),
    el('span', { text: cherche ? 'Arreter' : 'Annuler' }));
}

function renderIdentite() {
  $('identite-img').src = avatarDeClasse(etat.classe, etat.sexe);
  $('identite-nom').textContent = nomDeClasse(etat.classe);
  $('identite-detail').textContent = `${etat.niveau} · ${etat.sexe ? '♀' : '♂'}`;
}

function renderPlateau(stats) {
  const colonne = (id, cles) => {
    const noeud = $(id);
    renderCases(noeud, cles, etat.equipped, etat.posees,
      (cle, item) => ouvrirFicheDe(cle, item), etat.verrous, stats);
    return noeud;
  };

  const plateau = $('plateau');
  if (!plateau.firstChild) {
    plateau.replaceChildren(
      el('div', { class: 'colonne-cases', id: 'cases-gauche' }),
      el('div', { class: 'avatar-v2' }, el('img', { id: 'avatar-image', alt: '' })),
      el('div', { class: 'colonne-cases', id: 'cases-droite' }),
      el('div', { class: 'rangee-artefacts', id: 'cases-artefacts' }));
  }
  colonne('cases-gauche', SLOTS_GAUCHE);
  colonne('cases-droite', SLOTS_DROITE);
  colonne('cases-artefacts', SLOTS_ARTEFACTS);
  $('avatar-image').src = avatarDeClasse(etat.classe, etat.sexe);
}

function renderVerdict(stats, degats) {
  const vDegats = $('v-degats');
  vDegats.textContent = degats === null ? '—' : nombre(degats);
  vDegats.classList.toggle('vide-mesure', degats === null);
  $('degats-sans-sorts').hidden = degats !== null;
  $('degats-avec-sorts').hidden = degats === null;
  if (degats !== null) {
    $('degats-phrase').textContent = `Vos sorts envoient ${nombre(degats)} degats sur un tour.`;
  }

  const pdv = Number(stats.pdvEffectifs) || 0;
  $('v-pdv').textContent = nombre(pdv);
  $('pdv-phrase').textContent = `Vous encaissez ${nombre(pdv)} degats bruts avant de tomber.`;

  const rangees = rangerOptions(optionsAffichees(etat.options));
  renderOptions($('options-degats'), rangees.degats, poserOption);
  renderOptions($('options-pdv'), rangees.pdv, poserOption);

  // « A acheter » n'a de sens que face a un stuff de reference : sans lui, tout
  // est un achat, et le chiffre ne dit rien.
  const aAcheter = etat.reference
    ? [...etat.equipped.values()].filter((item) => !etat.reference.itemIds.includes(item.id)
        && !etat.possedees.has(item.id)).length
    : null;
  $('v-achats').textContent = aAcheter === null ? '—' : nombre(aAcheter);
  $('achats-phrase').textContent = aAcheter === null
    ? 'Dites-moi quel stuff vous portez pour compter les achats.'
    : 'face a votre stuff actuel';
}

function renderObjectif() {
  const muet = sansSorts();
  $('objectif').classList.toggle('inactif', muet);
  $('objectif').classList.toggle('sans-choix', etat.mode === SEARCH_MODES.STATS);
  $('objectif').replaceChildren(...OBJECTIFS.map(([cle, texte]) => el('button', {
    type: 'button', style: 'flex:1', 'data-mode': cle,
    'aria-pressed': String(etat.mode === cle),
    ...(muet ? { disabled: true } : {}),
    onClick: () => setEtat({ mode: cle }),
  }, texte)));

  $('aide-objectif').textContent = muet
    ? 'Sans sort, la recherche monte vos caracteristiques. Choisissez des sorts '
      + 'pour arbitrer entre frapper et encaisser.'
    : 'La recherche fait monter cette mesure et tient les minimums demandes.';
}

/**
 * Le reglage du melange n'existe que dans le mode qui s'en sert.
 *
 * Un curseur visible dans « frapper fort » laisserait croire qu'il change
 * quelque chose ; il ne changerait rien, et le joueur chercherait longtemps
 * pourquoi.
 */
function renderMelangeOuPas(bilan, stats) {
  const enMixte = etat.mode === SEARCH_MODES.MIXTE;
  $('melange').hidden = !enMixte;
  if (!enMixte) return;

  renderMelange($('melange'), {
    paliers: etat.survie ?? [],
    // `pdv` ne vient pas du score : il vit dans les statistiques du build.
    porte: bilan
      ? { damage: bilan.damage, endurance: bilan.endurance, pdv: Number(stats.pdv) || 0 }
      : null,
    part: etat.partDegats,
    onPart: (part) => setEtat({ partDegats: part }),
    onChoisir: (palier, part) => {
      recherche.porterAlaMain(palier, { partDegats: part });
      message(`Stuff porte : ${nombre(Math.floor(palier.damage))} de degats, `
        + `${nombre(Math.floor(palier.endurance))} pdv effectifs.`);
    },
  });
}

function renderSorts() {
  const sorts = sortsCalcules(etat);
  $('compte-sorts').textContent = String(sorts.length);
  $('chips-sorts').replaceChildren(...etat.sorts.map((sort) => el('span', { class: 'chip' },
    sort.icon ? el('img', { src: sort.icon, alt: '', decoding: 'async' }) : null,
    sort.name ?? sort.fr ?? String(sort.id),
    el('button', {
      type: 'button', text: '×', title: `Enlever ${sort.name ?? sort.fr ?? 'ce sort'}`,
      onClick: () => setEtat({ sorts: etat.sorts.filter((s) => s.id !== sort.id) }),
    }))));
  // Le bouton de l'enchainement porte l'etat du reglage : sans cela, il faut
  // l'ouvrir pour savoir si le combo compte ou non.
  $('etat-combo').textContent = resumeCombo(etat.options);
  $('aide-sorts').replaceChildren(
    ...(sorts.length ? [] : [
      'Aucun sort. L\'outil n\'en pose aucun d\'office : un chiffre de degats '
        + 'faux vaut moins que pas de chiffre.',
      el('br'),
    ]),
    el('button', { class: 'btn mini fantome', type: 'button', style: 'padding-left:0',
      text: sorts.length ? 'Changer mes sorts' : 'Choisir des sorts…',
      onClick: gestesSorts.ouvrir }),
    ...(sorts.length
      ? [el('button', { class: 'btn mini fantome', type: 'button',
          text: 'Tout enlever', onClick: gestesSorts.toutEnlever })]
      : []));
}

function renderAvoir(stats, degats) {
  const ligne = (texte, valeur, actions = {}) => el(actions.onClick ? 'button' : 'div', {
    class: 'avoir-ligne', ...(actions.onClick ? { type: 'button', onClick: actions.onClick } : {}),
    ...(actions.title ? { title: actions.title } : {}),
  },
    el('span', { text: texte }), el('span', {}, el('b', { text: String(valeur) })));

  const aUneReference = Boolean(etat.reference);
  $('avoir').replaceChildren(
    ligne('Mon stuff actuel', aUneReference ? etat.reference.itemIds.length : '—', {
      onClick: () => (aUneReference
        ? gestesReference.oublierReference()
        : gestesReference.figerReference()),
      title: aUneReference
        ? 'Oublier ce stuff : le solveur cherchera sans compter les achats.'
        : 'Figer le stuff porte comme celui que vous avez en jeu. Les pieces '
          + 'que le solveur propose se comptent alors en achats.',
    }),
    ligne('Pieces en banque', etat.possedees.size,
      { onClick: () => basculerPalette(liensPalette),
        title: 'Marquer les pieces que vous avez deja.' }),
    ligne('Pieces interdites', etat.bannis.size,
      { onClick: () => basculerPalette(liensPalette),
        title: 'Une piece interdite ne sera plus proposee.' }));

  $('ouvrir-palette').replaceChildren('Toutes les pieces',
    el('span', { class: 'raccourci', text: raccourciPalette() }));

  // Un minimum se lit a cote de la valeur que le MOTEUR lui compare, pas de
  // la statistique qui porte le meme nom. Une condition « Vitalite » porte sur
  // les points de vie : montrer la caracteristique donnait un minimum tenu et
  // pourtant rouge, et personne ne pouvait comprendre pourquoi.
  $('compte-limites').textContent = String(etat.conditions.length);
  $('regler-minimums').onclick = () => ouvrirMinimums({
    lireEtat, setEtat, message,
    lireMesures: () => {
      const b = buildCourant(etat, catalogue);
      const bl = b ? scoreAffiche(etat, b.stats) : null;
      return { stats: b?.stats ?? null, degats: Number(bl?.damage) || 0 };
    },
  });
  $('limites').replaceChildren(...etat.conditions.map((c) => {
    const valeur = conditionValue(c.stat, stats, degats ?? 0);
    const tenu = valeur >= c.target;
    const icone = iconeStat(c.stat);
    return el('div', { class: `limite ${tenu ? '' : 'defaut'}`.trim() },
      el('i', { class: `etat ${tenu ? 'tenue' : 'defaut'}` }),
      icone
        ? el('img', { class: 'limite-icone', src: icone, alt: '', decoding: 'async' })
        : el('span', { class: 'limite-icone' }),
      el('span', { class: 'limite-nom', text: STAT_LABELS[c.stat] ?? c.stat }),
      el('b', { class: 'n', text: `${nombre(valeur)} / ${nombre(c.target)}` }),
      el('button', {
        class: 'oter', type: 'button', text: '×',
        title: `Ne plus exiger de ${(STAT_LABELS[c.stat] ?? c.stat).toLowerCase()}`,
        onClick: () => enleverMinimum(c.stat),
      }));
  }));
}

/**
 * Les autres builds que la recherche a retenus.
 *
 * Chaque ligne se lit comme une DIFFERENCE, pas comme une fiche de plus : les
 * pieces a mettre, celles a enlever, et ce que l'echange rapporte.
 */
function renderTrouves(bilan) {
  const candidats = etat.candidats ?? [];
  $('compte-trouves').textContent = String(candidats.length);

  renderCandidats($('trouves'), candidats, {
    portes: new Set([...etat.equipped.values()].map((i) => i.id)),
    itemById: catalogue?.itemById ?? new Map(),
    porte: bilan,
    onPorter: (candidat) => recherche.porterAlaMain(candidat),
    selection: {
      choisis,
      onBasculer: (candidat) => basculerChoisi(candidat,
        `Trouve ${candidats.indexOf(candidat) + 1}`),
    },
  });
}

/** Le bandeau de comparaison : il ne parait qu'avec quelque chose a comparer. */
function renderComparer() {
  const bouton = $('comparer');
  bouton.hidden = choisis.size === 0;
  bouton.textContent = `Comparer ${choisis.size + 1}`;
  bouton.title = 'Compare le stuff porte et les stuffs coches, d\'ou qu\'ils viennent.';
}

/**
 * « Proche de mon stuff » : ce qu'une a trois pieces achetees rapportent.
 *
 * Le meilleur build du solveur demande souvent seize pieces neuves. Un joueur
 * qui equipe deja un personnage ne veut pas tout racheter. Le gain se lit face
 * au stuff de REFERENCE, jamais face au build pose : c'est l'achat qui se
 * decide, pas l'essai en cours.
 */
function renderProximite() {
  renderReglageProximite($('reglage-proximite'), {
    reference: etat.reference,
    max: etat.changementsMax,
    possedees: etat.possedees.size,
    portees: etat.equipped.size,
  }, {
    onFiger: gestesReference.figerReference,
    onOublier: gestesReference.oublierReference,
    onReprendre: gestesReference.reprendreReference,
    onMax: (valeur) => setEtat({ changementsMax: valeur }),
  });

  const paliers = etat.reference ? (etat.paliers ?? []) : [];
  const reference = valeurDeReference(etat, catalogue);
  $('compte-paliers').textContent = String(paliersUtiles(paliers, reference).length);

  renderPaliers($('paliers'), paliers, {
    reference,
    itemById: catalogue?.itemById ?? new Map(),
    piecesReference: etat.reference?.itemIds ?? [],
    max: etat.changementsMax,
    possedees: etat.possedees,
    onPorter: (palier) => {
      recherche.porterAlaMain(palier);
      message(`Stuff porte : ${palier.changements} piece(s) a acheter, `
        + `${nombre(Math.floor(palier.damage))} de degats.`);
    },
    selection: {
      choisis,
      onBasculer: (palier) => basculerChoisi(palier,
        `${palier.changements} piece(s)`),
    },
  });
}

/**
 * Les bonus de panoplie actifs.
 *
 * Le compte en tete est celui que les trophees verifient : (pieces − 1) par
 * panoplie, jamais le nombre de panoplies.
 */
function renderPanoplie(build) {
  const sets = build?.sets ?? [];
  $('compte-bonus').textContent = String(
    sets.reduce((n, s) => n + Math.max(0, s.pieces - 1), 0));
  $('bloc-panoplies').hidden = sets.length === 0;

  renderPanoplies($('panoplies'), sets, catalogue?.setById ?? new Map(), STAT_LABELS, {
    itemById: catalogue?.itemById ?? new Map(),
    equippedIds: new Set([...etat.equipped.values()].map((p) => p.id)),
    onPick: (piece) => ouvrirFiche(piece, { onEquip: () => poserPiece(piece) }),
  });
}

/**
 * D'ou vient le score, et ou investir pour le monter.
 *
 * Sans piece portee, il n'y a rien a analyser : le bloc disparait plutot que
 * de montrer trois listes vides.
 */
function renderAnalyseDuStuff(bilan, stats) {
  const bloc = $('bloc-analyse');
  bloc.hidden = !bilan || etat.equipped.size === 0;
  if (bloc.hidden) return;

  renderAnalyse(
    { apports: $('apports'), sensibilite: $('sensibilite'), remplacements: $('remplacements') },
    {
      etat,
      catalogue,
      stats,
      cible: cibleAffichee(etat),
      tenu: bilan.satisfied,
      contexte: {
        level: etat.niveau,
        allocation: etat.allocation,
        scrolls: etat.scrolls,
        passives: passifsActifs(etat),
        profile: profilDe(etat),
        setById: catalogue.setById,
      },
      onRemplacer: (proposition) => {
        setEtat(remplacer(etat, proposition.actuel, proposition.remplacant));
        message(`${proposition.remplacant.fr} posee`
          + `${proposition.actuel ? ` a la place de ${proposition.actuel.fr}` : ''}.`);
      },
    });
}

function renderInspecteur(stats, degats) {
  const minimums = etat.conditions.map((c) => c.stat);
  const lignes = toutVoir
    ? lignesCompletes(stats, new Set(minimums))
    : lignesEssentielles(stats, minimums, { degats, pdvEffectifs: Number(stats.pdvEffectifs) || 0 });

  $('tete-quoi').textContent = toutVoir ? 'Tout voir' : 'La fiche';
  $('tete-note').textContent = 'stuff porte';

  const noeud = (l) => (l.famille
    ? el('p', { class: 'famille' }, l.famille,
        l.famille === 'Caracteristiques'
          ? el('button', {
              class: 'btn mini fantome', type: 'button', text: 'Repartir mes points',
              onClick: () => ouvrirPoints({
                lireEtat, setEtat, lireStats: () => buildCourant(etat, catalogue)?.stats ?? null,
              }),
            })
          : null)
    : el('button', {
        // `exigee` et `sousMinimum` disent la meme chose vue de deux listes :
        // cette mesure est une des votres. Elle se reconnait sans lire, a son
        // fond et a son filet, parce que c'est elle qu'on vient verifier.
        class: `ligne ${l.exigee || l.sousMinimum ? 'exigee' : ''}`.trim(), type: 'button',
        ...(l.muet ? { disabled: true } : {}),
        title: l.exigee || l.sousMinimum
          ? `${l.libelle} est deja dans vos minimums.`
          : `Garder au moins ${nombre(l.valeur)} de ${l.libelle.toLowerCase()}.`,
        onClick: () => poserMinimum(l.cle, l.valeur),
      },
        el('img', { class: 'ligne-icone', src: iconeStat(l.cle) ?? '', alt: '', decoding: 'async' }),
        el('span', { class: 'ligne-nom', text: l.libelle }),
        // Une resistance porte deux chiffres : le brut et le pourcentage. Ils
        // ne se lisent jamais l'un sans l'autre.
        l.pourcent === null || l.pourcent === undefined
          ? el('b', { class: `ligne-val n ${l.muet ? 'vide-mesure' : ''}`.trim(),
              text: l.muet ? '—' : nombre(l.valeur) })
          : el('span', { class: 'ligne-paire' },
              el('b', { class: `n ${l.sansBrut ? 'vide-mesure' : ''}`.trim(),
                title: 'Retire au coup', text: l.sansBrut ? '—' : nombre(l.valeur) }),
              el('b', { class: 'n pct', title: 'Retranche en pourcentage',
                text: `${nombre(l.pourcent)} %` }))));

  $('corps-inspecteur').replaceChildren(
    ...lignes.map(noeud),
    el('button', {
      class: 'btn mini fantome', type: 'button', style: 'margin:14px 16px',
      onClick: () => { toutVoir = !toutVoir; render(); },
      text: toutVoir ? 'Voir l\'essentiel' : 'Tout voir',
    }));
}

function renderScore(bilan) {
  if (!bilan) return;
  const valeur = Number(bilan.score);
  $('score').textContent = Number.isFinite(valeur) ? nombre(valeur) : '—';

  // Un score negatif ne se lit pas comme un petit score : il dit qu'un
  // minimum n'est pas tenu. La couleur et la note le disent ensemble.
  const tenus = bilan?.satisfied !== false;
  $('score').classList.toggle('pos', tenus);
  $('score').classList.toggle('neg', !tenus);
  $('score-note').textContent = tenus
    ? 'score'
    : `${bilan.unmet.length} minimum(s) non tenu(s)`;
  recherche.dessiner();
}

/**
 * Dit si ce qui est a l'ecran repond encore aux reglages courants.
 *
 * Le bouton ne se contente pas de changer de mot : il porte une pastille, car
 * un libelle seul se lit mal dans une barre ou rien d'autre ne bouge.
 *
 * Il faut cependant qu'il y ait quelque chose a perimer. La signature du
 * dernier lancement survit au rechargement, mais pas les propositions qu'il
 * a rendues : `candidats`, `paliers` et `survie` ne sont pas ranges avec
 * l'etat. Une session neuve ouvrait donc sur « Relancer » et une pastille
 * d'alerte devant un ecran vide, ce qui promettait un ecart la ou il n'y
 * avait rien du tout.
 */
function renderFraicheur() {
  const montre = [etat.candidats, etat.paliers, etat.survie]
    .some((liste) => (liste ?? []).length > 0);
  const perime = montre && reglagesChanges(signatureLancement, etat);
  const bouton = $('lancer');
  bouton.classList.toggle('rappel', perime);
  // Le bouton se reconstruit en entier : ecrire son texte seul effaçait le
  // pictogramme pose au demarrage, et « Chercher » restait le seul des cinq
  // a n'avoir aucune image.
  bouton.replaceChildren(
    ...(perime ? [el('span', { class: 'puce' })] : [icone('play')]),
    el('span', { text: perime ? 'Relancer' : 'Chercher' }));
  bouton.title = perime
    ? 'Un reglage a bouge depuis la derniere recherche : ce qui est montre '
      + 'repond a la question d\'avant.'
    : '';
}

/**
 * Toutes les mesures de la fiche, dans l'ordre du jeu.
 *
 * La comparaison les parcourt toutes : c'est elle qui masque ce qui ne varie
 * pas, pas la liste qui choisit d'avance ce qui merite d'etre compare.
 */
const MESURES_COMPARABLES = FAMILLES.flatMap(([famille, paires]) =>
  paires.map(([cle, libelle]) => ({ cle, libelle, famille })));

/**
 * Les statistiques d'un stuff coche.
 *
 * Un essai garde porte les siennes : ce sont celles qu'il AVAIT, et les
 * recalculer aujourd'hui donnerait autre chose si les points ou les options
 * ont bouge depuis. Un candidat ou un palier n'en porte pas : on repose son
 * stuff sur une copie de l'etat et on laisse le moteur faire le calcul.
 */
function statsDe(objet) {
  if (objet.stats) return objet.stats;

  const ids = objet.itemIds ?? (objet.pieces ?? []).map((p) => p.id);
  return buildCourant(
    { ...etat, ...appliquerBuild(etat, { ...objet, itemIds: ids }, catalogue.itemById) },
    catalogue,
  )?.stats ?? {};
}

/** Ouvre la comparaison du stuff porte et des stuffs coches. */
function comparer() {
  if (choisis.size === 0) return;

  ouvrirComparaison({
    mesures: MESURES_COMPARABLES,
    colonnes: [
      { nom: 'Porte', stats: buildCourant(etat, catalogue)?.stats ?? {} },
      ...[...choisis].map(([objet, { nom }]) => ({ nom, stats: statsDe(objet) })),
    ],
    minimums: new Set(etat.conditions.map((c) => c.stat)),
  });
}

/**
 * Le raccourci de la palette, ecrit comme la machine le dit.
 *
 * « ⌘K » sur un Mac, « Ctrl K » ailleurs : montrer le mauvais signe apprend un
 * geste qui ne marche pas.
 */
function raccourciPalette() {
  const surMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  return surMac ? '⌘K' : 'Ctrl K';
}

/**
 * Remplit les listes de jeux enregistres.
 *
 * Le choix courant se garde s'il existe encore : recharger la liste apres un
 * enregistrement ne doit pas faire sauter la selection du joueur.
 */
/** Natures de jeux enregistres, et la liste qui les montre. */
const NATURES_JEUX = Object.freeze([
  'sorts', 'conditions', 'stuff', 'banque', 'bannis',
]);

function remplirListesSets() {
  for (const [nature, id] of NATURES_JEUX.map((n) => [n, `sets-${n}`])) {
    const noeud = $(id);
    const choisi = noeud.value;
    const jeux = lireSets(nature);

    noeud.replaceChildren(...(jeux.length === 0
      ? [el('option', { value: '', text: 'aucun jeu enregistre' })]
      : jeux.map((j) => el('option', { value: j.nom, text: j.nom }))));

    if (choisi && jeux.some((j) => j.nom === choisi)) noeud.value = choisi;
  }
}

/**
 * Range le stuff porte parmi les essais gardes.
 *
 * `siNouvelle` evite d'empiler quarante fois le meme stuff : la recherche
 * appelle cette fonction a chaque amelioration.
 */
function garderSimulation(choix = {}) {
  const build = buildCourant(etat, catalogue);
  if (!build) {
    message('Rien a garder : le catalogue n\'est pas encore charge.');
    return;
  }

  let ajoutee = null;
  try {
    ({ ajoutee } = ajouterSimulation(
      instantane(etat, build, scoreAffiche(etat, build.stats)),
      { siNouvelle: choix.siNouvelle }));
  } catch (erreur) {
    message(erreur.message, 'erreur');
    return;
  }

  panneauSimulations?.rafraichir();
  if (choix.silencieux || !ajoutee) return;
  message(`Essai garde a ${nombre(Math.floor(ajoutee.score))} degats.`);
}

/** Repose un essai garde sur le personnage. */
function restaurerSimulation(simulation) {
  if (!catalogue) return;
  const { patch, manquantes } = patchDepuisSimulation(etat, simulation, catalogue.itemById);
  setEtat(patch);
  message(manquantes === 0
    ? 'Essai repose. « Annuler » revient au stuff d\'avant.'
    : `Essai repose. ${manquantes} piece(s) introuvable(s) au catalogue.`,
  manquantes === 0 ? 'info' : 'erreur');
}

/**
 * Les sorts d'un combo, avec le nombre de lancers qu'il leur donne.
 *
 * Le nombre de lancers va dans « repeats » : c'est ce champ que les degats
 * comptent. « castsPerTurn » reste la limite du jeu, elle ne bouge pas.
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

/** Enregistre le combo comme un jeu de sorts. */
function garderCombo(combo) {
  const sorts = sortsDuCombo(combo);
  if (sorts.length === 0) return;
  const nom = window.prompt('Nom du jeu de sorts :', 'combo');
  if (nom === null) return;
  try {
    enregistrerSet('sorts', nom, sorts);
    remplirListesSets();
    $('sets-sorts').value = nom.trim();
    message(`Jeu de sorts « ${nom.trim()} » enregistre depuis le combo.`);
  } catch (erreur) {
    message(erreur.message, 'erreur');
  }
}

/** Change une option de calcul. */
const poserOption = (cle, valeur) => setEtat({ options: { ...etat.options, [cle]: valeur } });

/* ---------------------------------------------------------- Les minimums --- */

/**
 * Pose un minimum a la valeur atteinte, ou le remonte s'il existe deja.
 *
 * Cliquer un chiffre deja sous minimum n'est pas une erreur : c'est un joueur
 * qui vient de gagner de la valeur et veut la garder. Le minimum monte alors
 * a ce qu'il a maintenant, jamais il ne redescend.
 */
function poserMinimum(stat, valeur) {
  const cible = Math.round(Number(valeur) || 0);
  const deja = etat.conditions.find((c) => c.stat === stat);

  if (!deja) {
    setEtat({ conditions: [...etat.conditions, POIDS_PAR_DEFAUT(stat, cible)] });
    message(`Garde au moins ${nombre(cible)} de ${(STAT_LABELS[stat] ?? stat).toLowerCase()}.`);
    return;
  }

  if (cible <= deja.target) {
    message(`${STAT_LABELS[stat] ?? stat} est deja garde a ${nombre(deja.target)} au moins.`);
    return;
  }
  setEtat({
    conditions: etat.conditions.map((c) => (c.stat === stat ? { ...c, target: cible } : c)),
  });
  message(`${STAT_LABELS[stat] ?? stat} : le minimum monte a ${nombre(cible)}.`);
}

/** Forme d'un minimum pose a la main : la meme que dans la feuille. */
const POIDS_PAR_DEFAUT = (stat, target) => ({ ...MINIMUM_NEUF(stat), target });

/** Enleve un minimum. */
function enleverMinimum(stat) {
  setEtat({ conditions: etat.conditions.filter((c) => c.stat !== stat) });
  message(`${STAT_LABELS[stat] ?? stat} n'est plus un minimum.`);
}

/* ------------------------------------------------------------- Ouvertures --- */

const gestes = creerGestesCatalogue({
  lireEtat, lireCatalogue: () => catalogue, setEtat, message,
});

const gestesSorts = creerGestesSorts({
  lireEtat, setEtat, message, lireClassesSorts: () => classesSorts,
});

const gestesReference = creerGestesReference({
  lireEtat, setEtat, message, nomDeClasse, lireRecherche: () => recherche,
});

/**
 * Ouvre la fiche d'une piece portee, avec ce qu'on peut en faire.
 *
 * Une fiche qui ne sait que se fermer laisse le joueur devant un mur : il a
 * clique pour agir autant que pour lire. Les quatre gestes sont ceux de v1,
 * empruntes tels quels.
 */
function ouvrirFicheDe(cle, item) {
  const build = buildCourant(etat, catalogue);
  ouvrirFiche(item, {
    stats: build?.stats ?? null,
    onRemove: () => gestes.retirer(cle),
    onLock: () => gestes.verrouiller(item),
    verrouille: etat.verrous.has(item.id),
    onBan: () => gestes.bannir(item),
    banni: etat.bannis.has(item.id),
    onPosseder: () => gestes.basculerPossedee(item),
    possedee: etat.possedees.has(item.id),
  });
}

/* ------------------------------------------------------------------- Boot --- */

/**
 * Propose la visite au premier passage, et une seule fois.
 *
 * Elle attend que l'atelier soit pose : une lucarne mesuree avant la mise en
 * page se poserait a cote de la commande qu'elle montre.
 */
function proposerVisiteUneFois() {
  if (vierge || !visiteAfaire()) return;
  setTimeout(() => { if (!vierge && visiteAfaire()) ouvrirVisite({ message }); }, 600);
}

/* ==================================== Les deux volets ===
 *
 * Voir `volets.mjs` : l'etat se calcule la, l'ecran ne fait que le porter.
 */

/** Vrai quand les trois colonnes ne tiennent plus cote a cote. */
const ecranEtroit = () => window.innerWidth <= LARGEUR_ETROITE;

let volets = ouvertureDepart({ garde: lireVolets(), etroit: ecranEtroit() });

/** Pose l'etat des volets sur l'ecran. */
function montrerVolets() {
  const etroit = ecranEtroit();
  const appli = $('travail');
  appli.classList.remove('gauche-replie', 'droit-replie', 'volets-flottants');
  appli.classList.add(...classesDeVolets(volets, etroit));

  for (const cote of ['gauche', 'droit']) {
    $(`bascule-${cote}`).setAttribute('aria-pressed', String(volets[cote]));
  }
  // Le voile ne sert qu'a refermer un volet flottant : sur un ecran large,
  // les volets ne recouvrent rien.
  $('volets-voile').hidden = !etroit || (!volets.gauche && !volets.droit);
}

/** Ouvre ou replie un volet, et garde le choix. */
function basculerVolet(cote) {
  const etroit = ecranEtroit();
  volets = basculer(volets, cote, etroit);
  garderVolets(volets, etroit);
  montrerVolets();
}

/**
 * Pose une piece, en demandant quelle case remplacer quand c'est necessaire.
 *
 * Tant qu'une case de la famille est libre, la piece s'y pose sans un mot.
 * Quand elles sont toutes prises — six dofus, deux anneaux — l'outil ecrasait
 * la derniere en silence : la question se pose maintenant.
 */
function poserPiece(item) {
  if (!remplacementAuChoix(etat, item)) {
    gestes.equiper(item);
    return;
  }

  ouvrirCase({
    etat,
    item,
    onChoisir: (cle) => {
      const patch = equiperDans(etat, item, cle);
      if (!patch) return;
      setEtat(patch);
      message(`« ${item.fr ?? item.name} » prend la place ${cle.split(':')[1] * 1 + 1}.`);
    },
  });
}

function choisirClasse(classe) {
  vierge = false;
  $('accueil').hidden = true;
  $('travail').hidden = false;
  $('identite').hidden = false;
  $('barre-droite').hidden = false;
  $('barre-volets').hidden = false;
  setEtat({ classe });
  recherche.lancer();
  proposerVisiteUneFois();
}

/**
 * Accueille un reglage arrive par un lien.
 *
 * Il ne se pose pas tout seul. Quelqu'un qui travaille depuis une heure ne
 * doit pas perdre sa seance parce qu'il a ouvert le lien d'un ami : l'ecran
 * dit ce que le lien porte, et attend.
 *
 * Le fragment s'efface des qu'il est lu, avant meme la reponse. Sans cela un
 * rechargement reposerait la meme question, et le lien collerait a la page
 * longtemps apres avoir ete repondu.
 */
async function accueillirLien() {
  const forme = await reglageDuFragment(location.hash);
  if (!forme) return;
  history.replaceState(null, '', location.pathname + location.search);

  proposerReglage({
    compte: resume(forme, catalogue),
    nomDeClasse,
    onAdopter: () => {
      const recu = adopter(forme, catalogue);

      // Le lien ne porte que les identifiants des sorts : le catalogue les
      // refabrique. Un sort qu'il ne connait pas — classe changee, sort
      // retire du jeu — repartirait sans aucune ligne de degats et compterait
      // pour zero sans le dire. Mieux vaut ne pas le poser et l'annoncer.
      const { sorts } = enrichirSorts(recu.sorts, classesSorts, recu.niveau);
      const tenus = sorts.filter((sort) => (sort.lines ?? []).length > 0);
      setEtat({ ...recu, sorts: tenus });

      // Le reglage recu pose une question neuve : rien a l'ecran n'y repond
      // encore, et le bouton ne doit pas annoncer une peremption.
      signatureLancement = garderSignature(etat);
      repartDeZero = true;

      if (vierge) {
        vierge = false;
        $('accueil').hidden = true;
        $('travail').hidden = false;
        $('identite').hidden = false;
        $('barre-droite').hidden = false;
        $('barre-droite').style.display = 'flex';
      }
      const perdus = sorts.length - tenus.length;
      message(perdus > 0
        ? `Reglage adopte, sans ${perdus} sort(s) que le catalogue ne connait pas. `
          + 'Ctrl+Z rend le votre.'
        : 'Reglage adopte. Ctrl+Z rend le votre.');
      render();
    },
  });
}

async function main() {
  $('version').textContent = VERSION_LUE;
  montrerVolets();

  // Les noeuds que la nouvelle coquille ne montre plus vivent quand meme dans
  // le document : un champ hors de l'arbre ne garde pas sa valeur de facon
  // fiable, et les modules de v1 les lisent au lancement.
  document.body.append(...muets.values());

  // Chaque commande recoit son dessin avant son libelle. Ceux de « Chercher »
  // et d'« Annuler » changent avec ce qu'ils font : ils se posent au rendu.
  for (const [id, nom] of [['arreter', 'pause'], ['vider', 'poubelle'],
    ['partager', 'partage'], ['signaler', 'megaphone'], ['visite', 'boussole'],
    ['reglages', 'engrenage']]) {
    $(id).prepend(icone(nom));
  }

  renderClasses($('classes'), choisirClasse);
  message('Chargement du catalogue…');

  try {
    [catalogue, classesSorts] = await Promise.all([loadCatalog(), loadSpells()]);
    etat = reprendreEtat(etat, catalogue);

    const { sorts, changes } = enrichirSorts(etat.sorts, classesSorts, etat.niveau);
    if (changes) etat = { ...etat, sorts };

    // Un etat range dit que le joueur est deja venu : l'ecran vide n'a plus
    // rien a demander, il ouvrirait une question deja repondue.
    //
    // La question se pose au RANGEMENT, pas aux pieces portees. Un profil
    // repris peut ne porter ni piece ni sort — une classe, un niveau et des
    // minimums font deja un reglage — et l'ecran vide le cachait entier.
    if (etatRange()) {
      vierge = false;
      $('accueil').hidden = true;
      $('travail').hidden = false;
      $('identite').hidden = false;
      $('barre-droite').hidden = false;
      $('barre-volets').hidden = false;
    }

    // Les resultats ranges reviennent avec l'etat : ils doivent etre juges
    // face aux reglages du lancement qui les a produits, pas face a rien.
    signatureLancement = reprendreSignature();

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
      onMessage: (texte) => message(texte),
      selection: {
        choisis,
        onBasculer: (simulation) => basculerChoisi(simulation,
          simulation.nom || `${nomDeClasse(simulation.classe)} ${simulation.niveau}`),
      },
    });

    remplirListesSets();
    message('');
    recherche.reprendre();
    render();
    await accueillirLien();
    proposerVisiteUneFois();
  } catch (erreur) {
    message(`Catalogue indisponible : ${erreur.message}`, 'erreur');
  }
}

/*
 * « Chercher » repart de zero quand la question a change.
 *
 * Une population porte les reponses a la question qu'on lui a posee. Reprendre
 * cette population apres avoir change de sorts, de minimums ou d'objectif
 * revient a chercher la nouvelle reponse en partant des anciennes — le
 * solveur y met longtemps a oublier, et le compteur de generations continue
 * comme si de rien n'etait. v1 laissait le joueur trancher avec un bouton
 * « Recommencer » ; ici l'outil sait deja que la question a bouge, puisqu'il
 * l'annonce sur le bouton.
 */
$('lancer').addEventListener('click', () => {
  const montre = [etat.candidats, etat.paliers, etat.survie]
    .some((liste) => (liste ?? []).length > 0);
  const deZero = repartDeZero || (montre && reglagesChanges(signatureLancement, etat));
  signatureLancement = garderSignature(etat);
  repartDeZero = false;
  recherche.lancer({ deZero });
  render();
});
$('recommencer').addEventListener('click', () => {
  signatureLancement = garderSignature(etat);
  repartDeZero = false;
  recherche.lancer({ deZero: true });
  render();
});
$('arreter').addEventListener('click', () => recherche.arreter());
$('annuler').addEventListener('click', () => {
  if (recherche.abandonner()) {
    message('Recherche coupee. Rien n\'en a ete garde.');
    // L'arret solde la question posee : le bouton redevient « Chercher ».
    // Le depart de zero, lui, ne se perd pas — il passe par l'indicateur.
    signatureLancement = garderSignature(etat);
    repartDeZero = true;
    render();
    return;
  }
  annuler();
});
$('appel-sorts').addEventListener('click', gestesSorts.ouvrir);
$('identite').addEventListener('click', () => ouvrirIdentite({ lireEtat, setEtat }));

const liensPalette = {
  lireEtat, lireCatalogue: () => catalogue, setEtat,
  onPiece: (item) => { fermerPalette(); poserPiece(item); },
};
$('ouvrir-palette').addEventListener('click', () => basculerPalette(liensPalette));

// La palette s'ouvre a la touche, partout — sauf quand le joueur ecrit
// ailleurs, ou le raccourci lui volerait sa frappe.
window.addEventListener('keydown', (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault();
    basculerPalette(liensPalette);
    return;
  }
  // Ctrl+Z annule, sauf pendant une saisie ou il annule le texte tape.
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z') {
    const cible = ev.target;
    const ecrit = cible instanceof HTMLElement
      && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName));
    if (!ecrit) { ev.preventDefault(); annuler(); }
    return;
  }

  if (ev.key !== 'Escape') return;
  if (caseOuverte()) fermerCase();
  else if (visiteOuverte()) fermerVisite();
  else if (comparaisonOuverte()) fermerComparaison();
  else if (minimumsOuverts()) fermerMinimums();
  else if (signalerOuvert()) fermerSignaler();
  else if (comboOuvert()) fermerCombo();
  else if (reglagesOuverts()) fermerReglages();
  else if (partageOuvert()) fermerPartage();
  else if (pointsOuverts()) fermerPoints();
  else if (paletteOuverte()) fermerPalette();
});

$('comparer').addEventListener('click', comparer);

/*
 * Ce qu'un jeu garde, et comment il se repose.
 *
 * Les sorts et les minimums sont deja des listes : ils se rangent tels quels.
 * Les trois autres ne le sont pas — deux ensembles d'identifiants et une
 * table de cases — et ne survivraient pas a un aller-retour en JSON sans
 * etre traduits ici. Le stuff se repose par identifiant : une piece disparue
 * du catalogue est ecartee plutot que de laisser une case vide muette.
 */
const JEUX = Object.freeze({
  sorts: {
    lire: () => etat.sorts,
    poser: (contenu) => setEtat({ sorts: contenu }),
  },
  conditions: {
    lire: () => etat.conditions,
    poser: (contenu) => setEtat({ conditions: contenu }),
  },
  bannis: {
    lire: () => [...etat.bannis],
    poser: (contenu) => setEtat({ bannis: new Set(contenu) }),
  },
  banque: {
    lire: () => [...etat.possedees],
    poser: (contenu) => setEtat({ possedees: new Set(contenu) }),
  },
  stuff: {
    lire: () => [...etat.equipped.entries()].map(([cle, piece]) => [cle, piece.id]),
    poser: (contenu) => {
      const equipped = new Map();
      for (const [cle, id] of contenu ?? []) {
        const piece = catalogue?.itemById.get(id);
        if (piece) equipped.set(cle, piece);
      }
      setEtat({ equipped, posees: new Set(equipped.keys()) });
    },
  },
});

for (const nature of NATURES_JEUX) {
  brancherSets({
    $, message, remplirListesSets, nature,
    idListe: `sets-${nature}`,
    lire: JEUX[nature].lire,
    poser: JEUX[nature].poser,
  });
}

// Le graphe vit dans un canvas : il ne suit pas la cascade. Replier une
// section change sa largeur, donc il faut le redessiner.
window.addEventListener('copyroxx:theme', () => render());

// « Recommencer » est branche plus haut, avec « Chercher » : un deuxieme
// ecouteur ici lancait la recherche deux fois par clic.
$('vider').addEventListener('click', vider);
$('reglages').addEventListener('click',
  () => ouvrirReglages({ lireEtat, onOption: poserOption }));
$('partager').addEventListener('click', () => ouvrirPartage({ lireEtat, message }));
$('regler-combo').addEventListener('click',
  () => ouvrirCombo({ lireEtat, onOption: poserOption }));
$('visite').addEventListener('click', () => ouvrirVisite({ message }));
$('signaler').addEventListener('click',
  () => ouvrirSignaler({ lireEtat, nomDeClasse, message }));
$('bascule-gauche').addEventListener('click', () => basculerVolet('gauche'));
$('bascule-droit').addEventListener('click', () => basculerVolet('droit'));
$('volets-voile').addEventListener('click', () => {
  volets = { gauche: false, droit: false };
  montrerVolets();
});

// Un ecran qui passe d'etroit a large change ce qu'un volet ouvert veut
// dire : il occupait le milieu, il reprend sa colonne.
window.addEventListener('resize', montrerVolets);

main();
