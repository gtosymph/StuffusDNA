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
 * @param {object} actions
 * @param {(cle: string, valeur: number) => void} actions.onPoints
 * @param {(cle: string, actif: boolean) => void} actions.onScroll
 * @param {() => void} actions.onReset
 */
export function renderPoints(root, { niveau, allocation, scrolls }, actions) {
  const budget = availablePoints(niveau);

  let depense = 0;
  for (const cle of SCROLLABLE) depense += pointCost(cle, allocation[cle] ?? 0);
  const reste = budget - depense;

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
        title: `${investi} points investis, ${cout} points depenses`,
        onInput: (ev) => actions.onPoints(cle, Number(ev.target.value)),
      }),

      el('input', {
        type: 'number', min: '0', max: String(Math.max(plafond, investi)), value: String(investi),
        class: 'valeur-point',
        onChange: (ev) => actions.onPoints(cle, Math.max(0, Number(ev.target.value) || 0)),
      }),

      el('span', { class: 'cout-point', title: 'Points depenses', text: `${cout}` }),

      // Parchemins : en jeu, un personnage peut lire des parchemins de
      // caracteristique jusqu'a +101 en base, sans depenser de points.
      el('label', {
        class: `parcho ${scrolls[cle] ? 'pris' : ''}`.trim(),
        title: `Personnage parchemine : +${SCROLL_BONUS} en base, sans depenser de points`,
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
      el('button', { class: 'mini', type: 'button', text: 'Remettre a zero',
        title: 'Enlever tous les points investis', onClick: actions.onReset }),
    ),
    ...lignes,
  );
}
