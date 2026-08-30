/**
 * Emplacements d'equipement Dofus et correspondance avec les superTypeId DofusDB.
 */

/** superTypeId DofusDB porteurs d'un equipement. */
export const EQUIPABLE_SUPER_TYPES = Object.freeze({
  AMULETTE: 1,
  ARME: 2,
  ANNEAU: 3,
  CEINTURE: 4,
  BOTTES: 5,
  BOUCLIER: 7,
  CHAPEAU: 10,
  CAPE: 11,
  MONTURE: 12,
  ARTEFACT: 13,
});

/**
 * Emplacements du personnage, dans l'ordre d'affichage.
 *
 * `capacity` donne le nombre de pieces portees en meme temps. `types` restreint
 * l'emplacement a certains types d'items : le superTypeId 13 couvre a la fois
 * les Dofus, les Trophees et les Prysmaradites, mais la Prysmaradite occupe un
 * emplacement qui lui est propre.
 */
export const SLOTS = Object.freeze([
  { key: 'amulette', label: 'Amulette', superTypeId: 1, capacity: 1, types: null },
  { key: 'arme', label: 'Arme', superTypeId: 2, capacity: 1, types: null },
  { key: 'anneau', label: 'Anneau', superTypeId: 3, capacity: 2, types: null },
  { key: 'ceinture', label: 'Ceinture', superTypeId: 4, capacity: 1, types: null },
  { key: 'bottes', label: 'Bottes', superTypeId: 5, capacity: 1, types: null },
  { key: 'bouclier', label: 'Bouclier', superTypeId: 7, capacity: 1, types: null },
  { key: 'chapeau', label: 'Chapeau', superTypeId: 10, capacity: 1, types: null },
  { key: 'cape', label: 'Cape', superTypeId: 11, capacity: 1, types: null },
  { key: 'monture', label: 'Monture / Familier', superTypeId: 12, capacity: 1, types: null },
  // Dofus, Trophees et Prysmaradites partagent les six memes emplacements :
  // le jeu et le solveur de reference en montrent six, pas sept.
  { key: 'artefact', label: 'Dofus / Trophee', superTypeId: 13, capacity: 6,
    types: ['Dofus', 'Trophee', 'Trophée', 'Prysmaradite'] },
]);

/** Nombre total de pieces portables en meme temps. */
export const TOTAL_SLOT_CAPACITY = SLOTS.reduce((sum, slot) => sum + slot.capacity, 0);

/** Ensemble des superTypeId equipables, pour filtrer un catalogue. */
export const EQUIPABLE_SUPER_TYPE_IDS = Object.freeze(
  SLOTS.map((slot) => slot.superTypeId),
);

/**
 * Trouve l'emplacement qui accepte un item.
 *
 * Le type precis departage les emplacements qui partagent un superTypeId.
 *
 * @param {number} superTypeId
 * @param {string} [typeFr] Nom francais du type d'item.
 * @returns {(typeof SLOTS)[number] | undefined}
 */
export function slotForItem(superTypeId, typeFr) {
  const candidates = SLOTS.filter((slot) => slot.superTypeId === superTypeId);
  if (candidates.length <= 1) return candidates[0];

  const exact = candidates.find((slot) => slot.types?.includes(typeFr));
  // Un type inconnu rejoint l'emplacement general du superType.
  return exact ?? candidates.find((slot) => slot.types === null) ?? candidates[0];
}

/**
 * Trouve l'emplacement general d'un superTypeId.
 * @param {number} superTypeId
 * @returns {(typeof SLOTS)[number] | undefined}
 */
export function slotForSuperType(superTypeId) {
  return SLOTS.find((slot) => slot.superTypeId === superTypeId);
}
