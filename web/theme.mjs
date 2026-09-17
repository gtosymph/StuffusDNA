/**
 * Choix du theme visuel.
 *
 * Chaque theme est une feuille posee apres la feuille de base : elle redefinit
 * les jetons de couleur, de police et de densite, puis quelques regles de mise
 * en forme. La structure de la page ne change pas : un theme ne peut donc pas
 * casser l'interface, et le retour au theme de depart tient en un clic.
 *
 * Le choix se garde sous une cle propre au theme. L'etat du build, lui, reste
 * dans `copyroxx_etat` : les deux ne se touchent jamais.
 */

import { CLES, ecrire, lireTexte } from './stockage.mjs';

/**
 * Themes proposes. Le premier porte la feuille de base : il n'a pas de
 * feuille propre a poser.
 */
export const THEMES_V1 = [
  { cle: 'nuit', nom: 'Nuit', fichier: null },
  { cle: 'papier', nom: 'Papier', fichier: 'themes/papier.css' },
  { cle: 'forge', nom: 'Forge', fichier: 'themes/forge.css' },
  { cle: 'console', nom: 'Console', fichier: 'themes/console.css' },
  { cle: 'cockpit', nom: 'Cockpit', fichier: 'themes/cockpit.css' },
];

/**
 * Theme d'un visiteur qui n'a encore rien choisi.
 * Le script d'amorce du document pose la meme feuille avant le premier
 * rendu : gardez les deux d'accord.
 */
export const THEME_DEFAUT = 'cockpit';

/**
 * Themes de la coquille v2, repris du catalogue.
 *
 * Les chemins de `fichier` y sont relatifs au document, donc a `web/v2/`.
 */
export { THEMES_V2 } from './v2/catalogue-themes.mjs';

/**
 * Cle ou v2 garde son choix.
 *
 * Elle differe de celle de v1 : « braise » n'existe pas dans la liste de v1,
 * et une cle commune ferait retomber v1 sur son theme de depart des que v2
 * aurait ecrit le sien.
 */
export const CLE_THEME_V2 = CLES.themeV2;

/**
 * Liste et defaut en vigueur.
 *
 * Le module sert deux coquilles qui n'ont ni la meme palette ni les memes
 * feuilles. Plutot que de dupliquer tout ce qui suit, chaque coquille dit
 * une fois lequel des deux jeux elle porte.
 */
let THEMES = THEMES_V1;
let DEFAUT = THEME_DEFAUT;

/**
 * Cle ou le choix se garde.
 *
 * Chaque coquille a la sienne : « braise » n'existe pas dans la liste de v1,
 * et une cle commune ferait retomber v1 sur son theme de depart des que v2
 * aurait ecrit le sien.
 */
let CLE = CLES.theme;
const ID_FEUILLE = 'feuille-theme';

/**
 * Dit quel jeu de themes cette coquille propose.
 *
 * @param {{themes: any[], defaut: string, cle?: string}} reglage
 */
export function configurerThemes({ themes, defaut, cle = CLES.theme }) {
  THEMES = themes;
  DEFAUT = defaut;
  CLE = cle;
}

/** Rend le theme demande, ou celui par defaut si la cle est inconnue. */
function trouver(cle) {
  return THEMES.find((t) => t.cle === cle)
    ?? THEMES.find((t) => t.cle === DEFAUT)
    ?? THEMES[0];
}

/**
 * Theme a poser au chargement.
 *
 * Le parametre `?theme=` de l'adresse passe devant le choix garde, et ne
 * s'enregistre pas : une page d'apercu peut ainsi montrer un theme sans
 * changer celui de l'utilisateur, qui partage le meme stockage.
 */
export function themeGarde() {
  const demande = new URLSearchParams(location.search).get('theme');
  if (demande) return trouver(demande).cle;
  return trouver(lireTexte(CLE)).cle;
}

/** Vrai quand le theme vient de l'adresse : le choix ne doit alors pas etre garde. */
function themeImpose() {
  return new URLSearchParams(location.search).has('theme');
}

/**
 * Pose le theme demande.
 *
 * L'evenement `copyroxx:theme` part une fois la feuille lue : le graphe, qui
 * se dessine dans un canvas et ne suit pas la cascade, se redessine alors avec
 * les bonnes couleurs.
 */
export function appliquerTheme(cle) {
  const theme = trouver(cle);
  document.documentElement.dataset.theme = theme.cle;

  const ancienne = document.getElementById(ID_FEUILLE);
  const prevenir = () => window.dispatchEvent(new CustomEvent('copyroxx:theme', { detail: theme.cle }));

  if (!theme.fichier) {
    ancienne?.remove();
    prevenir();
    return;
  }

  // La feuille peut deja etre posee par le script d'amorce du document.
  if (ancienne && ancienne.getAttribute('href') === theme.fichier) {
    prevenir();
    return;
  }

  const feuille = document.createElement('link');
  feuille.id = ID_FEUILLE;
  feuille.rel = 'stylesheet';
  feuille.href = theme.fichier;
  // La feuille remplace la precedente une fois lue : sans cela, la page
  // clignote sur le theme de base entre les deux.
  feuille.addEventListener('load', () => { ancienne?.remove(); prevenir(); }, { once: true });
  feuille.addEventListener('error', () => { feuille.remove(); prevenir(); }, { once: true });
  document.head.append(feuille);
}

/** Garde le choix, sans jamais faire echouer l'application. */
function garder(cle) {
  ecrire(CLE, cle);
}

/** Installe le selecteur dans la barre du haut et pose le theme garde. */
export function installerTheme(hote) {
  const courant = themeGarde();
  appliquerTheme(courant);
  if (!hote) return;

  const choix = document.createElement('select');
  choix.id = 'choix-theme';
  choix.title = 'Theme visuel';
  choix.setAttribute('aria-label', 'Theme visuel');
  for (const theme of THEMES) {
    const option = document.createElement('option');
    option.value = theme.cle;
    option.textContent = theme.nom;
    choix.append(option);
  }
  choix.value = courant;
  choix.addEventListener('change', () => {
    if (!themeImpose()) garder(choix.value);
    appliquerTheme(choix.value);
  });
  hote.prepend(choix);
}
