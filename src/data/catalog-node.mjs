/**
 * Adaptateur Node : lit les donnees ingerees sur le disque.
 */
import { readFile } from 'node:fs/promises';
import { buildCatalog } from './catalog.mjs';

/** Racine des fichiers ingeres. */
const DATA_DIR = new URL('../../data/', import.meta.url);

async function readJson(name) {
  try {
    return JSON.parse(await readFile(new URL(name, DATA_DIR), 'utf8'));
  } catch (error) {
    throw new Error(
      `Donnee "${name}" absente ou illisible. Lancez "npm run data:all". (${error.message})`,
    );
  }
}

/**
 * Charge le catalogue complet depuis le disque.
 * @returns {Promise<ReturnType<typeof buildCatalog>>}
 */
export async function loadCatalog() {
  const [items, sets] = await Promise.all([readJson('items.json'), readJson('sets.json')]);
  return buildCatalog(items, sets);
}
