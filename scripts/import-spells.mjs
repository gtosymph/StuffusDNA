/**
 * Importe les sorts par classe depuis le projet dofopti-web.
 * Ecrit data/spells.json au format attendu par le moteur.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SOURCE = join(homedir(), 'projects/Perso/dofopti-web/data/classes.json');

/**
 * Donnees brutes de RoxxSolver (format DofusDB) : effets par palier, avec
 * masque de cible, delai et effets critiques. Elles corrigent les lignes de
 * degats de la source dofopti, qui additionne des lignes alternatives.
 */
const SOURCE_ROXX = 'data/raw/class_spells.json';
const URL_ROXX = 'https://roxxsolver.com/get/class_spells?v=3.6.2.1';

/**
 * Bonus « cible telefrag » du Xelor, extraits par scripts/fetch-telefrag.mjs.
 * Cle "<idSort>:<niveau>", valeur { bonusImmediat, bonusParLancer, gainPa }.
 */
const SOURCE_TELEFRAG = 'data/raw/telefrag-xelor.json';

async function chargerTelefrag() {
  try {
    return JSON.parse(await readFile(SOURCE_TELEFRAG, 'utf8'));
  } catch {
    process.stdout.write('Bonus telefrag absents (lancez scripts/fetch-telefrag.mjs).\n');
    return {};
  }
}

/** Element de chaque effet de degats (vol de vie compris). */
const ELEMENT_EFFET = Object.freeze({
  97: 'terre', 92: 'terre',
  99: 'feu', 94: 'feu',
  96: 'eau', 91: 'eau',
  98: 'air', 93: 'air',
  100: 'neutre', 95: 'neutre',
  5: 'poussee',
});

/** Effets "meilleur element" du Huppermage : hors du perimetre de la refonte. */
const EFFETS_BEST = new Set([2822, 2828]);

/** Charge les donnees Roxx locales, ou les recupere une premiere fois. */
async function chargerRoxx() {
  try {
    return JSON.parse(await readFile(SOURCE_ROXX, 'utf8'));
  } catch {
    process.stdout.write(`Telechargement de ${URL_ROXX}…\n`);
    const reponse = await fetch(URL_ROXX);
    if (!reponse.ok) throw new Error(`class_spells indisponible (HTTP ${reponse.status}).`);
    const texte = await reponse.text();
    await writeFile(SOURCE_ROXX, texte, 'utf8');
    return JSON.parse(texte);
  }
}

