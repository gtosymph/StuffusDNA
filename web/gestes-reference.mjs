/**
 * Gestes du stuff de reference.
 *
 * La reference est le stuff VRAIMENT porte en jeu. Elle sert d'origine a tout
 * ce qui se compte en achats : un palier « trois pieces » veut dire trois
 * pieces a acheter par rapport a elle. Une reference fausse rend donc faux
 * tout le panneau de proximite, sans qu'aucun nombre ne paraisse etrange.
 *
 * Les quatre gestes se tiennent ensemble parce qu'ils partagent une regle :
 * des que la reference bouge, les paliers d'avant ne valent plus rien. Ils
 * comptaient les achats face a l'ANCIENNE reference. Gardes, ils annonceraient
 * des gains qui ne veulent plus rien dire. Chaque geste les vide donc.
 */
import { referenceDepuisSimulation } from './reference.mjs';
import { libelle as libelleSimulation } from './simulations.mjs';

/**
 * Cree les gestes du stuff de reference.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {(patch: any) => void} liens.setEtat
 * @param {(texte: string, type?: string) => void} liens.message
 * @param {() => {porterAlaMain: (build: any) => void}} liens.lireRecherche
 * @param {(classe: number) => string} liens.nomDeClasse
 */
export function creerGestesReference({ lireEtat, setEtat, message, lireRecherche, nomDeClasse }) {
  /**
   * Fige le build pose comme stuff porte en jeu.
   *
   * Le piege est de figer un build que le solveur vient de trouver : il est
   * deja le meilleur connu, aucun achat ne le battra, et le panneau n'a plus
   * rien a dire. La reference n'a de sens que sur le stuff VRAIMENT porte.
   */
  function figerReference() {
    const etat = lireEtat();
    const itemIds = [...etat.equipped.values()].map((piece) => piece.id);
    if (itemIds.length === 0) {
      message('Posez d\'abord les pieces que vous portez en jeu.', 'alerte');
      return;
    }

    // Un build pose par le solveur ne porte aucune piece marquee « a la main ».
    const duSolveur = etat.posees.size === 0 && (etat.candidats ?? []).length > 0;

    setEtat({ reference: { itemIds, date: new Date().toISOString() }, paliers: [] });
    message(duSolveur
      ? `Stuff de reference fige : ${itemIds.length} piece(s). Attention, ce build `
        + 'vient du solveur : aucun achat ne le battra. Posez votre stuff de jeu '
        + 'et figez-le de nouveau pour voir ce que chaque achat rapporterait.'
      : `Stuff de reference fige : ${itemIds.length} piece(s). `
        + 'Le solveur compte maintenant ce que chaque build demande d\'acheter.',
    duSolveur ? 'alerte' : 'info');
  }

  /**
   * Fige le stuff d'une simulation gardee comme stuff porte en jeu.
   *
   * Le stuff porte en jeu se garde d'ordinaire comme une simulation avant d'en
   * essayer d'autres. Sans ce geste, le reprendre demandait de le remettre en
   * place, de le figer, puis de revenir a l'essai en cours : trois pas et une
   * perte du build courant pour une seule intention.
   *
   * @param {any} simulation
   */
  function figerSimulation(simulation) {
    const reference = referenceDepuisSimulation(simulation);
    if (!reference) {
      message('Cette simulation ne porte aucune piece : rien a figer.', 'alerte');
      return;
    }

    setEtat({ reference, paliers: [] });
    message(`Stuff de reference fige sur « ${libelleSimulation(simulation, nomDeClasse)} » : `
      + `${reference.itemIds.length} piece(s). Le build porte ne bouge pas.`, 'info');
  }

  /** Enleve la reference : le solveur cherche de nouveau librement. */
  function oublierReference() {
    setEtat({ reference: null, paliers: [] });
    message('Reference enlevee. Le solveur cherche de nouveau sans contrainte d\'achat.', 'info');
  }

  /** Repose le stuff de reference sur le personnage. */
  function reprendreReference() {
    const etat = lireEtat();
    if (!etat.reference) return;
    lireRecherche().porterAlaMain({ itemIds: etat.reference.itemIds });
    message('Stuff de reference repose.', 'info');
  }

  return { figerReference, figerSimulation, oublierReference, reprendreReference };
}
