/**
 * Envoi d'un build vers le Dofus-Stuffer de Dofusbook.
 *
 * Dofusbook n'a pas d'interface de programmation publique, et un stuff
 * enregistre chez eux vit sur leur serveur, sous un numero qu'ils attribuent.
 * Leur page d'essai, elle, lit le stuff entier dans l'adresse : un parametre
 * `stuff` qui porte du MessagePack passe en base64. C'est ce chemin-la que
 * nous empruntons, et il ne demande aucun compte.
 *
 * Le format n'est pas documente. Il a ete releve sur leur page, en septembre
 * 2026, en portant des builds connus et en lisant ce que la page en montrait.
 * Les six cles sont toutes exigees : la page rend « stuff introuvable » des
 * qu'il en manque une.
 *
 *   « 0 » : les statistiques innees du personnage, hors equipement et hors
 *           points. La cle est la caracteristique (voir CARACTERISTIQUES),
 *           la valeur son total. C'est la que les parchemins s'ajoutent.
 *   « 1 » : les points investis, dans l'ordre de SCROLLABLE. Six entrees.
 *   « 2 » : le niveau.
 *   « 3 » : zero. Role inconnu ; la page refuse le lien sans cette cle.
 *   « 4 » : les capacites des emplacements multiples — deux anneaux, six
 *           Dofus. Sans elle, la page ignore le deuxieme anneau et les six
 *           artefacts. Les valeurs ne varient pas d'un personnage a l'autre.
 *   « 5 » : seize identifiants d'objets, dans l'ordre de CASES. Zero pour une
 *           case vide. Les identifiants sont ceux d'Ankama, donc les notres.
 *
 * Ce que le lien ne porte pas : la classe, le sexe, les sorts, la monture
 * proprement dite (Dofusbook la range a part, pas dans les seize cases) et la
 * forgemagie. La page d'essai ne montre d'ailleurs aucune classe.
 */

import { BASE, NIVEAU_PA_BONUS } from '../engine/build.mjs';
import { SCROLLABLE, SCROLL_BONUS } from '../engine/characteristics.mjs';
import { enBase64 } from './base64.mjs';
import { ecrire } from './msgpack.mjs';

/** Page d'essai de Dofusbook, celle qui lit un stuff dans son adresse. */
export const PAGE_DOFUSBOOK = 'https://www.dofusbook.net/desktop/fr/equipement/dofus-stuffer/objets';

/**
 * Cles de la table « 0 », par caracteristique.
 *
 * Les six premieres suivent l'ordre de SCROLLABLE, ce qui n'est pas un
 * hasard : c'est l'ordre de la fiche de personnage du jeu.
 */
export const CARACTERISTIQUES = Object.freeze({
  vitalite: '0', sagesse: '1', force: '2', intelligence: '3', chance: '4', agilite: '5',
  pa: '6', pm: '7', prospection: '9', invocations: '11', pods: '23',
});

/**
 * Les seize cases de Dofusbook, dans leur ordre, nommees comme les notres.
 *
 * Une case qui n'existe pas chez nous n'a pas d'equivalent ici : nous portons
 * monture et familier dans une seule case, Dofusbook en garde une seizieme
 * pour le familier et range la monture ailleurs. La piece y est posee quand
 * meme ; un familier y est repris, une monture y est ignoree par leur page.
 */
export const CASES = Object.freeze([
  'cape:0', 'chapeau:0', 'ceinture:0', 'bottes:0', 'amulette:0',
  'anneau:0', 'anneau:1',
  'artefact:0', 'artefact:1', 'artefact:2', 'artefact:3', 'artefact:4', 'artefact:5',
  'bouclier:0', 'arme:0', 'monture:0',
]);

/** Capacites des emplacements multiples, telles que la page les attend. */
const CAPACITES = Object.freeze({ 5: 2, 6: 6 });

/**
 * Statistiques innees d'un personnage a ce niveau, parchemins compris.
 *
 * Elles doublent ce que `src/engine/build.mjs` pose en debut de calcul. Le
 * doublon est voulu : cette fonction traduit vers un format etranger, et
 * suivre servilement une refonte interne du moteur casserait le lien sans que
 * rien ne le dise. Les tests tiennent les deux cotes ensemble.
 *
 * @param {number} niveau
 * @param {Record<string, boolean>} parchemins
 * @returns {Record<string, number>}
 */
export function statistiquesInnees(niveau, parchemins = {}) {
  const table = {
    [CARACTERISTIQUES.vitalite]: BASE.vieFixe + BASE.vieParNiveau * niveau,
    [CARACTERISTIQUES.pa]: BASE.pa + (niveau >= NIVEAU_PA_BONUS ? 1 : 0),
    [CARACTERISTIQUES.pm]: BASE.pm,
    [CARACTERISTIQUES.prospection]: BASE.prospection,
    [CARACTERISTIQUES.invocations]: BASE.invocations,
    [CARACTERISTIQUES.pods]: BASE.pods,
  };

  for (const caracteristique of SCROLLABLE) {
    if (!parchemins[caracteristique]) continue;
    const cle = CARACTERISTIQUES[caracteristique];
    table[cle] = (table[cle] ?? 0) + SCROLL_BONUS;
  }
  return table;
}

/**
 * Les seize identifiants, dans l'ordre des cases de Dofusbook.
 *
 * @param {Map<string, {id: number}>} portees Pieces portees, par case.
 * @returns {number[]}
 */
export function casesDofusbook(portees) {
  return CASES.map((cle) => portees?.get(cle)?.id ?? 0);
}

/**
 * Charge d'un lien Dofusbook.
 *
 * @param {{niveau: number, allocation: Record<string, number>,
 *   scrolls: Record<string, boolean>, equipped: Map<string, {id: number}>}} etat
 * @returns {Record<string, any>} Objet pret a passer en MessagePack.
 */
export function chargeDofusbook(etat) {
  const niveau = Number(etat?.niveau);
  if (!Number.isInteger(niveau) || niveau < 1) {
    throw new TypeError(`Niveau hors du jeu : ${etat?.niveau}`);
  }

  const allocation = etat.allocation ?? {};
  return {
    0: statistiquesInnees(niveau, etat.scrolls ?? {}),
    1: SCROLLABLE.map((cle) => Math.max(0, Math.trunc(Number(allocation[cle]) || 0))),
    2: niveau,
    3: 0,
    4: { ...CAPACITES },
    5: casesDofusbook(etat.equipped),
  };
}

/**
 * Adresse du build chez Dofusbook.
 *
 * @param {Parameters<typeof chargeDofusbook>[0]} etat
 * @returns {string}
 */
export function lienDofusbook(etat) {
  const code = enBase64(ecrire(chargeDofusbook(etat)));
  return `${PAGE_DOFUSBOOK}?stuff=${encodeURIComponent(code)}`;
}
