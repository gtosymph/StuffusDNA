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
import { LARGEUR_TELEPHONE } from './volets.mjs';

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
    cible: '#limites',
    titre: 'Vos minimums',
    texte: 'Douze PA, six PM, une vitalite. La recherche tient ces planchers '
      + 'avant de chercher a marquer des points. Un point vert dit que le '
      + 'minimum est tenu, un point rose qu\'il manque.',
  },
  {
    cible: '#regler-minimums',
    titre: 'En ajouter un',
    texte: 'Vous pouvez aussi cliquer n\'importe quel chiffre de la fiche, a '
      + 'droite, pour en exiger au moins autant.',
  },
  {
    cible: '#avoir',
    titre: 'Ce que vous avez deja',
    texte: 'Votre stuff actuel, votre banque, et les pieces que vous refusez. '
      + 'Une piece que vous possedez ne compte pas comme un achat.',
  },
  {
    cible: '#ouvrir-palette',
    titre: 'Le catalogue',
    texte: 'Toutes les pieces du jeu, cherchables. Ctrl+K l\'ouvre de '
      + 'n\'importe ou. Une piece posee a la main reste : la recherche cherche '
      + 'autour d\'elle.',
  },
  {
    cible: '#lancer',
    titre: 'Chercher',
    texte: 'La recherche tourne tant que vous la laissez tourner. « Pause » la '
      + 'suspend sans rien perdre, « Annuler » jette ce qu\'elle a trouve.',
  },
  {
    cible: '#score',
    titre: 'Le score',
    texte: 'La mesure que la recherche fait monter, celle de l\'objectif '
      + 'choisi. Il ne se compare qu\'a lui-meme, d\'un essai a l\'autre.',
  },
  {
    cible: '#plateau',
    titre: 'Le stuff porte',
    texte: 'Ce que la recherche vous met sur le dos. Cliquez une case pour la '
      + 'figer : la recherche gardera cette piece et cherchera autour.',
  },
  {
    cible: '#v-degats',
    titre: 'Les degats',
    texte: 'Ce que vos sorts envoient sur un tour. Les deux cases dessous '
      + 'disent ce que ce chiffre veut dire : a distance ou au contact, avec '
      + 'ou sans l\'arme.',
  },
  {
    cible: '#v-pdv',
    titre: 'Les pdv effectifs',
    texte: 'Les degats bruts que vous encaissez avant de tomber : vos pdv, '
      + 'peses par vos resistances. Bien plus parlant que la vitalite seule.',
  },
  {
    cible: '#bloc-graphe',
    titre: 'Ce que la recherche trouve',
    texte: 'Un trait par fil de calcul. Quand les traits s\'aplatissent, la '
      + 'recherche a fini de progresser : c\'est le moment de l\'arreter.',
  },
  {
    cible: '#trouves',
    titre: 'Les autres stuffs',
    texte: 'La recherche en garde plusieurs, pas seulement le meilleur. '
      + 'Cochez-en deux pour les comparer piece par piece.',
  },
  {
    cible: '#paliers',
    titre: 'Proche de votre stuff',
    texte: 'Si je n\'achete qu\'une a trois pieces, que puis-je gagner ? La '
      + 'reponse chiffree, par nombre d\'achats.',
  },
  {
    cible: '#simulations',
    titre: 'Vos essais gardes',
    texte: 'Chaque pause garde une trace. Vous pouvez y revenir, les comparer, '
      + 'ou en figer un comme stuff de reference.',
  },
  {
    cible: '#bloc-analyse',
    titre: 'D\'ou vient le score',
    texte: 'Ce que chaque piece apporte, ou investir vos points pour gagner '
      + 'des degats, et le meilleur remplacement possible case par case.',
  },
  {
    cible: '#corps-inspecteur',
    titre: 'La fiche',
    texte: 'Toutes vos caracteristiques, a jour. Chaque chiffre se clique '
      + 'pour en exiger au moins autant.',
  },
  {
    cible: '#bascule-droit',
    titre: 'Replier un volet',
    texte: 'Les deux volets s\'ouvrent et se replient d\'ici. Sur un ecran '
      + 'etroit, replier rend toute la largeur au personnage.',
  },
  {
    cible: '#partager',
    titre: 'Partager',
    texte: 'Un lien qui porte tout votre reglage, ou l\'envoi du stuff vers '
      + 'Dofusbook. Le lien se relance tel quel chez celui qui le recoit.',
  },
  {
    cible: '#signaler',
    titre: 'Signaler',
    texte: 'Un defaut, une idee. Le rapport emporte votre reglage exact : le '
      + 'probleme se reproduit d\'un clic au lieu de se deviner.',
  },
  {
    cible: '#menus',
    titre: 'Votre profil',
    texte: 'Tout vit dans votre navigateur, sans compte ni serveur. Exportez '
      + 'un fichier pour passer d\'une machine a l\'autre, ou pour ne rien '
      + 'perdre.',
  },
  {
    cible: '#reglages',
    titre: 'Les reglages',
    texte: 'Comment vous jouez : passifs, resistances, bornes de l\'arme, et '
      + 'l\'habillage de la page. Ils changent ce que les chiffres veulent '
      + 'dire, pas l\'ecran.',
  },
  {
    cible: '#kofi',
    titre: 'C\'est tout',
    texte: 'Le site est gratuit, sans publicite et sans compte. Si l\'outil '
      + 'vous sert, un cafe aide a le tenir. Bonne chasse.',
  },
]);

/**
 * La visite du telephone : six etapes, pas vingt-cinq.
 *
 * Vingt-cinq bulles a faire defiler au pouce se font quitter avant la
 * moitie. Sur un petit ecran, la visite n'a qu'un travail : dire que
 * l'application tient en TROIS ecrans, et ou se trouve le geste principal.
 * Le reste se decouvre en s'en servant.
 */
export const ETAPES_TELEPHONE = Object.freeze([
  {
    cible: '#quai-onglets',
    titre: 'Trois ecrans',
    texte: 'Tout tient en trois ecrans, et cette barre dit lequel vous '
      + 'regardez : vos reglages, votre stuff, votre fiche.',
  },
  {
    cible: '#onglet-gauche',
    titre: 'Vos reglages',
    texte: 'Ce que vous cherchez, vos sorts, vos minimums, et les pieces que '
      + 'vous possedez deja.',
  },
  {
    cible: '#plateau',
    titre: 'Votre stuff',
    texte: 'Ce que la recherche vous met sur le dos, et juste dessous vos '
      + 'degats et vos pdv effectifs. Touchez une case pour la figer.',
  },
  {
    cible: '#onglet-droit',
    titre: 'Votre fiche',
    texte: 'Toutes vos caracteristiques. Touchez un chiffre pour en exiger au '
      + 'moins autant.',
  },
  {
    cible: '#lancer',
    titre: 'Chercher',
    texte: 'La recherche tourne tant que vous la laissez tourner. Elle reste '
      + 'sous votre pouce, quel que soit l\'ecran.',
  },
  {
    cible: '#plus',
    titre: 'Le reste',
    texte: 'Partager, signaler un defaut, les reglages de calcul, et de quoi '
      + 'soutenir le projet. Bonne chasse.',
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
 * Quelle visite montrer, selon la largeur.
 *
 * @param {number} largeur
 * @returns {readonly {cible: string}[]}
 */
export const visitePour = (largeur) => (largeur <= LARGEUR_TELEPHONE
  ? ETAPES_TELEPHONE
  : ETAPES);

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
