/**
 * Recupere tous les items equipables DofusDB et ecrit data/items.json.
 * Un item est conserve seulement si son superTypeId correspond a un emplacement.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fetchAll } from './lib/dofusdb.mjs';
import { EQUIPABLE_SUPER_TYPE_IDS, slotForItem } from '../src/data/slots.mjs';

/** Lit un fichier JSON deja ingere. */
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Fichier "${path}" illisible. Lancez d'abord "npm run data:sets". (${error.message})`);
  }
}

/**
 * Normalise un item brut DofusDB vers le format du moteur.
 * @param {any} raw
 * @param {Map<number, {superTypeId: number, fr: string}>} typeById
 */
function normalizeItem(raw, typeById) {
  const type = typeById.get(raw.typeId);
  if (!type) return null;

  const slot = slotForItem(type.superTypeId, type.fr);
  if (!slot) return null;

  const effects = (Array.isArray(raw.effects) ? raw.effects : [])
    .filter((effect) => Number.isInteger(effect?.effectId))
    .map((effect) => ({
      effectId: effect.effectId,
      from: Number(effect.from ?? 0),
      to: Number(effect.to ?? 0),
    }));

  return {
    id: raw.id,
    fr: (raw.name?.fr ?? raw.name?.en ?? '').trim(),
    // L'icone sert a la grille du catalogue et aux emplacements.
    iconId: raw.iconId ?? null,
    img: typeof raw.img === 'string' ? raw.img : null,
    level: Number(raw.level ?? 0),
    typeId: raw.typeId,
    typeFr: type.fr,
    superTypeId: type.superTypeId,
    slot: slot.key,
    setId: Number.isInteger(raw.itemSetId) && raw.itemSetId >= 0 ? raw.itemSetId : null,
    twoHanded: Boolean(raw.twoHanded),
    isLegendary: Boolean(raw.isLegendary),
    // Champs de combat d'une arme : cout, critique, lancers par tour.
    apCost: Number.isFinite(raw.apCost) ? raw.apCost : null,
    critProbability: Number.isFinite(raw.criticalHitProbability) ? raw.criticalHitProbability : 0,
    critBonus: Number.isFinite(raw.criticalHitBonus) ? raw.criticalHitBonus : 0,
    usesPerTurn: Number.isFinite(raw.maxCastPerTurn) && raw.maxCastPerTurn > 0 ? raw.maxCastPerTurn : 1,
    range: Number.isFinite(raw.range) ? raw.range : null,
    // Conditions d'equipement, par exemple un niveau de personnage minimum.
    criteria: typeof raw.criteria === 'string' ? raw.criteria : (raw.criterions ?? null),
    effects,
  };
}

async function main() {
  const types = await readJson('data/item-types.json');
  const typeById = new Map(types.map((type) => [type.id, type]));

  const equipableTypeIds = types
    .filter((type) => EQUIPABLE_SUPER_TYPE_IDS.includes(type.superTypeId))
    .map((type) => type.id);

  process.stdout.write(`Recuperation des items pour ${equipableTypeIds.length} types...\n`);

  const items = [];
  for (const typeId of equipableTypeIds) {
    const label = typeById.get(typeId)?.fr ?? String(typeId);
    const rows = await fetchAll('items', { typeId }, (loaded, total) => {
      process.stdout.write(`\r  ${label.padEnd(24)} ${loaded}/${total}   `);
    });
    process.stdout.write('\n');

    for (const raw of rows) {
      const item = normalizeItem(raw, typeById);
      if (item && item.fr) items.push(item);
    }
  }

  items.sort((a, b) => a.id - b.id);
  await writeFile('data/items.json', `${JSON.stringify(items)}\n`, 'utf8');
  process.stdout.write(`\nEcrit data/items.json (${items.length} items equipables).\n`);
}

main().catch((error) => {
  process.stderr.write(`Echec: ${error.message}\n`);
  process.exitCode = 1;
});
