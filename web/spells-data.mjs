/**
 * Chargement des sorts par classe.
 */

/**
 * Ancre un chemin d'icone au module, pas a la page.
 *
 * `data/spells.json` porte des chemins relatifs, ecrits du temps ou une seule
 * page existait. Ils se resolvaient contre l'adresse du document : depuis une
 * coquille rangee dans un sous-dossier, la meme chaine designe un fichier
 * absent et l'icone ne se voit pas. La correction se fait ici, au chargement,
 * pour que personne d'autre n'ait a y penser.
 */
const ancrer = (chemin) => (typeof chemin === 'string' && !/^(https?:|\/|data:)/.test(chemin)
  ? new URL(`./${chemin}`, import.meta.url).href
  : chemin);

let cache = null;

/**
 * Recupere la liste des classes et de leurs sorts.
 * @returns {Promise<any[]>}
 */
export async function loadSpells() {
  if (cache) return cache;

  const reponse = await fetch(new URL('../data/spells.json', import.meta.url));
  if (!reponse.ok) {
    throw new Error(`Sorts indisponibles (HTTP ${reponse.status}).`);
  }
  // Les donnees ne sont pas modifiees sur place : la liste ancree est une
  // copie, et l'originale reste ce que le fichier disait.
  const brut = await reponse.json();
  cache = brut.map((classe) => ({
    ...classe,
    icon: ancrer(classe.icon),
    spells: classe.spells.map((sort) => ({ ...sort, icon: ancrer(sort.icon) })),
  }));
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
    // Deux variantes d'un meme couple s'excluent dans le combo.
    exclusiveGroup: sort.exclusiveGroup ?? null,
    // Bonus du sort quand la cible est telefrag (Xelor), ou null.
    telefragCible: sort.telefragCible ?? null,
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
      // Une ligne differee touche N tours apres le lancer.
      ...(ligne.differe > 0 ? { differe: ligne.differe } : {}),
      source: contexte.source ?? 'sort',
      range: contexte.range ?? null,
    })),
  };
}
