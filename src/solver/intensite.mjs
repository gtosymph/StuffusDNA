/**
 * Bride d'intensite de la recherche.
 *
 * Les fils de calcul saturent le processeur : c'est ce qu'on leur demande,
 * mais une machine qui chauffe pendant une heure devient penible a utiliser.
 * L'intensite dit quelle part du temps les fils travaillent. Le reste, ils
 * se reposent, et le processeur redescend.
 *
 * Le repos se prend entre deux vagues, jamais au milieu : un fil ne lit ses
 * messages qu'a ce moment la, et le repos y laisse justement passer l'ordre
 * d'arret et les genomes venus des autres fils.
 */

/** Intensites proposees par l'interface, de la plus forte a la plus douce. */
export const INTENSITES = Object.freeze([
  { valeur: 1, fr: 'Maximale' },
  { valeur: 0.7, fr: 'Menagee' },
  { valeur: 0.4, fr: 'Basse' },
]);

/** Part de temps travaillee la plus basse acceptee. */
export const INTENSITE_MIN = 0.1;

/**
 * Ramene une intensite dans les bornes acceptees.
 * Une valeur absente ou illisible vaut plein regime : la bride ne doit jamais
 * ralentir la recherche par accident.
 *
 * @param {unknown} valeur
 * @returns {number} Part de temps travaillee, entre INTENSITE_MIN et 1.
 */
export function normaliserIntensite(valeur) {
  const part = Number(valeur);
  if (!Number.isFinite(part) || part <= 0) return 1;
  return Math.min(1, Math.max(INTENSITE_MIN, part));
}

/**
 * Repos a prendre apres une vague, pour tenir l'intensite demandee.
 *
 * A 0,4, une vague d'une seconde est suivie d'une seconde et demie de repos :
 * le fil travaille bien quatre dixiemes du temps.
 *
 * @param {number} dureeMs Duree de la vague qui vient de finir.
 * @param {unknown} intensite Part du temps travaillee.
 * @returns {number} Repos en millisecondes, jamais negatif.
 */
export function reposApresVague(dureeMs, intensite) {
  const part = normaliserIntensite(intensite);
  if (part >= 1) return 0;

  const duree = Number(dureeMs);
  if (!Number.isFinite(duree) || duree <= 0) return 0;

  return Math.round(duree * (1 / part - 1));
}
