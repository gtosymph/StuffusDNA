/**
 * Orchestration de l'interface.
 * L'etat reste immuable : chaque changement produit un nouvel objet.
 */
import { loadCatalog } from './catalog-web.mjs';
import { CLASSES } from './classes.mjs';
import { defaultThreadCount, runSearch } from './solver-client.mjs';
import * as vue from './render.mjs';
import * as plan from './layout.mjs';
import { dessinerEvolution } from './chart.mjs';
import { loadSpells, versSortMoteur } from './spells-data.mjs';
import { ouvrirFiche } from './item-panel.mjs';
import { renderPoints } from './points-panel.mjs';
import { ouvrirPicker } from './spell-picker.mjs';
import { cacherBulle } from './hover-card.mjs';
import { chargerSet, enleverSet, enregistrerSet, lireSets } from './presets.mjs';

import { SLOTS } from '../src/data/slots.mjs';
import { STATS, STAT_KEYS, STAT_LABELS } from '../src/data/stats.mjs';
import { computeBuild } from '../src/engine/build.mjs';
import { availablePoints } from '../src/engine/characteristics.mjs';
import { computeSpellDetail, weaponAttack } from '../src/engine/damage.mjs';
import { normalizePassives } from '../src/data/passives.mjs';
import { configPassifsDefaut } from '../src/data/passives-defaults.mjs';
import { scoreBuild, SEARCH_MODES } from '../src/solver/score.mjs';

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
    aide: 'Ajoute les degats de l\'arme equipee au total optimise' },
  { cle: 'passifs', libelle: 'Passifs Dofus & Legendaires',
    aide: 'Compte les passifs en combat des Dofus et objets legendaires' },
];

let etat = {
  niveau: 190, classe: 5, sexe: 0,
  filtre: null, filtreType: null, recherche: '',
  equipped: new Map(),
  posees: new Set(),
  bannis: new Set(),
  verrous: new Set(),
  filtreStat: { stat: '', op: '>=', valeur: 0 },
  conditions: CONDITIONS_DEPART,
  sorts: [],
  options: { distance: false, arme: false, passifs: true },
  allocation: { vitalite: 0, sagesse: 0, force: 0, intelligence: 0, chance: 0, agilite: 0 },
  scrolls: { vitalite: false, sagesse: false, force: false, intelligence: false, chance: false, agilite: false },
};

let catalogue = null;
let classesSorts = null;
let recherche = null;
/** Historique du score par fil, pour la courbe. */
let historiques = [];
/** Vrai pendant une recherche : la courbe se redessine a chaque avancee. */
let rechercheEnCours = false;

const setEtat = (patch) => { etat = { ...etat, ...patch }; sauverEtat(); render(); };

/** Cle de l'etat persistant dans le navigateur. */
const CLE_ETAT = 'copyroxx_etat';

/** Enregistre l'etat courant : un rechargement ne perd plus le travail. */
function sauverEtat() {
  try {
    localStorage.setItem(CLE_ETAT, JSON.stringify({
      niveau: etat.niveau, classe: etat.classe, sexe: etat.sexe,
      conditions: etat.conditions, sorts: etat.sorts, options: etat.options,
      allocation: etat.allocation, scrolls: etat.scrolls,
      bannis: [...etat.bannis],
      verrous: [...etat.verrous],
      equipped: [...etat.equipped.entries()].map(([cle, piece]) => [cle, piece.id]),
      posees: [...etat.posees],
    }));
  } catch { /* Stockage indisponible : l'etat reste en memoire. */ }
}

/** Cle du dernier resultat de recherche dans le navigateur. */
const CLE_RESULTAT = 'copyroxx_resultat';

/** Nombre maximal de points de courbe gardes par fil dans le navigateur. */
const POINTS_GARDES = 600;

/**
 * Enregistre la courbe et le compteur : un rechargement garde le resultat.
 * Les courbes sont echantillonnees pour rester legeres.
 */
function sauverResultat(generationMax, fils) {
  try {
    localStorage.setItem(CLE_RESULTAT, JSON.stringify({
      generationMax,
      fils,
      historiques: historiques.map(({ seed, history }) => {
        const pas = Math.max(1, Math.ceil(history.length / POINTS_GARDES));
        const points = [];
        for (let i = 0; i < history.length; i += pas) points.push(history[i]);
        if (history.length > 0 && points[points.length - 1] !== history[history.length - 1]) {
          points.push(history[history.length - 1]);
        }
        return { seed, history: points };
      }),
    }));
  } catch { /* Stockage indisponible : le resultat reste en memoire. */ }
}

