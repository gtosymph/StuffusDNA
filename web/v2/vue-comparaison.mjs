/**
 * L'ecran de comparaison.
 *
 * La comparaison n'est pas une page : elle se pose par-dessus, et se ferme.
 * Le joueur y vient pour trancher entre deux ou trois stuffs, pas pour s'y
 * installer.
 *
 * Ce module ne decide de rien : `comparaison.mjs` dit quelles lignes montrer,
 * ici on les pose. Le bouton des lignes masquees reste toujours visible, meme
 * a zero masquee, pour que le joueur sache que le masquage existe.
 */
import { el } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { lignesComparaison, nomDeColonne } from './comparaison.mjs';

let racine = null;
let libererFocus = null;

/** Vrai tant que le joueur n'a pas demande a revoir les lignes identiques. */
let masquerIdentiques = true;

const nombre = (n) => Math.round(n).toLocaleString('fr-FR');
const signe = (n) => `${n > 0 ? '+' : ''}${nombre(n)}`;

/** Ferme la comparaison. */
export function fermerComparaison() {
  if (!racine) return;
  racine.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/** Vrai quand la comparaison est ouverte. */
export const comparaisonOuverte = () => Boolean(racine) && !racine.hidden;

/**
 * Ouvre la comparaison.
 *
 * @param {object} liens
 * @param {{cle: string, libelle: string}[]} liens.mesures
 * @param {{nom: string, stats: Record<string, number>}[]} liens.colonnes
 *   La premiere est le stuff porte : c'est la reference des ecarts.
 * @param {Set<string>} liens.minimums
 */
export function ouvrirComparaison({ mesures, colonnes, minimums }) {
  if (!racine) {
    racine = el('div', { class: 'compare-fond', hidden: true, onClick: (ev) => {
      if (ev.target === racine) fermerComparaison();
    } });
    document.body.append(racine);
  }

  const { lignes, masquees } = lignesComparaison(mesures, colonnes,
    { minimums, masquerIdentiques });

  const cellule = (c, ligne) => {
    if (ligne.absolue) {
      return el('td', { class: 'n' }, nombre(c.valeur));
    }
    if (c.ecart === null) {
      return el('td', { class: 'n' }, nombre(c.valeur));
    }
    // L'ecart porte le sens ; la valeur atteinte reste lisible dessous, sinon
    // on sait ce qu'on gagne sans savoir ou l'on arrive.
    return el('td', { class: 'n' },
      el('b', { class: c.ecart > 0 ? 'pos' : (c.ecart < 0 ? 'neg' : ''), text: signe(c.ecart) }),
      el('small', { text: nombre(c.valeur) }));
  };

  const corps = lignes.length === 0
    ? el('p', { class: 'aide', style: 'padding:18px 16px',
        text: 'Ces stuffs ont exactement les memes valeurs sur toutes les mesures.' })
    : el('table', { class: 'compare' },
        el('thead', {}, el('tr', {},
          el('th', { text: '' }),
          ...colonnes.map((c, i) => el('th', { text: c.nom ?? nomDeColonne(i) })))),
        el('tbody', {}, ...lignes.map((ligne) => el('tr', {},
          el('th', { scope: 'row' },
            ligne.libelle,
            ligne.absolue
              ? el('span', { class: 'marque-min', title: 'Vous en exigez un minimum',
                  text: 'min' })
              : null),
          ...ligne.cellules.map((c) => cellule(c, ligne))))));

  racine.replaceChildren(el('div', {
    class: 'compare-boite', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Comparer',
  },
    el('div', { class: 'compare-tete' },
      el('h2', { text: 'Comparer' }),
      el('span', { class: 'aide',
        text: 'Les ecarts se lisent face au stuff porte. Un minimum se lit en valeur.' }),
      el('div', { class: 'pousse' }),
      el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
        onClick: fermerComparaison })),
    el('div', { class: 'compare-corps' }, corps),
    el('div', { class: 'compare-pied' },
      el('button', {
        class: 'btn mini fantome', type: 'button',
        text: masquerIdentiques
          ? `${masquees} ligne(s) identique(s) sur tous ces stuffs — les montrer`
          : 'Masquer de nouveau les lignes identiques',
        onClick: () => {
          masquerIdentiques = !masquerIdentiques;
          ouvrirComparaison({ mesures, colonnes, minimums });
        },
      })),
  ));

  racine.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(racine);
}
