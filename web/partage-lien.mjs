/**
 * Partage d'un reglage entier par un lien.
 *
 * Le lien porte tout ce qui commande une recherche : le personnage, le stuff
 * porte, les sorts, les minimums, les options, les pieces interdites et
 * possedees. Celui qui l'ouvre peut donc relancer LA MEME question, pas
 * seulement regarder le resultat.
 *
 * Quatre choix meritent d'etre dits.
 *
 * Le reglage voyage dans le FRAGMENT, apres le diese, pas dans la requete.
 * Un fragment ne part jamais vers un serveur : il ne se retrouve ni dans un
 * journal d'acces, ni dans l'en-tete que le navigateur envoie en suivant un
 * lien sortant. Le stuff d'un joueur n'a rien a faire dans les journaux de
 * qui que ce soit.
 *
 * Le lien ne porte AUCUN resultat de recherche : ni les stuffs trouves, ni
 * les paliers, ni la courbe. Ils pesent plusieurs dizaines de milliers de
 * caracteres et se refabriquent en relancant. Le lien transmet une question,
 * pas des reponses.
 *
 * Le reglage est COMPRIME avant d'etre code. Un reglage complet fait pres de
 * trois mille caracteres en JSON : un lien pareil se casse en deux dans une
 * conversation. Comprime, il en fait huit cents. La compression est celle du
 * navigateur (`CompressionStream`), donc sans dependance ; le codage porte un
 * chiffre en tete pour dire ce qui suit, car une machine sans compression
 * doit pouvoir fabriquer un lien quand meme.
 *
 * Ouvrir un lien N'ECRASE RIEN tout seul. Le reglage recu attend qu'on
 * l'adopte : quelqu'un qui travaille depuis une heure ne doit pas perdre sa
 * seance parce qu'il a clique sur le lien d'un ami.
 */

import { enBase64, versOctets } from '../src/partage/base64.mjs';
import { appliquerRange, serialiserEtat } from './etat-stockage.mjs';
import { etatInitial } from './reglages.mjs';

/** Nom du champ, dans le fragment. */
export const CHAMP = 'b';

/**
 * Version de la forme partagee.
 *
 * Elle ne sert pas a migrer : `appliquerRange` ignore deja un champ qui n'a
 * pas la forme attendue, donc un lien ancien s'ouvre en perdant au pire un
 * reglage. Elle sert a REFUSER un lien venu d'une version future, ou un texte
 * qui n'est pas un lien du tout.
 */
export const VERSION = 2;

/** Premier caractere du code : ce qui suit est comprime, ou non. */
const NU = '0';
const COMPRIME = '1';

/**
 * Ce que le lien ne porte pas : les resultats de la derniere recherche.
 *
 * Ils sont dans la forme rangee parce qu'un rechargement doit les rendre.
 */
const RESULTATS = Object.freeze(['candidats', 'paliers', 'survie']);

/**
 * Les seize cases du personnage, dans un ordre fige.
 *
 * Le nom d'une case ne voyage plus : sa POSITION le dit. « cape:0 » pesait
 * neuf caracteres repetes a chaque piece, pour une information que les deux
 * bouts connaissent deja.
 *
 * L'ordre est ecrit ici plutot que deduit de SLOTS, et c'est voulu : deduit,
 * il changerait le jour ou quelqu'un reordonne les emplacements, et tous les
 * liens deja partages se reliraient de travers sans que rien ne le dise. Un
 * test tient cette liste face a SLOTS : elle doit les couvrir toutes.
 */
const CASES = Object.freeze([
  'amulette:0', 'arme:0', 'anneau:0', 'anneau:1', 'ceinture:0', 'bottes:0',
  'bouclier:0', 'chapeau:0', 'cape:0', 'monture:0',
  'artefact:0', 'artefact:1', 'artefact:2', 'artefact:3', 'artefact:4', 'artefact:5',
]);

/**
 * Champs plats dont seules les differences voyagent.
 *
 * Ce sont des tables a plat : une vingtaine d'options, six parchemins, six
 * limites, six investissements. Un joueur en change deux ou trois ; les
 * autres n'ont aucune raison d'etre dans le lien. `appliquerRange` les fond
 * deja dans l'etat de depart, donc une table partielle se relit telle quelle.
 */
const PLATS = Object.freeze(['options', 'scrolls', 'limites', 'allocation']);

/**
 * Un minimum, a plat.
 *
 * Cinq champs nommes pesaient soixante-cinq caracteres par minimum, et un
 * joueur en pose cinq ou six. Leur ORDRE les dit aussi bien. Un test tient
 * cette liste face a ce qu'un minimum porte vraiment : y ajouter un champ
 * sans l'ajouter ici le ferait disparaitre du lien en silence.
 */
