/**
 * Recupere la table des effets DofusDB et l'ecrit dans data/effects.json.
 * Cette table sert a relier un effectId d'item a une statistique du moteur.
 */
import { writeFile } from 'node:fs/promises';
import { fetchAll } from './lib/dofusdb.mjs';

/** Retire les marqueurs de gabarit des descriptions DofusDB. */
function cleanDescription(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\{~[^}]*\}/g, '')   // blocs conditionnels {~1~2 a }
    .replace(/[#\+\-]?\d?\{[^}]*\}/g, '') // jetons de gabarit restants
    .replace(/#\d/g, '')          // references de parametre #1, #2
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  process.stdout.write('Recuperation des effets DofusDB...\n');

  const rows = await fetchAll('effects', {}, (loaded, total) => {
    process.stdout.write(`\r  ${loaded}/${total}`);
  });
  process.stdout.write('\n');

  const effects = rows
    .map((row) => ({
      id: row.id,
      characteristic: row.characteristic ?? -1,
      elementId: row.elementId ?? -1,
      operator: row.characteristicOperator ?? row.operator ?? '',
      isInPercent: Boolean(row.isInPercent),
      useInFight: Boolean(row.useInFight),
      bonusType: row.bonusType ?? 0,
      fr: cleanDescription(row.description?.fr),
      en: cleanDescription(row.description?.en),
    }))
    .filter((effect) => Number.isInteger(effect.id))
    .sort((a, b) => a.id - b.id);

  await writeFile('data/effects.json', `${JSON.stringify(effects, null, 2)}\n`, 'utf8');
  process.stdout.write(`Ecrit data/effects.json (${effects.length} effets).\n`);
}

main().catch((error) => {
  process.stderr.write(`Echec: ${error.message}\n`);
  process.exitCode = 1;
});
