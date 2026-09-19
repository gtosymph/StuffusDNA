/**
 * Panneau « proche de mon stuff ».
 *
 * Le meilleur build du solveur demande souvent seize pieces neuves. Un joueur
 * qui equipe deja un personnage ne veut pas tout racheter : il veut savoir ce
 * que lui rapporte UNE piece changee, puis deux, puis trois.
 *
 * Le panneau tient donc trois choses :
 * - la reference, c'est-a-dire le stuff porte en jeu, figee d'un clic ;
 * - la limite de pieces a changer ;
 * - le tableau des paliers, qui montre le gain de chaque piece achetee.
 *
 * La reference ne bouge pas quand on essaie un candidat : c'est tout son
 * interet. Sans cela, porter une proposition la remplacerait, et le compte
 * des pieces a changer retomberait a zero.
 */
import { el } from './render.mjs';
import { frontiere } from '../src/solver/proximite.mjs';

const entier = (v) => Math.floor(v).toLocaleString('fr-FR');

/**
 * Vignettes des pieces que la reference ne porte pas.
 *
 * Une piece deja en banque ne coute rien : elle se montre quand meme — il
 * faut bien aller la chercher — mais autrement, sinon le compte des pieces
 * a acheter parait faux face au nombre d'images.
 *
 * @param {any} palier
 * @param {{aReference: Set<number>, possedees: Set<number>, itemById: Map<number, any>}} contexte
 */
