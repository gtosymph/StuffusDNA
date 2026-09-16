/**
 * Adaptateur navigateur : recupere les donnees ingerees par le reseau.
 */
import { buildCatalog } from '../src/data/catalog.mjs';

/** Emplacement des fichiers de donnees, relatif a la page. */
/**
 * Un chemin se resout contre CE module, jamais contre la page.
 *
 * Un chemin relatif ecrit tel quel se resout contre l'adresse du document.
 * Tant qu'une seule page existait, cela ne se voyait pas ; des qu'une seconde
 * coquille vit dans un sous-dossier, la meme chaine designe un fichier qui
 * n'existe pas, et le chargement echoue en 404. `import.meta.url` supprime la
 * question : le chemin est ancre au module, donc il vaut depuis n'importe
 * quelle page.
 */
const depuisIci = (chemin) => new URL(chemin, import.meta.url).href;

const DATA_BASE = depuisIci('../data/');

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
