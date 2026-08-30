/**
 * Client HTTP minimal pour l'API publique DofusDB (Feathers).
 * Gere la pagination, les nouvelles tentatives et les erreurs reseau.
 */

export const API_BASE = 'https://api.dofusdb.fr';

/** Taille de page demandee a l'API. */
const PAGE_SIZE = 50;
/** Nombre de nouvelles tentatives sur erreur reseau. */
const MAX_RETRIES = 4;
/** Attente initiale entre deux tentatives, en millisecondes. */
const RETRY_BASE_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lance une requete GET et renvoie le corps JSON.
 * @param {string} url
 * @returns {Promise<any>}
 */
async function getJson(url) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} sur ${url}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_MS * 2 ** attempt);
      }
    }
  }
  throw new Error(`Requete DofusDB en echec: ${url}\nCause: ${lastError?.message}`);
}

/**
 * Construit une URL de service avec des parametres deja encodes.
 * @param {string} service
 * @param {Record<string, string | number>} query
 * @returns {string}
 */
function buildUrl(service, query) {
  const parts = Object.entries(query).map(
    ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
  );
  return `${API_BASE}/${service}?${parts.join('&')}`;
}

/**
 * Recupere toutes les pages d'un service DofusDB.
 * @param {string} service Nom du service, par exemple "items".
 * @param {Record<string, string | number>} [query] Filtres additionnels.
 * @param {(loaded: number, total: number) => void} [onProgress]
 * @returns {Promise<any[]>}
 */
export async function fetchAll(service, query = {}, onProgress) {
  const first = await getJson(buildUrl(service, { ...query, $limit: PAGE_SIZE, $skip: 0 }));
  if (!Array.isArray(first?.data)) {
    throw new Error(`Reponse inattendue du service "${service}": champ "data" absent.`);
  }

  const total = Number(first.total ?? first.data.length);
  const rows = [...first.data];
  onProgress?.(rows.length, total);

  const offsets = [];
  for (let skip = rows.length; skip < total; skip += PAGE_SIZE) {
    offsets.push(skip);
  }

  // Les pages partent par lots pour rester rapide sans saturer l'API.
  const CONCURRENCY = 6;
  for (let i = 0; i < offsets.length; i += CONCURRENCY) {
    const batch = offsets.slice(i, i + CONCURRENCY);
    const pages = await Promise.all(
      batch.map((skip) => getJson(buildUrl(service, { ...query, $limit: PAGE_SIZE, $skip: skip }))),
    );
    for (const page of pages) {
      if (Array.isArray(page?.data)) rows.push(...page.data);
    }
    onProgress?.(rows.length, total);
  }

  return rows;
}