function vignettes(palier, { aReference, possedees, itemById }) {
  return (palier.itemIds ?? [])
    .filter((id) => !aReference.has(id))
    .map((id) => ({ id, piece: itemById.get(id) }))
    .filter(({ piece }) => piece)
    .map(({ id, piece }) => el('img', {
      class: possedees.has(id) ? 'en-banque' : '',
      src: piece.img, alt: '', decoding: 'async', loading: 'lazy',
      title: possedees.has(id)
        ? `${piece.fr} — déjà dans votre inventaire, rien à acheter`
        : `${piece.fr} — à acheter`,
    }));
}
const signe = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('fr-FR')}`;

/** Date courte, lisible d'un coup d'oeil. */
function quand(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Remplit la barre de reglage de la proximite.
 *
 * @param {HTMLElement} racine
 * @param {object} etat
 * @param {{itemIds: number[], date: string}|null} etat.reference
 * @param {number} etat.max Pieces a changer au plus. Zero : aucune limite.
 * @param {number} etat.possedees Nombre de pieces marquees comme possedees.
 * @param {number} etat.portees Pieces du build actuellement pose.
 * @param {object} actions
 * @param {() => void} actions.onFiger
 * @param {() => void} actions.onOublier
 * @param {(valeur: number) => void} actions.onMax
 */
export function renderReglageProximite(racine, etat, actions) {
  const { reference, max, possedees, portees } = etat;

  if (!reference) {
    racine.replaceChildren(
      el('div', { class: 'proximite-barre' },
        el('button', { class: 'primaire', type: 'button', text: 'Figer mon stuff actuel',
          disabled: portees === 0,
          title: portees === 0
            ? 'Posez d\'abord les pièces que vous portez en jeu'
            : 'Fige les pièces portées comme référence. Le solveur comptera\n'
              + 'ensuite ce que chaque build demande d\'acheter.',
          onClick: actions.onFiger }),
        el('span', { class: 'note',
          text: portees === 0
            ? 'Posez votre stuff en jeu, puis figez-le.'
            : `${portees} pièce(s) posée(s). Une fois figées, elles ne bougent plus.` })),
    );
    return;
  }

  racine.replaceChildren(
    el('div', { class: 'proximite-barre' },
      el('span', { class: 'jeton', title: `Référence figée le ${quand(reference.date)}`,
        text: `${reference.itemIds.length} pièce(s) de référence` }),

      el('label', { class: 'proximite-max', title:
        'Pièces que le solveur peut vous demander d\'acheter, au plus.\n'
        + 'Zéro : aucune limite. Une pièce déjà portée ou marquee comme\n'
        + 'possédée ne compte pas.' },
        el('span', { text: 'À changer (max)' }),
        el('input', { type: 'number', min: '0', max: '16', value: String(max),
          onChange: (ev) => actions.onMax(Math.max(0, Number(ev.target.value) || 0)) })),

      possedees > 0
        ? el('span', { class: 'jeton banque',
            title: `${possedees} pièce(s) marquees comme possédées : elles ne comptent `
              + 'pas parmi les pièces à acheter',
            text: `${possedees} en banque` })
        : null,

      el('button', { class: 'mini', type: 'button', text: 'Reprendre',
        title: 'Repose le stuff de référence sur le personnage',
        onClick: actions.onReprendre }),

      el('button', { class: 'mini', type: 'button', text: 'Oublier',
        title: 'Enleve la référence. Le solveur cherche de nouveau librement.',
        onClick: actions.onOublier })),
  );
}

/**
 * Ce qu'un palier apporte, face au stuff de reference.
 *
 * Le score d'un build vaut ses degats quand toutes les conditions tiennent,
 * et moins la penalite quand l'une d'elles tombe. Les deux ne se soustraient
 * donc pas : comparer un build en defaut a un build tenu annoncait des gains
 * de plusieurs milliers de points qui ne voulaient rien dire.
 *
 * Le gain se lit sur les DEGATS, qui existent et se comparent dans tous les
 * cas. Ce que les conditions deviennent se dit a part, en toutes lettres.
 *
 * @param {any} palier
 * @param {{damage: number, satisfied: boolean}|null} reference
 * @returns {{gain: number|null, redresse: boolean, casse: boolean}}
 */
export function apport(palier, reference) {
  if (!reference || !Number.isFinite(reference.damage)) {
    return { gain: null, redresse: false, casse: false };
  }
  return {
    gain: (palier.damage ?? 0) - reference.damage,
    // Le vrai gain d'un build n'est pas toujours un chiffre : tenir une
    // condition qui tombait vaut souvent plus que quelques degats.
    redresse: palier.satisfied === true && reference.satisfied === false,
    casse: palier.satisfied === false && reference.satisfied === true,
  };
}

/**
 * Paliers qui valent la peine d'etre montres.
 *
 * Un palier qui casse une condition tenue ne se propose pas : le joueur a
 * pose ces conditions, un build qui les perd n'est pas une amelioration. Un
 * palier qui ne rapporte aucun degat de plus n'a rien a dire non plus, sauf
 * s'il redresse une condition en defaut.
 *
 * @param {any[]} paliers
 * @param {{damage: number, satisfied: boolean}|null} reference
 * @returns {any[]}
 */
export function paliersUtiles(paliers, reference) {
  if (!reference) return frontiere(paliers);

  const gagnants = paliers.filter((palier) => {
    const { gain, redresse, casse } = apport(palier, reference);
    if (casse) return false;
    if (redresse) return true;
    return Number.isFinite(gain) && gain > 0;
  });

  // La frontiere se prend a la fin : un palier plus cher qui ne fait pas mieux
  // qu'un moins cher n'a rien a proposer. Elle se lit sur les degats, comme
  // le gain montre a l'ecran.
  return frontiere(gagnants, (palier) => palier.damage ?? 0);
}

/**
 * Remplit le tableau des paliers.
 *
 * Chaque ligne dit : « pour tant de pieces achetees, voila ce que vous
 * frappez ». Le gain se lit face au stuff de reference, jamais face au build
 * pose : c'est bien l'achat qui se decide, pas l'essai en cours.
 *
 * @param {HTMLElement} racine
 * @param {any[]} paliers
 * @param {object} options
 * @param {{score: number, damage: number, satisfied: boolean}|null} options.reference
 * @param {Map<number, any>} options.itemById
 * @param {number[]} options.piecesReference Pieces du stuff de reference.
 * @param {(palier: any) => void} options.onPorter
 * @param {{choisis: Set<any>, onBasculer: (palier: any) => void}|null} [options.selection]
 *   Quand il est donne, chaque palier porte une case a cocher.
 */
export function renderPaliers(racine, paliers, options) {
  const {
    reference, itemById, piecesReference, onPorter, max = 0, possedees = new Set(),
    selection = null,
  } = options;

  const utiles = paliersUtiles(paliers, reference);
  const aReference = new Set(piecesReference ?? []);
  const contexte = { aReference, possedees, itemById };

  const ligne = (palier) => {
    const aAcheter = vignettes(palier, contexte);
    const { gain, redresse } = apport(palier, reference);

    return el('div', { class: 'palier' },
      // La case a cocher n'existe que si l'appelant sait quoi en faire : v1
      // ne compare pas les paliers, elle ne doit pas voir une case inerte.
      selection
        ? el('label', { class: 'palier-cocher', title: 'Comparer ce stuff' },
            el('input', {
              type: 'checkbox',
              ...(selection.choisis.has(palier) ? { checked: true } : {}),
              onChange: () => selection.onBasculer(palier),
            }))
        : null,
      el('div', { class: `palier-cout ${palier.changements === 0 ? 'gratuit' : ''}`.trim(),
        title: palier.changements === 0
          ? 'Aucun achat : vos pièces, mieux réparties ou mieux placées'
          : `${palier.changements} pièce(s) à acheter` },
        el('strong', { text: String(palier.changements) }),
        el('span', { text: palier.changements > 1 ? 'pieces' : 'piece' })),

      el('div', { class: 'palier-corps' },
        el('div', { class: 'palier-tete' },
          el('span', { class: 'palier-degats', title: 'Dégâts de ce build',
            text: `${entier(palier.damage ?? 0)} dégâts` }),

          gain === null ? null : el('span', {
            class: `palier-gain ${gain >= 0 ? 'pos' : 'neg'}`,
            title: 'Dégâts gagnes face à votre stuff de référence.\n'
              + 'Les points de caractéristique sont réoptimisés pour chaque\n'
              + 'build : une partie du gain peut ne rien coûter du tout.',
            text: `${signe(gain)} dégâts` }),

          redresse
            ? el('span', { class: 'palier-marque',
                title: 'Votre stuff laisse un minimum non tenu ; ce stuff les tient tous',
                text: 'minimums redressés' })
            : null),

        aAcheter.length === 0
          ? el('div', { class: 'note',
              text: 'Aucun achat : vos pièces, avec une meilleure répartition des points.' })
          : el('div', { class: 'palier-pieces' }, aAcheter)),

      el('button', { class: 'mini large', type: 'button', text: 'Porter',
        title: 'Pose ce build et sa répartition de points',
        onClick: () => onPorter(palier) }),
    );
  };

  // Rien a gagner : le panneau dit POURQUOI, et montre ce qu'il peut encore
  // servir. Un message unique pour trois situations differentes envoyait le
  // joueur monter une limite qui n'y etait pour rien.
  if (utiles.length === 0) {
    racine.replaceChildren(diagnostic(paliers, reference, max),
      ...(paliers.length > 0
        ? [equivalences(paliers, reference, { ...contexte, onPorter })]
        : []));
    return;
  }

  racine.replaceChildren(
    el('p', { class: 'note',
      text: 'Chaque ligne montre les dégâts que vous gagnez en achetant ce nombre '
        + 'de pièces. Les points de caractéristique suivent le build.' }),
    el('div', { class: 'paliers' },
      // La premiere ligne est le point de depart : votre stuff tel que vous le
      // portez aujourd'hui. Sans elle, les gains n'ont pas d'origine lisible.
      reference
        ? el('div', { class: 'palier depart' },
            el('div', { class: 'palier-cout', title: 'Votre stuff, tel que vous le portez' },
              el('strong', { text: '0' }),
              el('span', { text: 'piece' })),
            el('div', { class: 'palier-corps' },
              el('div', { class: 'palier-tete' },
                el('span', { class: 'palier-degats',
                  text: `${entier(reference.damage ?? 0)} dégâts` }),
                reference.satisfied
                  ? null
                  : el('span', { class: 'palier-marque defaut',
                      title: 'Un minimum au moins n\'est pas tenu par votre stuff',
                      text: 'minimums non tenus' })),
              el('div', { class: 'note', text: 'Votre stuff de référence, points actuels.' })),
            el('span', {}))
        : null,
      utiles.map(ligne)),
  );
}

/**
 * Dit pourquoi aucun palier n'est propose.
 *
 * Trois situations tres differentes menaient au meme message, dont un conseil
 * faux : « montez la limite » alors qu'elle etait deja au maximum. Le panneau
 * nomme desormais la vraie cause.
 *
 * @param {any[]} paliers
 * @param {{damage: number, satisfied: boolean}|null} reference
 * @param {number} max Limite de pieces a changer, zero pour aucune.
 */
function diagnostic(paliers, reference, max) {
  if (paliers.length === 0) {
    return el('p', { class: 'note',
      text: 'Aucun palier trouvé. Figez votre stuff, puis lancez une recherche.' });
  }

  // La limite mord vraiment quand le solveur butait dessus : le palier le plus
  // cher trouve vaut exactement la limite posee.
  const plusCher = Math.max(...paliers.map((p) => p.changements ?? 0));
  if (max > 0 && plusCher >= max) {
    return el('p', { class: 'note',
      text: `Aucun build a ${max} pièce(s) changée(s) ou moins ne fait mieux que `
        + 'votre stuff. Montez la limite pour ouvrir le choix.' });
  }

  return el('p', { class: 'note',
    text: 'Votre stuff de référence est déjà le meilleur build que la recherche ait '
      + 'trouve : il n\'y a rien à acheter. Pour voir ce que chaque achat '
      + 'rapporterait, figez votre stuff de jeu AVANT de lancer une recherche.' });
}

/**
 * Alternatives qui valent a peu pres la reference, sans la battre.
 *
 * Un build qui ne gagne rien peut quand meme servir : il remplace une piece
 * trop chere, ou introuvable, sans presque rien perdre. Ces alternatives ne
 * se montrent que faute de mieux, et leur perte s'annonce clairement.
 *
 * @param {any[]} paliers
 * @param {{damage: number}|null} reference
 * @param {object} contexte
 */
function equivalences(paliers, reference, contexte) {
  const { onPorter } = contexte;
  // Les moins chers d'abord : a perte egale, mieux vaut changer moins.
  const utiles = new Set(paliersUtiles(paliers, reference));
  const proches = [...paliers]
    .filter((palier) => (palier.changements ?? 0) > 0 && !utiles.has(palier))
    .sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0))
    .slice(0, 4);

  if (proches.length === 0) return el('span', {});

  return el('div', {},
    el('h3', { class: 'sous-titre', text: 'Alternatives a valeur égale' }),
    el('p', { class: 'note',
      text: 'Elles ne rapportent pas de dégâts, mais elles changent les pièces : '
        + 'utile quand une pièce est trop chère ou introuvable.' }),
    el('div', { class: 'paliers' }, proches.map((palier) => {
      const aAcheter = vignettes(palier, contexte);
      const { gain } = apport(palier, reference);

      return el('div', { class: 'palier' },
        el('div', { class: 'palier-cout', title: `${palier.changements} pièce(s) à acheter` },
          el('strong', { text: String(palier.changements) }),
          el('span', { text: palier.changements > 1 ? 'pieces' : 'piece' })),

        el('div', { class: 'palier-corps' },
          el('div', { class: 'palier-tete' },
            el('span', { class: 'palier-degats', text: `${entier(palier.damage ?? 0)} dégâts` }),
            gain === null ? null : el('span', {
              class: `palier-gain ${gain >= 0 ? 'pos' : 'neg'}`,
              title: 'Dégâts perdus face à votre stuff de référence',
              text: `${signe(gain)} dégâts` })),
          el('div', { class: 'palier-pieces' }, aAcheter)),

        el('button', { class: 'mini large', type: 'button', text: 'Porter',
          title: 'Pose ce build et sa répartition de points',
          onClick: () => onPorter(palier) }));
    })));
}
