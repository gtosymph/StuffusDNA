/**
 * Dispositions de l'ecran.
 *
 * Un theme change l'habillage ; une disposition change la place des choses.
 * Les deux sont independants : chaque theme se combine avec chaque disposition.
 *
 * Le module ne recree jamais une section : il deplace les noeuds existants.
 * Les ecouteurs poses par l'application, le contenu des canvas et l'etat des
 * champs suivent donc leur section. Avant chaque changement, l'arbre revient
 * a son etat d'origine : une disposition n'a pas a defaire celle d'avant.
 *
 * Contrainte a respecter : l'application pilote elle-meme l'attribut `hidden`
 * de la section des autres builds et de celle de l'analyse. Un volet cache
 * donc son conteneur, jamais les sections qu'il porte.
 */

import { CLES, ecrire, lireTexte } from './stockage.mjs';

const CLE = CLES.disposition;
const ID_FEUILLE = 'feuille-disposition';

/** Etat d'origine de l'atelier, releve au premier appel. */
let origine = null;

/** Rend la section qui porte l'element vise. */
const bloc = (selecteur) => document.querySelector(selecteur)?.closest('.bloc') ?? null;

/** Les briques de l'ecran, nommees une fois pour toutes. */
function briques() {
  return {
    catalogue: document.querySelector('.bloc-plein'),
    bannis: bloc('#bannis'),
    objectifs: bloc('#objectifs'),
    principales: bloc('#stats-principales'),
    caracteristiques: bloc('#stats-caracteristiques'),
    points: bloc('#points'),
    secondaires: bloc('#stats-secondaires'),
    conditions: bloc('#corps-conditions'),
    sorts: bloc('#liste-sorts'),
    personnage: bloc('.scene'),
    recherche: document.querySelector('.bloc-recherche'),
    simulations: document.getElementById('bloc-simulations'),
    proximite: document.getElementById('bloc-proximite'),
    survie: document.getElementById('bloc-survie'),
    candidats: document.getElementById('bloc-candidats'),
    possedees: bloc('#possedees'),
    panoplies: bloc('#panoplies'),
    analyse: document.getElementById('bloc-analyse'),
    dommages: bloc('#stats-dommages'),
    resistances: bloc('#stats-resistances'),
    options: bloc('#options'),
  };
}

/** Cree un element marque comme ajoute par la disposition. */
function creer(balise, classe) {
  const noeud = document.createElement(balise);
  noeud.className = classe;
  noeud.dataset.cree = '1';
  return noeud;
}

/** Colonne simple portant les sections donnees. */
function colonne(classe, sections) {
  const hote = creer('div', `colonne ${classe}`.trim());
  for (const section of sections) if (section) hote.append(section);
  return hote;
}

/* ---------------------------------------------------------------- Plans --- */

/**
 * « Bandeau » : le resultat en tete, les colonnes dessous.
 *
 * Le score, la courbe et les commandes sont ce que l'on regarde le plus
 * souvent ; ils quittent leur colonne etroite et prennent toute la largeur.
 * Le reste garde la disposition en colonnes, avec deux changements : les
 * reglages se suivent dans une meme colonne, et les chiffres du personnage
 * — caracteristiques, secondaires, dommages, resistances — se lisent enfin
 * ensemble au lieu d'etre separes par deux colonnes d'ecart.
 *
 * Aucun onglet : un onglet cache ce que l'on veut comparer, et coute un clic
 * pour retrouver ce que l'on voyait. Le pliage d'une section rend le meme
 * service sans rien imposer.
 */
function planBandeau(atelier, b) {
  const grille = creer('div', 'grille-atelier');
  grille.append(
    colonne('colonne-catalogue', [b.catalogue, b.bannis, b.possedees]),
    colonne('colonne-reglages', [b.conditions, b.sorts]),
    colonne('colonne-scene colonne-perso',
      [b.personnage, b.simulations, b.proximite, b.survie, b.candidats, b.panoplies]),
    colonne('colonne-chiffres', [
      b.objectifs, b.principales, b.caracteristiques, b.secondaires,
      b.dommages, b.resistances,
      b.points, b.analyse, b.options,
    ]),
  );
  atelier.append(b.recherche, grille);
}

