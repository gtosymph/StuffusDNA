/**
 * Les habillages de v2.
 *
 * Le catalogue vit a part pour une raison simple : il n'importe rien. Ni le
 * stockage, ni le DOM, ni une feuille de style. Le module qui pose les
 * feuilles et celui qui dessine le choix s'en servent tous les deux, et un
 * test peut le lire sans navigateur.
 *
 * Chaque entree porte quatre choses :
 *
 *   - `cle` : ce qui se garde et ce que `?theme=` accepte ;
 *   - `fichier` : la feuille a poser, relative a `web/v2/`. Le premier
 *     habillage n'en a pas : il EST la feuille de base ;
 *   - `apercu` : fond, surface, accent — dans l'ordre ou l'ecran les
 *     emploie. Il double les couleurs des feuilles parce qu'une pastille ne
 *     peut pas lire un fichier qui n'est pas pose ;
 *   - `phrase` : ce que l'habillage promet, en une ligne.
 *
 * Les habillages de v1 ne figurent pas ici : les deux coquilles n'emploient
 * pas la meme palette de jetons, et un habillage de v1 pose sur v2
 * n'habillerait que la moitie de l'ecran.
 */

/** Habillage d'un visiteur qui n'a encore rien choisi. */
export const THEME_V2_DEFAUT = 'studio';

export const THEMES_V2 = Object.freeze([
  {
    cle: 'studio',
    nom: 'Studio',
    fichier: null,
    apercu: ['#0d1017', '#1b2030', '#7f74ff'],
    phrase: 'Bleu-noir et iris. L\'habillage de départ.',
  },
  {
    cle: 'ardoise',
    nom: 'Ardoise',
    fichier: 'themes/ardoise.css',
    apercu: ['#0e0f11', '#1e2024', '#5b9dd9'],
    phrase: 'Graphite neutre, acier froid. Pour les longues séances.',
  },
  {
    cle: 'braise',
    nom: 'Braise',
    fichier: 'themes/braise.css',
    apercu: ['#100c0a', '#211915', '#e8712e'],
    phrase: 'Noir chaud et braise orange. La forge.',
  },
  {
    cle: 'abysse',
    nom: 'Abysse',
    fichier: 'themes/abysse.css',
    apercu: ['#061014', '#11242c', '#2bb9d4'],
    phrase: 'Bleu profond et cyan. Le fond lui-même est colore.',
  },
  {
    cle: 'vigne',
    nom: 'Vigne',
    fichier: 'themes/vigne.css',
    apercu: ['#120b18', '#23172d', '#a855c7'],
    phrase: 'Nuit violacée, pourpre et laiton. Le plus orne.',
  },
  {
    cle: 'parchemin',
    nom: 'Parchemin',
    fichier: 'themes/parchemin.css',
    apercu: ['#f3efe6', '#e5dfd2', '#35548c'],
    phrase: 'Ivoire et encre brune. Le clair le plus chaleureux.',
  },
  {
    cle: 'lin',
    nom: 'Lin',
    fichier: 'themes/lin.css',
    apercu: ['#eceef2', '#e9ecf1', '#4b4ecf'],
    phrase: 'Clair et froid, encre noire. Pour qui trouve le parchemin trop jaune.',
  },
  {
    cle: 'neige',
    nom: 'Neige',
    fichier: 'themes/neige.css',
    apercu: ['#ffffff', '#e2e6ec', '#2f3ccc'],
    phrase: 'Contraste maximal. Quand la nuance ne se voit pas.',
  },
  {
    cle: 'terminal',
    nom: 'Terminal',
    fichier: 'themes/terminal.css',
    apercu: ['#000000', '#101512', '#3ee07f'],
    phrase: 'Noir absolu et phosphore. Tout y est chiffré.',
  },
]);
