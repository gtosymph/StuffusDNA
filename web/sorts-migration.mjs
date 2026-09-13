/**
 * Mise a jour des sorts enregistres avant la refonte des donnees.
 *
 * Un joueur revient avec des sorts ranges par une version passee. Deux
 * champs les trahissent : `exclusiveGroup` et `telefragCible`, absents des
 * anciens formats. Le catalogue corrige fait foi pour les reconstruire ; un
 * sort deja a jour reste intact, modifications du joueur comprises.
 */
import { versSortMoteur } from './spells-data.mjs';

/** Sorts du catalogue par identifiant, toutes classes confondues. */
function indexerSorts(classesSorts) {
  const parId = new Map();
  for (const classe of classesSorts ?? []) {
    for (const s of classe.spells ?? []) parId.set(s.id, s);
  }
  return parId;
}

/** Variante la plus haute accessible au niveau donne. */
function varianteAccessible(sortCatalogue, niveau) {
  const accessibles = (sortCatalogue?.variants ?? []).filter((v) => v.level <= niveau);
  return accessibles[accessibles.length - 1];
}

/** Vrai quand un sort porte tous les champs du format courant. */
const complet = (s) => s.exclusiveGroup !== undefined && s.telefragCible !== undefined;

/**
 * Rend les sorts au format courant.
 *
 * @param {any[]} sorts Sorts de l'etat.
 * @param {any[]} classesSorts Catalogue des sorts par classe.
 * @param {number} niveau Niveau du personnage.
 * @returns {{sorts: any[], changes: boolean}} Les sorts, et s'il a fallu en toucher.
 */
export function enrichirSorts(sorts, classesSorts, niveau) {
  if (sorts.every(complet)) return { sorts, changes: false };

  const parId = indexerSorts(classesSorts);
  const rafraichis = sorts
    .map((sort) => refreshAncien(sort, parId, niveau))
    .map((sort) => completerTelefrag(sort, parId, niveau));
  return { sorts: rafraichis, changes: true };
}

/**
 * Reconstruit un sort d'avant la refonte depuis le catalogue corrige.
 *
 * Ces sorts se reconnaissent a l'absence du champ exclusiveGroup. Leurs
 * lignes de degats venaient de l'ancienne source, qui doublait certaines
 * lignes.
 */
function refreshAncien(ancien, parId, niveau) {
  if (ancien.exclusiveGroup !== undefined) return ancien;

  const catalogue = parId.get(ancien.id);
  if (!catalogue) return { ...ancien, exclusiveGroup: null };

  const variante = varianteAccessible(catalogue, niveau) ?? (catalogue.variants ?? [])[0];
  if (!variante) return { ...ancien, exclusiveGroup: catalogue.exclusiveGroup ?? null };

  return versSortMoteur({ ...catalogue, ...variante, critRate: variante.critRate });
}

/**
 * Complete le bonus « cible telefrag » d'un sort enregistre avant son
 * extraction, sans toucher au reste de sa definition.
 */
function completerTelefrag(sort, parId, niveau) {
  if (sort.telefragCible !== undefined) return sort;
  const variante = varianteAccessible(parId.get(sort.id), niveau);
  return { ...sort, telefragCible: variante?.telefragCible ?? null };
}
