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
import { AXE_ENDURANCE, frontiereSurvie } from '../src/solver/survie.mjs';
import { scoreMixte } from '../src/solver/score.mjs';

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
export function lignesSurvie(paliers, porte, axe = AXE_ENDURANCE) {
  const mesurable = porte
    && Number.isFinite(porte[axe.cle]) && Number.isFinite(porte[axe.valeur]);
  // Un palier qui ne fait pas mieux que le build porte sur les deux mesures
  // n'a rien a dire — le build porte lui-meme compris, qui se retrouve dans
  // la courbe quand il vient du solveur.
  const utiles = mesurable
    ? paliers.filter((p) => p[axe.valeur] > porte[axe.valeur] || p[axe.cle] > porte[axe.cle])
    : paliers;
  const entrees = mesurable ? [...utiles, { ...porte, porte: true }] : [...utiles];

  return frontiereSurvie(entrees, axe).map((palier) => ({
    palier,
    porte: palier.porte === true,
    // `gain` porte ce que la courbe maximise, `ecart` ce qu'elle tranche.
    gain: mesurable && !palier.porte ? palier[axe.valeur] - porte[axe.valeur] : null,
    ecart: mesurable && !palier.porte ? palier[axe.cle] - porte[axe.cle] : null,
    ecartPdv: mesurable && !palier.porte && Number.isFinite(palier.pdv)
      && Number.isFinite(porte.pdv) ? palier.pdv - porte.pdv : null,
  }));
}

/**
 * Rang de la ligne que le mode mixte retient.
 *
 * La courbe montre deja tous les compromis tenables : le curseur de la part
 * des degats ne fait que choisir un point dessus. Le marquer repond d'un coup
 * d'oeil a « ou m'a mene mon reglage ? », et bouger le curseur montre le
 * marqueur glisser le long de la courbe.
 *
 * @param {{palier: {damage: number, endurance: number}}[]} lignes
 * @param {number|null} [part] Part des degats, ou null hors mode mixte.
 * @returns {number|null} Rang de la ligne retenue, ou null.
 */
export function palierRetenu(lignes, part) {
  if (part === null || part === undefined || lignes.length === 0) return null;

  let meilleur = null;
  let rang = null;
  for (let i = 0; i < lignes.length; i += 1) {
    const { damage = 0, endurance = 0 } = lignes[i].palier ?? {};
    const note = scoreMixte(damage, endurance, part);
    if (meilleur === null || note > meilleur) {
      meilleur = note;
      rang = i;
    }
  }
  return rang;
}

/** Libelles de chaque mesure, par cle de palier. */
const MESURES = Object.freeze({
  endurance: {
    unite: 'pdv eff.',
    long: 'pdv effectifs',
    titreColonne: 'Degats bruts que ce build encaisse avant de tomber',
    titreTete: 'Endurance de ce build',
  },
  damage: {
    unite: 'degats',
    long: 'degats',
    titreColonne: 'Degats de ce build',
    titreTete: 'Degats de ce build',
  },
});

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
 * @param {number|null} [options.part] Part des degats en mode mixte, sinon null.
 * @returns {number} Nombre de lignes montrees, build porte non compris.
 */
export function renderSurvie(racine, paliers, options) {
  const { porte, portees, itemById, onPorter, axe = AXE_ENDURANCE, part = null } = options;
  const trancheeSur = MESURES[axe.cle];
  const maximisee = MESURES[axe.valeur];

  if (paliers.length === 0) {
    racine.replaceChildren(el('p', { class: 'note',
      text: `Lancez une recherche : le solveur garde le meilleur build de chaque `
        + `tranche de ${trancheeSur.long} qu'il croise.` }));
    return 0;
  }

  const lignes = lignesSurvie(paliers, porte, axe);
  const contexte = { portees, itemById };
  // En mode mixte, le curseur choisit un point sur cette courbe : le marquer
  // rend le reglage visible, et le bouger montre le marqueur glisser.
  const retenu = palierRetenu(lignes, part);

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
      el('strong', { text: entier(porte[axe.cle]) }),
      el('span', { text: trancheeSur.unite })),
    el('div', { class: 'palier-corps' },
      el('div', { class: 'palier-tete' },
        el('span', { class: 'palier-degats',
          text: `${entier(porte[axe.valeur])} ${maximisee.unite}` }),
        el('span', { class: 'palier-marque', text: 'votre build' })),
      ...(ligneVie(porte) ? [ligneVie(porte)] : [])));

  const lignePalier = ({ palier, gain, ecart }, rang) => el('div',
    { class: `palier ${rang === retenu ? 'retenu' : ''}`.trim() },
    el('div', { class: 'palier-cout', title: trancheeSur.titreColonne },
      el('strong', { text: entier(palier[axe.cle]) }),
      el('span', { text: trancheeSur.unite })),

    el('div', { class: 'palier-corps' },
      el('div', { class: 'palier-tete' },
        el('span', { class: 'palier-degats', title: maximisee.titreTete,
          text: `${entier(palier[axe.valeur])} ${maximisee.unite}` }),
        rang === retenu ? el('span', { class: 'palier-marque retenu',
          title: 'Le point que votre reglage de part des degats retient',
          text: 'votre reglage' }) : null,
        gain === null ? null : el('span', {
          class: `palier-gain ${gain >= 0 ? 'pos' : 'neg'}`,
          title: `${maximisee.long} gagnes ou perdus face a votre build`,
          text: `${signe(gain)} ${maximisee.unite}` }),
        ecart === null ? null : el('span', {
          class: 'palier-ecart',
          title: `${trancheeSur.long} gagnes ou perdus face a votre build`,
          text: `${signe(ecart)} ${trancheeSur.unite}` })),
      ...(ligneVie(palier) ? [ligneVie(palier)] : []),
      el('div', { class: 'palier-pieces' }, vignettes(palier, contexte))),

    el('button', { class: 'mini large', type: 'button', text: 'Porter',
      title: 'Pose ce build et sa repartition de points',
      onClick: () => onPorter(palier) }));

  // Rien sous le build porte : la condition de vie ne coute rien, et le
  // joueur doit le lire en toutes lettres plutot que chercher une ligne.
  const sousLeBuild = lignes.some((ligne) => ligne.ecart !== null && ligne.ecart < 0);

  const entete = axe.cle === 'endurance'
    ? 'Le build le plus fort trouve pour chaque tranche d\'endurance, points de '
      + 'caracteristique au service des degats. L\'endurance compte la vie ET les '
      + 'resistances : elle dit combien de degats bruts vous encaissez avant de '
      + 'tomber. De haut en bas : moins de survie, plus de degats.'
    : 'Le build le plus resistant trouve pour chaque tranche de degats. De haut '
      + 'en bas : moins de degats, plus d\'endurance.';

  racine.replaceChildren(
    el('p', { class: 'note', text: entete }),
    el('div', { class: 'paliers' },
      ...lignes.map((ligne, rang) => (ligne.porte ? ligneDepart() : lignePalier(ligne, rang)))),
    // replaceChildren ecrit « null » en toutes lettres : la note ne se passe
    // que si elle existe.
    ...(porte && !sousLeBuild
      ? [el('p', { class: 'note',
          text: axe.cle === 'endurance'
            ? 'Aucun build trouve avec moins de survie et plus de degats : lacher '
              + 'de la vie ou des resistances ne vous rapporterait rien ici.'
            : 'Aucun build trouve avec moins de degats et plus d\'endurance : '
              + 'lacher des degats ne vous rapporterait rien ici.' })]
      : []),
  );

  return lignes.filter((ligne) => !ligne.porte).length;
}
