/**
 * Panneau de repartition des points de caracteristique.
 *
 * Un personnage gagne cinq points par niveau. Leur cout depend de la
 * caracteristique et de la valeur deja investie : la sagesse coute trois points
 * par unite, les caracteristiques elementaires suivent des paliers de cent.
 */
import { el } from './render.mjs';
import { iconeStat } from './icons.mjs';
import { SCROLLABLE, SCROLL_BONUS, availablePoints, maxForBudget, pointCost }
  from '../src/engine/characteristics.mjs';

/** Libelles des caracteristiques ou des points peuvent aller. */
const LIBELLES = Object.freeze({
  vitalite: 'Vitalite', sagesse: 'Sagesse', force: 'Force',
  intelligence: 'Intelligence', chance: 'Chance', agilite: 'Agilite',
});

/**
 * Remplit le panneau de repartition.
 *
 * @param {HTMLElement} root
 * @param {object} etat
 * @param {number} etat.niveau
 * @param {Record<string, number>} etat.allocation
 * @param {Record<string, boolean>} etat.scrolls
 * @param {Record<string, number>} [etat.limites] Valeur maximale que la
 *   recherche investit par caracteristique, zero pour aucune limite.
 * @param {Record<string, number>|null} [etat.stats] Statistiques du build porte,
 *   pour rappeler le total a cote de la part investie.
 * @param {object} actions
 * @param {(cle: string, valeur: number) => void} actions.onPoints
 * @param {(cle: string, actif: boolean) => void} actions.onScroll
 * @param {(cle: string, valeur: number) => void} [actions.onLimite]
 * @param {() => void} actions.onReset
 */
