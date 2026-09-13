/**
 * Rendu des panneaux. Chaque fonction remplit un noeud a partir de l'etat.
 */
import { SLOTS } from '../src/data/slots.mjs';
import { conditionValue } from '../src/solver/condition-value.mjs';
import { LIBELLE_CASE } from './layout.mjs';
import { iconeStat } from './icons.mjs';
import { cacherBulle, montrerBulle, suivreBulle } from './hover-card.mjs';
import { COULEUR_ELEMENT, iconeElement } from './icons.mjs';
import { porteeMax } from '../src/solver/genome.mjs';

/** Nombre de cases montrees dans le catalogue. */
const MAX_CASES = 300;

/** Cree un element avec ses attributs et ses enfants. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

const fill = (root, ...children) => root.replaceChildren(...children.flat().filter(Boolean));
const nombre = (v) => Math.round(v).toLocaleString('fr-FR');
/** Troncature vers le bas, comme les moyennes du jeu. */
const entier = (v) => Math.floor(v).toLocaleString('fr-FR');

/** Classe de couleur selon le signe d'une valeur. */
function ton(valeur) {
  if (valeur > 0) return 'pos';
  if (valeur < 0) return 'neg';
  return 'nul';
}

/**
 * Remplit un panneau de paires libelle / valeur.
 * @param {HTMLElement} root
 * @param {readonly (readonly [string, string])[]} liste
 * @param {Record<string, number> | null} stats
 */
export function renderPaires(root, liste, stats, options = {}) {
  const { suivies = new Set(), onPick = null } = options;

  if (!stats) {
    fill(root, el('dt', { text: '—' }), el('dd', { class: 'nul', text: '—' }));
    return;
  }

  fill(root, liste.flatMap(([cle, libelle]) => {
    const valeur = stats[cle] ?? 0;
    const icone = iconeStat(cle);
    const suivie = suivies.has(cle);

    const nom = el('dt', {
      class: `${onPick ? 'cliquable' : ''} ${suivie ? 'suivie' : ''}`.trim(),
      title: onPick
        ? (suivie ? `${libelle} — deja dans les conditions` : `${libelle} — cliquez pour en faire une condition`)
        : libelle,
      ...(onPick ? { role: 'button', tabindex: '0' } : {}),
      ...(onPick ? { onClick: () => onPick(cle) } : {}),
      ...(onPick ? { onKeydown: (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(cle); }
      } } : {}),
    },
      icone ? el('img', { src: icone, alt: '', decoding: 'async' }) : null,
      el('span', { text: libelle }));

    return [nom, el('dd', { class: ton(valeur), text: nombre(valeur) })];
  }));
}

/** Types de la case monture, proposes en onglets separes. */
const TYPES_MONTURE = Object.freeze(['Dragodinde', 'Volkorne', 'Muldo', 'Familier', 'Montilier']);

/** Types de la case artefact, proposes en onglets separes. */
const TYPES_ARTEFACT = Object.freeze([
  { type: 'Dofus', label: 'Dofus' },
  { type: 'Trophée', label: 'Trophées' },
  { type: 'Prysmaradite', label: 'Prysmaradites' },
]);

/**
 * Remplit les onglets de filtre du catalogue.
 * Les cases monture et artefact s'ouvrent en plusieurs onglets, un par type.
 */
export function renderOnglets(root, actif, onPick, typeActif = null) {
  const entrees = [{ key: null, type: null, label: 'Tous' }];
  for (const slot of SLOTS) {
    if (slot.key === 'monture') {
      for (const type of TYPES_MONTURE) entrees.push({ key: slot.key, type, label: type });
    } else if (slot.key === 'artefact') {
      for (const e of TYPES_ARTEFACT) entrees.push({ key: slot.key, type: e.type, label: e.label });
    } else {
      entrees.push({ key: slot.key, type: null, label: slot.label });
    }
  }

  fill(root, entrees.map((e) => el('button', {
    type: 'button',
    'aria-pressed': String(actif === e.key && (typeActif ?? null) === e.type),
    text: e.label,
    onClick: () => onPick(e.key, e.type),
  })));
}

/**
 * Chargement des icones de la grille.
 *
 * Ni le chargement paresseux natif ni IntersectionObserver ne se declenchent
 * dans ce cadre defilant. Le calcul de position ci-dessous ne depend d'aucun
 * de ces mecanismes : il compare simplement les rectangles.
 */
const MARGE_CHARGEMENT = 300;

/** Charge les icones proches du cadre visible. */
function chargerVisibles(grille) {
  const cadre = grille.getBoundingClientRect();
  const haut = cadre.top - MARGE_CHARGEMENT;
  const bas = cadre.bottom + MARGE_CHARGEMENT;

  for (const img of grille.querySelectorAll('img[data-src]')) {
    const r = img.getBoundingClientRect();
    if (r.bottom < haut || r.top > bas) continue;
    img.src = img.dataset.src;
    delete img.dataset.src;
  }
}

/** Verification periodique, tant qu'il reste des icones a charger. */
let veille = null;

/**
 * Branche le chargement au defilement, avec une veille de securite.
 *
 * Le defilement programme ne declenche pas toujours l'evenement "scroll".
 * La veille comble ce manque : elle compare les positions a intervalle court
 * et s'arrete des que toutes les icones sont chargees.
 */
