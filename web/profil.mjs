/**
 * Profil du joueur : tout ce qu'il a construit, en un seul objet.
 *
 * L'application ne demande pas de compte et ne parle a aucun serveur. Le
 * profil vit donc dans le navigateur, et il y reste tant que le joueur garde
 * la meme machine, le meme navigateur et ses donnees de site. Trois choses le
 * font disparaitre : un nettoyage des donnees de navigation, la navigation
 * privee, et le passage a une autre machine.
 *
 * D'ou le fichier. Exporter ecrit tout le profil dans un fichier que le joueur
 * garde ou emporte ; importer le repose ailleurs. C'est la seule sauvegarde
 * qui survive au navigateur, et elle n'a besoin de personne.
 */
import { CLES, CLES_PROFIL, cleDici, lireTexte, ecrire, enlever, occupation } from './stockage.mjs';

/** Marque du format, pour refuser un fichier qui vient d'ailleurs. */
export const FORMAT = 'the-best-roxxeur/profil';

/** Version du format. Une lecture accepte cette version et les precedentes. */
export const VERSION = 1;

/** Nom lisible de chaque partie du profil, pour le compte rendu d'un import. */
const NOMS = Object.freeze({
  [CLES.etat]: 'build et reglages',
  [CLES.resultat]: 'derniere recherche',
  [CLES.simulations]: 'simulations gardees',
  [CLES.setsSorts]: 'jeux de sorts',
  [CLES.setsConditions]: 'jeux de conditions',
  [CLES.setsBannis]: 'jeux de pieces interdites',
  [CLES.setsBanque]: 'jeux de pieces en banque',
  [CLES.setsStuff]: 'stuffs enregistres',
  [CLES.theme]: 'theme',
  [CLES.themeV2]: 'habillage',
  [CLES.disposition]: 'disposition',
  [CLES.catalogue]: 'tiroir du catalogue',
  [CLES.plie]: 'sections repliees',
  [CLES.visite]: 'visite guidee',
});

/**
 * Rassemble le profil courant.
 * @returns {{format: string, version: number, date: string, donnees: Record<string, string>}}
 */
export function lireProfil() {
  const donnees = {};
  for (const cle of CLES_PROFIL) {
    const valeur = lireTexte(cle);
    if (valeur !== null) donnees[cle] = valeur;
  }

  return { format: FORMAT, version: VERSION, date: new Date().toISOString(), donnees };
}

/** Nom de fichier propose, date du jour comprise. */
export function nomFichier(date = new Date()) {
  const jour = date.toISOString().slice(0, 10);
  return `the-best-roxxeur-${jour}.json`;
}

/**
 * Verifie un profil lu dans un fichier.
 *
 * Un fichier vient de l'exterieur : rien n'y est acquis. La verification
 * refuse ce qui n'est pas un profil, et ecarte silencieusement les cles
 * inconnues plutot que de les poser dans le rangement.
 *
 * @param {unknown} brut
 * @returns {{donnees: Record<string, string>, inconnues: string[]}}
 * @throws {Error} Quand le contenu n'est pas un profil lisible.
 */
export function verifierProfil(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
    throw new Error('Ce fichier ne contient pas un profil.');
  }
  if (brut.format !== FORMAT) {
    throw new Error('Ce fichier vient d\'une autre application.');
  }
  if (!Number.isFinite(brut.version) || brut.version > VERSION) {
    throw new Error(`Profil en version ${brut.version} : cette page n'en lit que jusqu'a ${VERSION}.`);
  }
  if (!brut.donnees || typeof brut.donnees !== 'object' || Array.isArray(brut.donnees)) {
    throw new Error('Profil sans donnees.');
  }

  const donnees = {};
  const inconnues = [];

  for (const [cle, valeur] of Object.entries(brut.donnees)) {
    // Une cle exportee depuis un bac d'essai porte un suffixe. Elle designe
    // la meme chose : elle se rabat sur la cle de ce navigateur.
    const ici = cleDici(cle);
    if (!ici) { inconnues.push(cle); continue; }
    if (typeof valeur !== 'string') { inconnues.push(cle); continue; }
    donnees[ici] = valeur;
  }

  if (Object.keys(donnees).length === 0) {
    throw new Error('Profil vide : aucune donnee reconnue.');
  }

  return { donnees, inconnues };
}

/**
 * Repose un profil verifie dans le rangement.
 *
 * Les cles absentes du fichier sont enlevees : un import doit rendre le
 * navigateur identique a celui qui a exporte, sans melanger deux profils.
 *
 * @param {Record<string, string>} donnees
 * @returns {{posees: string[], refusees: string[]}}
 */
export function poserProfil(donnees) {
  const posees = [];
  const refusees = [];

  for (const cle of CLES_PROFIL) {
    if (!(cle in donnees)) { enlever(cle); continue; }
    if (ecrire(cle, donnees[cle])) posees.push(NOMS[cle] ?? cle);
    else refusees.push(NOMS[cle] ?? cle);
  }

  return { posees, refusees };
}

/**
 * Lit un fichier de profil et le repose.
 * @param {string} texte Contenu du fichier.
 */
export function importerProfil(texte) {
  let brut;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new Error('Ce fichier n\'est pas lisible : il n\'est pas au format JSON.');
  }

  const { donnees, inconnues } = verifierProfil(brut);
  return { ...poserProfil(donnees), inconnues };
}

/** Efface tout le profil. */
export function effacerProfil() {
  for (const cle of CLES_PROFIL) enlever(cle);
}

/**
 * Resume la place occupee, en clair.
 * @returns {{texte: string, sature: boolean, part: number}}
 */
export function resumeOccupation() {
  const { octets, limite, part, sature } = occupation();
  const enMo = (n) => `${(n / (1024 * 1024)).toFixed(1)} Mo`;

  return {
    texte: `${enMo(octets)} sur environ ${enMo(limite)} (${Math.round(part * 100)} %)`,
    sature,
    part,
  };
}
