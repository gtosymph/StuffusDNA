/**
 * Scenario de comparaison, aligne sur celui pose dans le solveur de reference :
 * niveau 190, aucun point investi, aucun parchemin, deux conditions, un sort Terre.
 */
import { loadCatalog } from '../src/data/catalog-node.mjs';
import { solveParallel } from '../src/solver/parallel.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

export const SCENARIO = {
  level: 190,
  conditions: [
    { stat: 'pa', target: 12, weight: 500, max: 12, absolute: true },
    { stat: 'pm', target: 6, weight: 500 },
  ],
  spells: [{
    name: 'Test Feu', apCost: 4, castsPerTurn: 1, baseCrit: 0,
    lines: [{ element: 'feu', min: 20, max: 24, critMin: 24, critMax: 28, source: 'sort', range: null }],
  }],
};

async function main() {
  const t0 = Date.now();
  const { best, runs, threads } = await solveParallel(
    {
      level: SCENARIO.level,
      profile: { classe: 5, sexe: 0 },
      objective: { conditions: SCENARIO.conditions, spells: SCENARIO.spells, mode: SEARCH_MODES.DAMAGE },
    },
    { populationSize: 200, maxGenerations: 2500, threadCount: 4, seed: 1 },
  );

  const catalog = await loadCatalog();
  const pieces = best.itemIds.map((id) => catalog.itemById.get(id)).filter(Boolean);

  process.stdout.write(`Duree : ${((Date.now() - t0) / 1000).toFixed(1)}s sur ${threads} fils\n`);
  process.stdout.write(`Score : ${Math.round(best.score)} (${best.satisfied ? 'conditions tenues' : 'en defaut'})\n\n`);

  const s = best.stats;
  const ligne = (nom, cle) => process.stdout.write(`  ${nom.padEnd(14)} ${String(Math.round(s[cle] ?? 0)).padStart(6)}\n`);
  process.stdout.write('CARACTERISTIQUES\n');
  for (const [n, c] of [['Pdv','pdv'],['PA','pa'],['PM','pm'],['PO','po'],['Vitalite','vitalite'],
    ['Force','force'],['Intelligence','intelligence'],['Chance','chance'],['Agilite','agilite'],
    ['Sagesse','sagesse'],['Puissance','puissance'],['% Critique','critique'],['Initiative','initiative'],
    ['Prospection','prospection'],['Pods','pods'],['Tacle','tacle']]) ligne(n, c);

  process.stdout.write('\nEQUIPEMENT\n');
  for (const it of pieces) {
    process.stdout.write(`  ${String(it.id).padStart(6)}  ${it.slot.padEnd(9)} niv ${String(it.level).padStart(3)}  ${it.fr}\n`);
  }

  process.stdout.write('\nSCORES PAR FIL : ' + runs.map((r) => Math.round(r.score)).join(', ') + '\n');
}

main().catch((e) => { process.stderr.write(`Echec: ${e.message}\n`); process.exitCode = 1; });
