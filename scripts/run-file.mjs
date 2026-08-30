/**
 * Lance une recherche a partir d'un fichier de configuration.
 * Usage : node scripts/run-file.mjs <fichier> [--sans-conflit]
 */
import { readFile } from 'node:fs/promises';
import { loadCatalog } from '../src/data/catalog.mjs';
import { findConflicts, parseBuildFile } from '../src/data/build-format.mjs';
import { solve } from '../src/solver/genetic.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Resout un nom d'item vers un item du catalogue.
 * En cas d'homonymie, le plus haut niveau utilisable l'emporte.
 */
function resolve(name, items, level) {
  const target = norm(name);
  const exact = items.filter((i) => norm(i.fr) === target);
  const pool = exact.length ? exact : items.filter((i) => norm(i.fr).includes(target));
  const usable = pool.filter((i) => i.level <= level);
  const chosen = (usable.length ? usable : pool).sort((a, b) => b.level - a.level)[0];
  return chosen ?? null;
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  const sansConflit = flags.includes('--sans-conflit');

  const parsed = parseBuildFile(await readFile(file, 'utf8'));
  const catalog = await loadCatalog();

  const conflicts = findConflicts(parsed.constraints);
  for (const c of conflicts) process.stdout.write(`ATTENTION : ${c}\n`);

  // Les contraintes deviennent des conditions du solveur.
  let conditions = parsed.constraints.map((c) => ({ ...c }));
  if (sansConflit && conflicts.length) {
    conditions = conditions.filter((c) => !(c.stat === 'pa' && c.target === 22));
    process.stdout.write('La contrainte "pa >= 22" est ecartee pour cet essai.\n');
  }
  if (parsed.minCrit != null) {
    conditions.push({ stat: 'critique', target: parsed.minCrit, weight: 500 });
  }

  // Chaque ligne devient une attaque distincte.
  const spells = parsed.damageLines.map((line, index) => ({
    name: `ligne ${index + 1}`,
    baseCrit: line.critBonus,
    lines: [{
      element: line.element, min: line.min, max: line.max,
      critMin: line.critMin, critMax: line.critMax, source: 'sort',
    }],
  }));

  const forced = parsed.forced.map((n) => resolve(n, catalog.items, parsed.level)).filter(Boolean);
  const excluded = parsed.excluded.map((n) => resolve(n, catalog.items, parsed.level)).filter(Boolean);

  process.stdout.write(`\nImposes : ${forced.map((i) => `${i.fr} (niv ${i.level})`).join(', ')}\n`);
  process.stdout.write(`Exclus  : ${excluded.length} items\n`);

  const t0 = Date.now();
  const result = solve(
    {
      items: catalog.items, setById: catalog.setById, level: parsed.level,
      lockedIds: forced.map((i) => i.id),
      banned: new Set(excluded.map((i) => i.id)),
      allowedSlots: new Set(Object.keys(parsed.slots)),
      objective: { conditions, spells, mode: SEARCH_MODES.DAMAGE },
    },
    { populationSize: 220, maxGenerations: 1200, seed: 2024 },
  );

  const s = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`\n--- Resultat (${result.generations} generations, ${s}s) ---\n`);
  process.stdout.write(`score ${Math.round(result.score)} | degats ${Math.round(result.detail.damage)}`);
  process.stdout.write(` | penalite ${Math.round(result.detail.penalty)}\n`);
  process.stdout.write(`items interdits ${result.invalid.length} | plafonds franchis ${result.violations.length}`);
  process.stdout.write(` | imposes non places ${result.unplaced.length}\n\n`);

  process.stdout.write(`PA ${result.stats.pa} | PM ${result.stats.pm} | critique ${result.stats.critique}%`);
  process.stdout.write(` | Pdv ${result.stats.pdv}\n\n`);

  process.stdout.write(`Build (${result.items.length} pieces) :\n`);
  for (const item of result.items) {
    process.stdout.write(`  ${item.slot.padEnd(13)} niv ${String(item.level).padStart(3)}  ${item.fr}\n`);
  }

  process.stdout.write('\nConditions :\n');
  for (const d of result.detail.details) {
    process.stdout.write(`  ${d.met ? 'ok    ' : 'manque'} ${d.stat.padEnd(10)} ${String(Math.round(d.value)).padStart(6)}\n`);
  }
}

main().catch((e) => { process.stderr.write(`Echec: ${e.message}\n${e.stack}\n`); process.exitCode = 1; });
