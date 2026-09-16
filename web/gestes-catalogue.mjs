/**
 * Gestes portes sur les pieces du catalogue.
 *
 * Equiper, bannir, verrouiller, posseder : quatre reglages independants sur
 * une meme piece. Chacun tient en deux temps — l'etat change, puis le joueur
 * lit ce qui vient de se passer. Le second temps compte autant que le premier :
 * bannir une piece ne se voit nulle part si le message ne le dit pas, et le
 * joueur croit son clic perdu.
 *
 * Les gestes en masse suivent la meme regle avec une prudence de plus : ils
 * touchent des dizaines de pieces d'un coup, donc ils annoncent toujours
 * combien, et par quel geste revenir en arriere.
 */
import * as geste from './equipement.mjs';
import { itemsFiltres } from './objectif.mjs';

/**
 * Cree les gestes du catalogue.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {() => any} liens.lireCatalogue
 * @param {(patch: any) => void} liens.setEtat
 * @param {(texte: string, type?: string) => void} liens.message
 */
export function creerGestesCatalogue({ lireEtat, lireCatalogue, setEtat, message }) {
  /** Pose une piece dans sa case, si elle y a sa place. */
  function equiper(item) {
    const patch = geste.equiper(lireEtat(), item);
    if (patch) setEtat(patch);
  }

  /** Bascule le bannissement d'une piece. */
  function bannir(item) {
    const { patch, bannie } = geste.basculerBanni(lireEtat(), item);
    setEtat(patch);
    message(bannie
      ? `« ${item.fr} » est interdite : le solveur ne la proposera plus.`
      : `« ${item.fr} » est de nouveau proposee au solveur.`, 'info');
  }

  /** Bascule le verrou d'une piece : le solveur la garde dans chaque build. */
  function verrouiller(item) {
    const { patch, verrouillee } = geste.basculerVerrou(lireEtat(), item);
    setEtat(patch);
    message(verrouillee
      ? `« ${item.fr} » est toujours gardee : le solveur la pose dans chaque stuff.`
      : `« ${item.fr} » n'est plus gardee d'office.`, 'info');
  }

  /** Enleve la piece posee dans une case. */
  function retirer(cle) {
    setEtat(geste.retirer(lireEtat(), cle));
  }

  /** Bannit d'un coup toutes les pieces qui passent les filtres du catalogue. */
  function bannirResultats() {
    const etat = lireEtat();
    const cibles = itemsFiltres(etat, lireCatalogue()).filter((item) => !etat.bannis.has(item.id));
    if (cibles.length === 0) {
      message('Aucune piece a interdire dans ces resultats.', 'info');
      return;
    }
    setEtat(geste.bannirPieces(etat, cibles));
    message(`${cibles.length} piece(s) interdite(s). « Autoriser » sur ces memes filtres annule.`, 'info');
  }

  /** Autorise de nouveau toutes les pieces bannies qui passent les filtres. */
  function autoriserResultats() {
    const etat = lireEtat();
    const cibles = itemsFiltres(etat, lireCatalogue()).filter((item) => etat.bannis.has(item.id));
    if (cibles.length === 0) {
      message('Aucune piece interdite dans ces resultats.', 'info');
      return;
    }
    setEtat(geste.autoriserPieces(etat, cibles));
    message(`${cibles.length} piece(s) de nouveau autorisee(s).`, 'info');
  }

  /** Marque comme possedees les pieces qui passent les filtres, ou les enleve. */
  function posseder(actif) {
    const etat = lireEtat();
    const cibles = itemsFiltres(etat, lireCatalogue())
      .filter((item) => etat.possedees.has(item.id) !== actif);
    if (cibles.length === 0) {
      message(actif
        ? 'Toutes ces pieces sont deja marquees comme possedees.'
        : 'Aucune piece possedee dans ces resultats.', 'info');
      return;
    }
    setEtat(geste.posseder(etat, cibles, actif));
    message(actif
      ? `${cibles.length} piece(s) marquee(s) comme possedees : elles ne coutent plus d'achat.`
      : `${cibles.length} piece(s) enlevee(s) de votre banque.`, 'info');
  }

  /** Met une piece dans l'inventaire, ou l'en enleve. */
  function basculerPossedee(item) {
    const etat = lireEtat();
    const avait = etat.possedees.has(item.id);
    setEtat(geste.posseder(etat, [item], !avait));
    message(avait
      ? `${item.fr} enlevee de votre inventaire.`
      : `${item.fr} ajoutee a votre inventaire : elle ne compte plus comme un achat.`, 'info');
  }

  return {
    equiper, bannir, verrouiller, retirer,
    bannirResultats, autoriserResultats, posseder, basculerPossedee,
  };
}
