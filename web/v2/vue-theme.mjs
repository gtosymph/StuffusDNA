/**
 * Le choix de l'habillage, dans la feuille des reglages.
 *
 * Un menu deroulant nomme les themes ; il ne les montre pas. « Braise » ne
 * dit rien tant qu'on ne l'a pas pose, et l'essayer un par un coute cinq
 * allers-retours. Chaque theme se presente donc par un echantillon de ses
 * trois couleurs porteuses — le fond, la surface, l'accent — dans l'ordre ou
 * l'ecran les emploie.
 *
 * Le theme se pose au survol et revient au theme courant si on repart sans
 * choisir : c'est l'essai avant l'achat, et il ne coute rien puisqu'un theme
 * n'est qu'une feuille de jetons.
 */
import { el } from '../render.mjs';
import { appliquerTheme, CLE_THEME_V2, themeGarde } from '../theme.mjs';
import { ecrire } from '../stockage.mjs';
import { THEMES_V2 } from './catalogue-themes.mjs';

/**
 * Dessine le choix de l'habillage dans un hote.
 *
 * @param {HTMLElement} hote
 */
export function renderChoixTheme(hote) {
  /**
   * L'habillage RETENU, pas celui qui est pose.
   *
   * Il ne peut pas vivre dans la fermeture d'un dessin : choisir redessine
   * les cartes, ce qui enleve du document la carte qu'on vient de cliquer.
   * Une carte enlevee perd le focus, son gestionnaire de sortie part, et il
   * remettait alors l'habillage PRECEDENT — celui que sa fermeture avait
   * capture. L'ecran gardait l'ancien theme, le stockage le nouveau, et la
   * page se retrouvait avec la feuille de l'un et l'attribut de l'autre.
   */
  let retenu = themeGarde();

  /** Pose un theme sans le garder : l'essai ne decide de rien. */
  const essayer = (cle) => appliquerTheme(cle);

  /** Remet l'habillage retenu : un survol ne decide de rien. */
  const revenir = () => appliquerTheme(retenu);

  const retenir = (cle) => {
    retenu = cle;
    ecrire(CLE_THEME_V2, cle);
    appliquerTheme(cle);
    dessiner(cle);
  };

  function dessiner(actif) {
    hote.replaceChildren(...THEMES_V2.map((theme) => {
      const [fond, surface, accent] = theme.apercu;
      return el('button', {
        class: `carte-theme ${theme.cle === actif ? 'actif' : ''}`.trim(),
        type: 'button', 'aria-pressed': String(theme.cle === actif),
        title: theme.phrase,
        onClick: () => retenir(theme.cle),
        onMouseEnter: () => essayer(theme.cle),
        onFocus: () => essayer(theme.cle),
        // Repartir sans choisir remet l'habillage en place : un survol ne
        // doit jamais laisser l'ecran dans un etat que personne n'a demande.
        onMouseLeave: revenir,
        onBlur: revenir,
      },
        el('span', { class: 'apercu-theme',
          style: `--a:${fond};--b:${surface};--c:${accent}` }),
        el('span', { class: 'nom-theme', text: theme.nom }));
    }));
  }

  dessiner(retenu);
}
