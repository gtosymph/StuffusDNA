/**
 * La feuille des reglages : les options qui ne se lisent pas a cote d'un
 * nombre.
 *
 * Elles restent nombreuses, mais elles ont ceci en commun : on n'en a besoin
 * qu'une fois, pour dire comment on joue. Une fois dites, elles ne se
 * reregardent plus. C'est exactement ce qu'une feuille sait porter.
 *
 * Le rangement par groupe vient de `GROUPES_OPTIONS` : ce n'est pas a v2 de
 * decider que « Portee de l'arme » va sous « Arme ».
 */
import { el, renderOptions } from '../render.mjs';
import { piegerFocus } from '../focus-piege.mjs';
import { GROUPES_OPTIONS, optionsAffichees } from '../reglages.mjs';
import { rangerOptions } from './options.mjs';
import { renderChoixTheme } from './vue-theme.mjs';

let racine = null;
let libererFocus = null;

/** Ferme la feuille. */
export function fermerReglages() {
  if (!racine) return;
  racine.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/** Vrai quand la feuille est ouverte. */
export const reglagesOuverts = () => Boolean(racine) && !racine.hidden;

/**
 * Ouvre la feuille des reglages.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {(cle: string, valeur: any) => void} liens.onOption
 */
export function ouvrirReglages({ lireEtat, onOption }) {
  if (!racine) {
    racine = el('div', { class: 'feuille-fond', hidden: true, onClick: (ev) => {
      if (ev.target === racine) fermerReglages();
    } });
    document.body.append(racine);
  }

  const corps = el('div', { class: 'options' });
  const themes = el('div', { class: 'themes' });

  // Les commandes du moteur ne sont pas recreees : la feuille adopte celles
  // du document. Un champ recree perdrait sa valeur a chaque ouverture, et la
  // recherche lit ces champs meme quand la feuille n'a jamais ete ouverte.
  const moteur = document.getElementById('reglages-moteur');
  if (moteur) moteur.hidden = false;

  /** Change une option, puis redessine la seule feuille. */
  function dessiner() {
    const { reglages } = rangerOptions(optionsAffichees(lireEtat().options));
    renderOptions(corps, reglages, (cle, valeur) => {
      onOption(cle, valeur);
      dessiner();
    }, GROUPES_OPTIONS);
  }

  racine.replaceChildren(el('div', {
    class: 'feuille large', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reglages',
  },
    el('div', { class: 'feuille-tete' },
      el('h2', { text: 'Reglages' }),
      el('div', { class: 'pousse' }),
      el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
        onClick: fermerReglages })),
    el('div', { class: 'feuille-corps' },
      el('h3', { class: 'titre-reglage', text: 'Le calcul' }),
      corps,
      el('p', { class: 'aide',
        text: 'Ces réglages disent comment vous jouez. Ceux qui changent ce '
          + 'qu\'un nombre veut dire se lisent à côté de ce nombre, pas ici.' }),
      el('h3', { class: 'titre-reglage', text: 'Le moteur' }),
      moteur,
      el('p', { class: 'aide',
        text: 'Plus de fils cherchent plus vite et chauffent plus. L\'intensité '
          + 'dit quelle part du temps ils calculent : basse, la machine souffle. '
          + 'L\'arrêt automatique compte les générations depuis le lancement : la '
          + 'recherche se met en pause toute seule, et « Chercher » repart d\'ou '
          + 'elle en était. Mettez 0 pour ne jamais vous arrêter. '
          + 'Repartir de zéro jette la population en cours — à faire quand vous '
          + 'avez beaucoup change de réglages.' }),

      el('h3', { class: 'titre-reglage', text: 'L\'habillage' }),
      themes,
      el('p', { class: 'aide',
        text: 'Survolez pour essayer, cliquez pour garder. Un habillage ne '
          + 'change que des couleurs : il ne peut rien casser.' })),
  ));

  dessiner();
  renderChoixTheme(themes);
  racine.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(racine);
}
