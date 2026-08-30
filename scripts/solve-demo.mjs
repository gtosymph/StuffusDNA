/**
 * Demonstration de bout en bout : charge le catalogue, lance le solveur
 * sur un objectif realiste et montre le build retenu.
 */
import { loadCatalog } from '../src/data/catalog-node.mjs';
import { solve, SEARCH_MODES } from '../src/solver/genetic.mjs';
import { STAT_LABELS } from '../src/data/stats.mjs';

const LEVEL = 190;

/** Conditions ponderees, au format du solveur. */
const CONDITIONS = [
  { stat: 'pa', target: 12, weight: 500, max: 12 },
  { stat: 'pm', target: 5, weight: 500 },
  { stat: 'po', target: 2, weight: 250 },
  { stat: 'vitalite', target: 4000, weight: 1 },
  { stat: 'pods', target: 5000, weight: 1 },
  { stat: 'critique', target: 75, weight: 50, max: 100 },
  { stat: 'soins', target: 60, weight: 30 },
  { stat: 'prospection', target: 200, weight: 15 },
  { stat: 'sagesse', target: 300, weight: 15 },
  { stat: 'resCritique', target: 100, weight: 10 },
  { stat: 'dommagesNeutre', target: 150, weight: 25 },
  { stat: 'initiative', target: 2000, weight: 1 },
  { stat: 'tacle', target: 70, weight: 20 },
  { stat: 'invocations', target: 6, weight: 125, max: 6 },
];

/** Un sort d'exemple, saisi comme sur une fiche de personnage. */
const SPELLS = [
  { name: 'Sort principal', apCost: 4, castsPerTurn: 3, baseCrit: 10,
    lines: [{ element: 'air', min: 30, max: 34, critMin: 36, critMax: 40, source: 'sort', range: 'distance' }] },
];

async function main() {
  const t0 = Date.now();
  const catalog = await loadCatalog();
  process.stdout.write(`Catalogue : ${catalog.items.length} items, ${catalog.setById.size} panoplies.\n`);

  const result = solve(
    {
      items: catalog.items,
      setById: catalog.setById,
      level: LEVEL,
      allocation: { sagesse: 190, force: 100, agilite: 187 },
      scrolls: { vitalite: true, sagesse: true, force: true, intelligence: true, chance: true, agilite: true },
      objective: { conditions: CONDITIONS, spells: SPELLS, mode: SEARCH_MODES.DAMAGE },
    },
    { populationSize: 160, maxGenerations: 600, seed: 42 },
  );

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`\nGenerations parcourues : ${result.generations} en ${seconds}s\n`);
  process.stdout.write(`Score final            : ${Math.round(result.score)}\n`);
  process.stdout.write(`  degats               : ${Math.round(result.detail.damage)}\n`);
  process.stdout.write(`  penalites            : ${Math.round(result.detail.penalty)}\n`);
  process.stdout.write(`  conditions tenues    : ${result.detail.satisfied ? 'toutes' : `${result.detail.unmet.length} en defaut`}\n\n`);

  process.stdout.write(`Build retenu (${result.items.length} pieces) :\n`);
  for (const item of result.items) {
    process.stdout.write(`  ${item.slot.padEnd(9)} niv ${String(item.level).padStart(3)}  ${item.fr}\n`);
  }

  process.stdout.write('\nConditions :\n');
  for (const detail of result.detail.details) {
    const mark = detail.met ? 'ok    ' : 'manque';
    const label = (STAT_LABELS[detail.stat] ?? detail.stat).padEnd(20);
    process.stdout.write(`  ${mark} ${label} ${String(Math.round(detail.value)).padStart(6)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`Echec: ${error.message}\n${error.stack}\n`);
  process.exitCode = 1;
});
