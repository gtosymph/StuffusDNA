/**
 * Fil de calcul du solveur.
 *
 * Chaque fil fait evoluer sa propre population avec une graine distincte, puis
 * renvoie son meilleur build. Le catalogue est relu depuis le disque plutot que
 * transmis par message : le transfert de plusieurs milliers d'items couterait
 * plus cher que la lecture.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { loadCatalog } from '../data/catalog-node.mjs';
import { normalizePassives } from '../data/passives.mjs';
import { STAT_KEYS } from '../data/stats.mjs';
import { solve } from './genetic.mjs';

async function run() {
  const {
    level, objective, allocation, scrolls, passivesConfig,
    bannedIds, allowedSlots, options, seed, seedGenomes,
  } = workerData;

  const catalog = await loadCatalog();
  const { passives } = normalizePassives(passivesConfig, new Set(STAT_KEYS));

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
      seedGenomes: seedGenomes ?? [],
      objective,
    },
    { ...options, seed },
  );

  // Seuls les identifiants reviennent : les items complets sont deja connus
  // du coordinateur, qui les relit dans son propre catalogue.
  parentPort.postMessage({
    ok: true,
    seed,
    score: result.score,
    generations: result.generations,
    itemIds: result.items.map((item) => item.id),
    penalty: result.detail.penalty,
    damage: result.detail.damage,
    satisfied: result.detail.satisfied,
    unmet: result.detail.unmet,
    stats: result.stats,
    history: result.history,
    topGenomes: result.topGenomes,
  });
}

run().catch((error) => {
  parentPort.postMessage({ ok: false, seed: workerData?.seed, message: error.message });
});
