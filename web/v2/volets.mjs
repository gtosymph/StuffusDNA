/**
 * Les deux volets : ouverts, replies, et qui decide.
 *
 * L'atelier tient sur trois colonnes. A partir d'un ecran d'ordinateur
 * portable — mille cent pixels, ce qui est courant — les trois colonnes
 * etranglent celle du milieu : le personnage, le trace et les stuffs trouves
 * se serrent dans quatre cents pixels pendant que deux listes de reglages en
 * occupent six cents.
 *
 * Les volets se replient donc, depuis la barre du haut, et leur etat se
 * garde. Deux regles suffisent :
 *
 *   - sur un ecran large, un volet replie rend sa place au milieu ;
 *   - sur un ecran etroit, un volet ouvert passe PAR-DESSUS le milieu, et
 *     l'autre se ferme — deux panneaux flottants sur un ecran de telephone se
 *     recouvriraient.
 *
 * Rien ici ne touche au document : l'etat se calcule, la feuille de style
 * s'occupe du reste.
 */
import { CLES, ecrireJson, lireJson } from '../stockage.mjs';

/** Cle du rangement : l'etat des volets suit le joueur d'une seance a l'autre. */
export const CLE_VOLETS = CLES.volets;

/** Les deux cotes, dans l'ordre de l'ecran. */
export const COTES = Object.freeze(['gauche', 'droit']);

/**
 * Largeur en dessous de laquelle un volet ouvert recouvre le milieu.
 *
 * Elle vaut la somme des trois colonnes plus la marge du milieu : en dessous,
 * les trois ne tiennent plus cote a cote sans etrangler celle qu'on regarde.
 */
export const LARGEUR_ETROITE = 1240;

/**
 * Etat d'ouverture au demarrage.
 *
 * Sur un ecran etroit, les deux volets partent fermes quoi qu'on ait garde :
 * l'application s'ouvre sur le personnage, pas sur deux listes de reglages.
 *
 * @param {object} liens
 * @param {{gauche?: boolean, droit?: boolean}|null} liens.garde Ce qui a ete
 *   garde, ou null.
 * @param {boolean} liens.etroit
 * @returns {{gauche: boolean, droit: boolean}}
 */
export function ouvertureDepart({ garde, etroit }) {
  if (etroit) return { gauche: false, droit: false };
  return {
    gauche: garde?.gauche !== false,
    droit: garde?.droit !== false,
  };
}

/**
 * Ouvre ou replie un volet.
 *
 * @param {{gauche: boolean, droit: boolean}} etat
 * @param {'gauche'|'droit'} cote
 * @param {boolean} etroit Sur un ecran etroit, un seul volet a la fois.
 * @returns {{gauche: boolean, droit: boolean}}
 */
export function basculer(etat, cote, etroit) {
  if (!COTES.includes(cote)) return etat;
  const ouvre = !etat[cote];
  const autre = cote === 'gauche' ? 'droit' : 'gauche';

  return {
    ...etat,
    [cote]: ouvre,
    ...(etroit && ouvre ? { [autre]: false } : {}),
  };
}

/**
 * Classes a poser sur l'atelier.
 *
 * Un volet REPLIE porte une classe ; un volet ouvert n'en porte aucune. C'est
 * le sens le plus sur : une feuille de style chargee a moitie laisse alors
 * les deux volets visibles, ce qui est l'etat le moins genant.
 *
 * @param {{gauche: boolean, droit: boolean}} etat
 * @param {boolean} etroit
 * @returns {string[]}
 */
export function classesDeVolets(etat, etroit) {
  return [
    ...(etat.gauche ? [] : ['gauche-replie']),
    ...(etat.droit ? [] : ['droit-replie']),
    ...(etroit ? ['volets-flottants'] : []),
  ];
}

/**
 * Largeur en dessous de laquelle l'ecran n'en montre plus qu'UN a la fois.
 *
 * Sur un telephone, les trois zones ne cohabitent pas : elles deviennent
 * trois ecrans, et une barre d'onglets dit lequel on regarde. Un volet pose
 * par-dessus le milieu marchait sur une tablette ; sur trois cent quatre-vingt
 * dix pixels, il recouvrait sa propre commande de fermeture.
 */
export const LARGEUR_TELEPHONE = 720;

/** Les trois ecrans du telephone, dans l'ordre de la barre d'onglets. */
export const ONGLETS = Object.freeze(['gauche', 'stuff', 'droit']);

/**
 * Quel ecran l'etat des volets designe.
 *
 * Les deux etats existants suffisent a en dire trois : un volet ouvert nomme
 * son ecran, aucun volet ouvert nomme le milieu. Rien de nouveau a garder, et
 * rien qui puisse se contredire.
 *
 * @param {{gauche: boolean, droit: boolean}} etat
 * @returns {'gauche'|'stuff'|'droit'}
 */
export function ongletCourant(etat) {
  if (etat?.gauche) return 'gauche';
  if (etat?.droit) return 'droit';
  return 'stuff';
}

/**
 * Va sur un ecran, sans passer par une bascule.
 *
 * Un onglet n'est pas un interrupteur : appuyer sur celui ou l'on est deja ne
 * doit pas ramener ailleurs. C'est ce que `basculer` ferait.
 *
 * @param {{gauche: boolean, droit: boolean}} etat
 * @param {'gauche'|'stuff'|'droit'} onglet
 * @returns {{gauche: boolean, droit: boolean}}
 */
export function choisirOnglet(etat, onglet) {
  if (!ONGLETS.includes(onglet)) return etat;
  return { gauche: onglet === 'gauche', droit: onglet === 'droit' };
}

/** Lit ce qui a ete garde, ou null. */
export const lireVolets = () => lireJson(CLE_VOLETS, null);

/** Garde l'etat des volets. Un ecran etroit ne garde rien : son etat est du
 * moment, et l'imposer au prochain ecran large serait une surprise. */
export function garderVolets(etat, etroit) {
  if (etroit) return;
  ecrireJson(CLE_VOLETS, etat);
}