function suivreDefilement(grille) {
  let planifie = false;
  const relancer = () => {
    if (planifie) return;
    planifie = true;
    requestAnimationFrame(() => { planifie = false; chargerVisibles(grille); });
  };

  if (!grille.dataset.suivi) {
    grille.dataset.suivi = '1';
    grille.addEventListener('scroll', relancer, { passive: true });
    window.addEventListener('scroll', relancer, { passive: true });
    window.addEventListener('resize', relancer, { passive: true });
  }

  clearInterval(veille);
  veille = setInterval(() => {
    if (!grille.isConnected || grille.querySelector('img[data-src]') === null) {
      clearInterval(veille);
      veille = null;
      return;
    }
    chargerVisibles(grille);
  }, 400);
}

/** Construit la vignette d'un item. L'icone se charge a l'approche. */
function vignette(item, extra = '') {
  return el('button', {
    class: `case-item ${extra}`.trim(),
    type: 'button',
    title: `${item.fr} — niveau ${item.level}${item.criteria ? `\nCondition : ${item.criteria}` : ''}`,
  }, item.img
    ? el('img', { 'data-src': item.img, alt: item.fr, decoding: 'async' })
    : el('span', { text: item.fr.slice(0, 2) }));
}

/** Remplit la grille du catalogue. */
export function renderCatalogue(root, compteur, items, onPick, bannis = new Set(), possedees = new Set()) {
  const montres = items.slice(0, MAX_CASES);
  fill(root, montres.map((item) => {
    const marques = [
      bannis.has(item.id) ? 'bannie' : '',
      possedees.has(item.id) ? 'possedee' : '',
    ].filter(Boolean).join(' ');
    const noeud = vignette(item, marques);
    if (bannis.has(item.id)) noeud.title += '\nBannie : le solveur ne la propose plus.';
    // Le titre natif laisserait sa place : l'infobulle le remplace au survol.
    noeud.removeAttribute('title');
    noeud.addEventListener('click', () => { cacherBulle(); onPick(item); });
    noeud.addEventListener('mouseenter', (ev) => montrerBulle(item, ev.clientX, ev.clientY));
    noeud.addEventListener('mousemove', (ev) => suivreBulle(ev.clientX, ev.clientY));
    noeud.addEventListener('mouseleave', cacherBulle);
    return noeud;
  }));

  suivreDefilement(root);
  // Deux passes : la seconde rattrape la mise en page qui suit l'insertion.
  chargerVisibles(root);
  requestAnimationFrame(() => chargerVisibles(root));
  compteur.textContent = items.length > MAX_CASES
    ? `${nombre(items.length)} pieces — ${MAX_CASES} montrees`
    : `${nombre(items.length)} piece${items.length > 1 ? 's' : ''}`;
}

/**
 * Remplit la liste des pieces bannies.
 * @param {HTMLElement} root
 * Le meme rendu sert aux pieces que le joueur possede : dans les deux cas,
 * une liste de pieces dont un clic retire l'etiquette.
 *
 * @param {any[]} items Pieces bannies, dans l'ordre du catalogue.
 * @param {(item: any) => void} onUnban
 * @param {{vide?: string, aide?: string}} [textes] Mots propres a la liste.
 */
export function renderBannis(root, items, onUnban, textes = {}) {
  const {
    vide = 'Aucune piece bannie. Ouvrez la fiche d\'une piece pour la bannir.',
    aide = 'cliquez pour autoriser de nouveau',
  } = textes;

  if (items.length === 0) {
    fill(root, el('p', { class: 'note', text: vide }));
    return;
  }

  fill(root, items.map((item) => el('button', {
    class: 'puce-bannie', type: 'button',
    title: `${item.fr} — ${aide}`,
    onClick: () => onUnban(item),
  },
    item.img ? el('img', { src: item.img, alt: '', decoding: 'async' }) : null,
    el('span', { text: item.fr }),
    el('span', { class: 'croix', text: '×' }),
  )));
}

/**
 * Remplit une colonne de cases d'equipement.
 * @param {HTMLElement} root
 * @param {readonly string[]} cles
 * @param {Map<string, any>} equipped
 * @param {Set<string>} posees Cases choisies a la main.
 * @param {(cle: string, item: any) => void} onPick Ouvre la fiche de la piece.
 */
export function renderCases(root, cles, equipped, posees, onPick, verrous = new Set(), stats = null) {
  fill(root, cles.map((cle) => {
    const item = equipped.get(cle);
    const libelle = LIBELLE_CASE[cle] ?? cle;

    if (!item) {
      return el('button', { class: 'case-slot vide', type: 'button', title: `${libelle} — libre`, disabled: true },
        el('span', { class: 'note', text: '' }));
    }

    const marque = verrous.has(item.id) ? 'verrou' : (posees.has(cle) ? 'pose' : 'solveur');
    return el('button', {
      class: `case-slot ${marque}`, type: 'button',
      onClick: () => onPick(cle, item),
      // Le survol montre l'infobulle ; le clic ouvre la fiche complete.
      // Les stats du build permettent le calcul des degats de l'arme portee.
      onMouseenter: (ev) => montrerBulle(item, ev.clientX, ev.clientY, { stats }),
      onMousemove: (ev) => suivreBulle(ev.clientX, ev.clientY),
      onMouseleave: cacherBulle,
      onFocus: cacherBulle,
    }, item.img
      ? el('img', { src: item.img, alt: item.fr, decoding: 'async' })
      : el('span', { text: item.fr.slice(0, 2) }));
  }));
}