const CHAMPS_MINIMUM = Object.freeze(['stat', 'target', 'weight', 'max', 'absolute']);

/** Forme rangee d'un etat neuf, calculee une fois. */
let defautRange = null;
const defaut = () => (defautRange ??= serialiserEtat(etatInitial()));

const memeValeur = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Vrai quand le navigateur sait comprimer. */
const saitComprimer = () => typeof CompressionStream === 'function'
  && typeof DecompressionStream === 'function';

/** Passe des octets dans un flux de compression, dans un sens ou dans l'autre. */
async function transformer(octets, flux) {
  const source = new Blob([octets]).stream().pipeThrough(flux);
  return new Uint8Array(await new Response(source).arrayBuffer());
}

/**
 * Forme partagee d'un etat.
 *
 * @param {any} etat
 * @returns {any}
 */
export function formePartagee(etat) {
  const range = serialiserEtat(etat);
  const neuf = defaut();
  const forme = { v: VERSION };

  for (const [cle, valeur] of Object.entries(range)) {
    if (RESULTATS.includes(cle)) continue;

    // Une table a plat ne transmet que ses cases changees.
    if (PLATS.includes(cle)) {
      const change = Object.fromEntries(Object.entries(valeur ?? {})
        .filter(([sous, v]) => !memeValeur(v, neuf[cle]?.[sous])));
      if (Object.keys(change).length > 0) forme[cle] = change;
      continue;
    }

    // Tout ce qui vaut encore le reglage de depart n'a rien a dire : celui
    // qui ouvre le lien part du meme etat neuf.
    if (!memeValeur(valeur, neuf[cle])) forme[cle] = valeur;
  }

  /*
   * Un sort ne voyage que par son identifiant.
   *
   * Range, un sort porte sa definition entiere : nom, cout, lignes de degats,
   * groupe exclusif, et l'adresse de son icone. Huit sorts pesaient les deux
   * tiers du lien, et l'adresse de l'icone porte le NOM DE MACHINE de celui
   * qui partage — un lien fabrique sur un poste renvoyait les autres vers un
   * fichier qui n'existe que la.
   *
   * Rien ne se perd : un sort ne se modifie pas a la main dans l'outil, il
   * s'ajoute et s'enleve. Le catalogue le refabrique a l'arrivee, et il le
   * refabrique AU NIVEAU DU LIEN, donc a la bonne variante.
   */
  if ((etat.sorts ?? []).length > 0) forme.sorts = etat.sorts.map((sort) => sort.id);

  // Un minimum se lit a l'ordre de ses champs, pas a leur nom. Le tri au
  // dessus a deja decide si les minimums voyagent : ceux de depart, non.
  if (Array.isArray(forme.conditions)) {
    forme.conditions = forme.conditions.map((condition) => [
      condition.stat, condition.target, condition.weight, condition.max ?? null,
      condition.absolute ? 1 : 0,
    ]);
  }

  // Les pieces portees par POSITION, et les cases posees a la main en un seul
  // nombre : un bit par case, dans le meme ordre.
  const portees = new Map(range.equipped ?? []);
  if (portees.size > 0) forme.equipped = CASES.map((cle) => portees.get(cle) ?? 0);

  const posees = new Set(range.posees ?? []);
  const marque = CASES.reduce((n, cle, i) => (posees.has(cle) ? n | (1 << i) : n), 0);
  if (marque !== 0) forme.posees = marque;
  else delete forme.posees;

  // Les limites se relisent avec leur marque de version : sans elle, une
  // limite a zero — « n'investis rien ici » — se relirait comme « aucune
  // limite », qui est son contraire.
  if (forme.limites) forme.limitesVersion = range.limitesVersion;

  return forme;
}

/**
 * Rend a une forme partagee la tete d'une forme rangee.
 *
 * C'est l'exacte reciproque de ce que `formePartagee` compacte. Elle vit ici
 * et non dans `appliquerRange` pour que le rangement du navigateur n'ait rien
 * a savoir du format des liens.
 *
 * @param {any} forme
 * @returns {any}
 */
export function formeRangee(forme) {
  const range = { ...forme };

  if (Array.isArray(forme.equipped)) {
    range.equipped = forme.equipped
      .map((id, i) => [CASES[i], id])
      .filter(([cle, id]) => cle && Number.isFinite(id) && id > 0);
  }

  if (Number.isFinite(forme.posees)) {
    range.posees = CASES.filter((cle, i) => (forme.posees & (1 << i)) !== 0);
  } else {
    range.posees = [];
  }

  if (Array.isArray(forme.sorts)) {
    range.sorts = forme.sorts
      .filter((id) => Number.isFinite(id))
      .map((id) => ({ id }));
  }

  if (Array.isArray(forme.conditions)) {
    range.conditions = forme.conditions
      .filter(Array.isArray)
      .map(([stat, target, weight, max, absolute]) => (
        { stat, target, weight, max: max ?? null, absolute: absolute === 1 }));
  }

  return range;
}

