/**
 * Fil de calcul du solveur.
 *
 * Le fil reste VIVANT pendant toute la recherche, comme dans le navigateur :
 * il charge le catalogue une seule fois au demarrage, puis traite une requete
 * de vague apres l'autre. Relancer un fil a chaque vague coutait plus cher
 * que la vague elle-meme (demarrage de Node et relecture du catalogue).
 *
 * Protocole : la configuration fixe (niveau, objectif, passifs…) arrive par
 * workerData ; chaque message { type: 'vague', seed, seedGenomes, options }
 * declenche une recherche et rend un resultat ; { type: 'fin' } ferme le fil.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { loadCatalog } from '../data/catalog-node.mjs';
import { normalizePassives } from '../data/passives.mjs';
import { STAT_KEYS } from '../data/stats.mjs';
import { solve } from './genetic.mjs';

const {
  level, objective, allocation, scrolls, passivesConfig, bannedIds, allowedSlots,
} = workerData ?? {};

// Le catalogue est relu depuis le disque plutot que transmis par message :
// le transfert de plusieurs milliers d'items couterait plus cher.
const preparation = (async () => {
  const catalog = await loadCatalog();
  const { passives } = normalizePassives(passivesConfig, new Set(STAT_KEYS));
  return { catalog, passives };
})();

parentPort.on('message', async (message) => {
  if (message?.type === 'fin') {
    parentPort.close();
    return;
  }
  if (message?.type !== 'vague') return;

  try {
    const { catalog, passives } = await preparation;

    const result = solve(
      {
        items: catalog.items,
        setById: catalog.setById,
        level,
        allocation,
        scrolls,
        passives,
        banned: new Set(bannedIds ?? []),
        allowedSlots: allowedSlots ? new Set(allowedSlots) : null,
        seedGenomes: message.seedGenomes ?? [],
        objective,
      },
      { ...message.options, seed: message.seed },
    );

    // Seuls les identifiants reviennent : les items complets sont deja connus
    // du coordinateur, qui les relit dans son propre catalogue.
    parentPort.postMessage({
      ok: true,
      seed: message.seed,
      score: result.score,
      generations: result.generations,
      itemIds: result.items.map((item) => item.id),
      penalty: result.detail.penalty,
      damage: result.detail.damage,
      satisfied: result.detail.satisfied,
      unmet: result.detail.unmet,
      stats: result.stats,
      history: result.history,
      candidats: result.candidats,
      topGenomes: result.topGenomes,
    });
  } catch (error) {
    parentPort.postMessage({ ok: false, seed: message?.seed, message: error.message });
  }
});