/** Remplit le tableau des conditions. */
export function renderConditions(root, conditions, stats, libelles, options) {
  const { onChange, onRemove, degats = 0 } = options;
  fill(root, conditions.map((condition, index) => {
    // Les degats ne vivent pas dans les statistiques : une condition qui
    // porte sur eux lirait zero sans cette valeur, et paraitrait manquee
    // alors que le build frappe assez fort.
    const valeur = stats ? conditionValue(condition.stat, stats, degats) : null;
    const manque = valeur == null ? null : Math.max(0, condition.target - valeur);
    const tenue = manque === 0;
    const icone = iconeStat(condition.stat);

    // La barre montre d'un coup d'oeil la part de l'objectif deja atteinte.
    const part = valeur == null || condition.target <= 0
      ? 1
      : Math.min(1, Math.max(0, valeur / condition.target));

    // Le place-tenant reste court : dans une colonne etroite de telephone,
    // « Maximum » se coupait en plein mot. L'infobulle porte le nom entier.
    const champ = (cle, titre, court = titre) => el('input', {
      type: 'number', value: String(condition[cle] ?? ''), title: titre, placeholder: court,
      onChange: (ev) => onChange(index, cle, Number(ev.target.value)),
    });

    return el('tr', { class: valeur == null ? '' : (tenue ? 'tenue' : 'manquee') },
      el('td', {},
        el('div', { class: 'nom-stat', title: libelles[condition.stat] ?? condition.stat },
          icone ? el('img', { src: icone, alt: '', decoding: 'async' }) : null,
          el('span', { text: libelles[condition.stat] ?? condition.stat })),
        el('div', { class: `barre-ecart ${tenue ? '' : 'manque'}`.trim() },
          el('span', { style: `width:${Math.round(part * 100)}%` }))),
      el('td', {}, champ('target', 'Objectif')),
      el('td', {}, champ('weight', 'Poids')),
      el('td', {}, champ('max', 'Maximum', 'Max')),
      el('td', {}, el('button', {
        class: 'mini', type: 'button', 'aria-pressed': String(Boolean(condition.absolute)),
        title: 'Maximum absolu : le solveur ne le franchit pas', text: 'A',
        onClick: () => onChange(index, 'absolute', !condition.absolute),
      })),
      el('td', { class: 'etat' }, valeur == null
        ? el('span', { class: 'nul', text: '—' })
        : el('span', {
            style: `color:${tenue ? 'var(--positif)' : 'var(--alerte)'}`,
            text: tenue ? nombre(valeur) : `${nombre(valeur)} −${nombre(manque)}`,
          })),
      el('td', {}, el('button', { class: 'mini', type: 'button', text: '×',
        title: 'Enlever', onClick: () => onRemove(index) })),
    );
  }));
}

/**
 * Remplit la grille des sorts retenus, sous forme de pastilles.
 * @param {HTMLElement} root
 * @param {any[]} sorts
 * @param {(index: number) => void} onRemove
 */
export function renderPuceSorts(root, sorts, onRemove) {
  fill(root, sorts.map((sort, index) => el('button', {
    class: 'puce-sort', type: 'button', title: `${sort.name} — cliquez pour enlever`,
    onClick: () => onRemove(index),
  },
    sort.icon ? el('img', { src: sort.icon, alt: '', decoding: 'async' }) : null,
    el('span', { text: sort.name }),
    el('span', { class: 'pa', text: `${sort.apCost} PA` }),
  )));
}

/**
 * Zone de detail d'un sort : plages, moyennes, taux critique.
 * @param {any} detail Resultat de computeSpellDetail.
 */
function detailSort(detail) {
  const taux = Math.round((detail.critRate ?? 0) * 100);
  const plage = (a, b) => (a === b ? nombre(a) : `${nombre(a)} – ${nombre(b)}`);

  return el('div', { class: 'sort-detail' },
    el('div', { class: 'sort-plages' },
      el('span', { class: 'cle', text: 'Normal' }),
      el('span', { class: 'val', text: plage(detail.normalMin, detail.normalMax) }),
      el('span', { class: 'cle crit', text: `Critique ${taux} %` }),
      el('span', { class: 'val crit', text: plage(detail.critMin, detail.critMax) }),
    ),
    // Plusieurs lignes : chacune montre son apport, element par element.
    (detail.parLigne?.length ?? 0) > 1
      ? el('div', { class: 'lignes-arme', title: 'Apport de chaque ligne, hors critique' },
          detail.parLigne.map((ligne) => ligneArme(ligne, plage(ligne.normalMin, ligne.normalMax))))
      : null,
    el('div', { class: 'sort-moyennes' },
      el('span', { title: 'Moyenne par coup, taux critique compris' },
        el('b', { text: entier(detail.average) }), ' par coup'),
      detail.perAp
        ? el('span', { title: 'Moyenne par point d\'action' },
            el('b', { text: entier(detail.perAp) }), ' par PA')
        : null,
      detail.comptes > 1
        ? el('span', { title: `${detail.comptes} lancer(s) comptes dans le score.\n`
            + `Le tour en permet ${detail.casts}.` },
            el('b', { text: entier(detail.total) }), ` au total (×${detail.comptes})`)
        : null,
    ),
  );
}

