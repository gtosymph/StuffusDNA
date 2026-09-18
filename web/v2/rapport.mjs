/**
 * Le rapport qu'un joueur envoie, et le lien qui l'emmene.
 *
 * Un retour sans contexte coute une demi-heure a qui le lit : quelle version,
 * quelle classe, quel reglage. Le joueur ne les connait pas, et n'a pas a les
 * connaitre. L'outil les sait tous, et il a mieux que cela — le lien de
 * partage porte le reglage ENTIER en sept cents caracteres. Un defaut signale
 * avec son lien se reproduit d'un clic ; sans lui, il se devine.
 *
 * Rien n'est envoye dans le dos de personne : le rapport se montre en entier
 * avant de partir, et il ne part que par un geste du joueur — un ticket qu'il
 * ouvre, ou un texte qu'il colle ou il veut.
 */

/** Ou vont les tickets. */
export const DEPOT = 'https://github.com/gtosymph/TheBestRoxxeur';

/**
 * Longueur au-dela de laquelle GitHub refuse l'adresse.
 *
 * Il rend alors une page « 414 URI Too Long », sans rien expliquer. La borne
 * reelle depend du serveur ; six mille laisse de la marge sous toutes celles
 * qu'on rencontre, et un rapport plus long que cela n'est de toute facon plus
 * lu.
 */
export const LONGUEUR_MAX = 6000;

/** Les deux natures de retour, et ce qu'elles deviennent chez GitHub. */
export const NATURES = Object.freeze([
  { cle: 'probleme', nom: 'Un probleme', etiquette: 'bug',
    aide: 'Quelque chose ne marche pas, ou ne dit pas la verite.' },
  { cle: 'amelioration', nom: 'Une amelioration', etiquette: 'enhancement',
    aide: 'Quelque chose manque, ou pourrait mieux se faire.' },
]);

/**
 * Le contexte que l'outil ajoute de lui-meme.
 *
 * Il tient en cinq lignes, et chacune a deja servi a expliquer un defaut :
 * la version dit quel code tourne, le navigateur quelles limites il pose, la
 * classe et le niveau quel catalogue est en jeu, l'adresse si le joueur est
 * en ligne ou sur sa machine.
 *
 * @param {object} liens
 * @param {string} liens.version
 * @param {string} liens.navigateur
 * @param {string} liens.adresse
 * @param {string} liens.personnage
 * @param {number} liens.pieces
 * @param {number} liens.sorts
 * @returns {string}
 */
export function contexte({ version, navigateur, adresse, personnage, pieces, sorts }) {
  return [
    `- Version : ${version}`,
    `- Page : ${adresse}`,
    `- Navigateur : ${navigateur}`,
    `- Personnage : ${personnage}`,
    `- Stuff : ${pieces} piece(s), ${sorts} sort(s)`,
  ].join('\n');
}

/**
 * Compose le rapport, tel qu'il partira.
 *
 * @param {object} liens
 * @param {string} liens.nature Cle d'une des `NATURES`.
 * @param {string} liens.texte Ce que le joueur a ecrit.
 * @param {string} liens.contexte Sortie de `contexte()`.
 * @param {string|null} liens.lien Lien de partage, ou null.
 * @returns {{titre: string, corps: string}}
 */
export function composerRapport({ nature, texte, contexte: faits, lien }) {
  const dit = (texte ?? '').trim();
  const quoi = NATURES.find((n) => n.cle === nature) ?? NATURES[0];

  // Le titre reprend la premiere ligne de ce que le joueur a ecrit : c'est
  // lui qui sait nommer son probleme, pas nous.
  const premiere = dit.split('\n')[0].trim();
  const titre = premiere.length > 0
    ? `${premiere.slice(0, 72)}${premiere.length > 72 ? '…' : ''}`
    : `${quoi.nom} sans titre`;

  const corps = [
    dit.length > 0 ? dit : '(rien n\'a ete ecrit)',
    '',
    '---',
    faits,
    ...(lien ? ['', `Le reglage exact : ${lien}`] : []),
  ].join('\n');

  return { titre, corps };
}

/**
 * Le lien qui ouvre le ticket, deja rempli.
 *
 * Le corps se coupe plutot que de fabriquer une adresse que GitHub refuse :
 * un rapport ampute vaut mieux qu'une page d'erreur.
 *
 * @param {object} liens
 * @param {string} liens.titre
 * @param {string} liens.corps
 * @param {string} liens.etiquette
 * @param {string} [liens.depot]
 * @returns {string}
 */
export function lienTicket({ titre, corps, etiquette, depot = DEPOT }) {
  const adresse = (texte) => `${depot}/issues/new?`
    + new URLSearchParams({ title: titre, body: texte, labels: etiquette }).toString();

  let texte = corps;
  while (adresse(texte).length > LONGUEUR_MAX && texte.length > 0) {
    texte = `${texte.slice(0, Math.max(0, texte.length - 200)).trimEnd()}\n[…]`;
  }
  return adresse(texte);
}

/**
 * Le navigateur, en trois mots.
 *
 * La chaine complete d'un navigateur fait deux cents caracteres illisibles et
 * ment sur la moitie d'entre eux. Trois familles suffisent a expliquer les
 * defauts qu'on voit vraiment, et la version dit le reste.
 *
 * @param {string} chaine `navigator.userAgent`.
 * @returns {string}
 */
export function navigateurLisible(chaine) {
  const texte = String(chaine ?? '');
  const famille = [
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ].map(([motif, nom]) => {
    const trouve = texte.match(motif);
    return trouve ? `${nom} ${trouve[1].split('.')[0]}` : null;
  }).find(Boolean);

  const systeme = [
    [/Windows NT/, 'Windows'],
    [/Mac OS X/, 'macOS'],
    [/Android/, 'Android'],
    [/(iPhone|iPad)/, 'iOS'],
    [/Linux/, 'Linux'],
  ].map(([motif, nom]) => (motif.test(texte) ? nom : null)).find(Boolean);

  return [famille, systeme].filter(Boolean).join(' · ') || 'inconnu';
}
