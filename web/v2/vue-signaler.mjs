/**
 * Signaler un probleme, ou demander une amelioration.
 *
 * Le site n'a pas de serveur : rien ici ne peut recevoir un formulaire. Deux
 * sorties, donc, et le joueur choisit la sienne :
 *
 *   - un ticket GitHub deja rempli, pour qui a un compte ;
 *   - le rapport en clair, a coller ou il veut, pour tous les autres — et ils
 *     sont la majorite : un joueur de Dofus n'a aucune raison d'avoir un
 *     compte GitHub.
 *
 * Dans les deux cas, le rapport se montre EN ENTIER avant de partir. Un outil
 * qui ramasse la version, le navigateur et le reglage doit le dire, et le
 * montrer ; ce n'est pas negociable.
 */
import { el } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { lienPartage } from '../partage-lien.mjs';
import { VERSION_LUE } from '../version.mjs';
import {
  composerRapport, contexte, DEPOT, lienTicket, NATURES, navigateurLisible,
} from './rapport.mjs';

let racine = null;
let libererFocus = null;

/** Ferme la feuille. */
export function fermerSignaler() {
  if (!racine) return;
  racine.remove();
  racine = null;
  libererFocus?.();
  libererFocus = null;
}

/** Vrai quand la feuille est ouverte. */
export const signalerOuvert = () => racine !== null;

/**
 * Ouvre la feuille du signalement.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {(classe: number) => string} liens.nomDeClasse
 * @param {(texte: string, type?: string) => void} liens.message
 */
export async function ouvrirSignaler({ lireEtat, nomDeClasse, message }) {
  fermerSignaler();
  const etat = lireEtat();

  // Le lien de partage est ce qui rend un defaut reproductible. S'il echoue,
  // le rapport part quand meme : mieux vaut un retour sans lien que pas de
  // retour du tout.
  let lien = null;
  try {
    lien = await lienPartage(etat, location.href);
  } catch {
    lien = null;
  }

  const faits = contexte({
    version: VERSION_LUE,
    navigateur: navigateurLisible(navigator.userAgent),
    adresse: `${location.origin}${location.pathname}`,
    personnage: `${nomDeClasse(etat.classe)} ${etat.niveau}`,
    pieces: etat.equipped?.size ?? 0,
    sorts: etat.sorts?.length ?? 0,
  });

  let nature = NATURES[0].cle;

  const dire = el('textarea', { class: 'champ-dire', rows: 5,
    placeholder: 'Ce qui s\'est passe, ce que vous attendiez. Une ligne suffit.',
    onInput: () => rafraichir() });

  const apercu = el('pre', { class: 'apercu-rapport' });
  const choixNature = el('div', { class: 'segmente', style: 'width:100%' });
  const aideNature = el('p', { class: 'aide' });

  const versGitHub = el('a', { class: 'btn premier', target: '_blank', rel: 'noopener noreferrer',
    text: 'Ouvrir un ticket GitHub' });
  const copier = el('button', { class: 'btn', type: 'button', text: 'Copier le rapport',
    onClick: async () => {
      const { corps, titre } = rapport();
      try {
        await navigator.clipboard.writeText(`${titre}\n\n${corps}`);
        message('Rapport copie. Collez-le ou vous voulez : Discord, courriel…');
      } catch {
        // Hors HTTPS le presse-papier est refuse : le texte reste lisible et
        // se selectionne a la main.
        message('Le navigateur refuse le presse-papier. Le rapport est '
          + 'selectionne : copiez-le a la main.', 'info');
        const plage = document.createRange();
        plage.selectNodeContents(apercu);
        const choix = window.getSelection();
        choix.removeAllRanges();
        choix.addRange(plage);
      }
    } });

  /** Le rapport tel qu'il est a cet instant. */
  const rapport = () => composerRapport({ nature, texte: dire.value, contexte: faits, lien });

  /** Redessine le choix de nature, l'apercu et le lien du ticket. */
  function rafraichir() {
    choixNature.replaceChildren(...NATURES.map((quoi) => el('button', {
      type: 'button', style: 'flex:1', 'aria-pressed': String(nature === quoi.cle),
      onClick: () => { nature = quoi.cle; rafraichir(); },
    }, quoi.nom)));

    const quoi = NATURES.find((n) => n.cle === nature);
    aideNature.textContent = quoi.aide;

    const { titre, corps } = rapport();
    apercu.textContent = `${titre}\n\n${corps}`;
    versGitHub.href = lienTicket({ titre, corps, etiquette: quoi.etiquette });
  }

  racine = el('div', { class: 'feuille-fond', onClick: (ev) => {
    if (ev.target === racine) fermerSignaler();
  } },
    el('div', { class: 'feuille', role: 'dialog', 'aria-modal': 'true',
      'aria-label': 'Signaler' },
      el('div', { class: 'feuille-tete' },
        el('h2', { text: 'Signaler' }),
        el('div', { class: 'pousse' }),
        el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
          onClick: fermerSignaler })),
      el('div', { class: 'feuille-corps' },
        choixNature,
        aideNature,
        dire,
        el('p', { class: 'aide',
          text: lien
            ? 'Le rapport emporte votre reglage exact par un lien : le defaut '
              + 'se reproduit en l\'ouvrant, sans rien avoir a deviner.'
            : 'Le lien de votre reglage n\'a pas pu etre fabrique : le rapport '
              + 'part sans lui.' }),
        el('h3', { class: 'titre-reglage', text: 'Ce qui partira, en entier' }),
        apercu,
        el('div', { class: 'ligne-gestes' }, versGitHub, copier),
        el('p', { class: 'aide' },
          'Le ticket demande un compte GitHub. Sans compte, copiez le rapport '
          + 'et collez-le sur le Discord. Les tickets ouverts se lisent ici : ',
          el('a', { href: `${DEPOT}/issues`, target: '_blank', rel: 'noopener noreferrer',
            text: 'la liste des tickets' }),
          '.'))));

  document.body.append(racine);
  rafraichir();
  libererFocus = piegerFocus(racine);
  dire.focus();
}