/**
 * Pastille d'une ligne de degats d'arme, avec l'icone de son element.
 * @param {{element: string, steal?: boolean}} ligne
 * @param {string} texte
 */
/**
 * Resume le cout et la cadence d'une arme, pour un titre ou une infobulle.
 *
 * Une arme ne se juge pas a ses seuls degats : ce qu'elle coute en PA, la
 * distance a laquelle elle atteint et le nombre de fois qu'elle frappe dans le
 * tour decident de sa place dans un build. Ces chiffres se lisent donc partout
 * ou l'arme se montre.
 *
 * @param {any} item Arme du catalogue.
 * @returns {string} Resume vide quand l'arme ne declare aucun chiffre.
 */
export function resumeArme(item) {
  const parties = [];

  const pa = Number(item?.apCost);
  if (Number.isFinite(pa) && pa > 0) parties.push(`${pa} PA`);

  // La portee dit d'un coup d'oeil si l'arme se joue au contact ou de loin.
  const portee = porteeMax(item);
  if (Number.isFinite(portee) && portee > 0) {
    parties.push(`portee ${portee} case${portee > 1 ? 's' : ''}`);
  }

  const lancers = Number(item?.usesPerTurn);
  if (Number.isFinite(lancers) && lancers > 0) {
    parties.push(`${lancers} lancer${lancers > 1 ? 's' : ''} par tour`);
  }

  const crit = Number(item?.critProbability);
  if (Number.isFinite(crit) && crit > 0) {
    parties.push(`${crit} % critique (+${item.critBonus ?? 0})`);
  }

  return parties.join(' · ');
}

export function ligneArme(ligne, texte) {
  const icone = iconeElement(ligne.element);
  return el('span', {
    class: 'ligne-arme',
    style: `--teinte:${COULEUR_ELEMENT[ligne.element] ?? '#8d97a9'}`,
    title: `${ligne.element}${ligne.steal ? ' — vol de vie' : ''}`,
  },
    icone ? el('img', { src: icone, alt: ligne.element, decoding: 'async' }) : null,
    el('span', { text: `${texte}${ligne.steal ? ' (vol)' : ''}` }));
}

/**
 * Carte de l'attaque de l'arme equipee, comptee dans les degats totaux.
 * @param {HTMLElement} root
 * @param {any|null} attaque Sort equivalent de l'arme, ou null.
 * @param {any|null} detail Resultat de computeSpellDetail.
 */
export function renderArme(root, attaque, detail) {
  if (!attaque) {
    fill(root);
    return;
  }

  fill(root, el('div', { class: 'sort arme' },
    el('div', { class: 'sort-tete' },
      attaque.icon ? el('img', { class: 'icone-sort', src: attaque.icon, alt: '', decoding: 'async' }) : null,
      el('span', { class: 'nom-arme', text: attaque.name }),
      el('span', { class: 'meta-arme',
        text: `${attaque.apCost ?? '?'} PA · ${attaque.castsPerTurn}/tour · arme` })),
    el('div', { class: 'lignes-arme' },
      attaque.lines.map((ligne) => ligneArme(ligne, `${ligne.min}–${ligne.max}`))),
    detail ? detailSort(detail) : null,
  ));
}

/**
 * Remplit la liste des sorts.
 *
 * @param {HTMLElement} root
 * @param {any[]} sorts
 * @param {any[]|null} degats Details calcules, un par sort.
 * @param {object} actions
 * @param {(index: number, cle: string, valeur: any) => void} actions.onChange
 * @param {(index: number) => void} actions.onRemove
 * @param {(index: number) => void} [actions.onAjouterLigne] Ajoute une ligne de degats.
 * @param {(index: number, rang: number) => void} [actions.onEnleverLigne]
 * @param {boolean} [actions.compterDiffere] Vrai quand les lignes des tours
 *   suivants entrent dans le total. Le signal visuel suit ce choix : une ligne
 *   estompee dit « ne compte pas », elle mentirait si elle comptait.
 */
