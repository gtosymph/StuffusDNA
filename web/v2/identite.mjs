/**
 * Qui est le personnage : classe, niveau, sexe.
 *
 * Trois reglages qui ne bougent presque jamais, mais dont tout depend : le
 * niveau commande les points de caracteristique et les pieces accessibles, la
 * classe commande les sorts. Ils ne meritent pas un volet permanent, et ils ne
 * meritent surtout pas d'etre introuvables : la pastille de la barre les porte
 * et les ouvre.
 *
 * Le niveau se borne a la SAISIE, jamais a l'enregistrement : un champ vide en
 * cours de frappe ne doit pas ecrire « niveau 1 » dans l'etat.
 */
import { el } from '../render.mjs';
import { avatarDeClasse, CLASSES } from '../classes.mjs';

/** Bornes du niveau, celles du jeu. */
export const NIVEAU_MIN = 1;
export const NIVEAU_MAX = 200;

/**
 * Niveau retenu pour une saisie, ou null si la saisie n'en est pas un.
 *
 * Null n'est pas une erreur : c'est un champ en cours de frappe. L'appelant
 * laisse alors l'etat tranquille au lieu d'y ecrire une valeur inventee.
 *
 * @param {string|number} saisie
 * @returns {number|null}
 */
export function niveauValide(saisie) {
  const texte = String(saisie ?? '').trim();
  if (texte === '') return null;

  const valeur = Number(texte);
  if (!Number.isFinite(valeur)) return null;
  return Math.max(NIVEAU_MIN, Math.min(NIVEAU_MAX, Math.trunc(valeur)));
}

let racine = null;

/** Ferme la feuille. */
export function fermerIdentite() {
  if (racine) racine.hidden = true;
}

/**
 * Ouvre la feuille du personnage.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {(patch: object) => void} liens.setEtat
 */
export function ouvrirIdentite({ lireEtat, setEtat }) {
  if (!racine) {
    racine = el('div', { class: 'feuille-fond', hidden: true, onClick: (ev) => {
      if (ev.target === racine) fermerIdentite();
    } });
    document.body.append(racine);
  }

  const etat = lireEtat();

  const champNiveau = el('input', {
    type: 'number', class: 'n', id: 'champ-niveau',
    min: String(NIVEAU_MIN), max: String(NIVEAU_MAX), value: String(etat.niveau),
    onChange: (ev) => {
      const niveau = niveauValide(ev.target.value);
      if (niveau === null) {
        ev.target.value = String(lireEtat().niveau);
        return;
      }
      ev.target.value = String(niveau);
      setEtat({ niveau });
    },
  });

  const listeClasses = el('select', {
    id: 'champ-classe',
    onChange: (ev) => { setEtat({ classe: Number(ev.target.value) }); redessiner(); },
  }, ...CLASSES.map((c) => el('option', {
    value: String(c.id), ...(c.id === etat.classe ? { selected: true } : {}), text: c.fr,
  })));

  const sexe = el('div', { class: 'segmente', id: 'champ-sexe' },
    ...[[0, '♂'], [1, '♀']].map(([valeur, signe]) => el('button', {
      type: 'button', 'aria-pressed': String(etat.sexe === valeur),
      onClick: () => { setEtat({ sexe: valeur }); redessiner(); },
      text: signe,
    })));

  function redessiner() {
    fermerIdentite();
    ouvrirIdentite({ lireEtat, setEtat });
  }

  racine.replaceChildren(el('div', {
    class: 'feuille', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mon personnage',
  },
    el('div', { class: 'feuille-tete' },
      el('h2', { text: 'Mon personnage' }),
      el('div', { class: 'pousse' }),
      el('button', { class: 'btn fantome', type: 'button', text: 'Fermer',
        onClick: fermerIdentite })),

    el('div', { class: 'feuille-corps' },
      el('div', { class: 'portrait' },
        el('img', { src: avatarDeClasse(etat.classe, etat.sexe), alt: '' })),

      el('label', { class: 'rangee-reglage', for: 'champ-classe' },
        el('span', { text: 'Classe' }), listeClasses),

      el('label', { class: 'rangee-reglage', for: 'champ-niveau' },
        el('span', { text: 'Niveau' }), champNiveau),

      el('div', { class: 'rangee-reglage' },
        el('span', { text: 'Sexe' }), sexe),

      el('p', { class: 'aide',
        text: 'Le niveau commande vos points de caractéristique et les pièces '
          + 'que vous pouvez porter. La classe commande vos sorts.' })),
  ));

  racine.hidden = false;
}
