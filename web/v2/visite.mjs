/**
 * La visite guidee : ce qu'elle raconte, et dans quel ordre.
 *
 * L'ecran porte une quinzaine de commandes. Chacune est nommee en francais et
 * porte une infobulle, ce qui suffit a un joueur qui SAIT deja ce qu'il
 * cherche. Celui qui arrive ne le sait pas : il voit un plateau, des chiffres,
 * et ne devine pas par quel bout commencer. Une visite ne remplace pas les
 * libelles, elle donne l'ordre des gestes.
 *
 * Les etapes sont des donnees, pas du dessin. Elles disent quoi montrer et
 * quoi ecrire ; `vue-visite.mjs` s'occupe de la lucarne et de la bulle. Ce
 * partage permet de verifier ici les deux choses qui cassent en silence : une
 * etape qui vise une commande disparue, et une visite qui se coince sur une
 * commande absente de l'ecran du moment.
 */
import { CLES, ecrire, lireTexte } from '../stockage.mjs';

/** Cle du rangement : la visite ne se propose d'office qu'une fois. */
export const CLE_VISITE = CLES.visite;

/**
 * Les etapes, dans l'ordre d'un premier stuff.
 *
 * L'ordre n'est pas celui de l'ecran : c'est celui des gestes. On dit qui on
 * est, ce qu'on veut, avec quoi on frappe, ce qu'on exige, puis on cherche.
 * Le reste ne sert qu'apres un premier resultat.
 */
export const ETAPES = Object.freeze([
  {
    cible: '#identite',
    titre: 'Votre personnage',
    texte: 'Classe, niveau et sexe. Tout le calcul en depend : une amulette '
      + 'de niveau 200 ne se propose pas a un personnage de 60.',
  },
  {
    cible: '#objectif',
    titre: 'Ce que vous cherchez',
    texte: 'Frapper fort, encaisser, ou un melange des deux. C\'est la mesure '
      + 'que la recherche fait monter ; tout le reste ne fait que la borner.',
  },
  {
    cible: '#chips-sorts',
    titre: 'Vos sorts',
    texte: 'Sans sort, l\'outil ne compte aucun degat et se contente de monter '
      + 'vos caracteristiques. Choisissez ceux de votre tour habituel.',
  },
  {
    cible: '#regler-combo',
    titre: 'Leur enchainement',
    texte: 'Comment ces sorts partent : un lancer chacun, ou le meilleur tour '
      + 'possible sous votre budget de PA.',
  },
  {
    cible: '#regler-minimums',
    titre: 'Vos minimums',
    texte: 'Douze PA, six PM, une vitalite. La recherche tient ces planchers '
      + 'avant de chercher a marquer des points.',
  },
  {
    cible: '#ouvrir-palette',
    titre: 'Ce que vous possedez',
    texte: 'Vos pieces en banque et celles que vous refusez. Une piece que vous '
      + 'avez deja ne compte pas comme un achat.',
  },
  {
    cible: '#lancer',
    titre: 'Chercher',
    texte: 'La recherche tourne tant que vous la laissez tourner. « Pause » la '
      + 'suspend sans rien perdre, « Annuler » jette ce qu\'elle a trouve.',
  },
  {
    cible: '#plateau',
    titre: 'Le stuff porte',
    texte: 'Ce que la recherche vous met sur le dos. Cliquez une case pour la '
      + 'figer : la recherche gardera cette piece et cherchera autour.',
  },
  {
    cible: '#trouves',
    titre: 'Les autres stuffs',
    texte: 'La recherche en garde plusieurs, pas seulement le meilleur. Cochez-en '
      + 'deux pour les comparer piece par piece.',
  },
  {
    cible: '#partager',
    titre: 'Partager',
    texte: 'Un lien qui porte tout votre reglage, ou l\'envoi du stuff vers '
      + 'Dofusbook. Le lien se relance tel quel chez celui qui le recoit.',
  },
  {
    cible: '#reglages',
    titre: 'Les reglages',
    texte: 'Comment vous jouez : distance ou melee, passifs, resistances. Ils '
      + 'changent ce que les chiffres veulent dire, pas l\'ecran.',
  },
]);

/**
 * Les etapes qui ont encore une cible a montrer.
 *
 * Une commande peut manquer : l'ecran d'accueil n'a pas de plateau, un
 * telephone replie les volets. Une visite qui s'arrete sur une bulle sans
 * cible est pire que pas de visite.
 *
 * @param {(cible: string) => boolean} present Vrai quand la cible existe.
 * @param {readonly {cible: string}[]} [etapes]
 * @returns {{cible: string}[]}
 */
export function etapesVisibles(present, etapes = ETAPES) {
  return etapes.filter((etape) => present(etape.cible));
}

/**
 * Numero d'etape apres un deplacement, borne aux deux bouts.
 *
 * @param {number} index Etape courante.
 * @param {number} pas Deplacement demande, souvent -1 ou +1.
 * @param {number} total Nombre d'etapes.
 * @returns {number}
 */
export function avancer(index, pas, total) {
  if (total <= 0) return 0;
  const vise = (Number(index) || 0) + (Number(pas) || 0);
  return Math.min(total - 1, Math.max(0, vise));
}

/**
 * Vrai quand la visite n'a jamais ete faite sur ce navigateur.
 *
 * Elle ne s'ouvre d'office qu'une fois. Un outil qui redemande a chaque
 * visite « voulez-vous la visite ? » se fait fermer sans etre lu.
 */
export const visiteAfaire = () => lireTexte(CLE_VISITE) === null;

/** Note que la visite a ete vue, quelle qu'en soit la fin. */
export const visiteFaite = () => ecrire(CLE_VISITE, '1');