/** Reprend le dernier resultat de recherche enregistre. */
function reprendreResultat() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(CLE_RESULTAT) ?? 'null'); } catch { return; }
  if (!data || !Array.isArray(data.historiques)) return;

  historiques = data.historiques.filter((h) => Array.isArray(h?.history));
  if (Number.isFinite(data.fils) && data.fils >= 1) $('fils').value = String(data.fils);
  if (Number.isFinite(data.generationMax) && data.generationMax > 0) {
    $('compteur-generations').textContent =
      `generation ${data.generationMax.toLocaleString('fr-FR')} — en pause`;
  }
}

/** Reprend l'etat enregistre, une fois le catalogue disponible. */
function reprendreEtat() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(CLE_ETAT) ?? 'null'); } catch { return; }
  if (!data || typeof data !== 'object') return;

  const equipped = new Map();
  for (const [cle, id] of data.equipped ?? []) {
    const piece = catalogue.itemById.get(id);
    if (piece) equipped.set(cle, piece);
  }

  etat = {
    ...etat,
    ...(Number.isFinite(data.niveau) ? { niveau: data.niveau } : {}),
    ...(Number.isFinite(data.classe) ? { classe: data.classe } : {}),
    ...(Number.isFinite(data.sexe) ? { sexe: data.sexe } : {}),
    ...(Array.isArray(data.conditions) ? { conditions: data.conditions } : {}),
    ...(Array.isArray(data.sorts) ? { sorts: data.sorts } : {}),
    ...(data.options ? { options: { ...etat.options, ...data.options } } : {}),
    ...(data.allocation ? { allocation: { ...etat.allocation, ...data.allocation } } : {}),
    ...(data.scrolls ? { scrolls: { ...etat.scrolls, ...data.scrolls } } : {}),
    ...(Array.isArray(data.bannis) ? { bannis: new Set(data.bannis) } : {}),
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
  return etat.sorts.map((sort) => ({
    ...sort,
    lines: sort.lines.map((ligne) => ({ ...ligne, range, source: 'sort' })),
  }));
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
  const attaque = weaponAttack(arme);
  if (!attaque) return null;
  // La portee de l'arme suit l'option distance, comme les sorts.
  const range = etat.options.distance ? 'distance' : 'melee';
  return { ...attaque, lines: attaque.lines.map((l) => ({ ...l, range })) };
}

/** Sorts et attaque d'arme comptes dans le score affiche. */
function attaquesAffichees() {
  const attaque = attaqueArme();
  return attaque ? [...sortsCalcules(), attaque] : sortsCalcules();
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

function changerSort(index, cle, valeur) {
  const sorts = etat.sorts.map((sort, i) => {
    if (i !== index) return sort;
    if (!cle.startsWith('line.')) return { ...sort, [cle]: valeur };
    // "line.<rang>.<champ>" modifie une ligne de degats precise.
    const [, rang, champ] = cle.split('.');
    return {
      ...sort,
      lines: sort.lines.map((l, j) => (j === Number(rang) ? { ...l, [champ]: valeur } : l)),
    };
  });
  setEtat({ sorts });
}

function render() {
  const build = buildCourant();
  const stats = build?.stats ?? null;

  vue.renderOnglets($('onglets-slot'), etat.filtre,
    (key, type) => setEtat({ filtre: key, filtreType: type ?? null }), etat.filtreType);
  vue.renderCatalogue($('grille-items'), $('compte-items'), itemsFiltres(),
    (item) => ouvrirFiche(item, {
      onEquip: () => equiper(item),
      onBan: () => bannir(item),
      onLock: () => verrouiller(item),
      banni: etat.bannis.has(item.id),
      verrouille: etat.verrous.has(item.id),
    }), etat.bannis);

  const listeBannis = [...etat.bannis]
    .map((id) => catalogue?.itemById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.fr.localeCompare(b.fr, 'fr'));
  $('compte-bannis').textContent = String(listeBannis.length);
  vue.renderBannis($('bannis'), listeBannis, bannir);

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
    banni: etat.bannis.has(item.id),
    verrouille: etat.verrous.has(item.id),
  });
  vue.renderCases($('slots-gauche'), plan.SLOTS_GAUCHE, etat.equipped, etat.posees, voirPiece, etat.verrous);
  vue.renderCases($('slots-droite'), plan.SLOTS_DROITE, etat.equipped, etat.posees, voirPiece, etat.verrous);
  vue.renderCases($('slots-artefacts'), plan.SLOTS_ARTEFACTS, etat.equipped, etat.posees, voirPiece, etat.verrous);

  const classe = classeCourante();
  const image = $('avatar-image');
  if (classe?.render) {
    image.src = classe.render;
    image.alt = classe.fr;
    image.hidden = false;
  } else {
    image.hidden = true;
  }
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
  });

  const arme = attaqueArme();
  vue.renderArme($('carte-arme'), arme, arme && stats ? computeSpellDetail(arme, stats) : null);

  renderPoints($('points'), etat, {
    onPoints: (cle, valeur) => setEtat({ allocation: { ...etat.allocation, [cle]: Math.max(0, valeur) } }),
    onScroll: (cle, actif) => setEtat({ scrolls: { ...etat.scrolls, [cle]: actif } }),
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

  vue.renderOptions($('options'), OPTIONS.map((o) => ({ ...o, actif: etat.options[o.cle] })),
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
  $('score-libelle').textContent = detail.satisfied ? 'Degats totaux' : 'Conditions non satisfaites';

  const invalides = build?.invalid?.length ?? 0;
  $('score-note').textContent = detail.satisfied
    ? `Toutes les conditions sont tenues.${invalides ? ` ${invalides} piece(s) non equipable(s).` : ''}`
    : `${detail.unmet.length} condition(s) en defaut.${invalides ? ` ${invalides} piece(s) non equipable(s).` : ''}`;
}

/**
 * Lance une recherche continue.
 * @param {{deZero?: boolean}} [choix] deZero : population neuve, sans le
 *   build courant en graine — pour repartir apres un changement de reglages.
 */
async function lancer(choix = {}) {
  if (!catalogue || recherche) return;
  const deZero = choix.deZero === true;

  const fils = Math.max(1, Math.min(8, Number($('fils').value) || 1));

  $('lancer').disabled = true;
  $('recommencer').disabled = true;
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
        dessinerEvolution($('graphe'), historiques, { enCours: true });
        montrerFils();
        sauverResultat(generationMax, fils);

        // Le meilleur build du moment s'applique en direct au personnage.
        if (vague.resume && vague.resume.score > meilleurApplique) {
          meilleurApplique = vague.resume.score;
          appliquer(vague.resume);
        }
      },
    },
  );

  try {
    const { best } = await recherche.promise;
    if (best.score > meilleurApplique) appliquer(best);
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
  }
}

