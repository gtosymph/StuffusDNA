/**
 * A quel rythme l'ecran se repeint, et surtout : a quel moment il ne se
 * repeint PAS.
 *
 * Pendant une recherche, chaque fil rend une vague par seconde et le meilleur
 * build s'applique des qu'il s'ameliore. Chaque application repeint l'ecran,
 * et repeindre veut dire remplacer des noeuds. Un clic se joue en deux temps —
 * le doigt descend sur un bouton, il remonte dessus — et le navigateur ne
 * compte le clic que si le MEME noeud recoit les deux. Un repeint glisse entre
 * les deux temps, et le clic n'arrive jamais. C'est le defaut qu'on voit en
 * ligne : « parfois mes clics ne passent pas ».
 *
 * Deux regles suffisent a le faire disparaitre :
 *
 *   1. plusieurs demandes rapprochees ne font qu'un seul repeint ;
 *   2. tant qu'un doigt est pose, rien ne se repeint — le repeint attendu
 *      part des que le doigt se leve.
 *
 * Rien ici ne connait le document : le planificateur et le peintre sont
 * donnes. C'est ce qui permet de verifier la regle sans navigateur.
 */

/**
 * Cree la cadence de repeint.
 *
 * @param {object} liens
 * @param {() => void} liens.peindre Repeint l'ecran, pour de vrai.
 * @param {(suite: () => void) => void} liens.planifier Reporte au prochain
 *   moment ou peindre a du sens — une image d'ecran, en general.
 * @returns {{demander: () => void, enfoncer: () => void, relacher: () => void}}
 */
export function creerCadence({ peindre, planifier }) {
  /** Un repeint est deja programme : une demande de plus ne coute rien. */
  let programme = false;

  /** Un doigt est pose : tout repeint attend qu'il se leve. */
  let enfonce = false;

  /** Un repeint a ete demande pendant que le doigt etait pose. */
  let du = false;

  /** Repeint, ou note qu'il le faudra des que le doigt se levera. */
  function maintenant() {
    programme = false;
    if (enfonce) { du = true; return; }
    du = false;
    peindre();
  }

  return {
    /** Demande un repeint. Plusieurs demandes rapprochees n'en font qu'un. */
    demander() {
      if (programme) return;
      programme = true;
      planifier(maintenant);
    },

    /** Un doigt vient de se poser : plus rien ne bouge sous lui. */
    enfoncer() { enfonce = true; },

    /** Le doigt se leve : le repeint retenu part. */
    relacher() {
      enfonce = false;
      if (du) { du = false; peindre(); }
    },
  };
}
