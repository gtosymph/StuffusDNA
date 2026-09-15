/**
 * Acces unique au rangement du navigateur.
 *
 * Le reglage d'un joueur ne vit nulle part ailleurs : pas de compte, pas de
 * serveur. Chaque visiteur garde donc son propre materiel, dans son propre
 * navigateur. Cela tient tant que trois choses sont vraies, et ce module
 * existe pour les tenir :
 *
 *   1. toutes les cles se lisent au meme endroit, sinon un export en oublie ;
 *   2. une ecriture refusee se dit, au lieu de disparaitre dans un catch vide.
 *      Le rangement d'un navigateur est borne : passe la limite, il refuse
 *      tout, et le joueur croit son travail garde alors qu'il est perdu ;
 *   3. l'occupation se mesure, pour prevenir AVANT le refus.
 *
 * Les noms de cle ne changent jamais : ils portent les sauvegardes deja
 * posees chez les visiteurs.
 */

/**
 * Suffixe du bac d'essai, tire de l'adresse.
 *
 * Le rangement suit l'origine, pas l'onglet : deux onglets ouverts sur la
 * meme adresse ecrivent dans les memes cles. Un essai lance dans l'un
 * remplace alors le build porte dans l'autre, sans que rien ne le signale.
 * « ?test » ouvre un jeu de cles a part ; « ?test=mobile » en ouvre un autre
 * encore, pour mener deux essais en parallele.
 *
 * @param {string} recherche Partie « ?… » de l'adresse.
 * @returns {string} Suffixe a coller aux cles, vide hors essai.
 */
export function suffixeDeBac(recherche) {
  if (typeof recherche !== 'string') return '';

  let nom;
  try {
    const params = new URLSearchParams(recherche);
    if (!params.has('test')) return '';
    nom = params.get('test') ?? '';
  } catch {
    return '';
  }

  // Le nom entre dans une cle de rangement : tout ce qui n'est pas une
  // lettre ou un chiffre part, plutot que de fabriquer une cle etrange.
  const propre = nom.toLowerCase().replace(/[^a-z0-9]/g, '');
  return propre && propre !== '1' ? `_test_${propre}` : '_test';
}

/**
 * Nom effectif d'une cle, bac d'essai compris.
 *
 * @param {string} base Nom historique de la cle.
 * @param {string} [recherche] Partie « ?… » de l'adresse.
 */
export function nomDeCle(base, recherche = adresse()) {
  return `${base}${suffixeDeBac(recherche)}`;
}

/** Partie « ?… » de l'adresse, vide hors navigateur. */
function adresse() {
  try {
    return globalThis.location?.search ?? '';
  } catch {
    return '';
  }
}

/**
 * Cles du rangement, par role.
 *
 * Les noms de base ne changent jamais : ils portent les sauvegardes deja
 * posees chez les visiteurs. Seul un bac d'essai leur ajoute un suffixe.
 */
export const CLES = Object.freeze({
  etat: nomDeCle('copyroxx_etat'),
  resultat: nomDeCle('copyroxx_resultat'),
  simulations: nomDeCle('copyroxx_simulations'),
  setsSorts: nomDeCle('copyroxx_sets_sorts'),
  setsConditions: nomDeCle('copyroxx_sets_conditions'),
  theme: nomDeCle('copyroxx_theme'),
  disposition: nomDeCle('copyroxx_disposition'),
  catalogue: nomDeCle('copyroxx_catalogue'),
  plie: nomDeCle('copyroxx_plie'),
});

/** Vrai quand la page tourne dans un bac d'essai. */
export const EN_BAC_DESSAI = suffixeDeBac(adresse()) !== '';

/** Toutes les cles du profil, dans l'ordre ou un import les repose. */
export const CLES_PROFIL = Object.freeze(Object.values(CLES));

/**
 * Taille que les navigateurs accordent a une origine, en caracteres.
 * Aucun d'eux ne l'annonce : cinq mega-octets est la valeur commune depuis
 * les premieres versions de la norme.
 */
export const LIMITE_ESTIMEE = 5 * 1024 * 1024;

/** Part d'occupation a partir de laquelle il faut prevenir. */
export const SEUIL_ALERTE = 0.8;

