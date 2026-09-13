/**
 * Panneau « degats ou survie ».
 *
 * Le solveur rend le build le plus fort sous les conditions, dont celle de
 * vitalite. Le joueur hesite pourtant toujours au meme endroit : « et si je
 * lachais 500 points de vie ? ». Le panneau repond sans relancer quoi que ce
 * soit : pendant la recherche, le solveur a garde le build le plus fort de
 * chaque tranche de points de vie.
 *
 * La courbe se lit de haut en bas : plus de vie en haut, plus de degats en
 * bas. Le build porte y prend place : chaque ligne dit ce qu'elle lui coute
 * en vie et ce qu'elle lui rapporte en degats.
 */
import { el } from './render.mjs';
import { frontiereSurvie } from '../src/solver/survie.mjs';

const entier = (v) => Math.floor(v).toLocaleString('fr-FR');
const signe = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('fr-FR')}`;

/**
 * Lignes a montrer, du plus de vie au moins de vie, build porte compris.
 *
 * Le build porte entre dans la frontiere comme un palier : une ligne qui a
 * moins de vie ET moins de degats que lui n'a rien a dire, elle tombe. Ce qui
 * reste vaut l'echange dans un sens ou dans l'autre.
 *
 * @param {any[]} paliers Paliers rendus par le solveur.
 * @param {{pdv: number, damage: number}|null} porte Build pose sur le personnage.
 * @returns {{palier: any, porte: boolean, gainDegats: number|null, ecartPdv: number|null}[]}
 */
export function lignesSurvie(paliers, porte) {
  const mesurable = porte && Number.isFinite(porte.pdv) && Number.isFinite(porte.damage);
  // Un palier qui ne fait pas mieux que le build porte sur les deux mesures
  // n'a rien a dire — le build porte lui-meme compris, qui se retrouve dans
  // la courbe quand il vient du solveur.
  const utiles = mesurable
    ? paliers.filter((p) => p.damage > porte.damage || p.pdv > porte.pdv)
    : paliers;
  const entrees = mesurable ? [...utiles, { ...porte, porte: true }] : [...utiles];

  return frontiereSurvie(entrees).map((palier) => ({
    palier,
    porte: palier.porte === true,
    gainDegats: mesurable && !palier.porte ? palier.damage - porte.damage : null,
    ecartPdv: mesurable && !palier.porte ? palier.pdv - porte.pdv : null,
  }));
}

/**
 * Vignettes des pieces que le build porte n'a pas.
 * @param {any} palier
 * @param {{portees: Set<number>, itemById: Map<number, any>}} contexte
 */
function vignettes(palier, { portees, itemById }) {
  return (palier.itemIds ?? [])
    .filter((id) => !portees.has(id))
    .map((id) => itemById.get(id))
    .filter(Boolean)
    .map((piece) => el('img', {
      src: piece.img, alt: '', decoding: 'async', loading: 'lazy',
      title: `${piece.fr} — differe de votre build`,
    }));
}

/**
 * Remplit le panneau.
 *
 * @param {HTMLElement} racine
 * @param {any[]} paliers
 * @param {object} options
 * @param {{pdv: number, damage: number}|null} options.porte
 * @param {Set<number>} options.portees Pieces du build pose.
 * @param {Map<number, any>} options.itemById
 * @param {(palier: any) => void} options.onPorter
 * @returns {number} Nombre de lignes montrees, build porte non compris.
 */
export function renderSurvie(racine, paliers, options) {
  const { porte, portees, itemById, onPorter } = options;

  if (paliers.length === 0) {
    racine.replaceChildren(el('p', { class: 'note',
      text: 'Lancez une recherche : le solveur garde le build le plus fort de '
        + 'chaque tranche de points de vie qu\'il croise.' }));
    return 0;
  }

  const lignes = lignesSurvie(paliers, porte);
  const contexte = { portees, itemById };

  const ligneDepart = () => el('div', { class: 'palier depart' },
    el('div', { class: 'palier-cout', title: 'Votre build, tel qu\'il est pose' },
      el('strong', { text: entier(porte.pdv) }),
      el('span', { text: 'pdv' })),
    el('div', { class: 'palier-corps' },
      el('div', { class: 'palier-tete' },
        el('span', { class: 'palier-degats', text: `${entier(porte.damage)} degats` }),
        el('span', { class: 'palier-marque', text: 'votre build' }))));

  const lignePalier = ({ palier, gainDegats, ecartPdv }) => el('div', { class: 'palier' },
    el('div', { class: 'palier-cout', title: 'Points de vie de ce build' },
      el('strong', { text: entier(palier.pdv) }),
      el('span', { text: 'pdv' })),

    el('div', { class: 'palier-corps' },
      el('div', { class: 'palier-tete' },
        el('span', { class: 'palier-degats', title: 'Degats de ce build',
          text: `${entier(palier.damage)} degats` }),
        gainDegats === null ? null : el('span', {
          class: `palier-gain ${gainDegats >= 0 ? 'pos' : 'neg'}`,
          title: 'Degats gagnes ou perdus face a votre build',
          text: `${signe(gainDegats)} degats` }),
        ecartPdv === null ? null : el('span', {
          class: 'palier-ecart',
          title: 'Points de vie gagnes ou perdus face a votre build',
          text: `${signe(ecartPdv)} pdv` })),
      el('div', { class: 'palier-pieces' }, vignettes(palier, contexte))),

    el('button', { class: 'mini large', type: 'button', text: 'Porter',
      title: 'Pose ce build et sa repartition de points',
      onClick: () => onPorter(palier) }));

  // Rien sous le build porte : la condition de vie ne coute rien, et le
  // joueur doit le lire en toutes lettres plutot que chercher une ligne.
  const sousLeBuild = lignes.some((ligne) => ligne.ecartPdv !== null && ligne.ecartPdv < 0);

  racine.replaceChildren(
    el('p', { class: 'note',
      text: 'Le build le plus fort trouve pour chaque tranche de points de vie, '
        + 'points de caracteristique au service des degats. De haut en bas : '
        + 'moins de vie, plus de degats.' }),
    el('div', { class: 'paliers' },
      ...lignes.map((ligne) => (ligne.porte ? ligneDepart() : lignePalier(ligne)))),
    // replaceChildren ecrit « null » en toutes lettres : la note ne se passe
    // que si elle existe.
    ...(porte && !sousLeBuild
      ? [el('p', { class: 'note',
          text: 'Aucun build trouve avec moins de vie et plus de degats : lacher de '
            + 'la vie ne vous rapporterait rien ici.' })]
      : []),
  );

  return lignes.filter((ligne) => !ligne.porte).length;
}