/** Dispositions proposees. La premiere est celle de la feuille de base. */
export const DISPOSITIONS = [
  { cle: 'colonnes', nom: 'Colonnes', fichier: null, plan: null },
  { cle: 'bandeau', nom: 'Bandeau', fichier: 'dispositions/bandeau.css', plan: planBandeau },
];

/* ----------------------------------------------------------- Mecanique --- */

function trouver(cle) {
  return DISPOSITIONS.find((d) => d.cle === cle) ?? DISPOSITIONS[0];
}

/** Releve l'arbre d'origine, une seule fois. */
function memoriser(atelier) {
  origine ??= [...atelier.children].map((col) => ({ col, sections: [...col.children] }));
}

/** Remet l'atelier dans son etat d'origine, puis enleve ce qui a ete cree. */
function restaurer(atelier) {
  for (const { col, sections } of origine) {
    col.append(...sections);
    atelier.append(col);
  }
  for (const ajoute of [...atelier.querySelectorAll('[data-cree]')]) ajoute.remove();
  atelier.className = 'atelier';
}

/** Pose la feuille de la disposition, en remplacant la precedente. */
function poserFeuille(fichier) {
  const ancienne = document.getElementById(ID_FEUILLE);
  if (!fichier) { ancienne?.remove(); return; }
  if (ancienne?.getAttribute('href') === fichier) return;

  const feuille = document.createElement('link');
  feuille.id = ID_FEUILLE;
  feuille.rel = 'stylesheet';
  feuille.href = fichier;
  feuille.addEventListener('load', () => ancienne?.remove(), { once: true });
  feuille.addEventListener('error', () => feuille.remove(), { once: true });
  document.head.append(feuille);
}

/** Applique la disposition demandee. */
export function appliquerDisposition(cle) {
  const atelier = document.querySelector('.atelier');
  if (!atelier) return;
  const choix = trouver(cle);

  memoriser(atelier);
  restaurer(atelier);
  document.documentElement.dataset.disposition = choix.cle;
  poserFeuille(choix.fichier);

  if (choix.plan) {
    const gardees = briques();
    // Toutes les sections de depart, pour n'en perdre aucune en route.
    const attendues = origine.flatMap(({ sections }) => sections);

    atelier.replaceChildren();
    choix.plan(atelier, gardees);

    // Filet de securite : un plan liste ses sections a la main, et une section
    // ajoutee au document sans etre ajoutee au plan disparaissait de l'ecran
    // sans rien signaler. Celles que le plan a oubliees reviennent ici.
    const oubliees = attendues.filter((section) => !atelier.contains(section));
    if (oubliees.length > 0) {
      const derniere = atelier.querySelector('.grille-atelier > .colonne:last-child') ?? atelier;
      derniere.append(...oubliees);
    }
  }

  // Le graphe se dessine dans un canvas : sa largeur vient de changer.
  window.dispatchEvent(new CustomEvent('copyroxx:theme', { detail: choix.cle }));
}

/** Disposition a poser au chargement : l'adresse passe devant le choix garde. */
export function dispositionGardee() {
  const demande = new URLSearchParams(location.search).get('disposition');
  if (demande) return trouver(demande).cle;
  return trouver(lireTexte(CLE)).cle;
}

/** Installe le selecteur dans la barre du haut et pose la disposition gardee. */
export function installerDisposition(hote) {
  const courante = dispositionGardee();
  appliquerDisposition(courante);

  if (!hote) return;

  const choix = document.createElement('select');
  choix.id = 'choix-disposition';
  choix.title = 'Disposition de l\'ecran';
  choix.setAttribute('aria-label', 'Disposition de l\'ecran');
  for (const disposition of DISPOSITIONS) {
    const option = document.createElement('option');
    option.value = disposition.cle;
    option.textContent = disposition.nom;
    choix.append(option);
  }
  choix.value = courante;
  choix.addEventListener('change', () => {
    if (!new URLSearchParams(location.search).has('disposition')) {
      ecrire(CLE, choix.value);
    }
    appliquerDisposition(choix.value);
  });
  hote.prepend(choix);
}
