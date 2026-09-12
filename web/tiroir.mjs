/**
 * Tiroir du catalogue.
 *
 * Le catalogue et les pieces bannies occupent une colonne entiere, en
 * permanence. Or on ne s'en sert que par moments : on cherche une piece, on
 * en bannit une serie, puis on revient aux chiffres. Le reste du temps, cette
 * colonne prend deux cents pixels aux panneaux que l'on lit vraiment.
 *
 * Un bouton de la barre du haut la referme donc et la rouvre. L'etat tient
 * dans un attribut de la racine : la feuille de chaque disposition retire
 * alors la premiere piste de sa grille, et les autres colonnes prennent la
 * place. Le choix se garde d'une visite a l'autre.
 */
import { CLES, ecrire, lireTexte } from './stockage.mjs';

const CLE = CLES.catalogue;

/** Lit le choix garde. Le catalogue reste ouvert tant qu'on n'a rien dit. */
function lire() {
  return lireTexte(CLE) === 'ferme' ? 'ferme' : 'ouvert';
}

/** Garde le choix. */
function garder(etat) {
  ecrire(CLE, etat);
}

/**
 * Installe le bouton du tiroir et pose l'etat garde.
 *
 * @param {HTMLElement|null} hote Conteneur du bouton, dans la barre du haut.
 * @returns {() => void} Fonction qui arrete le suivi du compteur.
 */
export function installerTiroir(hote) {
  const colonne = document.querySelector('.colonne-catalogue');
  if (!colonne) return () => {};
  colonne.id ||= 'colonne-catalogue';

  let etat = lire();
  document.documentElement.dataset.catalogue = etat;
  if (!hote) return () => {};

  const bouton = document.createElement('button');
  bouton.id = 'bascule-catalogue';
  bouton.type = 'button';
  bouton.className = 'bascule-tiroir';
  bouton.setAttribute('aria-controls', colonne.id);

  const libelle = document.createElement('span');
  libelle.textContent = 'Catalogue';
  const compte = document.createElement('span');
  compte.className = 'compte-tiroir';
  bouton.append(libelle, compte);

  const poser = () => {
    document.documentElement.dataset.catalogue = etat;
    bouton.setAttribute('aria-expanded', String(etat === 'ouvert'));
    bouton.title = etat === 'ouvert'
      ? 'Ferme le catalogue et rend sa place aux autres colonnes'
      : 'Rouvre le catalogue et les pieces bannies';
  };

  bouton.addEventListener('click', () => {
    etat = etat === 'ouvert' ? 'ferme' : 'ouvert';
    garder(etat);
    poser();
    // La courbe se dessine dans un canvas : sa largeur vient de changer.
    window.dispatchEvent(new CustomEvent('copyroxx:theme', { detail: 'tiroir' }));
  });

  poser();
  hote.append(bouton);

  // Le nombre de pieces bannies se lit sans ouvrir le tiroir : c'est le seul
  // reglage du catalogue qui pese sur une recherche.
  const source = document.getElementById('compte-bannis');
  if (!source) return () => {};

  const suivre = () => {
    const bannies = Number(source.textContent) || 0;
    compte.textContent = bannies > 0 ? String(bannies) : '';
    compte.title = bannies > 0 ? `${bannies} piece(s) bannie(s)` : '';
  };
  const suiveur = new MutationObserver(suivre);
  suiveur.observe(source, { childList: true, characterData: true, subtree: true });
  suivre();

  return () => suiveur.disconnect();
}
