/**
 * Audit du catalogue de sorts.
 *
 * Le catalogue nait de deux sources : une base ancienne (dofopti) qui donne
 * la liste des sorts, et les donnees a jour de RoxxSolver qui corrigent les
 * lignes de degats. Une source qui prend du retard laisse passer des sorts
 * retires du jeu, des couts absents et des lignes cumulees a tort. Rien de
 * tout cela ne se voit dans l'application : le sort s'affiche, et le solveur
 * optimise pour des degats qui n'existent pas.
 *
 * Ce banc relit data/spells.json et refuse ce qui ne tient pas debout.
 *
 * Lancement : npm run audit:sorts
 *   Le script rend le code 1 des qu'une anomalie apparait.
 */
import { readFile } from 'node:fs/promises';

/** Elements connus du moteur, poussee comprise. */
const ELEMENTS = new Set(['neutre', 'terre', 'feu', 'eau', 'air', 'poussee']);

/**
 * Degats moyens par point d'action au-dela desquels un sort est suspect.
 *
 * Mesure du 2026-09-09 sur les 477 sorts : mediane 9, neuvieme decile 13.
 * Les deux seuls sorts au-dessus de 40 etaient faux — Rekop et Tromperie
 * cumulaient des effets que le jeu tire au hasard. Le seuil laisse donc une
 * marge large et n'attrape que l'aberration.
 */
const RATIO_MAX = 40;

/** Nombre de lignes de degats au-dela duquel une variante est suspecte. */
const LIGNES_MAX = 8;

const anomalies = new Map();
const noter = (type, detail) => {
  if (!anomalies.has(type)) anomalies.set(type, []);
  anomalies.get(type).push(detail);
};

/** Verifie une ligne de degats. */
function verifierLigne(ligne, ou) {
  if (!ELEMENTS.has(ligne.element)) noter('element inconnu du moteur', `${ou} element=${ligne.element}`);

  for (const cle of ['min', 'max', 'critMin', 'critMax']) {
    const valeur = ligne[cle];
    if (!Number.isFinite(valeur)) { noter('valeur illisible', `${ou} ${cle}=${valeur}`); continue; }
    if (valeur < 0) noter('valeur negative', `${ou} ${cle}=${valeur}`);
    if (!Number.isInteger(valeur)) noter('valeur non entiere', `${ou} ${cle}=${valeur}`);
  }

  if (ligne.min > ligne.max) noter('minimum au-dessus du maximum', `${ou} ${ligne.min} > ${ligne.max}`);
  if (ligne.critMin > ligne.critMax) noter('critique minimum au-dessus du maximum', `${ou} ${ligne.critMin} > ${ligne.critMax}`);
  if (ligne.critMax > 0 && ligne.critMin < ligne.min) {
    noter('coup critique plus faible que le coup normal', `${ou} crit ${ligne.critMin} < normal ${ligne.min}`);
  }
  if (ligne.max === 0 && ligne.critMax === 0) noter('ligne sans aucun degat', ou);
}

/** Verifie une variante de sort et rend ses lignes immediates. */
function verifierVariante(variante, ou) {
  const lignes = Array.isArray(variante.lines) ? variante.lines : [];
  if (lignes.length === 0) { noter('variante sans ligne de degats', ou); return []; }
  if (lignes.length > LIGNES_MAX) {
    noter('variante a trop de lignes', `${ou} ${lignes.length} lignes — effets alternatifs cumules ?`);
  }

  for (const [rang, ligne] of lignes.entries()) {
    verifierLigne(ligne, `${ou} ligne ${rang + 1} (${ligne.element})`);
  }

  // Les totaux annonces ne comptent que le tour courant : une ligne differee
  // touche plus tard, elle n'y entre pas.
  const immediates = lignes.filter((l) => !(l.differe > 0));
  const somme = (cle) => immediates.reduce((n, l) => n + (l[cle] ?? 0), 0);

  for (const cle of ['min', 'max', 'critMin', 'critMax']) {
    const annonce = variante[cle];
    if (Number.isFinite(annonce) && annonce !== somme(cle)) {
      noter(`total ${cle} different de la somme des lignes du tour`, `${ou} annonce ${annonce}, lignes ${somme(cle)}`);
    }
  }

  return immediates;
}

async function main() {
  const classes = JSON.parse(await readFile('data/spells.json', 'utf8'));
  const vus = new Map();
  let variantes = 0;

  for (const classe of classes) {
    if (!Array.isArray(classe.spells)) { noter('classe sans liste de sorts', classe.fr ?? '?'); continue; }

    for (const sort of classe.spells) {
      const ou = `${classe.fr}/${sort.fr} (#${sort.id})`;

      if (vus.has(sort.id)) noter('identifiant en double', `${ou} deja vu dans ${vus.get(sort.id)}`);
      else vus.set(sort.id, classe.fr);

      // Un sort gratuit n'existe pas dans le jeu, et l'optimisateur de combo
      // le lancerait sans fin.
      if (!(sort.apCost > 0)) noter('aucun cout en points d\'action', ou);

      const paliers = Array.isArray(sort.variants) ? sort.variants : [];
      if (paliers.length === 0) { noter('sort sans variante', ou); continue; }

      const niveaux = paliers.map((v) => v.level);
      if (niveaux.some((n) => !Number.isFinite(n))) noter('niveau de variante illisible', `${ou} ${niveaux}`);
      if (new Set(niveaux).size !== niveaux.length) noter('niveau de variante en double', `${ou} ${niveaux}`);
      if ([...niveaux].sort((a, b) => a - b).join() !== niveaux.join()) {
        noter('variantes non triees par niveau', `${ou} ${niveaux}`);
      }

      for (const variante of paliers) {
        variantes += 1;
        verifierVariante(variante, `${ou} niveau ${variante.level}`);
      }

      // Un sort qui rend beaucoup trop pour son cout cumule des effets que le
      // jeu ne cumule pas.
      const dernier = paliers[paliers.length - 1];
      const moyenne = ((dernier.min ?? 0) + (dernier.max ?? 0)) / 2;
      if (sort.apCost > 0 && moyenne / sort.apCost > RATIO_MAX) {
        noter('degats hors de proportion avec le cout',
          `${ou} ${Math.round(moyenne)} degats moyens pour ${sort.apCost} PA`);
      }
    }
  }

  const total = [...anomalies.values()].reduce((n, l) => n + l.length, 0);
  process.stdout.write(`\n${classes.length} classes, ${vus.size} sorts, ${variantes} variantes.\n\n`);

  if (total === 0) {
    process.stdout.write('Aucune anomalie.\n');
    return;
  }

  for (const [type, liste] of [...anomalies.entries()].sort((a, b) => b[1].length - a[1].length)) {
    process.stdout.write(`${String(liste.length).padStart(5)}  ${type}\n`);
    for (const detail of liste.slice(0, 5)) process.stdout.write(`         ${detail}\n`);
    if (liste.length > 5) process.stdout.write(`         … et ${liste.length - 5} autres\n`);
  }

  process.stdout.write(`\n${total} anomalie(s). Relancez scripts/import-spells.mjs apres correction.\n`);
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Echec de l'audit : ${error.message}\n`);
  process.exitCode = 1;
});