export function renderPoints(root, { niveau, allocation, scrolls, limites = {}, stats = null }, actions) {
  const budget = availablePoints(niveau);

  let depense = 0;
  for (const cle of SCROLLABLE) depense += pointCost(cle, allocation[cle] ?? 0);
  const reste = budget - depense;

  /**
   * Limite posee sur une caracteristique, ou null quand il n'y en a pas.
   *
   * Le champ vide dit « aucune limite ». Zero est une limite comme une autre :
   * il interdit d'investir. Les deux demandes sont opposees, elles ne peuvent
   * pas partager la meme valeur.
   */
  const limiteDe = (cle) => {
    const brut = limites[cle];
    if (brut === null || brut === undefined || brut === '') return null;
    const valeur = Number(brut);
    return Number.isFinite(valeur) && valeur >= 0 ? valeur : null;
  };

  /**
   * Vrai quand votre saisie passe au-dessus de la limite.
   *
   * La limite ne bride que la recherche : vous restez libre de mettre plus a
   * la main. Le champ s'allume alors en alerte pour que l'ecart se voie.
   */
  const depasse = (cle) => {
    const limite = limiteDe(cle);
    return limite !== null && (allocation[cle] ?? 0) > limite;
  };

  /** Aide du champ de limite, adaptee a ce que la ligne montre. */
  const aideLimite = (cle) => {
    const limite = limiteDe(cle);
    const investi = allocation[cle] ?? 0;
    const total = stats?.[cle];
    const situation = Number.isFinite(total)
      ? `\nLe build porté est à ${total} au total, dont ${investi} investis.`
      : '';

    if (limite === null) {
      return `Limite de ${LIBELLES[cle]} : valeur maximale que la recherche investit.\n`
        + `Champ vide : aucune limite. Zéro : la recherche n'y met rien.\n`
        + `Elle borne le curseur, pas son coût en points, et ne touche pas\n`
        + `a ce que l'équipement apporte.\n`
        + `Pour borner la caractéristique entière, mettez un maximum a la condition.\n`
        + `Votre saisie à la main reste libre.${situation}`;
    }
    if (limite === 0) {
      return `La recherche n'investit rien en ${LIBELLES[cle]}.\n`
        + `${depasse(cle) ? `Votre saisie est a ${investi} : au-dessus de la limite.\n` : ''}`
        + `Videz le champ pour lever la limite.${situation}`;
    }
    return `La recherche n'investit pas plus de ${limite} en ${LIBELLES[cle]}.\n`
      + `${depasse(cle) ? `Votre saisie est a ${investi} : au-dessus de la limite.\n` : ''}`
      + `La limite borne le curseur, pas son coût en points.${situation}`;
  };

  const lignes = SCROLLABLE.map((cle) => {
    const investi = allocation[cle] ?? 0;
    const cout = pointCost(cle, investi);
    // Le maximum atteignable tient compte des points encore libres.
    const plafond = maxForBudget(cle, cout + Math.max(0, reste));
    const icone = iconeStat(cle);

    return el('div', { class: 'ligne-point' },
      el('label', { class: 'nom-point', title: LIBELLES[cle] },
        icone ? el('img', { src: icone, alt: '', decoding: 'async' }) : null,
        el('span', { text: LIBELLES[cle] })),

      el('input', {
        type: 'range', min: '0', max: String(Math.max(plafond, investi)), value: String(investi),
        class: 'curseur',
        title: `${investi} points investis, ${cout} points dépenses`,
        onInput: (ev) => actions.onPoints(cle, Number(ev.target.value)),
      }),

      el('input', {
        type: 'number', min: '0', max: String(Math.max(plafond, investi)), value: String(investi),
        class: 'valeur-point',
        onChange: (ev) => actions.onPoints(cle, Math.max(0, Number(ev.target.value) || 0)),
      }),

      el('span', { class: 'cout-point', title: 'Points dépenses', text: `${cout}` }),

      // La limite bride la recherche, jamais la saisie : le joueur reste libre
      // de depasser a la main, et le champ le signale quand c'est le cas.
      el('input', {
        type: 'number', min: '0',
        value: limiteDe(cle) === null ? '' : String(limiteDe(cle)),
        class: ['limite-point',
          limiteDe(cle) !== null ? 'active' : '',
          limiteDe(cle) === 0 ? 'fermee' : '',
          depasse(cle) ? 'depassee' : ''].filter(Boolean).join(' '),
        // Un champ vide dit « aucune limite » ; le tiret le montre a l'oeil.
        placeholder: '—',
        title: aideLimite(cle),
        ...(actions.onLimite ? {} : { disabled: true }),
        onChange: (ev) => {
          const brut = ev.target.value.trim();
          if (brut === '') { actions.onLimite?.(cle, null); return; }
          actions.onLimite?.(cle, Math.max(0, Number(brut) || 0));
        },
      }),

      // Parchemins : en jeu, un personnage peut lire des parchemins de
      // caracteristique jusqu'a +101 en base, sans depenser de points.
      el('label', {
        class: `parcho ${scrolls[cle] ? 'pris' : ''}`.trim(),
        title: `Personnage parchemine : +${SCROLL_BONUS} en base, sans dépenser de points`,
      },
        el('input', {
          type: 'checkbox', ...(scrolls[cle] ? { checked: true } : {}),
          onChange: (ev) => actions.onScroll(cle, ev.target.checked),
        }),
        el('span', { text: `P+${SCROLL_BONUS}` })),
    );
  });

  root.replaceChildren(
    el('div', { class: 'bandeau-points' },
      el('span', { class: 'note', text: `${budget} points au niveau ${niveau}` }),
      el('span', {
        class: `jeton ${reste < 0 ? 'trop' : ''}`.trim(),
        text: reste < 0 ? `${-reste} en trop` : `${reste} restants`,
      }),
      el('button', { class: 'mini', type: 'button', text: 'Remettre a zéro',
        title: 'Enlever tous les points investis', onClick: actions.onReset }),
    ),
    el('div', { class: 'entete-points' },
      el('span', { text: 'Caracteristique' }),
      el('span', { text: '' }),
      el('span', { text: 'Points' }),
      el('span', { text: 'Cout' }),
      el('span', { text: 'Limite',
        title: 'Valeur maximale que la recherche investit.\nVide : aucune limite. Zéro : rien du tout.' }),
      el('span', { text: 'Parcho' })),
    ...lignes,
  );
}