export function renderSorts(root, sorts, degats, {
  onChange, onRemove, onAjouterLigne = null, onEnleverLigne = null,
  compterDiffere = false,
}) {
  if (sorts.length === 0) {
    fill(root, el('p', { class: 'note', text: 'Aucun sort. Le solveur ne vise que les conditions.' }));
    return;
  }

  fill(root, sorts.map((sort, index) => {
    // Chaque champ porte sa legende au-dessus : la grille se lit sans survol.
    const cellule = (titre, controle, aide) => el('label', {
      class: 'cellule-sort', title: aide ?? titre,
    }, el('span', { class: 'legende', text: titre }), controle);

    const champ = (cle, titre, aide, defaut = 0) => cellule(titre, el('input', {
      type: 'number', value: String(sort[cle] ?? defaut),
      onChange: (ev) => onChange(index, cle, Number(ev.target.value)),
    }), aide);
    const champLigne = (rang, ligne, cle, titre, aide) => cellule(titre, el('input', {
      type: 'number', value: String(ligne[cle] ?? 0),
      onChange: (ev) => onChange(index, `line.${rang}.${cle}`, Number(ev.target.value)),
    }), aide);

    const detail = degats?.[index];

    return el('div', { class: 'sort' },
      el('div', { class: 'sort-tete' },
        sort.icon ? el('img', { class: 'icone-sort', src: sort.icon, alt: '', decoding: 'async' }) : null,
        el('input', { type: 'text', value: sort.name ?? '', title: 'Nom du sort',
          onChange: (ev) => onChange(index, 'name', ev.target.value) }),
        sort.telefrag?.genere
          ? el('span', { class: 'marque-tf', title: 'Ce sort produit un telefrag', text: 'TF+' }) : null,
        sort.telefrag?.consomme
          ? el('span', { class: 'marque-tf consomme',
              title: sort.telefrag.bonusSousTelefrag
                ? 'Ce sort consomme un telefrag et gagne un bonus'
                : 'Ce sort consomme un telefrag', text: 'TF−' }) : null,
        el('button', { class: 'mini', type: 'button', text: '×', title: 'Enlever',
          onClick: () => onRemove(index) }),
      ),
      el('div', { class: 'sort-grille' },
        champ('apCost', 'PA', 'Cout du sort en points d\'action'),
        // Deux nombres voisins mais distincts : « Max/tour » borne
        // l'optimisateur de combo, « Lancers » compte les degats.
        champ('castsPerTurn', 'Max/tour',
          'Nombre maximal de lancers par tour.\n'
          + 'L\'optimisateur de combo ne depasse jamais cette limite.'),
        champ('repeats', 'Lancers',
          'Nombre de lancers comptes dans les degats.\n'
          + '« Appliquer aux sorts » y met le nombre retenu par le combo.', 1),
        champ('baseCrit', 'Crit +%', 'Bonus de critique propre au sort'),
        cellule('1 max au combo', el('input', {
          type: 'checkbox', ...(sort.unParTour ? { checked: true } : {}),
          onChange: (ev) => onChange(index, 'unParTour', ev.target.checked),
        }), 'Coche : l\'optimisateur de combo ne lance ce sort qu\'une fois'),
      ),
      // Une rangee editable par ligne de degats : element, plage, plage critique.
      sort.lines.map((ligne, rang) => el('div', {
        class: ['sort-grille', 'ligne-sort',
          ligne.differe > 0 && !compterDiffere ? 'differee' : '',
          ligne.differe > 0 && compterDiffere ? 'differee-comptee' : '',
          onEnleverLigne && sort.lines.length > 1 ? 'otable' : ''].filter(Boolean).join(' ') },
        cellule(ligne.differe > 0 ? `Element · T+${ligne.differe}` : 'Element',
          el('select', {
            onChange: (ev) => onChange(index, `line.${rang}.element`, ev.target.value) },
            ['neutre', 'terre', 'feu', 'eau', 'air'].map((e) => el('option', {
              value: e, ...(ligne.element === e ? { selected: true } : {}), text: e }))),
          ligne.differe > 0
            ? `Ligne differee : touche ${ligne.differe} tour(s) apres le lancer.`
              + (compterDiffere
                ? ' Elle compte dans le score : l\'option « sorts des tours suivants » est cochee.'
                : ' Elle ne compte pas dans le score : cochez « sorts des tours suivants ».')
            : 'Element de la ligne de degats'),
        champLigne(rang, ligne, 'min', 'Min', 'Degats de base minimaux'),
        champLigne(rang, ligne, 'max', 'Max', 'Degats de base maximaux'),
        champLigne(rang, ligne, 'critMin', 'Crit min', 'Degats de base minimaux en critique'),
        champLigne(rang, ligne, 'critMax', 'Crit max', 'Degats de base maximaux en critique'),
        // Le sort garde toujours une ligne : la derniere ne s'enleve pas.
        onEnleverLigne && sort.lines.length > 1
          ? el('button', { class: 'mini oter-ligne', type: 'button', text: '×',
              title: 'Enlever cette ligne de degats',
              onClick: () => onEnleverLigne(index, rang) })
          : null,
      )),
      onAjouterLigne
        ? el('div', { class: 'ajout-ligne' },
            el('button', { class: 'mini large', type: 'button', text: '+ ligne de degats',
              title: 'Ajoute une ligne de degats, dans le meme element ou dans un autre',
              onClick: () => onAjouterLigne(index) }))
        : null,
      detail ? detailSort(detail) : null,
    );
  }));
}

/**
 * Remplit l'analyse du build : apport des pieces et statistiques qui paient.
 *
 * L'apport d'une piece vaut ce que le build perd sans elle ; la barre le
 * montre a l'echelle de la piece la plus utile. Les statistiques, elles,
 * repondent a la question suivante : ou mettre le prochain point gagne.
 *
 * @param {HTMLElement} racineApports
 * @param {HTMLElement} racineSensibilite
 * @param {object} analyse
 * @param {any[]} analyse.apports
 * @param {any[]} analyse.sensibilite
 * @param {Map<number, any>} analyse.itemById
 * @param {Record<string, string>} analyse.libelles
 */