/** Abonnes prevenus d'un echec d'ecriture. */
const temoins = new Set();

/** Cles deja signalees : un meme echec ne se repete pas a chaque frappe. */
const signalees = new Set();

/**
 * S'abonne aux echecs d'ecriture.
 * @param {(echec: {cle: string, raison: string, sature: boolean}) => void} rappel
 * @returns {() => void} Fonction de desabonnement.
 */
export function surEchec(rappel) {
  temoins.add(rappel);
  return () => temoins.delete(rappel);
}

/** Rend le rangement, ou null quand le navigateur le refuse. */
function rangement() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Navigation privee stricte, ou site sans acces au stockage.
    return null;
  }
}

/** Vrai quand le rangement repond. */
export function disponible() {
  const magasin = rangement();
  if (!magasin) return false;
  try {
    const temoin = '__copyroxx_essai__';
    magasin.setItem(temoin, '1');
    magasin.removeItem(temoin);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lit une valeur texte.
 * @param {string} cle
 * @param {string|null} [defaut]
 * @returns {string|null}
 */
export function lireTexte(cle, defaut = null) {
  try {
    return rangement()?.getItem(cle) ?? defaut;
  } catch {
    return defaut;
  }
}

/**
 * Lit une valeur JSON. Un contenu illisible rend la valeur par defaut : un
 * rangement abime ne doit jamais bloquer l'interface.
 * @param {string} cle
 * @param {any} defaut
 */
export function lireJson(cle, defaut) {
  const brut = lireTexte(cle);
  if (brut === null) return defaut;
  try {
    const valeur = JSON.parse(brut);
    return valeur === null || valeur === undefined ? defaut : valeur;
  } catch {
    return defaut;
  }
}

/** Previent les temoins d'un echec, une seule fois par cle. */
function signaler(cle, erreur) {
  const sature = erreur?.name === 'QuotaExceededError'
    || erreur?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || erreur?.code === 22;
  if (signalees.has(cle)) return false;
  signalees.add(cle);

  const echec = { cle, raison: erreur?.message ?? 'rangement indisponible', sature };
  for (const temoin of temoins) {
    try { temoin(echec); } catch { /* un temoin en echec n'en empeche pas d'autres */ }
  }
  return false;
}

/**
 * Ecrit une valeur texte.
 * @param {string} cle
 * @param {string} texte
 * @returns {boolean} Vrai quand l'ecriture a bien eu lieu.
 */
export function ecrire(cle, texte) {
  const magasin = rangement();
  if (!magasin) return signaler(cle, new Error('rangement indisponible'));

  try {
    magasin.setItem(cle, String(texte));
    signalees.delete(cle);
    return true;
  } catch (erreur) {
    return signaler(cle, erreur);
  }
}

/**
 * Ecrit une valeur JSON.
 * @returns {boolean} Vrai quand l'ecriture a bien eu lieu.
 */
export function ecrireJson(cle, valeur) {
  try {
    return ecrire(cle, JSON.stringify(valeur));
  } catch (erreur) {
    // Une valeur impossible a serialiser (cycle) n'est pas un probleme de place.
    return signaler(cle, erreur);
  }
}

/** Enleve une cle. */
export function enlever(cle) {
  try {
    rangement()?.removeItem(cle);
    return true;
  } catch (erreur) {
    return signaler(cle, erreur);
  }
}

/**
 * Mesure la place prise par le profil.
 *
 * @returns {{octets: number, parCle: {cle: string, octets: number}[],
 *            limite: number, part: number, sature: boolean}}
 */
export function occupation() {
  const parCle = [];
  for (const cle of CLES_PROFIL) {
    const valeur = lireTexte(cle);
    if (valeur === null) continue;
    // Une cle pese son nom plus sa valeur : les deux occupent le rangement.
    parCle.push({ cle, octets: valeur.length + cle.length });
  }

  const octets = parCle.reduce((n, e) => n + e.octets, 0);
  return {
    octets,
    parCle: parCle.sort((a, b) => b.octets - a.octets),
    limite: LIMITE_ESTIMEE,
    part: octets / LIMITE_ESTIMEE,
    sature: octets / LIMITE_ESTIMEE >= SEUIL_ALERTE,
  };
}
