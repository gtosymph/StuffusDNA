/**
 * Overlay de choix des sorts.
 *
 * Chaque sort peut exister en plusieurs variantes, une par palier de niveau.
 * L'overlay les propose du plus bas au plus haut, avec leurs degats de base.
 */
import { el } from './render.mjs';
import { COULEUR_ELEMENT, iconeElement } from './icons.mjs';
import { versSortMoteur } from './spells-data.mjs';
import { piegerFocus } from './focus-piege.mjs';

/** Elements proposes dans le filtre. */
const ELEMENTS_FILTRE = ['neutre', 'terre', 'feu', 'eau', 'air'];

let racine = null;

/** Libere le clavier quand l'overlay se ferme. */
let libererFocus = null;

function assurerRacine() {
  if (racine) return racine;
  racine = el('div', { class: 'picker-fond', hidden: true, onClick: (ev) => {
    if (ev.target === racine) fermerPicker();
  } });
  document.body.append(racine);
  return racine;
}

/** Ferme l'overlay. */
export function fermerPicker() {
  if (!racine) return;
  racine.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/** Construit la pastille d'une variante. */
function pastilleVariante(sort, variante, choisi, onPick) {
  const couleur = COULEUR_ELEMENT[variante.element] ?? '#8d97a9';
  return el('button', {
    class: `variante ${choisi ? 'prise' : ''}`.trim(),
    type: 'button',
    style: `--teinte:${couleur}`,
    title: `Niveau ${variante.level} — ${variante.element}\n`
      + `${variante.min} à ${variante.max} (critique ${variante.critMin} à ${variante.critMax})\n`
      + `${variante.critRate} % de critique propre`,
    onClick: () => onPick(sort, variante),
  },
    el('span', { class: 'niv', text: `niv ${variante.level}` }),
    el('span', { class: 'plage', text: `${variante.min}–${variante.max}` }),
    variante.critRate > 0 ? el('span', { class: 'cc', text: `${variante.critRate}%` }) : null,
  );
}

/**
 * Ouvre l'overlay de choix.
 *
 * @param {object} entree
 * @param {any} entree.classe Classe dont les sorts sont proposes.
 * @param {number} entree.niveau Niveau du personnage.
 * @param {Set<number>} entree.pris Identifiants deja retenus.
 * @param {(sort: any) => void} entree.onAjouter
 * @param {(id: number) => void} entree.onEnlever
 */
export function ouvrirPicker({ classe, niveau, pris, onAjouter, onAjouterPlusieurs, onEnlever }) {
  const fond = assurerRacine();
  const sorts = classe?.spells ?? [];

  const etat = { recherche: '', masquerHauts: true, aoe: false, elements: new Set() };

  /** Version moteur d'une entree, sur sa variante la plus haute. */
  function sortMoteur(entree) {
    const variante = entree.variantes[entree.variantes.length - 1];
    return versSortMoteur({ ...entree.sort, ...variante, critRate: variante.critRate });
  }

  /** Ajoute d'un coup toutes les entrees pas encore retenues. */
  function ajouterEnMasse(entrees) {
    const nouveaux = entrees.filter((e) => !pris.has(e.sort.id)).map(sortMoteur);
    if (nouveaux.length === 0) return;
    for (const s of nouveaux) pris.add(s.id);
    if (onAjouterPlusieurs) onAjouterPlusieurs(nouveaux);
    else for (const s of nouveaux) onAjouter(s);
    dessiner();
  }

  /** Carte d'un sort : identite, marques telefrag et pastilles de paliers. */
  function carteSort(sort, variantes) {
    const choisi = pris.has(sort.id);
    return el('div', { class: `carte-sort ${choisi ? 'prise' : ''}`.trim() },
      el('div', { class: 'tete-sort' },
        sort.icon ? el('img', { src: sort.icon, alt: '', decoding: 'async' }) : null,
        el('div', { class: 'ident' },
          el('div', { class: 'nom', text: sort.fr }),
          el('div', { class: 'meta', text: `${sort.apCost} PA · portée ${sort.minRange}–${sort.range}`
            + (sort.maxCast > 0 ? ` · ${sort.maxCast}/tour` : '')
            + (sort.zone ? ` · ${sort.zone}` : '') })),
        sort.generatesTelefrag ? el('span', { class: 'marque-tf', text: 'TF+' }) : null,
        sort.consumesTelefrag ? el('span', { class: 'marque-tf consomme', text: 'TF−' }) : null,
        choisi
          ? el('button', { class: 'mini', type: 'button', text: '×', title: 'Enlever ce sort',
              onClick: () => { pris.delete(sort.id); onEnlever(sort.id); dessiner(); } })
          : null),

      el('div', { class: 'variantes' },
        variantes.map((v) => pastilleVariante(sort, v, choisi, (s, variante) => {
          pris.add(s.id);
          onAjouter(versSortMoteur({ ...s, ...variante, critRate: variante.critRate }));
          dessiner();
        }))),
    );
  }

  /** Vrai si l'entree passe les filtres de zone et d'element. */
  function passeFiltres(entree) {
    if (etat.aoe && !entree.sort.zone) return false;
    if (etat.elements.size === 0) return true;
    return entree.variantes.some((v) => (v.lines ?? [])
      .some((l) => etat.elements.has(l.element)));
  }

  function dessiner() {
    const terme = etat.recherche.trim().toLowerCase();

    const entrees = sorts
      .map((s) => ({
        sort: s,
        // Une variante au-dessus du niveau du personnage reste inaccessible.
        variantes: (s.variants ?? []).filter((v) => !etat.masquerHauts || v.level <= niveau),
      }))
      .filter((e) => e.variantes.length > 0);

    // Les sorts se presentent par couple de variantes : deux sorts du meme
    // groupe s'excluent en jeu, le joueur choisit l'un ou l'autre.
    const groupes = new Map();
    for (const entree of entrees) {
      const cle = entree.sort.exclusiveGroup ?? `seul:${entree.sort.id}`;
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(entree);
    }

    const couples = [...groupes.values()]
      // Le terme de recherche garde le couple entier des qu'un membre repond.
      .filter((membres) => !terme || membres.some((m) => m.sort.fr.toLowerCase().includes(terme)))
      // Les filtres de zone et d'element gardent aussi le couple entier.
      .filter((membres) => membres.some(passeFiltres))
      .map((membres) => membres.sort((a, b) => a.variantes[0].level - b.variantes[0].level))
      .sort((a, b) => a[0].variantes[0].level - b[0].variantes[0].level
        || a[0].sort.fr.localeCompare(b[0].sort.fr, 'fr'));

    const nbSortsVisibles = couples.reduce((n, c) => n + c.length, 0);
    // Les ajouts en masse : tout le catalogue, ou les membres qui passent
    // les filtres dans les couples visibles.
    const visibles = couples.flat().filter(passeFiltres);

    const liste = couples.map((membres) => el('div', {
      class: `couple-sorts ${membres.length > 1 ? 'duo' : ''}`.trim() },
      membres.flatMap((m, rang) => [
        rang > 0 ? el('div', { class: 'lien-couple', text: 'ou' }) : null,
        carteSort(m.sort, m.variantes),
      ])));

    fond.replaceChildren(el('div', { class: 'picker', role: 'dialog', 'aria-label': 'Choix des sorts' },
      el('div', { class: 'picker-tete' },
        el('div', {},
          el('div', { class: 'picker-titre', text: `Sorts — ${classe?.fr ?? ''}` }),
          el('div', { class: 'picker-sous', text: `${nbSortsVisibles} sorts · ${pris.size} retenus` })),
        el('button', { class: 'mini', type: 'button', text: '×', title: 'Fermer', onClick: fermerPicker })),

      el('div', { class: 'picker-filtres' },
        el('input', { type: 'search', placeholder: 'Rechercher un sort…', value: etat.recherche,
          onInput: (ev) => { etat.recherche = ev.target.value; dessiner(); } }),
        el('label', { class: 'option' },
          el('input', { type: 'checkbox', ...(etat.masquerHauts ? { checked: true } : {}),
            onChange: (ev) => { etat.masquerHauts = ev.target.checked; dessiner(); } }),
          el('span', { text: `Niveau ${niveau} maximum` })),
        el('label', { class: 'option' },
          el('input', { type: 'checkbox', ...(etat.aoe ? { checked: true } : {}),
            onChange: (ev) => { etat.aoe = ev.target.checked; dessiner(); } }),
          el('span', { text: 'Sorts de zone (AOE)' }))),

      el('div', { class: 'picker-filtres picker-elements' },
        ELEMENTS_FILTRE.map((element) => {
          const actif = etat.elements.has(element);
          const icone = iconeElement(element);
          return el('button', {
            class: `chip-element ${actif ? 'actif' : ''}`.trim(),
            type: 'button',
            'aria-pressed': String(actif),
            style: `--teinte:${COULEUR_ELEMENT[element] ?? '#8d97a9'}`,
            title: actif ? `Ne plus filtrer sur ${element}` : `Garder les sorts ${element}`,
            onClick: () => {
              if (actif) etat.elements.delete(element);
              else etat.elements.add(element);
              dessiner();
            },
          },
            icone ? el('img', { src: icone, alt: '', decoding: 'async' }) : null,
            el('span', { text: element }));
        }),
        el('span', { class: 'espace' }),
        el('button', { class: 'mini large', type: 'button', text: 'Ajouter les visibles',
          title: 'Ajoute tous les sorts qui passent les filtrès, sur leur variante la plus haute',
          onClick: () => ajouterEnMasse(visibles) }),
        el('button', { class: 'mini large', type: 'button', text: 'Ajouter tout',
          title: 'Ajoute tous les sorts de la classe, sur leur variante la plus haute',
          onClick: () => ajouterEnMasse(entrees) })),

      el('div', { class: 'picker-liste' }, liste.length > 0
        ? liste
        : el('p', { class: 'note', text: 'Aucun sort ne correspond.' })),
    ));
  }

  dessiner();
  fond.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(fond);
}
