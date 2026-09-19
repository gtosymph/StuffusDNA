/**
 * La feuille de l'enchainement : comment les sorts choisis partent.
 *
 * Ces quatre reglages vivaient dans les reglages de calcul, entre le plafond
 * de resistance et le coup de reference. Ils n'y avaient rien a faire : ils
 * ne parlent que de la liste de sorts, qui se trouve trois metres plus loin
 * dans l'ecran. Un joueur qui venait de choisir six sorts n'avait aucune
 * raison d'aller chercher sous un engrenage la facon dont ils s'enchainent.
 *
 * La feuille s'ouvre donc depuis la liste elle-meme, et elle explique avant
 * de regler : « optimisateur de combo » ne veut rien dire tant que personne
 * n'a dit ce que l'outil compte quand il est eteint.
 */
import { el, renderOptions } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { optionsAffichees } from '../reglages.mjs';
import { rangerOptions } from './options.mjs';

let racine = null;
let libererFocus = null;

/** Ferme la feuille. */
export function fermerCombo() {
  if (!racine) return;
  racine.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/** Vrai quand la feuille est ouverte. */
export const comboOuvert = () => Boolean(racine) && !racine.hidden;

/**
 * Ouvre la feuille de l'enchainement.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {(cle: string, valeur: any) => void} liens.onOption
 */
export function ouvrirCombo({ lireEtat, onOption }) {
  if (!racine) {
    racine = el('div', { class: 'feuille-fond', hidden: true, onClick: (ev) => {
      if (ev.target === racine) fermerCombo();
    } });
    document.body.append(racine);
  }

  const corps = el('div', { class: 'options' });

  /** Redessine les quatre reglages : l'un d'eux grise les autres. */
  function dessiner() {
    const { sorts } = rangerOptions(optionsAffichees(lireEtat().options));
    renderOptions(corps, sorts, (cle, valeur) => {
      onOption(cle, valeur);
      dessiner();
    });
  }

  racine.replaceChildren(el('div', {
    class: 'feuille', role: 'dialog', 'aria-modal': 'true',
    'aria-label': 'Enchaînement des sorts',
  },
    el('div', { class: 'feuille-tete' },
      el('h2', { text: 'Enchaînement des sorts' }),
      el('div', { class: 'pousse' }),
      el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
        onClick: fermerCombo })),
    el('div', { class: 'feuille-corps' },
      el('p', { class: 'aide',
        text: 'Sans enchaînement, chaque sort de la liste compte une fois, '
          + 'quels que soient vos PA. Avec, l\'outil cherche le meilleur tour '
          + 'possible sous votre budget de PA : il relance un sort qui vaut le '
          + 'coup, et en laisse tomber un qui n\'entre pas.' }),
      corps,
      el('p', { class: 'aide',
        text: 'Le budget de PA vient du stuff trouvé : montez vos PA, et le '
          + 'tour se remplit tout seul. Gardez-en quelques-uns si vous voulez '
          + 'vous déplacer ou lancer un sort utilitaire dans le même tour.' })),
  ));

  dessiner();
  racine.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(racine);
}
