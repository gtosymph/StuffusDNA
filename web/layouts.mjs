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

const CLE = 'copyroxx_disposition';
const CLE_VOLET = 'copyroxx_volet';
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
    principales: bloc('#stats-principales'),
    caracteristiques: bloc('#stats-caracteristiques'),
    points: bloc('#points'),
    secondaires: bloc('#stats-secondaires'),
    conditions: bloc('#corps-conditions'),
    sorts: bloc('#liste-sorts'),
    personnage: bloc('.scene'),
    recherche: document.querySelector('.bloc-recherche'),
    candidats: document.getElementById('bloc-candidats'),
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

/**
 * Panneau a onglets.
 *
 * Chaque volet garde ses sections dans le document meme quand il est cache :
 * l'application continue de les remplir, et le passage d'un onglet a l'autre
 * ne coute aucun rendu.
 */
function panneau(nom, volets) {
  const hote = creer('div', 'panneau');
  const barre = creer('div', 'onglets-panneau');
  barre.setAttribute('role', 'tablist');
  hote.append(barre);

  const gardes = [];
  for (const volet of volets) {
    const sections = volet.sections.filter(Boolean);
    if (sections.length === 0) continue;

    const corps = creer('div', 'volet');
    corps.dataset.volet = volet.cle;
    for (const section of sections) corps.append(section);
    hote.append(corps);

    const bouton = creer('button', 'onglet-panneau');
    bouton.type = 'button';
    bouton.textContent = volet.nom;
    bouton.dataset.volet = volet.cle;
    bouton.setAttribute('role', 'tab');
    barre.append(bouton);

    gardes.push({ cle: volet.cle, bouton, corps });
  }

  const montrer = (cle) => {
    const vise = gardes.some((g) => g.cle === cle) ? cle : gardes[0]?.cle;
    for (const garde of gardes) {
      const actif = garde.cle === vise;
      garde.corps.hidden = !actif;
      garde.bouton.setAttribute('aria-selected', String(actif));
    }
    try { localStorage.setItem(`${CLE_VOLET}_${nom}`, vise); } catch { /* stockage refuse */ }
  };

  for (const garde of gardes) garde.bouton.addEventListener('click', () => montrer(garde.cle));

  let depart = null;
  try { depart = localStorage.getItem(`${CLE_VOLET}_${nom}`); } catch { /* stockage refuse */ }
  montrer(depart);

  return hote;
}

/* ---------------------------------------------------------------- Plans --- */

/**
 * « Bandeau » : le resultat en tete, sur toute la largeur.
 *
 * Le score, la courbe et les commandes sont ce que l'on regarde le plus
 * souvent ; ils quittent leur colonne etroite. Dessous, trois colonnes : la
 * matiere a gauche, le personnage au centre, les reglages a droite.
 */
function planBandeau(atelier, b) {
  const grille = creer('div', 'grille-atelier');
  grille.append(
    colonne('colonne-catalogue', [b.catalogue, b.bannis]),
    colonne('colonne-scene colonne-perso', [b.personnage, b.candidats, b.panoplies]),
    panneau('bandeau', [
      { cle: 'reglages', nom: 'Conditions et sorts', sections: [b.conditions, b.sorts] },
      { cle: 'stats', nom: 'Statistiques', sections: [b.principales, b.caracteristiques, b.points, b.secondaires] },
      { cle: 'degats', nom: 'Dommages', sections: [b.dommages, b.resistances, b.options] },
      { cle: 'analyse', nom: 'Analyse', sections: [b.analyse] },
    ]),
  );
  atelier.append(b.recherche, grille);
}

/**
 * « Atelier » : le catalogue passe dans un tiroir.
 *
 * Le catalogue occupe une colonne entiere toute la journee alors qu'il ne sert
 * que par moments. Ferme, il rend sa place au personnage et au resultat.
 */
