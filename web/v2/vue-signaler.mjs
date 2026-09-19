/**
 * Signaler un probleme, ou demander une amelioration.
 *
 * Le site n'a pas de serveur : rien ici ne peut recevoir un formulaire. Il en
 * ouvre donc un, chez un hebergeur qui ne demande aucun compte au joueur —
 * c'est la seule facon de ne pas perdre la plupart des retours avant le
 * premier mot. Un joueur de Dofus n'a aucune raison d'avoir un compte chez un
 * outil de developpeurs.
 *
 * Le joueur ecrit LA-BAS, pas ici. Ecrire deux fois la meme phrase est la
 * seule chose plus penible que de ne pas pouvoir la dire ; cette feuille ne
 * demande donc rien. Elle explique, elle montre ce qui va voyager avec le
 * message, et elle ouvre la porte.
 *
 * Ce qui voyage se montre EN ENTIER. Un outil qui ramasse le navigateur et le
 * reglage doit le dire, et le montrer ; ce n'est pas negociable.
 */
import { el } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { lienPartage } from '../partage-lien.mjs';
import { VERSION_LUE } from '../version.mjs';
import {
  contexteEnLigne, DEPOT, lienFormulaire, navigateurLisible, rapportACopier,
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

  const contexte = contexteEnLigne({
    navigateur: navigateurLisible(navigator.userAgent),
    page: `${location.origin}${location.pathname}`,
    personnage: `${nomDeClasse(etat.classe)} ${etat.niveau}`,
    pieces: etat.equipped?.size ?? 0,
    sorts: etat.sorts?.length ?? 0,
  });

  const aCopier = rapportACopier({ version: VERSION_LUE, contexte, lien });
  const apercu = el('pre', { class: 'apercu-rapport', text: aCopier });

  const versFormulaire = el('a', {
    class: 'btn premier', target: '_blank', rel: 'noopener noreferrer',
    href: lienFormulaire({ version: VERSION_LUE, contexte, lien }),
    text: 'Ouvrir le formulaire',
    // La feuille se ferme en partant : revenir sur une feuille restee
    // ouverte, apres avoir envoye, laisse croire que rien n'est parti.
    onClick: () => setTimeout(fermerSignaler, 200),
  });

  const copier = el('button', { class: 'btn', type: 'button', text: 'Copier ces informations',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(aCopier);
        message('Informations copiées. Collez-les avec votre message.');
      } catch {
        // Hors HTTPS le presse-papier est refuse : le texte reste lisible et
        // se selectionne a la main.
        message('Le navigateur refuse le presse-papier. Le texte est '
          + 'sélectionné : copiez-le à la main.', 'info');
        const plage = document.createRange();
        plage.selectNodeContents(apercu);
        const choix = window.getSelection();
        choix.removeAllRanges();
        choix.addRange(plage);
      }
    } });

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
        el('p', { class: 'aide',
          text: 'Un défaut, une idée, un chiffre qui vous paraît faux : dites-le. '
            + 'Le formulaire ne demande aucun compte, et prend une minute.' }),
        el('h3', { class: 'titre-reglage', text: 'Ce qui partira avec votre message' }),
        apercu,
        el('p', { class: 'aide',
          text: lien
            ? 'Le lien porte votre réglage exact : un défaut se reproduit en '
              + 'l\'ouvrant, au lieu de se deviner. Rien d\'autre ne voyage — '
              + 'ni nom, ni adresse, ni compte.'
            : 'Le lien de votre réglage n\'a pas pu être fabriqué : le rapport '
              + 'part sans lui.' }),
        el('div', { class: 'ligne-gestes' }, versFormulaire, copier),
        el('p', { class: 'aide' },
          'Vous pouvez aussi en parler sur le Discord : collez-y ces '
          + 'informations avec votre message. Les défauts déjà connus se '
          + 'lisent ici : ',
          el('a', { href: `${DEPOT}/issues`, target: '_blank', rel: 'noopener noreferrer',
            text: 'la liste des tickets' }),
          '.'))));

  document.body.append(racine);
  libererFocus = piegerFocus(racine);
  versFormulaire.focus();
}
