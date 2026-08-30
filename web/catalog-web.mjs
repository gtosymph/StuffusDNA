/**
 * Adaptateur navigateur : recupere les donnees ingerees par le reseau.
 */
import { buildCatalog } from '../src/data/catalog.mjs';

/** Emplacement des fichiers de donnees, relatif a la page. */
const DATA_BASE = '../data/';

async function fetchJson(name) {
  const response = await fetch(`${DATA_BASE}${name}`);
  if (!response.ok) {
    throw new Error(`Donnee "${name}" indisponible (HTTP ${response.status}).`);
  }
  return response.json();
}

/**
 * Charge le catalogue complet depuis le serveur.
 * @returns {Promise<ReturnType<typeof buildCatalog>>}
 */
export async function loadCatalog() {
  const [items, sets] = await Promise.all([fetchJson('items.json'), fetchJson('sets.json')]);
  return buildCatalog(items, sets);
}
