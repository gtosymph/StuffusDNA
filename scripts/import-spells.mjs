/**
 * Importe les sorts par classe depuis le projet dofopti-web.
 * Ecrit data/spells.json au format attendu par le moteur.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SOURCE = join(homedir(), 'projects/Perso/dofopti-web/data/classes.json');

/** Ramene un chemin d'icone vers le dossier local des ressources. */
function icone(chemin, dossier) {
  if (typeof chemin !== 'string') return null;
  const nom = chemin.split('/').pop();
  return nom ? `assets/${dossier}/${nom}` : null;
}

/**
 * Normalise les paliers d'un sort, du plus bas au plus haut.
 *
 * Les entrees de meme niveau sont les LIGNES DE DEGATS d'un meme palier :
 * Pendule frappe deux fois en air, d'autres sorts frappent dans plusieurs
 * elements. Chaque palier garde donc toutes ses lignes, et porte en plus
 * les totaux sommes pour l'affichage.
 */
function variantes(levels) {
  const parNiveau = new Map();

  for (const l of levels ?? []) {
    const niveau = Number(l.level ?? 0);
    if (!parNiveau.has(niveau)) parNiveau.set(niveau, []);
    parNiveau.get(niveau).push({
      element: l.element ?? 'neutre',
      bestElement: Boolean(l.best_element),
      critRate: Number(l.crit_rate ?? 0),
      min: Number(l.min ?? 0),
      max: Number(l.max ?? 0),
      critMin: Number(l.min_crit ?? 0),
      critMax: Number(l.max_crit ?? 0),
    });
  }

  const somme = (lignes, cle) => lignes.reduce((n, l) => n + l[cle], 0);

  return [...parNiveau.entries()]
    .map(([level, lines]) => ({
      level,
      lines,
      element: lines[0].element,
      bestElement: lines.some((l) => l.bestElement),
      critRate: Math.max(...lines.map((l) => l.critRate)),
      min: somme(lines, 'min'),
      max: somme(lines, 'max'),
      critMin: somme(lines, 'critMin'),
      critMax: somme(lines, 'critMax'),
    }))
    .sort((a, b) => a.level - b.level);
}

async function main() {
  const brut = JSON.parse(await readFile(SOURCE, 'utf8'));

  const classes = brut.classes.map((classe) => ({
    id: classe.id,
    fr: classe.name,
    role: classe.role ?? '',
    icon: icone(classe.icon, 'breeds'),
    render: icone(classe.render_file, 'renders'),
    spells: (classe.spells ?? []).map((sort) => {
      const paliers = variantes(sort.levels);
      const niveau = paliers[paliers.length - 1] ?? null;
      return {
        id: sort.id,
        fr: sort.name,
        icon: icone(sort.icon, 'spells'),
        apCost: Number(sort.ap_cost ?? 0),
        maxCast: Number(sort.max_cast ?? 0),
        maxCastPerTarget: Number(sort.max_cast_per_target ?? 0),
        range: Number(sort.range ?? 0),
        minRange: Number(sort.min_range ?? 0),
        recastBonus: Number(sort.recast_bonus ?? 0),
        zone: sort.zone ?? '',
        // Marqueurs du systeme de telefrag.
        generatesTelefrag: Boolean(sort.generates_telefrag),
        consumesTelefrag: Boolean(sort.consumes_telefrag),
        bonusNeedsTelefrag: Boolean(sort.bonus_needs_telefrag),
        exclusiveGroup: sort.exclusive_group ?? null,
        excludes: Array.isArray(sort.excludes) ? sort.excludes : [],
        // Toutes les variantes sont gardees : l'interface les propose au choix.
        variants: paliers,
        level: niveau ? Number(niveau.level ?? 0) : 0,
        element: niveau?.element ?? 'neutre',
        bestElement: Boolean(niveau?.best_element),
        critRate: Number(niveau?.critRate ?? 0),
        min: Number(niveau?.min ?? 0),
        max: Number(niveau?.max ?? 0),
        critMin: Number(niveau?.critMin ?? 0),
        critMax: Number(niveau?.critMax ?? 0),
        lines: niveau?.lines ?? [],
      };
    }).filter((s) => s.max > 0 || s.min > 0),
  }));

  await writeFile('data/spells.json', `${JSON.stringify(classes)}\n`, 'utf8');

  const total = classes.reduce((n, c) => n + c.spells.length, 0);
  const tf = classes.flatMap((c) => c.spells).filter((s) => s.generatesTelefrag || s.consumesTelefrag);
  process.stdout.write(`Ecrit data/spells.json : ${classes.length} classes, ${total} sorts offensifs.\n`);
  process.stdout.write(`  sorts lies au telefrag : ${tf.length}\n`);
  for (const s of tf.slice(0, 6)) {
    process.stdout.write(`   ${s.fr} — genere:${s.generatesTelefrag} consomme:${s.consumesTelefrag} bonus:${s.bonusNeedsTelefrag}\n`);
  }
}

main().catch((e) => { process.stderr.write(`Echec: ${e.message}\n`); process.exitCode = 1; });
