/**
 * Extrait les bonus « cible telefrag » des sorts du Xelor.
 *
 * Sous l'etat telefrag (E251 sur la cible), un sort lance des SOUS-SORTS
 * (effets 1160 et 792, diceNum = id du sous-sort, diceSide = grade).
 * Les sous-sorts portent :
 *   - une augmentation des degats de base du sort principal, effet 293 :
 *     immediate (Horloge +24, Rayon Obscur +12) ou cumulee apres chaque
 *     lancer (Fletrissement +6) selon l'etat interne requis ;
 *   - un gain de PA immediat pour le lanceur, effets 111 et 84
 *     (Ralentissement rend 1 PA).
 *
 * Les sous-sorts ne sont pas dans class_spells : ils viennent de l'API
 * DofusDB, avec un cache local. Ecrit data/raw/telefrag-xelor.json.
 */
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE = 'data/raw/class_spells.json';
const SORTIE = 'data/raw/telefrag-xelor.json';
const API = 'https://api.dofusdb.fr';

/** Element de chaque effet de degats. */
const ELEMENT_EFFET = Object.freeze({
  97: 'terre', 92: 'terre', 99: 'feu', 94: 'feu',
  96: 'eau', 91: 'eau', 98: 'air', 93: 'air', 100: 'neutre', 95: 'neutre',
});

/** Effets qui referencent un sous-sort. */
const EFFETS_SOUS_SORT = new Set([1160, 792]);

/** Le sort « Telefrag » lui-meme ne porte que des etats : il se saute. */
const SORT_TELEFRAG = 13265;

const cacheSorts = new Map();
const cachePaliers = new Map();

async function api(chemin) {
  const reponse = await fetch(`${API}${chemin}`);
  if (!reponse.ok) throw new Error(`DofusDB ${chemin} : HTTP ${reponse.status}`);
  return reponse.json();
}

/** Identifiants des paliers d'un sort DofusDB. */
async function ficheSort(id) {
  if (!cacheSorts.has(id)) {
    const data = await api(`/spells?id=${id}&lang=fr`);
    const sort = data.data?.[0];
    cacheSorts.set(id, { paliers: sort?.spellLevels ?? [], nom: sort?.name?.fr ?? '' });
  }
  return cacheSorts.get(id);
}

/** Effets d'un palier DofusDB. */
async function palier(idPalier) {
  if (!cachePaliers.has(idPalier)) {
    cachePaliers.set(idPalier, await api(`/spell-levels/${idPalier}?lang=fr`));
  }
  return cachePaliers.get(idPalier);
}

/** Vrai si le masque vise les ennemis. */
const viseEnnemis = (masque) => String(masque ?? '').split(',').includes('A');

/** Vrai si le masque exige l'etat telefrag sur un ennemi. */
const exigeTelefrag = (masque) => {
  const jetons = String(masque ?? '').split(',');
  return jetons.includes('A') && jetons.includes('E251');
};

/**
 * Recolte recursivement les bonus d'un sous-sort.
 * @param {number} id Sous-sort a resoudre.
 * @param {number} grade Grade cible (1 = premier palier).
 * @param {{id: number, nom: string}} idPrincipal Sort principal (cumul 293, copies de zone).
 * @param {Set<number>} vus Sous-sorts deja traverses.
 * @param {{bonusImmediat: number, bonusParLancer: number, gainPa: number}} bonus
 */
async function recolter(id, grade, idPrincipal, vus, bonus) {
  // Un sous-sort qui EST le sort principal (meme id, ou copie de zone au
  // meme nom comme Refraction) re-applique ses effets : rien de plus sur
  // une cible unique.
  if (id === SORT_TELEFRAG || id === idPrincipal.id || vus.has(id)) return;
  vus.add(id);

  const fiche = await ficheSort(id);
  const idPalier = fiche.paliers[Math.min(Math.max(grade, 1), fiche.paliers.length) - 1];
  if (!idPalier) return;

  const donnees = await palier(idPalier);

  for (const effet of donnees.effects ?? []) {
    // Les lignes de degats des sous-sorts ne se comptent pas : sur le
    // Xelor, elles decrivent des propagations de zone (Refraction), sans
    // effet sur une cible unique. Les bonus passent par 293, 111 et 84.

    // Augmentation des degats de base du sort principal. Un etat interne
    // requis (*E<id>, pose par le lancer precedent) donne un cumul PAR
    // LANCER (Fletrissement) ; sinon le bonus s'applique des le premier
    // lancer (Horloge, Rayon Obscur).
    if (effet.effectId === 293 && effet.diceNum === idPrincipal.id) {
      const jetons = String(effet.targetMask ?? '').split(',');
      if (jetons.some((j) => /^\*E\d+$/.test(j))) {
        bonus.bonusParLancer += Number(effet.value ?? 0);
      } else {
        bonus.bonusImmediat += Number(effet.value ?? 0);
      }
      continue;
    }

    // Gain de PA immediat pour le lanceur (111) ou vol de PA (84).
    if ((effet.effectId === 111 || effet.effectId === 84) && (effet.delay ?? 0) === 0) {
      bonus.gainPa += Number(effet.diceNum || effet.value || 0);
      continue;
    }

    if (EFFETS_SOUS_SORT.has(effet.effectId)) {
      await recolter(effet.diceNum, effet.diceSide || 1, idPrincipal, vus, bonus);
    }
  }
}

async function main() {
  const brut = JSON.parse(await readFile(SOURCE, 'utf8'));
  const table = {};

  for (const couple of brut.xelor ?? []) {
    for (const cle of ['0', '1']) {
      const sort = couple[cle];
      if (!sort) continue;

      for (const niveau of sort.levels ?? []) {
        const refs = (niveau.effects ?? [])
          .filter((e) => EFFETS_SOUS_SORT.has(e.effectId) && exigeTelefrag(e.targetMask));
        if (refs.length === 0) continue;

        const bonus = { bonusImmediat: 0, bonusParLancer: 0, gainPa: 0 };
        // Le pattern telefrag passe parfois par une reference "self"
        // (mask C) qui porte le cumul, declenchee par la branche E251.
        const refsSelf = (niveau.effects ?? []).filter((e) => EFFETS_SOUS_SORT.has(e.effectId)
          && String(e.targetMask ?? '') === 'C');
        for (const ref of [...refs, ...refsSelf]) {
          await recolter(ref.diceNum, ref.diceSide || 1, { id: sort.id, nom: sort.name.fr }, new Set(), bonus);
        }

        if (bonus.bonusImmediat === 0 && bonus.bonusParLancer === 0
          && bonus.gainPa === 0) continue;
        table[`${sort.id}:${niveau.minPlayerLevel ?? 0}`] = bonus;
        process.stdout.write(`${sort.name.fr} (niv ${niveau.minPlayerLevel}) : `
          + `immediat +${bonus.bonusImmediat}, par lancer +${bonus.bonusParLancer}, `
          + `PA +${bonus.gainPa}\n`);
      }
    }
  }

  await writeFile(SORTIE, `${JSON.stringify(table, null, 1)}\n`, 'utf8');
  process.stdout.write(`Ecrit ${SORTIE} (${Object.keys(table).length} entrees).\n`);
}

main().catch((e) => { process.stderr.write(`Echec : ${e.message}\n`); process.exitCode = 1; });
