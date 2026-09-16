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
  el, renderCandidats, renderCases, renderOptions, renderPanoplies,
} from '../render.mjs';
import { SLOTS_ARTEFACTS, SLOTS_DROITE, SLOTS_GAUCHE } from '../layout.mjs';
import { etatInitial, optionsAffichees } from '../reglages.mjs';
import { reprendreEtat, sauverEtat } from '../etat-stockage.mjs';
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
import { lireSets } from '../presets.mjs';
import { creerGestesReference } from '../gestes-reference.mjs';

import { creerPont } from './pont.mjs';
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
import { rangerOptions } from './options.mjs';
import { paliersUtiles, renderPaliers, renderReglageProximite } from '../proximite-panel.mjs';
import { renderAnalyse } from '../analyse-panel.mjs';
import { remplacer } from '../equipement.mjs';

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
 * Stuffs trouves coches pour la comparaison.
 *
 * Ils sont gardes par reference a l'objet candidat : deux stuffs peuvent
 * porter le meme score et les memes degats sans etre le meme stuff.
 */
let choisis = new Set();

/**
 * Reglages qui valaient au dernier lancement, ou null si aucun n'a eu lieu.
 *
 * Il sert a dire que ce qui est a l'ecran repond a une question precedente.
 * Oublier de relancer apres un reglage etait la vraie gene, pas le clic.
 */
let signatureLancement = null;

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
  appliquer: (resultat) => setEtat(appliquerBuild(etat, resultat, catalogue.itemById)),
  // v2 ne range pas encore les essais : la phase suivante rebranche les
  // simulations. Ne rien faire vaut mieux que ranger dans un panneau absent.
  garderSimulation: () => {},
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

function render() {
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
  renderPanoplie(build);
  renderAnalyseDuStuff(bilan, stats);
  renderInspecteur(stats, degats);
  renderScore(bilan);
  renderFraicheur();
  $('annuler').disabled = passe.length === 0;
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
  });
}