/** Pose le build trouve par le solveur, points de caracteristique compris. */
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

function brancher() {
  $('niveau').addEventListener('change', (e) =>
    setEtat({ niveau: Math.max(1, Math.min(200, Number(e.target.value) || 1)) }));
  $('classe').addEventListener('change', (e) => setEtat({ classe: Number(e.target.value) }));
  $('sexe').addEventListener('change', (e) => setEtat({ sexe: Number(e.target.value) }));
  $('recherche').addEventListener('input', (e) => setEtat({ recherche: e.target.value }));

  $('filtre-stat').addEventListener('change', (e) =>
    setEtat({ filtreStat: { ...etat.filtreStat, stat: e.target.value } }));
  $('filtre-op').addEventListener('change', (e) =>
    setEtat({ filtreStat: { ...etat.filtreStat, op: e.target.value } }));
  $('filtre-valeur').addEventListener('input', (e) =>
    setEtat({ filtreStat: { ...etat.filtreStat, valeur: Number(e.target.value) || 0 } }));
  $('bannir-resultats').addEventListener('click', bannirResultats);
  $('autoriser-resultats').addEventListener('click', autoriserResultats);
  $('vider').addEventListener('click', () => setEtat({ equipped: new Map(), posees: new Set() }));

  $('ajouter-condition').addEventListener('click', () => {
    const stat = $('nouvelle-condition').value;
    if (etat.conditions.some((c) => c.stat === stat)) {
      message(`Une condition porte deja sur "${STAT_LABELS[stat]}".`, 'erreur');
      return;
    }
    setEtat({ conditions: [...etat.conditions, { stat, target: 0, weight: 1, max: null, absolute: false }] });
  });

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
      onEnlever: (id) => setEtat({ sorts: etat.sorts.filter((s) => s.id !== id) }),
    });
  });

  brancherSets('sorts', 'sets-sorts', () => etat.sorts, (contenu) => setEtat({ sorts: contenu }));
  brancherSets('conditions', 'sets-conditions', () => etat.conditions, (contenu) => setEtat({ conditions: contenu }));

  document.querySelector('.colonne-perso')?.addEventListener('mouseleave', cacherBulle);
  window.addEventListener('scroll', cacherBulle, { passive: true });

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
    const nbSorts = classesSorts.reduce((n, c) => n + c.spells.length, 0);
    $('etiquette-items').textContent =
      `${catalogue.items.length.toLocaleString('fr-FR')} items · ${nbSorts} sorts`;
    message('');
    render();
  } catch (error) {
    message(`Catalogue indisponible : ${error.message}`, 'erreur');
  }
}

main();