/**
 * Code d'un reglage, tel qu'il tient dans un fragment.
 *
 * @param {any} etat
 * @returns {Promise<string>}
 */
export async function coder(etat) {
  const octets = new TextEncoder().encode(JSON.stringify(formePartagee(etat)));
  if (!saitComprimer()) return NU + enBase64(octets, { adresse: true });

  const serres = await transformer(octets, new CompressionStream('deflate-raw'));
  return COMPRIME + enBase64(serres, { adresse: true });
}

/**
 * Relit un code de reglage.
 *
 * @param {string} code
 * @returns {Promise<any|null>} Null des que le code n'est pas un reglage
 *   lisible de cette version : un lien tronque par une messagerie, un
 *   fragment qui parle d'autre chose, ou un lien d'une version a venir.
 */
export async function decoder(code) {
  const texte = String(code ?? '');
  if (texte.length < 2) return null;

  try {
    const marque = texte[0];
    if (marque !== NU && marque !== COMPRIME) return null;

    let octets = versOctets(texte.slice(1));
    if (marque === COMPRIME) {
      if (!saitComprimer()) return null;
      octets = await transformer(octets, new DecompressionStream('deflate-raw'));
    }

    const forme = JSON.parse(new TextDecoder().decode(octets));
    if (!forme || typeof forme !== 'object' || forme.v !== VERSION) return null;
    return forme;
  } catch {
    // Un lien abime se lit comme une absence de lien. L'ecran n'a rien a
    // annoncer : personne n'a rien demande.
    return null;
  }
}

/**
 * Adresse complete d'un partage.
 *
 * @param {any} etat
 * @param {string} adresse Adresse de la page, d'ordinaire `location.href`.
 * @returns {Promise<string>}
 */
export async function lienPartage(etat, adresse) {
  const url = new URL(adresse);
  url.hash = `${CHAMP}=${await coder(etat)}`;
  return url.toString();
}

/**
 * Reglage porte par un fragment, s'il y en a un.
 *
 * @param {string} fragment Le fragment, diese compris ou non.
 * @returns {Promise<any|null>}
 */
export async function reglageDuFragment(fragment) {
  const brut = String(fragment ?? '').replace(/^#/, '');
  if (!brut) return null;
  return decoder(new URLSearchParams(brut).get(CHAMP));
}

/**
 * Pose un reglage recu.
 *
 * Elle part d'un etat NEUF, jamais de l'ecran courant. Le lien ne porte que
 * ce qui s'ecarte du reglage de depart : construire dessus l'ecran de celui
 * qui recoit lui laisserait ses propres options la ou le lien dit « celles
 * d'origine », et deux personnes ouvrant le meme lien ne verraient pas la
 * meme chose.
 *
 * @param {any} forme Forme lue dans le lien.
 * @param {{itemById: Map<number, any>}} catalogue
 * @returns {any} Nouvel etat.
 */
export function adopter(forme, catalogue) {
  // Les resultats a l'ecran repondent a la question d'avant : le reglage qui
  // arrive n'est pas le leur.
  const vide = Object.fromEntries(RESULTATS.map((cle) => [cle, []]));
  return { ...appliquerRange(etatInitial(), formeRangee(forme), catalogue), ...vide };
}

/**
 * Ce qu'un lien porte, avant de l'adopter.
 *
 * Elle sert a annoncer ce qu'on s'apprete a prendre : un lien qui change le
 * personnage et pose seize pieces ne doit pas s'ouvrir en silence.
 *
 * @param {any} forme
 * @param {{itemById: Map<number, any>}} catalogue
 * @returns {{pieces: number, inconnues: number, sorts: number,
 *   minimums: number, niveau: number|null, classe: number|null}}
 */
export function resume(forme, catalogue) {
  const portees = (Array.isArray(forme?.equipped) ? forme.equipped : [])
    .filter((id) => Number.isFinite(id) && id > 0);
  return {
    pieces: portees.length,
    inconnues: portees.filter((id) => !catalogue?.itemById?.has(id)).length,
    sorts: Array.isArray(forme?.sorts) ? forme.sorts.length : 0,
    minimums: Array.isArray(forme?.conditions) ? forme.conditions.length : 0,
    niveau: Number.isFinite(forme?.niveau) ? forme.niveau : null,
    classe: Number.isFinite(forme?.classe) ? forme.classe : null,
  };
}