function renderSorts() {
  const sorts = sortsCalcules(etat);
  $('compte-sorts').textContent = String(sorts.length);
  $('chips-sorts').replaceChildren(...etat.sorts.map((sort) => el('span', { class: 'chip' },
    sort.name ?? sort.fr ?? String(sort.id),
    el('button', {
      type: 'button', text: '×', title: `Enlever ${sort.name ?? sort.fr ?? 'ce sort'}`,
      onClick: () => setEtat({ sorts: etat.sorts.filter((s) => s.id !== sort.id) }),
    }))));
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
  $('limites').replaceChildren(...etat.conditions.map((c) => {
    const valeur = conditionValue(c.stat, stats, degats ?? 0);
    const tenu = valeur >= c.target;
    return el('div', { class: `limite ${tenu ? '' : 'defaut'}`.trim() },
      el('i', { class: `etat ${tenu ? 'tenue' : 'defaut'}` }),
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

  // Une recherche neuve rend d'autres candidats : les coches d'avant ne
  // designent plus rien, et comparer des fantomes ne veut rien dire.
  const vivants = new Set(candidats);
  for (const choisi of choisis) if (!vivants.has(choisi)) choisis.delete(choisi);

  renderCandidats($('trouves'), candidats, {
    portes: new Set([...etat.equipped.values()].map((i) => i.id)),
    itemById: catalogue?.itemById ?? new Map(),
    porte: bilan,
    onPorter: (candidat) => recherche.porterAlaMain(candidat),
    selection: {
      choisis,
      onBasculer: (candidat) => {
        if (choisis.has(candidat)) choisis.delete(candidat);
        else choisis.add(candidat);
        render();
      },
    },
  });

  const bouton = $('comparer');
  bouton.hidden = choisis.size === 0;
  bouton.textContent = `Comparer ${choisis.size + 1}`;
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
    onPick: (piece) => ouvrirFiche(piece, { onEquip: () => gestes.equiper(piece) }),
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
        class: `ligne ${l.exigee ? 'exigee' : ''}`.trim(), type: 'button',
        ...(l.muet ? { disabled: true } : {}),
        title: l.exigee
          ? `${l.libelle} est deja dans vos minimums.`
          : `Garder au moins ${nombre(l.valeur)} de ${l.libelle.toLowerCase()}.`,
        onClick: () => poserMinimum(l.cle, l.valeur),
      },
        el('img', { class: 'ligne-icone', src: iconeStat(l.cle) ?? '', alt: '', decoding: 'async' }),
        el('span', { class: 'ligne-nom', text: l.libelle }),
        el('b', { class: `ligne-val n ${l.muet ? 'vide-mesure' : ''}`.trim(),
          text: l.muet ? '—' : nombre(l.valeur) })));

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
 */
function renderFraicheur() {
  const perime = reglagesChanges(signatureLancement, etat);
  const bouton = $('lancer');
  bouton.classList.toggle('rappel', perime);
  bouton.textContent = perime ? 'Relancer' : 'Chercher';
  if (perime) bouton.prepend(el('span', { class: 'puce' }));
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
const MESURES_COMPARABLES = FAMILLES.flatMap(([, paires]) =>
  paires.map(([cle, libelle]) => ({ cle, libelle })));

/** Ouvre la comparaison du stuff porte et des stuffs coches. */
function comparer() {
  if (choisis.size === 0) return;

  const colonnes = [
    { nom: 'Porte', stats: buildCourant(etat, catalogue)?.stats ?? {} },
    ...[...choisis].map((candidat, i) => ({
      nom: `Trouve ${i + 1}`,
      // Les stats d'un candidat ne sont pas rangees avec lui : on repose son
      // stuff sur une copie de l'etat et on laisse le moteur recalculer.
      stats: buildCourant(
        { ...etat, ...appliquerBuild(etat, candidat, catalogue.itemById) },
        catalogue,
      )?.stats ?? {},
    })),
  ];

  ouvrirComparaison({
    mesures: MESURES_COMPARABLES,
    colonnes,
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
function remplirListesSets() {
  for (const [nature, id] of [['sorts', 'sets-sorts'], ['conditions', 'sets-conditions']]) {
    const noeud = $(id);
    const choisi = noeud.value;
    const jeux = lireSets(nature);

    noeud.replaceChildren(...(jeux.length === 0
      ? [el('option', { value: '', text: 'aucun jeu enregistre' })]
      : jeux.map((j) => el('option', { value: j.nom, text: j.nom }))));

    if (choisi && jeux.some((j) => j.nom === choisi)) noeud.value = choisi;
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

/**
 * Forme d'un minimum pose a la main.
 *
 * Le poids dit combien une unite manquante coute au score. Un poids de 1 en
 * fait une preference, pas un couperet : le solveur la tiendra s'il peut, et
 * le joueur remonte le poids lui-meme si elle doit etre imperative.
 */
const POIDS_PAR_DEFAUT = (stat, target) => ({
  stat, target, weight: 1, max: null, absolute: false,
});

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

function choisirClasse(classe) {
  vierge = false;
  $('accueil').hidden = true;
  $('travail').hidden = false;
  $('identite').hidden = false;
  $('barre-droite').style.display = 'flex';
  $('barre-droite').hidden = false;
  setEtat({ classe });
  recherche.lancer();
}

async function main() {
  // Les noeuds que la nouvelle coquille ne montre plus vivent quand meme dans
  // le document : un champ hors de l'arbre ne garde pas sa valeur de facon
  // fiable, et les modules de v1 les lisent au lancement.
  document.body.append(...muets.values());

  renderClasses($('classes'), choisirClasse);
  message('Chargement du catalogue…');

  try {
    [catalogue, classesSorts] = await Promise.all([loadCatalog(), loadSpells()]);
    etat = reprendreEtat(etat, catalogue);

    const { sorts, changes } = enrichirSorts(etat.sorts, classesSorts, etat.niveau);
    if (changes) etat = { ...etat, sorts };

    // Un etat range dit que le joueur est deja venu : l'ecran vide n'a plus
    // rien a demander, il ouvrirait une question deja repondue.
    if (etat.equipped.size > 0 || etat.sorts.length > 0) {
      vierge = false;
      $('accueil').hidden = true;
      $('travail').hidden = false;
      $('identite').hidden = false;
      $('barre-droite').hidden = false;
      $('barre-droite').style.display = 'flex';
    }

    // Les resultats ranges reviennent avec l'etat : ils doivent etre juges
    // face aux reglages du lancement qui les a produits, pas face a rien.
    signatureLancement = reprendreSignature();

    remplirListesSets();
    message('');
    recherche.reprendre();
    render();
  } catch (erreur) {
    message(`Catalogue indisponible : ${erreur.message}`, 'erreur');
  }
}

$('lancer').addEventListener('click', () => {
  signatureLancement = garderSignature(etat);
  recherche.lancer();
  render();
});
$('arreter').addEventListener('click', () => recherche.arreter());
$('appel-sorts').addEventListener('click', gestesSorts.ouvrir);
$('identite').addEventListener('click', () => ouvrirIdentite({ lireEtat, setEtat }));

const liensPalette = {
  lireEtat, lireCatalogue: () => catalogue, setEtat,
  onPiece: (item) => { gestes.equiper(item); fermerPalette(); },
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
  if (comparaisonOuverte()) fermerComparaison();
  else if (reglagesOuverts()) fermerReglages();
  else if (pointsOuverts()) fermerPoints();
  else if (paletteOuverte()) fermerPalette();
});

$('comparer').addEventListener('click', comparer);
for (const nature of ['sorts', 'conditions']) {
  brancherSets({
    $, message, remplirListesSets, nature,
    idListe: `sets-${nature}`,
    lire: () => lireEtat()[nature],
    poser: (contenu) => setEtat({ [nature]: contenu }),
  });
}

// Le graphe vit dans un canvas : il ne suit pas la cascade. Replier une
// section change sa largeur, donc il faut le redessiner.
window.addEventListener('copyroxx:theme', () => render());

$('annuler').addEventListener('click', annuler);
$('vider').addEventListener('click', vider);
$('reglages').addEventListener('click',
  () => ouvrirReglages({ lireEtat, onOption: poserOption }));

main();
