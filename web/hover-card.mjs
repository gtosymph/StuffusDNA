/**
 * Infobulle d'equipement, suivant le pointeur.
 *
 * Elle apparait au survol d'une piece et se place a cote du curseur, en
 * restant dans la fenetre. Le toucher ne la declenche pas : sur mobile, un
 * appui ouvre directement la fiche complete.
 */
import { el, ligneArme, resumeArme } from './render.mjs';
import { iconeStat } from './icons.mjs';
import { computeSpellDetail, weaponAttack } from '../src/engine/damage.mjs';
import { STAT_LABELS } from '../src/data/stats.mjs';
import { passifDe } from '../src/data/passives-defaults.mjs';
import { libelleCriteria } from '../src/data/criteria.mjs';

/** Distance entre le pointeur et le coin de l'infobulle. */
const ECART = 16;
/** Nombre de statistiques montrees, les plus fortes d'abord. */
const MAX_LIGNES = 10;

let bulle = null;

function assurerBulle() {
  if (bulle) return bulle;
  bulle = el('div', { class: 'bulle', hidden: true });
  document.body.append(bulle);
  return bulle;
}

const signe = (v) => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v)));
const entier = (v) => Math.floor(v).toLocaleString('fr-FR');

/**
 * Bloc des degats de l'arme, calcules avec les statistiques du build.
 * @param {any} item
 * @param {Record<string, number>|null} stats
 */
function blocArmeCalculee(item, stats) {
  if (!stats || item.slot !== 'arme') return null;
  const attaque = weaponAttack(item);
  if (!attaque) return null;

  const detail = computeSpellDetail(attaque, stats);
  return el('div', { class: 'bulle-arme-calc' },
    el('div', { class: 'titre-arme-calc', text: 'Avec vos caracteristiques' }),
    detail.parLigne.map((ligne) =>
      ligneArme(ligne, `${entier(ligne.normalMin)}–${entier(ligne.normalMax)}`
        + ` (${entier(ligne.critMin)}–${entier(ligne.critMax)} crit)`)),
    el('div', { class: 'bulle-arme-moyenne',
      text: `Moyenne ${entier(detail.average)} par coup — critique ${Math.round(detail.critRate * 100)} %`
        + (attaque.repeats > 1 ? ` — ×${attaque.repeats} par tour` : '') }),
  );
}

/** Remplit l'infobulle avec le detail d'une piece. */
function garnir(noeud, item, contexte = {}) {
  const lignes = Object.entries(item.stats ?? {})
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, MAX_LIGNES);

  const restant = Object.values(item.stats ?? {}).filter((v) => v !== 0).length - lignes.length;

  const enfants = [
    el('div', { class: 'bulle-tete' },
      item.img ? el('img', { src: item.img, alt: '', decoding: 'async' }) : null,
      el('div', {},
        el('div', { class: 'bulle-nom', text: item.fr }),
        el('div', { class: 'bulle-sous', text: `${item.typeFr} — niveau ${item.level}` }))),

    item.criteria
      ? el('div', { class: 'bulle-condition', text: `Condition : ${libelleCriteria(item.criteria)}` })
      : null,

    Array.isArray(item.weapon) && item.weapon.length > 0
      ? el('div', { class: 'bulle-arme' },
          resumeArme(item)
            ? el('div', { class: 'bulle-arme-cout', text: resumeArme(item) })
            : null,
          el('div', { class: 'bulle-arme-lignes' },
            item.weapon.map((ligne) => ligneArme(ligne, `${ligne.min}–${ligne.max}`))))
      : null,

    blocArmeCalculee(item, contexte.stats ?? null),

    lignes.length === 0
      ? el('div', { class: 'bulle-vide', text: 'Aucune statistique' })
      : el('dl', { class: 'bulle-stats' }, lignes.flatMap(([cle, valeur]) => {
          const icone = iconeStat(cle);
          return [
            el('dt', {},
              icone ? el('img', { src: icone, alt: '', decoding: 'async' }) : null,
              el('span', { text: STAT_LABELS[cle] ?? cle })),
            el('dd', { class: valeur > 0 ? 'pos' : 'neg', text: signe(valeur) }),
          ];
        })),

    restant > 0 ? el('div', { class: 'bulle-reste', text: `+ ${restant} autres` }) : null,

    passifDe(item.id)
      ? el('div', { class: 'bulle-passif' },
          el('div', { class: 'titre-passif', text: '✨ Passif combat' }),
          ...Object.entries(passifDe(item.id).stats).map(([cle, valeur]) =>
            el('div', { text: `+${valeur} ${STAT_LABELS[cle] ?? cle}` })))
      : null,
    el('div', { class: 'bulle-aide', text: 'Cliquez pour la fiche complete' }),
  ];

  // Un enfant null deviendrait le texte "null" : il est ecarte.
  noeud.replaceChildren(...enfants.filter(Boolean));
}

/** Place l'infobulle pres du pointeur, sans sortir de la fenetre. */
function placer(noeud, x, y) {
  const { width, height } = noeud.getBoundingClientRect();
  const maxX = window.innerWidth - width - 8;
  const maxY = window.innerHeight - height - 8;

  // A droite du curseur par defaut, a gauche si la place manque.
  const gauche = x + ECART > maxX ? Math.max(8, x - width - ECART) : x + ECART;
  const haut = Math.min(Math.max(8, y + ECART), Math.max(8, maxY));

  noeud.style.left = `${gauche}px`;
  noeud.style.top = `${haut}px`;
}

/**
 * Montre l'infobulle d'une piece.
 * @param {any} item
 * @param {number} x
 * @param {number} y
 */
export function montrerBulle(item, x, y, contexte = {}) {
  if (!item) return;
  const noeud = assurerBulle();
  garnir(noeud, item, contexte);
  noeud.hidden = false;
  placer(noeud, x, y);
}

/** Deplace l'infobulle deja visible. */
export function suivreBulle(x, y) {
  if (bulle && !bulle.hidden) placer(bulle, x, y);
}

/** Cache l'infobulle. */
export function cacherBulle() {
  if (bulle) bulle.hidden = true;
}
