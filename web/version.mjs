/**
 * La version publiee, en un seul endroit.
 *
 * Elle se lit dans la barre du haut. Un joueur qui signale un defaut dit
 * « v1.0.0 » au lieu de « la version d'hier », et le defaut se replace dans
 * l'histoire du depot sans rien deviner.
 *
 * `package.json` porte la meme valeur. Les deux ne peuvent pas se lire l'un
 * l'autre — le navigateur ne lit pas `package.json`, et un module de la page
 * n'est pas charge par npm — donc un test les confronte.
 */

/** Version publiee, au format « majeur.mineur.correctif ». */
export const VERSION = '1.0.0';

/** Version telle qu'elle se montre a l'ecran. */
export const VERSION_LUE = `v${VERSION}`;