export function renderAnalyse(racineApports, racineSensibilite, analyse) {
  const { apports, sensibilite, itemById, libelles } = analyse;

  // La jauge suit les degats : le score melange degats et penalites, une piece
  // qui rend un point d'action y paraitrait plus utile qu'une piece de degats.
  const fort = Math.max(1, ...apports.map((a) => a.degats ?? 0));
  fill(racineApports, apports.map((apport) => {
    const piece = itemById.get(apport.id);
    const part = Math.min(100, Math.round(((apport.degats ?? 0) / fort) * 100));

    return el('div', {
      class: `apport ${apport.casseCondition ? 'decisive' : ''}`.trim(),
      title: apport.casseCondition
        ? `${apport.fr} — sans elle, ces conditions tombent : `
          + `${(apport.conditionsPerdues ?? []).map((stat) => libelles[stat] ?? stat).join(', ')}`
        : `${apport.fr} — sans elle, le build perd ${entier(apport.degats ?? 0)} degats`,
    },
      piece?.img
        ? el('img', { class: 'apport-icone', src: piece.img, alt: '', decoding: 'async',
            onMouseenter: (ev) => montrerBulle(piece, ev.clientX, ev.clientY),
            onMousemove: (ev) => suivreBulle(ev.clientX, ev.clientY),
            onMouseleave: cacherBulle })
        : null,
      el('span', { class: 'apport-nom', text: apport.fr }),
      el('span', { class: 'apport-jauge' }, el('i', { style: `width:${part}%` })),
      apport.casseCondition
        ? el('span', { class: 'apport-marque', title: 'Sans cette piece, une condition tombe', text: '!' })
        : null,
      el('span', { class: `apport-valeur ${ton(apport.degats ?? 0)}`,
        text: `+${entier(apport.degats ?? 0)}` }));
  }));

  // Une statistique sans effet n'apprend rien : seules les utiles restent.
  const utiles = sensibilite.filter((mesure) => mesure.gain > 0).slice(0, 8);
  if (utiles.length === 0) {
    fill(racineSensibilite, el('p', { class: 'note', text: 'Aucun sort retenu : rien a conseiller.' }));
    return;
  }

  const meilleur = utiles[0].gain;
  fill(racineSensibilite, utiles.map((mesure) => {
    const icone = iconeStat(mesure.stat);
    const part = Math.min(100, Math.round((mesure.gain / meilleur) * 100));
    // Les libelles portent deja leur unite : « % Dommages Melee », « % Critique ».
    const unite = '';

    return el('div', { class: 'mesure', title: `${mesure.pas}${unite} de plus sur cette statistique rend ${entier(mesure.gain)} degats` },
      icone ? el('img', { class: 'mesure-icone', src: icone, alt: '', decoding: 'async' }) : null,
      el('span', { class: 'mesure-nom', text: `+${mesure.pas}${unite} ${libelles[mesure.stat] ?? mesure.stat}` }),
      el('span', { class: 'apport-jauge' }, el('i', { style: `width:${part}%` })),
      el('span', { class: 'mesure-gain', text: `+${entier(mesure.gain)}` }));
  }));
}

/**
 * Remplit la liste des autres builds trouves.
 *
 * Un solveur qui ne rend qu'un gagnant cache ses seconds : ils valent
 * souvent quelques degats de moins pour deux pieces que le joueur possede
 * deja. Chaque ligne dit donc ce qu'il faut changer, et ce que cela coute.
 *
 * @param {HTMLElement} root
 * @param {any[]} candidats
 * @param {object} contexte
 * @param {Set<number>} contexte.portes Identifiants du build porte.
 * @param {Map<number, any>} contexte.itemById
 * @param {number|null} contexte.scorePorte Score du build porte, ou null.
 * @param {(candidat: any) => void} contexte.onPorter
 */
