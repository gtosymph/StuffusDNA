/**
 * Liaison des commandes de la page a l'etat.
 *
 * Tout ce qui se clique ou se saisit passe par ici, une fois pour toutes, au
 * demarrage. Rassembler ces liaisons donne la liste complete de ce que le
 * joueur peut faire : une commande ajoutee a la page et oubliee ici ne repond
 * pas, et rien dans le code ne le signale.
 *
 * Aucune de ces fonctions ne calcule : chacune lit un champ, le borne, et
 * passe le resultat a l'etat. Le travail se fait ailleurs.
 */
import { cacherBulle } from './hover-card.mjs';
import { fermerFiche } from './item-panel.mjs';
import { fermerPicker } from './spell-picker.mjs';
import { creerGestesSorts } from './gestes-sorts.mjs';
import { chargerSet, enleverSet, enregistrerSet } from './presets.mjs';
import { STAT_LABELS } from '../src/data/stats.mjs';

/**
 * Branche toutes les commandes de la page.
 *
 * @param {object} liens
 * @param {(id: string) => HTMLElement} liens.$
 * @param {() => any} liens.lireEtat
 * @param {(patch: any) => void} liens.setEtat
 * @param {(texte: string, type?: string) => void} liens.message
 * @param {() => void} liens.annuler
 * @param {() => void} liens.render
 * @param {() => any[]|null} liens.lireClassesSorts
 * @param {() => void} liens.remplirListesSets
 * @param {object} liens.gestes Gestes du catalogue.
 * @param {object} liens.recherche
 */
export function brancher(liens) {
  const { $, lireEtat, setEtat, message, annuler, render } = liens;
  const { lireClassesSorts, remplirListesSets, gestes, recherche } = liens;

  brancherPersonnage($, setEtat);
  brancherCatalogue($, lireEtat, setEtat, gestes);
  brancherClavier($, annuler);
  brancherConditions($, lireEtat, setEtat, message);
  brancherSorts($, lireEtat, setEtat, message, lireClassesSorts);

  for (const nature of ['sorts', 'conditions']) {
    brancherSets({
      $, message, remplirListesSets, nature,
      idListe: `sets-${nature}`,
      lire: () => lireEtat()[nature],
      poser: (contenu) => setEtat({ [nature]: contenu }),
    });
  }

  document.querySelector('.colonne-perso')?.addEventListener('mouseleave', cacherBulle);
  window.addEventListener('scroll', cacherBulle, { passive: true });

  // Le graphe se dessine dans un canvas : il ne suit pas la cascade CSS.
  // Un changement de theme demande donc un nouveau rendu.
  window.addEventListener('copyroxx:theme', () => render());

  $('lancer').addEventListener('click', () => recherche.lancer());
  $('recommencer').addEventListener('click', () => recherche.lancer({ deZero: true }));
  $('arreter').addEventListener('click', () => recherche.arreter());
}

/** Niveau, classe et sexe du personnage. */
function brancherPersonnage($, setEtat) {
  $('niveau').addEventListener('change', (e) =>
    setEtat({ niveau: Math.max(1, Math.min(200, Number(e.target.value) || 1)) }));
  $('classe').addEventListener('change', (e) => setEtat({ classe: Number(e.target.value) }));
  $('sexe').addEventListener('change', (e) => setEtat({ sexe: Number(e.target.value) }));
}

/** Filtres du catalogue et gestes en masse. */
function brancherCatalogue($, lireEtat, setEtat, gestes) {
  $('recherche').addEventListener('input', (e) => setEtat({ recherche: e.target.value }));
  $('filtre-pk').addEventListener('change', (e) => setEtat({ filtrePk: e.target.checked }));

  const changerFiltre = (cle, valeur) =>
    setEtat({ filtreStat: { ...lireEtat().filtreStat, [cle]: valeur } });
  $('filtre-stat').addEventListener('change', (e) => changerFiltre('stat', e.target.value));
  $('filtre-op').addEventListener('change', (e) => changerFiltre('op', e.target.value));
  $('filtre-valeur').addEventListener('input', (e) =>
    changerFiltre('valeur', Number(e.target.value) || 0));

  $('bannir-resultats').addEventListener('click', gestes.bannirResultats);
  $('autoriser-resultats').addEventListener('click', gestes.autoriserResultats);
  $('posseder-resultats').addEventListener('click', () => gestes.posseder(true));
  $('oublier-possedees').addEventListener('click', () => gestes.posseder(false));
  $('vider').addEventListener('click', () => setEtat({ equipped: new Map(), posees: new Set() }));
}

/** Raccourcis clavier : Echap ferme, Ctrl+Z annule. */
function brancherClavier($, annuler) {
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
}

/** Ajout d'une condition, et choix du mode de recherche. */
function brancherConditions($, lireEtat, setEtat, message) {
  $('ajouter-condition').addEventListener('click', () => {
    const etat = lireEtat();
    const stat = $('nouvelle-condition').value;
    if (etat.conditions.some((c) => c.stat === stat)) {
      message(`Une condition porte deja sur "${STAT_LABELS[stat]}".`, 'erreur');
      return;
    }
    setEtat({ conditions: [...etat.conditions,
      { stat, target: 0, weight: 1, max: null, absolute: false }] });
  });

  $('mode-recherche').addEventListener('change', (ev) => {
    const mode = ev.target.value;
    setEtat({ mode });
    const etat = lireEtat();
    if (mode !== 'caracteristiques' && etat.sorts.length === 0 && !etat.options.arme) {
      message('Aucun sort ni arme : la recherche n\'a aucun degat a compter. '
        + 'Choisissez des sorts, ou revenez aux caracteristiques.', 'alerte');
    }
  });
}

/** Choix et retrait des sorts. */
function brancherSorts($, lireEtat, setEtat, message, lireClassesSorts) {
  const sorts = creerGestesSorts({ lireEtat, setEtat, message, lireClassesSorts });
  $('enlever-sorts').addEventListener('click', sorts.toutEnlever);
  $('choisir-sorts').addEventListener('click', sorts.ouvrir);
}

/**
 * Branche les trois boutons d'un jeu enregistre.
 *
 * @param {object} liens
 * @param {(id: string) => HTMLElement} liens.$
 * @param {(texte: string, type?: string) => void} liens.message
 * @param {() => void} liens.remplirListesSets
 * @param {'sorts'|'conditions'} liens.nature
 * @param {string} liens.idListe
 * @param {() => any} liens.lire Contenu courant a enregistrer.
 * @param {(contenu: any) => void} liens.poser Applique un contenu repris.
 */
export function brancherSets({ $, message, remplirListesSets, nature, idListe, lire, poser }) {
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
