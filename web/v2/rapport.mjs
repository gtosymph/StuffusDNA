/**
 * Le rapport qu'un joueur envoie, et le lien qui l'emmene.
 *
 * Un retour sans contexte coute une demi-heure a qui le lit : quelle version,
 * quelle classe, quel reglage. Le joueur ne les connait pas, et n'a pas a les
 * connaitre. L'outil les sait tous, et il a mieux que cela — le lien de
 * partage porte le reglage ENTIER en sept cents caracteres. Un defaut signale
 * avec son lien se reproduit d'un clic ; sans lui, il se devine.
 *
 * Le rapport part vers un formulaire, PAS vers un ticket : un joueur de Dofus
 * n'a aucune raison d'avoir un compte GitHub, et demander un compte perd la
 * plupart des retours avant le premier mot. Le formulaire ne demande rien, et
 * il n'y a aucun secret a cacher dans la page — c'est ce qui permet de s'en
 * tenir a un site sans serveur.
 *
 * Rien n'est envoye dans le dos de personne : ce que le lien emporte se
 * montre en entier avant de partir.
 */

/** Ou les retours arrivent. Le formulaire ne demande aucun compte. */
export const FORMULAIRE = 'https://tally.so/r/2E2xLe';

/** Ou se lisent les defauts deja connus, pour qui veut regarder. */
export const DEPOT = 'https://github.com/gtosymph/TheBestRoxxeur';

/**
 * Le contexte, en une ligne.
 *
 * Il voyage dans un champ cache du formulaire, et un champ cache porte du
 * texte, pas une mise en page. Les quatre faits se separent donc par un point
 * median plutot que par des retours a la ligne, qui survivent mal a un
 * aller-retour dans une adresse.
 *
 * Chacun a deja servi a expliquer un defaut : le navigateur dit quelles
 * limites la machine pose, la classe et le niveau quel catalogue est en jeu,
 * la page si le joueur est en ligne ou chez lui.
 *
 * @param {object} liens
 * @param {string} liens.navigateur
 * @param {string} liens.page
 * @param {string} liens.personnage
 * @param {number} liens.pieces
 * @param {number} liens.sorts
 * @returns {string}
 */
export function contexteEnLigne({ navigateur, page, personnage, pieces, sorts }) {
  return [
    navigateur,
    personnage,
    `${pieces} pièce(s), ${sorts} sort(s)`,
    page,
  ].join(' · ');
}

/**
 * Le lien du formulaire, ses champs caches deja remplis.
 *
 * Les noms des trois champs sont ceux poses dans le formulaire, et ils sont
 * sensibles a la casse : un nom mal ecrit ne fait pas d'erreur, il fait
 * arriver un rapport vide. Le test les tient.
 *
 * @param {object} liens
 * @param {string} liens.version
 * @param {string} liens.contexte Sortie de `contexteEnLigne`.
 * @param {string|null} liens.lien Lien de partage, ou null.
 * @param {string} [liens.formulaire]
 * @returns {string}
 */
export function lienFormulaire({ version, contexte, lien, formulaire = FORMULAIRE }) {
  const champs = new URLSearchParams({
    version,
    contexte,
    // Un champ absent vaut mieux qu'un champ portant le mot « null ».
    ...(lien ? { lien } : {}),
  });
  return `${formulaire}?${champs.toString()}`;
}

/**
 * Le meme rapport en clair, a coller ailleurs.
 *
 * Tout le monde n'ira pas sur un formulaire : beaucoup diront la chose sur le
 * Discord, ou elle se discute mieux. Le texte porte alors les memes faits,
 * pour que la reponse ne commence pas par trois questions.
 *
 * @param {object} liens
 * @param {string} liens.version
 * @param {string} liens.contexte
 * @param {string|null} liens.lien
 * @returns {string}
 */
export function rapportACopier({ version, contexte, lien }) {
  return [
    `The Best Roxxeur ${version}`,
    contexte,
    ...(lien ? [`Mon réglage : ${lien}`] : []),
  ].join('\n');
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