export function renderCandidats(root, candidats, { portes, itemById, porte, onPorter }) {
  if (!candidats || candidats.length === 0) {
    fill(root, el('p', { class: 'note', text: 'Aucun autre build. Lancez une recherche.' }));
    return;
  }

  fill(root, candidats.map((candidat) => {
    const ids = candidat.itemIds ?? [];
    const aMettre = ids.filter((id) => !portes.has(id));
    const aEnlever = [...portes].filter((id) => !ids.includes(id));
    // L'ecart se lit sur les DEGATS, jamais sur le score. Un score vaut les
    // degats quand les conditions tiennent, et moins la penalite quand l'une
    // d'elles tombe : soustraire l'un de l'autre annoncait des ecarts de
    // plusieurs milliers de points qui ne voulaient rien dire.
    const ecart = Number.isFinite(porte?.damage) ? (candidat.damage ?? 0) - porte.damage : null;
    const redresse = candidat.satisfied === true && porte?.satisfied === false;
    const casse = candidat.satisfied === false && porte?.satisfied === true;

    // Un build deja porte se signale : il n'y a rien a changer.
    const identique = aMettre.length === 0 && aEnlever.length === 0;

    const vignette = (id, classe) => {
      const piece = itemById.get(id);
      if (!piece) return null;
      return el('img', {
        class: `piece-candidat ${classe}`,
        src: piece.img, alt: piece.fr, title: piece.fr, decoding: 'async',
        onMouseenter: (ev) => montrerBulle(piece, ev.clientX, ev.clientY),
        onMousemove: (ev) => suivreBulle(ev.clientX, ev.clientY),
        onMouseleave: cacherBulle,
      });
    };

    return el('div', { class: `candidat ${identique ? 'porte' : ''}`.trim() },
      el('div', { class: 'candidat-tete' },
        el('span', { class: 'candidat-score', title: 'Degats de ce build',
          text: entier(candidat.damage ?? 0) }),
        ecart === null || identique
          ? null
          : el('span', {
              class: `candidat-ecart ${ecart >= 0 ? 'pos' : 'neg'}`,
              text: `${ecart >= 0 ? '+' : ''}${entier(ecart)}`,
              title: 'Degats en plus ou en moins, face au build porte',
            }),
        redresse
          ? el('span', { class: 'candidat-marque',
              title: 'Le build porte laisse une condition en defaut ; celui-ci les tient toutes',
              text: 'conditions tenues' })
          : null,
        casse
          ? el('span', { class: 'candidat-marque defaut',
              title: 'Ce build ne tient pas toutes vos conditions',
              text: 'conditions en defaut' })
          : null,
        el('span', { class: 'candidat-changements',
          text: identique ? 'build porte' : `${aMettre.length} piece(s) a changer` }),
        identique
          ? null
          : el('button', { class: 'mini large', type: 'button', text: 'Porter',
              title: 'Remplace le build porte par celui-ci',
              onClick: () => onPorter(candidat) })),

      identique ? null : el('div', { class: 'candidat-pieces' },
        el('span', { class: 'candidat-legende', text: 'a mettre' }),
        aMettre.map((id) => vignette(id, 'entrante')),
        aEnlever.length > 0 ? el('span', { class: 'candidat-legende', text: 'a enlever' }) : null,
        aEnlever.map((id) => vignette(id, 'sortante'))),
    );
  }));
}

/**
 * Remplit les cartes de panoplie.
 * @param {HTMLElement} root
 * @param {any[]} panoplies Panoplies actives du build.
 * @param {Map<number, any>} setById
 * @param {Record<string, string>} libelles
 * @param {{itemById?: Map<number, any>, equippedIds?: Set<number>}} [contexte]
 */
export function renderPanoplies(root, panoplies, setById, libelles, contexte = {}) {
  const { itemById = new Map(), equippedIds = new Set() } = contexte;

  if (!panoplies || panoplies.length === 0) {
    fill(root, el('p', { class: 'note', text: 'Aucune panoplie active.' }));
    return;
  }

  fill(root, panoplies.map(({ setId, pieces, fr }) => {
    const set = setById.get(setId);
    const tier = set?.tiers?.[pieces - 1] ?? {};
    const lignes = Object.entries(tier).filter(([, v]) => v !== 0);

    // Les pieces de la panoplie : les portees en clair, les autres en retrait.
    const vignettes = (set?.itemIds ?? [])
      .map((id) => itemById.get(id))
      .filter(Boolean)
      .sort((a, b) => Number(equippedIds.has(b.id)) - Number(equippedIds.has(a.id)))
      .map((piece) => el('img', {
        class: `piece-panoplie ${equippedIds.has(piece.id) ? 'portee' : 'absente'}`,
        src: piece.img, alt: piece.fr, title: piece.fr, decoding: 'async',
        // Le survol montre l'infobulle de la piece ; le clic ouvre sa fiche.
        onMouseenter: (ev) => montrerBulle(piece, ev.clientX, ev.clientY),
        onMousemove: (ev) => suivreBulle(ev.clientX, ev.clientY),
        onMouseleave: cacherBulle,
        ...(contexte.onPick ? { onClick: () => { cacherBulle(); contexte.onPick(piece); } } : {}),
      }));

    return el('div', { class: 'panoplie' },
      el('div', { class: 'panoplie-tete' },
        el('span', { text: fr }),
        el('span', { class: 'pieces', text: `${pieces} pieces` })),
      vignettes.length > 0 ? el('div', { class: 'pieces-panoplie' }, vignettes) : null,
      el('dl', {}, lignes.flatMap(([cle, valeur]) => {
        const icone = iconeStat(cle);
        return [
          el('dt', {},
            icone ? el('img', { src: icone, alt: '', decoding: 'async' }) : null,
            el('span', { text: libelles[cle] ?? cle })),
          el('dd', { class: valeur > 0 ? 'pos' : 'neg', text: nombre(valeur) }),
        ];
      })),
    );
  }));
}

/**
 * Remplit la liste des options, rangees par groupe.
 *
 * `groupes` donne l'ordre et les titres ; une option sans groupe connu se
 * range a la fin, sous aucun titre, plutot que de disparaitre.
 *
 * @param {HTMLElement} root
 * @param {any[]} options
 * @param {(cle: string, valeur: any) => void} onToggle
 * @param {{cle: string, titre: string}[]} [groupes]
 */
