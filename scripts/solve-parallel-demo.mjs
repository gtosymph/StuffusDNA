/**
 * Demonstration du solveur multi-fils, avec un passif actif.
 */
import { loadCatalog } from '../src/data/catalog-node.mjs';
import { solveParallel, defaultThreadCount } from '../src/solver/parallel.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

const LEVEL = 190;

const CONDITIONS = [
  { stat: 'pa', target: 12, weight: 500, max: 12 },
  { stat: 'pm', target: 5, weight: 500 },
  { stat: 'po', target: 2, weight: 250 },
  { stat: 'vitalite', target: 4000, weight: 1 },
  { stat: 'critique', target: 75, weight: 50, max: 100 },
  { stat: 'sagesse', target: 300, weight: 15 },
  { stat: 'tacle', target: 70, weight: 20 },
];

const SPELLS = [
  { name: 'Sort principal', apCost: 4, castsPerTurn: 3, baseCrit: 10,
    lines: [{ element: 'air', min: 30, max: 34, critMin: 36, critMax: 40, source: 'sort', range: 'distance' }] },
];

/** Un passif declare par l'utilisateur, sur le Dofus Vulbis. */
const PASSIVES = { 6980: { enabled: true, stats: { puissance: 100, pctDommagesFinaux: 10 } } };

async function main() {
  const t0 = Date.now();
  const { best, runs, threads, failures } = await solveParallel(
    {
      level: LEVEL,
      allocation: { sagesse: 190, force: 100, agilite: 187 },
      scrolls: { vitalite: true, sagesse: true, force: true, intelligence: true, chance: true, agilite: true },
      passivesConfig: PASSIVES,
      objective: { conditions: CONDITIONS, spells: SPELLS, mode: SEARCH_MODES.DAMAGE },
    },
    { populationSize: 160, maxGenerations: 600, threadCount: defaultThreadCount(), seed: 1 },
  );

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`Fils lances       : ${threads} en ${seconds}s\n`);
  if (failures.length) process.stdout.write(`Fils en echec     : ${failures.length}\n`);

  process.stdout.write('\nScore par fil :\n');
  for (const run of runs) {
    const etat = run.satisfied ? 'toutes conditions tenues' : `penalite ${Math.round(run.penalty)}`;
    process.stdout.write(`  graine ${String(run.seed).padStart(6)} -> ${String(Math.round(run.score)).padStart(7)}  (${etat})\n`);
  }

  const catalog = await loadCatalog();
  process.stdout.write(`\nMeilleur build (score ${Math.round(best.score)}) :\n`);
  for (const id of best.itemIds) {
    const item = catalog.itemById.get(id);
    if (item) process.stdout.write(`  ${item.slot.padEnd(9)} niv ${String(item.level).padStart(3)}  ${item.fr}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`Echec: ${error.message}\n`);
  process.exitCode = 1;
});
