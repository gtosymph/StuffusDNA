/**
 * La feuille du partage : donner son reglage, ou l'emmener chez Dofusbook.
 *
 * Deux gestes qui se ressemblent et ne portent pas la meme chose. Les mettre
 * cote a cote dans une feuille permet de le DIRE, la ou deux boutons dans la
 * barre laisseraient croire a deux facons de faire la meme chose :
 *
 *   - le lien de la page porte le reglage entier, et celui qui l'ouvre peut
 *     relancer la meme recherche ;
 *   - Dofusbook ne connait ni nos sorts, ni nos minimums, ni nos options : il
 *     recoit le stuff, les points et le niveau.
 *
 * La feuille montre aussi le lien en toutes lettres. Un bouton « Copier »
 * seul demande de croire sur parole ; un champ qu'on voit et qu'on peut
 * reprendre a la main marche meme quand le presse-papier est refuse, ce qui
 * arrive des que la page n'est pas servie en HTTPS.
 */
import { el } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { lienPartage } from '../partage-lien.mjs';
import { lienDofusbook } from '../../src/partage/dofusbook.mjs';

let racine = null;
let libererFocus = null;

/** Ferme la feuille. */
export function fermerPartage() {
  if (!racine) return;
  racine.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/** Vrai quand la feuille est ouverte. */
export const partageOuvert = () => Boolean(racine) && !racine.hidden;

/** Prepare le fond de feuille, une seule fois. */
function fond() {
  if (!racine) {
    racine = el('div', { class: 'feuille-fond', hidden: true, onClick: (ev) => {
      if (ev.target === racine) fermerPartage();
    } });
    document.body.append(racine);
  }
  return racine;
}

/**
 * Met un texte dans le presse-papier.
 *
 * Le presse-papier n'est pas toujours accessible : hors HTTPS, le navigateur
 * refuse. La selection du champ reste alors, et le joueur copie lui-meme.
 *
 * @param {string} texte
 * @param {HTMLInputElement} champ
 * @returns {Promise<boolean>}
 */
async function copier(texte, champ) {
  champ.select();
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ouvre la feuille du partage.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {(texte: string, type?: string) => void} liens.message
 */
export async function ouvrirPartage({ lireEtat, message }) {
  const etat = lireEtat();
  const lien = await lienPartage(etat, location.href);

  const champ = el('input', {
    class: 'champ-lien', type: 'text', readonly: true, value: lien,
    onFocus: (ev) => ev.target.select(),
  });

  const versDofusbook = () => {
    try {
      window.open(lienDofusbook(etat), '_blank', 'noopener');
      fermerPartage();
    } catch (erreur) {
      message(`Dofusbook n'a pas pu etre ouvert : ${erreur.message}`, 'erreur');
    }
  };

  const portees = etat.equipped?.size ?? 0;

  fond().replaceChildren(el('div', {
    class: 'feuille', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Partager',
  },
    el('div', { class: 'feuille-tete' },
      el('h2', { text: 'Partager' }),
      el('div', { class: 'pousse' }),
      el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
        onClick: fermerPartage })),

    el('div', { class: 'feuille-corps' },
      el('h3', { class: 'titre-reglage', text: 'Le lien de ce reglage' }),
      el('div', { class: 'ligne-lien' },
        champ,
        el('button', { class: 'btn premier', type: 'button', text: 'Copier',
          onClick: async (ev) => {
            const fait = await copier(lien, champ);
            ev.target.textContent = fait ? 'Copie' : 'A copier a la main';
            if (fait) message('Lien copie. Il porte tout votre reglage.');
          } })),
      el('p', { class: 'aide',
        text: 'Il porte le personnage, le stuff porte, les sorts, les minimums, '
          + 'les options et les pieces interdites ou possedees. Celui qui '
          + 'l\'ouvre peut relancer la meme recherche. Il ne porte aucun '
          + 'resultat : ils se refabriquent en cherchant.' }),

      el('h3', { class: 'titre-reglage', text: 'Chez Dofusbook' }),
      el('div', { class: 'ligne-lien' },
        el('button', { class: 'btn', type: 'button', disabled: portees === 0,
          text: 'Ouvrir le stuff chez Dofusbook', onClick: versDofusbook })),
      el('p', { class: 'aide',
        text: portees === 0
          ? 'Aucune piece n\'est portee : il n\'y a rien a envoyer.'
          : `Dofusbook recoit les ${portees} piece(s) portees, les points investis, `
            + 'les parchemins et le niveau. Il ne connait ni nos sorts, ni nos '
            + 'minimums, ni nos options : ces reglages-la ne passent que par le '
            + 'lien ci-dessus. La page s\'ouvre dans un autre onglet, sans compte.' }),
    ),
  ));

  racine.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(racine);
}

/**
 * Propose un reglage arrive par un lien.
 *
 * Elle ne pose rien : elle demande. Le visiteur a peut-etre une seance en
 * cours, et un lien recu n'a pas a l'effacer sans un mot.
 *
 * @param {object} liens
 * @param {ReturnType<typeof import('../partage-lien.mjs').resume>} liens.compte
 * @param {(classe: number|null) => string} liens.nomDeClasse
 * @param {() => void} liens.onAdopter
 */
export function proposerReglage({ compte, nomDeClasse, onAdopter }) {
  const qui = compte.classe === null
    ? 'Un reglage'
    : `Un ${nomDeClasse(compte.classe)}${compte.niveau ? ` de niveau ${compte.niveau}` : ''}`;

  const porte = [
    compte.pieces > 0 ? `${compte.pieces} piece(s) portees` : null,
    compte.sorts > 0 ? `${compte.sorts} sort(s)` : null,
    compte.minimums > 0 ? `${compte.minimums} minimum(s)` : null,
  ].filter(Boolean);

  fond().replaceChildren(el('div', {
    class: 'feuille', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reglage recu',
  },
    el('div', { class: 'feuille-tete' },
      el('h2', { text: 'Un reglage vous a ete partage' }),
      el('div', { class: 'pousse' }),
      el('button', { class: 'btn fantome', type: 'button', text: 'Ignorer',
        onClick: fermerPartage })),

    el('div', { class: 'feuille-corps' },
      el('p', { class: 'aide',
        text: `${qui} vous attend dans ce lien${porte.length > 0 ? `, avec ${porte.join(', ')}` : ''}.` }),
      ...(compte.inconnues > 0
        ? [el('p', { class: 'aide',
          text: `${compte.inconnues} piece(s) du lien ne sont pas dans le catalogue : `
            + 'elles ne seront pas posees.' })]
        : []),
      el('p', { class: 'aide',
        text: 'L\'adopter remplace ce qui est a l\'ecran. Ctrl+Z le rend.' }),
      el('div', { class: 'ligne-lien' },
        el('button', { class: 'btn premier', type: 'button', text: 'Adopter ce reglage',
          onClick: () => { fermerPartage(); onAdopter(); } }),
        el('button', { class: 'btn fantome', type: 'button', text: 'Garder le mien',
          onClick: fermerPartage })),
    ),
  ));

  racine.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(racine);
}