function planAtelier(atelier, b) {
  const tiroir = creer('aside', 'tiroir');
  tiroir.append(b.catalogue, b.bannis);

  const poignee = creer('button', 'poignee-tiroir');
  poignee.type = 'button';
  poignee.textContent = 'Catalogue';
  poignee.title = 'Ouvre ou ferme le catalogue (touche C)';
  poignee.addEventListener('click', () => {
    const ouvert = atelier.classList.toggle('tiroir-ouvert');
    poignee.setAttribute('aria-expanded', String(ouvert));
  });
  poignee.setAttribute('aria-expanded', 'false');

  const grille = creer('div', 'grille-atelier');
  grille.append(
    colonne('colonne-scene colonne-perso', [b.recherche, b.personnage, b.panoplies]),
    panneau('atelier', [
      { cle: 'reglages', nom: 'Conditions et sorts', sections: [b.conditions, b.sorts] },
      { cle: 'stats', nom: 'Statistiques', sections: [b.principales, b.caracteristiques, b.points, b.secondaires] },
      { cle: 'degats', nom: 'Dommages', sections: [b.dommages, b.resistances, b.options] },
      { cle: 'analyse', nom: 'Analyse', sections: [b.analyse, b.candidats] },
    ]),
  );
  atelier.append(tiroir, poignee, grille);
}

/**
 * « Entree et sortie » : ce que je regle a gauche, ce que cela donne a droite.
 *
 * La separation suit le travail reel : on modifie une condition, un sort, une
 * piece, puis on lit le score, les degats et l'analyse. Les deux moities ne se
 * melangent plus.
 */
function planEntreeSortie(atelier, b) {
  const grille = creer('div', 'grille-atelier');

  const gauche = creer('div', 'volets-entree');
  const titreEntree = creer('div', 'titre-moitie');
  titreEntree.textContent = 'Ce que je regle';
  gauche.append(titreEntree, panneau('entree', [
    { cle: 'catalogue', nom: 'Catalogue', sections: [b.catalogue, b.bannis] },
    { cle: 'conditions', nom: 'Conditions', sections: [b.conditions] },
    { cle: 'sorts', nom: 'Sorts', sections: [b.sorts] },
    { cle: 'points', nom: 'Points', sections: [b.points, b.options] },
  ]));

  const droite = creer('div', 'volets-sortie');
  const titreSortie = creer('div', 'titre-moitie');
  titreSortie.textContent = 'Ce que cela donne';
  droite.append(
    titreSortie,
    b.recherche,
    creer('div', 'paire-sortie'),
  );
  droite.querySelector('.paire-sortie').append(
    colonne('colonne-perso', [b.personnage, b.panoplies]),
    colonne('', [b.principales, b.caracteristiques, b.secondaires, b.dommages, b.resistances]),
  );
  droite.append(b.candidats, b.analyse);

  grille.append(gauche, droite);
  atelier.append(grille);
}

/** Dispositions proposees. La premiere est celle de la feuille de base. */
export const DISPOSITIONS = [
  { cle: 'colonnes', nom: 'Colonnes', fichier: null, plan: null },
  { cle: 'bandeau', nom: 'Bandeau', fichier: 'dispositions/bandeau.css', plan: planBandeau },
  { cle: 'atelier', nom: 'Atelier', fichier: 'dispositions/atelier.css', plan: planAtelier },
  { cle: 'entree-sortie', nom: 'Entree / sortie', fichier: 'dispositions/entree-sortie.css', plan: planEntreeSortie },
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
    atelier.replaceChildren();
    choix.plan(atelier, gardees);
  }

  // Le graphe se dessine dans un canvas : sa largeur vient de changer.
  window.dispatchEvent(new CustomEvent('copyroxx:theme', { detail: choix.cle }));
}

/** Disposition a poser au chargement : l'adresse passe devant le choix garde. */
export function dispositionGardee() {
  const demande = new URLSearchParams(location.search).get('disposition');
  if (demande) return trouver(demande).cle;
  try {
    return trouver(localStorage.getItem(CLE)).cle;
  } catch {
    return DISPOSITIONS[0].cle;
  }
}

/** Installe le selecteur dans la barre du haut et pose la disposition gardee. */
export function installerDisposition(hote) {
  const courante = dispositionGardee();
  appliquerDisposition(courante);

  // La touche C ouvre le catalogue quand il est en tiroir, hors zone de saisie.
  window.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'c' && evenement.key !== 'C') return;
    if (evenement.metaKey || evenement.ctrlKey || evenement.altKey) return;
    const cible = evenement.target;
    if (cible instanceof HTMLElement && cible.closest('input, select, textarea')) return;
    document.querySelector('.poignee-tiroir')?.click();
  });

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
      try { localStorage.setItem(CLE, choix.value); } catch { /* stockage refuse */ }
    }
    appliquerDisposition(choix.value);
  });
  hote.prepend(choix);
}
