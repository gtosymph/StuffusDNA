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
 * Le dernier habillage DEMANDE, pose ou non.
 *
 * Survoler huit cartes en demande huit en une seconde, et une feuille met un
 * instant a se lire. Sans cette memoire, la feuille d'un habillage abandonne
 * arrivait apres celle du suivant : elle se posait par-dessus et gagnait la
 * cascade, parce qu'une feuille posee plus tard passe devant. On choisissait
 * « Neige » et l'ecran montrait « Braise ».
 *
 * C'est la CLE qui departage, pas un numero d'ordre : revenir sur un
 * habillage deja demande est frequent — un survol qui repart, un choix qui
 * confirme ce que le survol montrait — et un numero ferait alors jeter la
 * bonne feuille.
 */
let themeDemande = null;

/** Toutes les feuilles d'habillage posees : celle de l'amorce, et les notres. */
const feuillesPosees = () => document.querySelectorAll(
  `link#${ID_FEUILLE}, link[data-theme-feuille]`);

/**
 * N'en garde qu'une.
 *
 * Chaque pose enlevait « la » feuille precedente, trouvee par son
 * identifiant. Deux poses rapprochees designaient donc la meme, et les
 * autres restaient : sept feuilles se sont empilees dans l'en-tete en huit
 * survols. Une seule regle vaut ici — a la fin, il en reste une.
 *
 * @param {Element|null} gardee
 */
function nettoyerFeuilles(gardee) {
  for (const lien of [...feuillesPosees()]) if (lien !== gardee) lien.remove();
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
  themeDemande = theme.cle;
  const prevenir = () => window.dispatchEvent(new CustomEvent('copyroxx:theme', { detail: theme.cle }));

  // L'habillage de base n'a pas de feuille a poser : il faut seulement
  // enlever celle qui couvrait la feuille de base.
  if (!theme.fichier) {
    nettoyerFeuilles(null);
    prevenir();
    return;
  }

  // La feuille voulue est peut-etre deja la : posee par le script d'amorce du
  // document, ou par un survol qui revient sur ses pas.
  const deja = [...feuillesPosees()].find((lien) => lien.getAttribute('href') === theme.fichier);
  if (deja) {
    nettoyerFeuilles(deja);
    prevenir();
    return;
  }

  const feuille = document.createElement('link');
  // La nouvelle feuille ne reprend PAS l'identifiant de l'amorce : deux
  // elements de meme identifiant rendent `getElementById` indecidable, et
  // c'est exactement ce qui empilait les feuilles.
  feuille.dataset.themeFeuille = theme.cle;
  feuille.rel = 'stylesheet';
  feuille.href = theme.fichier;
  // La feuille remplace les precedentes une fois lue : sans cela, la page
  // clignote sur le theme de base entre les deux.
  feuille.addEventListener('load', () => {
    // Un survol plus recent a demande autre chose : cette feuille n'a plus
    // rien a dire, et surtout rien a enlever.
    if (themeDemande !== theme.cle) { feuille.remove(); return; }
    nettoyerFeuilles(feuille);
    prevenir();
  }, { once: true });
  feuille.addEventListener('error', () => {
    feuille.remove();
    if (themeDemande === theme.cle) prevenir();
  }, { once: true });
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