export function renderOptions(root, options, onToggle, groupes = []) {
  const champ = ({ cle, libelle, actif, aide, type, min, max, choix, inactif }) => {
    // Une option a plusieurs reponses montre une liste : trois etats ne
    // tiennent pas dans une case a cocher.
    if (type === 'liste') {
      return el('label', { class: `option liste ${inactif ? 'off' : ''}`.trim(), title: aide ?? '' },
        el('span', { text: libelle }),
        el('select', {
          ...(inactif ? { disabled: true } : {}),
          onChange: (ev) => onToggle(cle, ev.target.value),
        }, (choix ?? []).map((option) => el('option', {
          value: option.valeur,
          text: option.nom,
          ...(String(actif ?? '') === String(option.valeur) ? { selected: true } : {}),
        }))),
      );
    }

    // Une option numerique montre un champ au lieu d'une case a cocher.
    if (type === 'nombre') {
      return el('label', { class: `option nombre ${inactif ? 'off' : ''}`.trim(), title: aide ?? '' },
        el('span', { text: libelle }),
        el('input', { type: 'number', min: min ?? 0, max: max ?? 99, value: Number(actif) || 0,
          ...(inactif ? { disabled: true } : {}),
          onChange: (ev) => onToggle(cle, Math.max(min ?? 0, Number(ev.target.value) || 0)) }),
      );
    }

    return el('label', { class: 'option', title: aide ?? '' },
      el('input', { type: 'checkbox', ...(actif ? { checked: true } : {}),
        onChange: (ev) => onToggle(cle, ev.target.checked) }),
      el('span', { text: libelle }),
    );
  };

  // Sans groupe declare, le panneau garde la liste a plat : l'appelant qui
  // ne connait pas les groupes ne perd rien.
  if (groupes.length === 0) {
    fill(root, options.map(champ));
    return;
  }

  const connus = new Set(groupes.map((g) => g.cle));
  const orphelines = options.filter((o) => !connus.has(o.groupe));

  fill(root, [
    ...groupes.map((groupe) => {
      const dedans = options.filter((o) => o.groupe === groupe.cle);
      if (dedans.length === 0) return null;
      return el('div', { class: 'groupe-options' },
        el('h3', { class: 'titre-groupe', text: groupe.titre }),
        el('div', { class: 'options-groupe' }, dedans.map(champ)));
    }).filter(Boolean),
    ...(orphelines.length > 0
      ? [el('div', { class: 'groupe-options' },
          el('div', { class: 'options-groupe' }, orphelines.map(champ)))]
      : []),
  ]);
}

/**
 * Montre le combo optimise : lancers retenus, PA depenses et total.
 * @param {HTMLElement} root
 * @param {{total:number, budget:number, paUtilises:number, lancers:any[]} | null} combo
 */
export function renderCombo(root, combo, actions = {}) {
  if (!combo) {
    fill(root, []);
    return;
  }

  const lignes = combo.lancers.map((l) => el('div', { class: 'ligne-combo' },
    l.icon ? el('img', { src: l.icon, alt: '', decoding: 'async' }) : null,
    el('span', { class: 'nom', text: `${l.lancers} × ${l.name}` }),
    el('span', { class: 'pa', text: `${l.coutTotal} PA`
      + (l.rend > 0 ? ` (TF +${l.rend})` : '') }),
    el('span', { class: 'deg', text: entier(l.total) }),
  ));

  // Couverture d'elements : montree des qu'une condition existe ou que le
  // combo touche plusieurs elements.
  const couverts = combo.elementsCouverts ?? [];
  const manque = combo.elementsManquants ?? 0;
  const ligneElements = (combo.elementsMin > 0 || couverts.length > 1)
    ? el('div', { class: `elements-combo ${manque > 0 ? 'manque' : ''}`.trim() },
        couverts.map((e) => {
          const icone = iconeElement(e);
          return icone ? el('img', { src: icone, alt: e, title: e, decoding: 'async' })
            : el('span', { text: e });
        }),
        el('span', { class: 'note-elements',
          text: combo.elementsMin > 0
            ? `${couverts.length}/${combo.elementsMin} element(s) demandes`
              + (manque > 0 ? ' — budget insuffisant' : '')
            : `${couverts.length} element(s)` }))
    : null;

  fill(root, [el('div', { class: 'carte-combo' },
    el('div', { class: 'tete-combo' },
      el('span', { class: 'titre', text: 'Combo optimise' }),
      el('span', { class: 'pa', text: `${combo.paUtilises}/${combo.budget} PA` })),
    combo.lancers.length > 0
      ? lignes
      : el('p', { class: 'note', text: 'Aucun lancer ne tient dans le budget de PA.' }),
    ligneElements,
    el('div', { class: 'total-combo' },
      el('span', { text: 'Degats du combo' }),
      el('span', { class: 'deg', text: entier(combo.total) })),
    combo.lancers.length > 0 && (actions.onAppliquer || actions.onGarder)
      ? el('div', { class: 'actions-combo' },
          actions.onAppliquer ? el('button', { class: 'mini large', type: 'button',
            text: 'Appliquer aux sorts',
            title: 'Remplace la liste des sorts par ceux du combo,\n'
              + 'avec leur nombre de lancers retenu',
            onClick: () => actions.onAppliquer(combo) }) : null,
          actions.onGarder ? el('button', { class: 'mini large', type: 'button',
            text: 'Garder en jeu de sorts',
            title: 'Enregistre les sorts du combo comme un jeu nomme',
            onClick: () => actions.onGarder(combo) }) : null)
      : null,
  )]);
}
