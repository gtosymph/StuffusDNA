/**
 * Section « meilleur remplacement par case » du bloc Analyse.
 *
 * L'apport dit ce que vaut chaque piece portee ; cette section dit quoi
 * acheter : pour chaque case, la piece du catalogue qui rapporte le plus a
 * sa place, et le gain. Un clic la pose.
 */
import { el } from './render.mjs';
import { cacherBulle, montrerBulle, suivreBulle } from './hover-card.mjs';

const entier = (v) => Math.floor(v).toLocaleString('fr-FR');

/** Vignette d'une piece, avec sa bulle au survol. */
function vignette(piece, classe) {
  if (!piece?.img) return el('span', { class: `${classe} vide`, title: 'Case vide' });
  return el('img', {
    class: classe, src: piece.img, alt: '', decoding: 'async', loading: 'lazy',
    onMouseenter: (ev) => montrerBulle(piece, ev.clientX, ev.clientY, { ancre: ev.currentTarget }),
    onMousemove: (ev) => suivreBulle(ev.clientX, ev.clientY),
    onMouseleave: cacherBulle,
  });
}

/**
 * Remplit la section.
 *
 * @param {HTMLElement} racine
 * @param {any[]} propositions Rendues par meilleursRemplacements, deja triees.
 * @param {object} options
 * @param {boolean} options.tenu Vrai quand le build porte tient ses conditions.
 * @param {(proposition: any) => void} options.onEquiper
 */
export function renderRemplacements(racine, propositions, { tenu, onEquiper }) {
  if (propositions.length === 0) {
    racine.replaceChildren(el('p', { class: 'note', text: tenu
      ? 'Aucune pièce du catalogue ne fait mieux a sa place, a points egaux. '
        + 'Le prochain gain demande de changer plusieurs pièces : lancez une recherche.'
      : 'Aucune pièce seule ne redresse vos conditions : il en faut plusieurs, '
        + 'lancez une recherche.' }));
    return;
  }

  const fort = Math.max(1, ...propositions.map((p) => p.gainDegats));
  racine.replaceChildren(
    el('p', { class: 'note', text: tenu
      ? 'Pour chaque case, la pièce qui rapporte le plus a sa place, points inchanges.'
      : 'Votre build laisse une condition en défaut : voici les pièces qui, seules, la redressent.' }),
    ...propositions.map((p) => {
      const part = Math.min(100, Math.round((Math.max(0, p.gainDegats) / fort) * 100));
      return el('div', { class: 'remplacement',
        title: p.actuel
          ? `${p.actuel.fr} → ${p.remplacant.fr}`
          : `Case vide → ${p.remplacant.fr}` },
        vignette(p.actuel, 'apport-icone'),
        el('span', { class: 'remplacement-fleche', text: '→' }),
        vignette(p.remplacant, 'apport-icone'),
        el('span', { class: 'apport-nom', text: p.remplacant.fr }),
        el('span', { class: 'apport-jauge' }, el('i', { style: `width:${part}%` })),
        p.redresse
          ? el('span', { class: 'apport-marque', title: 'Redresse une condition en défaut', text: '!' })
          : null,
        el('span', { class: `apport-valeur ${p.gainDegats >= 0 ? '' : 'neg'}`.trim(),
          text: `${p.gainDegats >= 0 ? '+' : '−'}${entier(Math.abs(p.gainDegats))}` }),
        el('button', { class: 'mini', type: 'button', text: 'Poser',
          title: 'Pose cette pièce a la place de l\'actuelle', onClick: () => onEquiper(p) }));
    }),
  );
}
