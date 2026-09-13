/**
 * Panneau « degats ou survie ».
 *
 * Le solveur rend le build le plus fort sous les conditions, dont celle de
 * vitalite. Le joueur hesite pourtant toujours au meme endroit : « et si je
 * lachais 500 points de vie ? ». Le panneau repond sans relancer quoi que ce
 * soit : pendant la recherche, le solveur a garde le build le plus fort de
 * chaque tranche d'endurance.
 *
 * L'axe est l'endurance, c'est-a-dire les points de vie une fois les
 * resistances comptees (src/engine/defense.mjs). Une piece qui rend vingt
 * pour cent de resistance vaut donc un quart de vie en plus, et le panneau
 * montre les deux nombres : ce que le jeu affiche, et ce que le personnage
 * encaisse vraiment.
 *
 * La courbe se lit de haut en bas : plus d'endurance en haut, plus de degats
 * en bas. Le build porte y prend place : chaque ligne dit ce qu'elle lui
 * coute en survie et ce qu'elle lui rapporte en degats.
 */
import { el } from './render.mjs';
import { frontiereSurvie } from '../src/solver/survie.mjs';

const entier = (v) => Math.floor(v).toLocaleString('fr-FR');
const signe = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('fr-FR')}`;

/**
 * Lignes a montrer, de la plus grande endurance a la plus petite, build porte
 * compris.
 *
 * Le build porte entre dans la frontiere comme un palier : une ligne qui tient
 * moins longtemps ET frappe moins fort que lui n'a rien a dire, elle tombe. Ce
 * qui reste vaut l'echange dans un sens ou dans l'autre.
 *
 * @param {any[]} paliers Paliers rendus par le solveur.
 * @param {{endurance: number, pdv: number, damage: number}|null} porte Build pose.
 * @returns {{palier: any, porte: boolean, gainDegats: number|null,
 *            ecartEndurance: number|null, ecartPdv: number|null}[]}
 */
export function lignesSurvie(paliers, porte) {
  const mesurable = porte && Number.isFinite(porte.endurance) && Number.isFinite(porte.damage);
  // Un palier qui ne fait pas mieux que le build porte sur les deux mesures
  // n'a rien a dire — le build porte lui-meme compris, qui se retrouve dans
  // la courbe quand il vient du solveur.
  const utiles = mesurable
    ? paliers.filter((p) => p.damage > porte.damage || p.endurance > porte.endurance)
    : paliers;
  const entrees = mesurable ? [...utiles, { ...porte, porte: true }] : [...utiles];

  return frontiereSurvie(entrees).map((palier) => ({
    palier,
    porte: palier.porte === true,
    gainDegats: mesurable && !palier.porte ? palier.damage - porte.damage : null,
    ecartEndurance: mesurable && !palier.porte ? palier.endurance - porte.endurance : null,
    ecartPdv: mesurable && !palier.porte && Number.isFinite(palier.pdv)
      && Number.isFinite(porte.pdv) ? palier.pdv - porte.pdv : null,
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
 * @param {{endurance: number, pdv: number, damage: number}|null} options.porte
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
        + 'chaque tranche d\'endurance qu\'il croise.' }));
    return 0;
  }

  const lignes = lignesSurvie(paliers, porte);
  const contexte = { portees, itemById };

  // Sous-ligne de vie : la vie du jeu, et ce que les resistances lui
  // ajoutent. Sans ces deux nombres, un joueur qui lit « 4 200 » ne retrouve
  // rien dans sa fiche de personnage.
  const ligneVie = (palier) => {
    if (!Number.isFinite(palier.pdv) || palier.pdv <= 0) return null;
    const apport = Math.round((palier.endurance / palier.pdv - 1) * 100);
    return el('div', { class: 'palier-vie',
      title: 'Points de vie du jeu, puis ce que vos resistances leur ajoutent',
      text: apport > 0
        ? `${entier(palier.pdv)} pdv, +${apport} % par vos resistances`
        : `${entier(palier.pdv)} pdv, aucune resistance` });
  };

  const ligneDepart = () => el('div', { class: 'palier depart' },
    el('div', { class: 'palier-cout', title: 'Votre build, tel qu\'il est pose' },
      el('strong', { text: entier(porte.endurance) }),
      el('span', { text: 'pdv eff.' })),
    el('div', { class: 'palier-corps' },
      el('div', { class: 'palier-tete' },
        el('span', { class: 'palier-degats', text: `${entier(porte.damage)} degats` }),
        el('span', { class: 'palier-marque', text: 'votre build' })),
      ...(ligneVie(porte) ? [ligneVie(porte)] : [])));

  const lignePalier = ({ palier, gainDegats, ecartEndurance }) => el('div', { class: 'palier' },
    el('div', { class: 'palier-cout',
      title: 'Degats bruts que ce build encaisse avant de tomber' },
      el('strong', { text: entier(palier.endurance) }),
      el('span', { text: 'pdv eff.' })),

    el('div', { class: 'palier-corps' },
      el('div', { class: 'palier-tete' },
        el('span', { class: 'palier-degats', title: 'Degats de ce build',
          text: `${entier(palier.damage)} degats` }),
        gainDegats === null ? null : el('span', {
          class: `palier-gain ${gainDegats >= 0 ? 'pos' : 'neg'}`,
          title: 'Degats gagnes ou perdus face a votre build',
          text: `${signe(gainDegats)} degats` }),
        ecartEndurance === null ? null : el('span', {
          class: 'palier-ecart',
          title: 'Endurance gagnee ou perdue face a votre build',
          text: `${signe(ecartEndurance)} pdv eff.` })),
      ...(ligneVie(palier) ? [ligneVie(palier)] : []),
      el('div', { class: 'palier-pieces' }, vignettes(palier, contexte))),

    el('button', { class: 'mini large', type: 'button', text: 'Porter',
      title: 'Pose ce build et sa repartition de points',
      onClick: () => onPorter(palier) }));

  // Rien sous le build porte : la condition de vie ne coute rien, et le
  // joueur doit le lire en toutes lettres plutot que chercher une ligne.
  const sousLeBuild = lignes.some(
    (ligne) => ligne.ecartEndurance !== null && ligne.ecartEndurance < 0);

  racine.replaceChildren(
    el('p', { class: 'note',
      text: 'Le build le plus fort trouve pour chaque tranche d\'endurance, points '
        + 'de caracteristique au service des degats. L\'endurance compte la vie ET '
        + 'les resistances : elle dit combien de degats bruts vous encaissez avant '
        + 'de tomber. De haut en bas : moins de survie, plus de degats.' }),
    el('div', { class: 'paliers' },
      ...lignes.map((ligne) => (ligne.porte ? ligneDepart() : lignePalier(ligne)))),
    // replaceChildren ecrit « null » en toutes lettres : la note ne se passe
    // que si elle existe.
    ...(porte && !sousLeBuild
      ? [el('p', { class: 'note',
          text: 'Aucun build trouve avec moins de survie et plus de degats : lacher '
            + 'de la vie ou des resistances ne vous rapporterait rien ici.' })]
      : []),
  );

  return lignes.filter((ligne) => !ligne.porte).length;
}
