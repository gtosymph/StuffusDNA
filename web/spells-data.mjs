/**
 * Chargement des sorts par classe.
 */
let cache = null;

/**
 * Recupere la liste des classes et de leurs sorts.
 * @returns {Promise<any[]>}
 */
export async function loadSpells() {
  if (cache) return cache;

  const reponse = await fetch('../data/spells.json');
  if (!reponse.ok) {
    throw new Error(`Sorts indisponibles (HTTP ${reponse.status}).`);
  }
  cache = await reponse.json();
  return cache;
}

/**
 * Convertit un sort du catalogue vers le format du moteur.
 * @param {any} sort
 * @param {{range?: string|null, source?: string}} [contexte]
 */
export function versSortMoteur(sort, contexte = {}) {
  return {
    id: sort.id,
    name: sort.fr,
    icon: sort.icon,
    apCost: sort.apCost,
    castsPerTurn: sort.maxCast > 0 ? sort.maxCast : 1,
    baseCrit: sort.critRate,
    telefrag: {
      genere: sort.generatesTelefrag,
      consomme: sort.consumesTelefrag,
      bonusSousTelefrag: sort.bonusNeedsTelefrag,
    },
    // Un palier peut porter plusieurs lignes : Pendule frappe deux fois.
    lines: (Array.isArray(sort.lines) && sort.lines.length > 0
      ? sort.lines
      : [{ element: sort.element, min: sort.min, max: sort.max, critMin: sort.critMin, critMax: sort.critMax }]
    ).map((ligne) => ({
      element: ligne.element,
      min: ligne.min, max: ligne.max,
      critMin: ligne.critMin, critMax: ligne.critMax,
      source: contexte.source ?? 'sort',
      range: contexte.range ?? null,
    })),
  };
}
