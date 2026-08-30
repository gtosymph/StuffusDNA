/**
 * Recupere les types d'items et les panoplies DofusDB.
 * Ecrit data/item-types.json et data/sets.json.
 */
import { writeFile } from 'node:fs/promises';
import { fetchAll } from './lib/dofusdb.mjs';

function frName(node) {
  return (node?.name?.fr ?? node?.name?.en ?? '').trim();
}

async function fetchTypes() {
  const rows = await fetchAll('item-types', {}, (loaded, total) => {
    process.stdout.write(`\r  types ${loaded}/${total}`);
  });
  process.stdout.write('\n');

  return rows
    .filter((row) => Number.isInteger(row.id))
    .map((row) => ({
      id: row.id,
      superTypeId: row.superTypeId ?? 0,
      categoryId: row.categoryId ?? 0,
      fr: frName(row),
    }))
    .sort((a, b) => a.id - b.id);
}

async function fetchSets() {
  const rows = await fetchAll('item-sets', {}, (loaded, total) => {
    process.stdout.write(`\r  panoplies ${loaded}/${total}`);
  });
  process.stdout.write('\n');

  return rows
    .filter((row) => Number.isInteger(row.id))
    .map((row) => ({
      id: row.id,
      fr: frName(row),
      // Le service renvoie les items complets : seuls les identifiants servent.
      itemIds: (Array.isArray(row.items) ? row.items : (row.itemIds ?? []))
        .map((entry) => (typeof entry === 'object' ? entry?.id : entry))
        .filter(Number.isInteger),
      // effects[n] = bonus obtenu avec (n + 2) pieces equipees.
      effects: Array.isArray(row.effects)
        ? row.effects.map((tier) =>
            (Array.isArray(tier) ? tier : []).map((effect) => ({
              effectId: effect.effectId,
              from: effect.from ?? 0,
              to: effect.to ?? 0,
            })),
          )
        : [],
    }))
    .sort((a, b) => a.id - b.id);
}

async function main() {
  process.stdout.write('Recuperation des types et panoplies...\n');
  const [types, sets] = await Promise.all([fetchTypes(), fetchSets()]);

  await writeFile('data/item-types.json', `${JSON.stringify(types, null, 2)}\n`, 'utf8');
  await writeFile('data/sets.json', `${JSON.stringify(sets, null, 2)}\n`, 'utf8');
  process.stdout.write(`Ecrit data/item-types.json (${types.length}) et data/sets.json (${sets.length}).\n`);
}

main().catch((error) => {
  process.stderr.write(`Echec: ${error.message}\n`);
  process.exitCode = 1;
});
