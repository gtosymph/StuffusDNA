/**
 * Fiche detaillee d'un equipement.
 * Elle s'ouvre au clic ou au toucher, sur une piece du catalogue ou du build.
 */
import { el, ligneArme, resumeArme } from './render.mjs';
import { iconeStat } from './icons.mjs';
import { computeSpellDetail, weaponAttack } from '../src/engine/damage.mjs';
import { STAT_LABELS } from '../src/data/stats.mjs';
import { passifDe } from '../src/data/passives-defaults.mjs';
import { libelleCriteria } from '../src/data/criteria.mjs';
import { piegerFocus } from './focus-piege.mjs';

/** Racine de la fiche, creee une seule fois. */
let racine = null;

/** Libere le clavier quand la fiche se ferme. */
let libererFocus = null;

const nombre = (v) => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v)));
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
  return el('div', { class: 'fiche-arme calc' },
    el('div', { class: 'titre-arme', text: 'Avec vos caracteristiques' }),
    el('div', { class: 'lignes-arme' },
      detail.parLigne.map((ligne) =>
        ligneArme(ligne, `${entier(ligne.normalMin)}–${entier(ligne.normalMax)}`
          + ` (${entier(ligne.critMin)}–${entier(ligne.critMax)} crit)`))),
    el('div', { class: 'fiche-note',
      text: `Moyenne ${entier(detail.average)} par coup — critique ${Math.round(detail.critRate * 100)} %`
        + (attaque.repeats > 1 ? ` — ×${attaque.repeats} par tour` : '') }),
  );
}

function assurerRacine() {
  if (racine) return racine;

  racine = el('div', { class: 'fiche-fond', hidden: true, onClick: (ev) => {
    // Un clic hors de la fiche la referme.
    if (ev.target === racine) fermerFiche();
  } });
  document.body.append(racine);
  return racine;
}

/**
 * Bloc du passif en combat, pour les Dofus et objets legendaires qui en ont un.
 * @param {any} item
 */
function blocPassif(item) {
  const passif = passifDe(item.id);
  if (!passif) return null;

  return el('div', { class: 'fiche-passif' },
    el('div', { class: 'titre-passif', text: '✨ Passif combat' }),
    ...Object.entries(passif.stats).map(([cle, valeur]) => {
      const icone = iconeStat(cle);
      return el('div', { class: 'ligne-passif' },
        icone ? el('img', { src: icone, alt: '', decoding: 'async' }) : null,
        el('span', { text: `+${valeur} ${STAT_LABELS[cle] ?? cle}` }));
    }),
  );
}

/** Ferme la fiche. */
export function fermerFiche() {
  if (!racine) return;
  racine.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/**
 * Ouvre la fiche d'un item.
 * @param {any} item
 * @param {{onEquip?: () => void, onRemove?: () => void, onBan?: () => void,
 *   banni?: boolean, onPosseder?: () => void, possedee?: boolean}} [actions]
 */
export function ouvrirFiche(item, actions = {}) {
  if (!item) return;
  const fond = assurerRacine();

  const lignes = Object.entries(item.stats ?? {})
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  fond.replaceChildren(el('div', { class: 'fiche', role: 'dialog', 'aria-label': item.fr },
    el('div', { class: 'fiche-tete' },
      item.img ? el('img', { src: item.img, alt: '', decoding: 'async' }) : null,
      el('div', {},
        el('div', { class: 'fiche-nom', text: item.fr }),
        el('div', { class: 'fiche-sous', text: `${item.typeFr} — niveau ${item.level}` })),
      el('button', { class: 'mini', type: 'button', text: '×', title: 'Fermer',
        onClick: fermerFiche })),

    item.criteria
      ? el('div', { class: 'fiche-condition' },
          el('span', { class: 'cle', text: 'Condition' }),
          el('code', { text: libelleCriteria(item.criteria) }))
      : null,

    Array.isArray(item.weapon) && item.weapon.length > 0
      ? el('div', { class: 'fiche-arme' },
          el('div', { class: 'titre-arme', text: `Degats de l'arme`
            + `${resumeArme(item) ? ` — ${resumeArme(item)}` : ''}` }),
          el('div', { class: 'lignes-arme' },
            item.weapon.map((ligne) => ligneArme(ligne, `${ligne.min}–${ligne.max}`))))
      : null,

    blocArmeCalculee(item, actions.stats ?? null),

    item.twoHanded
      ? el('div', { class: 'fiche-note', text: 'Arme a deux mains : elle interdit le bouclier.' })
      : null,

    blocPassif(item),

    lignes.length === 0
      ? el('p', { class: 'note', text: 'Cette piece ne porte aucune statistique.' })
      : el('dl', { class: 'fiche-stats' }, lignes.flatMap(([cle, valeur]) => {
          const icone = iconeStat(cle);
          return [
            el('dt', {},
              icone ? el('img', { src: icone, alt: '', decoding: 'async' }) : null,
              el('span', { text: STAT_LABELS[cle] ?? cle })),
            el('dd', { class: valeur > 0 ? 'pos' : 'neg', text: nombre(valeur) }),
          ];
        })),

    el('div', { class: 'fiche-actions' },
      actions.onEquip
        ? el('button', { class: 'primaire', type: 'button', text: 'Equiper',
            onClick: () => { actions.onEquip(); fermerFiche(); } })
        : null,
      actions.onRemove
        ? el('button', { class: 'danger', type: 'button', text: 'Retirer',
            onClick: () => { actions.onRemove(); fermerFiche(); } })
        : null,
      actions.onLock
        ? el('button', {
            type: 'button',
            text: actions.verrouille ? 'Ne plus garder' : 'Toujours garder',
            title: actions.verrouille
              ? 'Le solveur pourra de nouveau remplacer cette piece'
              : 'Le solveur garde cette piece dans chaque build',
            onClick: () => { actions.onLock(); fermerFiche(); } })
        : null,
      actions.onBan
        ? el('button', {
            class: actions.banni ? '' : 'danger', type: 'button',
            text: actions.banni ? 'Autoriser' : 'Interdire',
            title: actions.banni
              ? 'Rendre cette piece au solveur'
              : 'Le solveur ne proposera plus cette piece',
            onClick: () => { actions.onBan(); fermerFiche(); } })
        : null,
      // L'inventaire change ce qu'une proposition coute : une piece que vous
      // avez deja ne se compte pas parmi les pieces a acheter.
      actions.onPosseder
        ? el('button', {
            class: actions.possedee ? 'possede' : '', type: 'button',
            text: actions.possedee ? 'Je l\'ai deja ✓' : 'Je l\'ai deja',
            title: actions.possedee
              ? 'Enlever cette piece de votre inventaire'
              : 'Cette piece dort dans votre banque : le solveur ne la comptera\n'
                + 'plus parmi les pieces a acheter.',
            onClick: () => { actions.onPosseder(); fermerFiche(); } })
        : null,
      el('button', { type: 'button', text: 'Fermer', onClick: fermerFiche }),
    ),
  ));

  fond.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(fond);
}
