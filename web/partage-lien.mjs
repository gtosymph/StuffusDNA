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
export const VERSION = 1;

/** Premier caractere du code : ce qui suit est comprime, ou non. */
const NU = '0';
const COMPRIME = '1';

/**
 * Ce que le lien ne porte pas : les resultats de la derniere recherche.
 *
 * Ils sont dans la forme rangee parce qu'un rechargement doit les rendre.
 */
const RESULTATS = Object.freeze(['candidats', 'paliers', 'survie']);

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
  const forme = serialiserEtat(etat);
  for (const cle of RESULTATS) delete forme[cle];

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
  forme.sorts = (etat.sorts ?? []).map((sort) => ({ id: sort.id }));

  return { v: VERSION, ...forme };
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
 * Pose un reglage recu sur l'etat courant.
 *
 * @param {any} etat Etat de depart : celui de l'ecran, pas l'etat initial.
 * @param {any} forme Forme lue dans le lien.
 * @param {{itemById: Map<number, any>}} catalogue
 * @returns {any} Nouvel etat.
 */
export function adopter(etat, forme, catalogue) {
  // Les resultats a l'ecran repondent a la question d'avant : le reglage qui
  // arrive n'est pas le leur.
  const vide = Object.fromEntries(RESULTATS.map((cle) => [cle, []]));
  return { ...appliquerRange(etat, forme, catalogue), ...vide };
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
  const portees = Array.isArray(forme?.equipped) ? forme.equipped : [];
  return {
    pieces: portees.length,
    inconnues: portees.filter(([, id]) => !catalogue?.itemById?.has(id)).length,
    sorts: Array.isArray(forme?.sorts) ? forme.sorts.length : 0,
    minimums: Array.isArray(forme?.conditions) ? forme.conditions.length : 0,
    niveau: Number.isFinite(forme?.niveau) ? forme.niveau : null,
    classe: Number.isFinite(forme?.classe) ? forme.classe : null,
  };
}