/** Cle de comparaison insensible aux accents et a la casse. */
function normaliser(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Indexe les sorts Roxx par identifiant, et par classe + nom en secours :
 * la refonte du Cra a change les identifiants de ses fleches.
 */
function indexerRoxx(brut) {
  const parId = new Map();
  const parNom = new Map();
  for (const [classe, couples] of Object.entries(brut)) {
    for (const couple of couples) {
      for (const cle of ['0', '1']) {
        const sort = couple[cle];
        if (!sort?.id) continue;
        parId.set(sort.id, sort);
        parNom.set(`${normaliser(classe)}:${normaliser(sort.name?.fr)}`, sort);
      }
    }
  }
  return { parId, parNom };
}

/** Decompose un masque de cible en groupes et conditions d'etat. */
function lireMasque(masque) {
  const jetons = String(masque ?? '').split(',').filter(Boolean);
  return {
    groupes: jetons.filter((j) => /^[A-Za-z]+$/.test(j)),
    // E majuscule sans etoile : la ligne exige un etat sur la cible
    // (Tempete de Puissance, Fleche Devorante). Les jetons etoiles *E<id>
    // portent au contraire les degats de base de certains sorts (Glas).
    exigeEtat: jetons.some((j) => /^E\d+$/.test(j)),
  };
}

/**
 * Extrait les lignes de degats d'un palier Roxx.
 *
 * Regles, verifiees sur les fiches du jeu :
 *   1. une ligne qui exige un etat (E<id>) sort du calcul de base ;
 *   2. si des lignes visent les ennemis (groupe A), les autres cibles
 *      (invocations, allies) sortent : elles doublaient les totaux ;
 *   3. des lignes identiques sous des masques differents decrivent le meme
 *      coup : une seule reste par masque. Pendule garde ses deux coups,
 *      declares sous le meme masque ;
 *   4. un delai (delay) marque la ligne comme differee : elle touche aux
 *      tours suivants.
 */
function lignesRoxx(palier) {
  const garde = (e) => ELEMENT_EFFET[e.effectId] !== undefined;
  const normaux = (palier.effects ?? []).filter(garde);
  const critiques = (palier.criticalEffect ?? []).filter(garde);

  const brutes = normaux.map((effet, rang) => {
    const crit = critiques[rang] ?? effet;
    const { groupes, exigeEtat } = lireMasque(effet.targetMask);
    return {
      element: ELEMENT_EFFET[effet.effectId],
      min: effet.diceNum || effet.value || 0,
      max: effet.diceSide || effet.diceNum || effet.value || 0,
      critMin: crit.diceNum || crit.value || 0,
      critMax: crit.diceSide || crit.diceNum || crit.value || 0,
      differe: Number(effet.delay ?? 0),
      groupes,
      exigeEtat,
      masque: String(effet.targetMask ?? ''),
    };
  }).filter((l) => l.max > 0 && !l.exigeEtat);

  const surEnnemis = brutes.filter((l) => l.groupes.includes('A'));
  const retenues = surEnnemis.length > 0 ? surEnnemis : brutes;

  // Par valeurs identiques : au plus le nombre de repetitions d'un MEME masque.
  const parCle = new Map();
  for (const ligne of retenues) {
    const cle = `${ligne.element}|${ligne.min}|${ligne.max}|${ligne.critMin}|${ligne.critMax}|${ligne.differe}`;
    if (!parCle.has(cle)) parCle.set(cle, new Map());
    const masques = parCle.get(cle);
    masques.set(ligne.masque, [...(masques.get(ligne.masque) ?? []), ligne]);
  }

  const finales = [];
  for (const masques of parCle.values()) {
    const meilleures = [...masques.values()].sort((a, b) => b.length - a.length)[0];
    finales.push(...meilleures);
  }

  return finales.map(({ element, min, max, critMin, critMax, differe }) => ({
    element, min, max, critMin, critMax,
    ...(differe > 0 ? { differe } : {}),
  }));
}

/** Palier Roxx qui correspond a un niveau de variante. */
function palierRoxx(sortRoxx, niveau) {
  const paliers = sortRoxx?.levels ?? [];
  let retenu = null;
  for (const p of paliers) {
    if ((p.minPlayerLevel ?? 0) <= niveau) retenu = p;
  }
  return retenu ?? paliers[0] ?? null;
}

/**
 * Remplace les lignes d'une variante par celles de Roxx, si possible.
 * Les sorts au "meilleur element" (Huppermage) gardent leurs lignes dofopti.
 */
function enrichirVariante(variante, sortRoxx) {
  const palier = palierRoxx(sortRoxx, variante.level);
  if (!palier) return variante;

  const aBest = (palier.effects ?? []).some((e) => EFFETS_BEST.has(e.effectId));
  if (aBest) return variante;

  const lignes = lignesRoxx(palier);
  if (lignes.length === 0) return variante;

  const immediates = lignes.filter((l) => !(l.differe > 0));
  const somme = (liste, cle) => liste.reduce((n, l) => n + l[cle], 0);

  return {
    ...variante,
    lines: lignes,
    element: (immediates[0] ?? lignes[0]).element,
    critRate: Number(palier.criticalHitProbability ?? variante.critRate ?? 0),
    // Les totaux montres ne comptent que les degats du tour courant.
    min: somme(immediates, 'min'),
    max: somme(immediates, 'max'),
    critMin: somme(immediates, 'critMin'),
    critMax: somme(immediates, 'critMax'),
  };
}

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
    // Un maximum a zero decrit des degats fixes : le minimum fait foi.
    parNiveau.get(niveau).push({
      element: l.element ?? 'neutre',
      bestElement: Boolean(l.best_element),
      critRate: Number(l.crit_rate ?? 0),
      min: Number(l.min ?? 0),
      max: Number(l.max ?? 0) || Number(l.min ?? 0),
      critMin: Number(l.min_crit ?? 0),
      critMax: Number(l.max_crit ?? 0) || Number(l.min_crit ?? 0),
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
  const { parId: roxxParId, parNom: roxxParNom } = indexerRoxx(await chargerRoxx());
  const telefragParCle = await chargerTelefrag();
  let enrichis = 0;

  const classes = brut.classes.map((classe) => ({
    id: classe.id,
    fr: classe.name,
    role: classe.role ?? '',
    icon: icone(classe.icon, 'breeds'),
    render: icone(classe.render_file, 'renders'),
    spells: (classe.spells ?? []).map((sort) => {
      const sortRoxx = roxxParId.get(sort.id)
        ?? roxxParNom.get(`${normaliser(classe.name)}:${normaliser(sort.name)}`)
        ?? null;
      if (sortRoxx) enrichis += 1;
      const paliers = variantes(sort.levels)
        .map((v) => (sortRoxx ? enrichirVariante(v, sortRoxx) : v))
        .map((v) => {
          const bonus = telefragParCle[`${sort.id}:${v.level}`];
          return bonus ? { ...v, telefragCible: bonus } : v;
        });
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
    // Un sort reste des qu'une variante porte une ligne de degats, meme
    // entierement differee : ses totaux immediats peuvent valoir zero.
    }).filter((s) => s.variants.some((v) => (v.lines ?? []).some((l) => l.max > 0))),
  }));

  await writeFile('data/spells.json', `${JSON.stringify(classes)}\n`, 'utf8');

  const total = classes.reduce((n, c) => n + c.spells.length, 0);
  const tf = classes.flatMap((c) => c.spells).filter((s) => s.generatesTelefrag || s.consumesTelefrag);
  process.stdout.write(`Ecrit data/spells.json : ${classes.length} classes, ${total} sorts offensifs, ${enrichis} enrichis par Roxx.\n`);
  process.stdout.write(`  sorts lies au telefrag : ${tf.length}\n`);
  for (const s of tf.slice(0, 6)) {
    process.stdout.write(`   ${s.fr} — genere:${s.generatesTelefrag} consomme:${s.consumesTelefrag} bonus:${s.bonusNeedsTelefrag}\n`);
  }
}

main().catch((e) => { process.stderr.write(`Echec: ${e.message}\n`); process.exitCode = 1; });
