/**
 * Classes de personnage, dans l'ordre des identifiants du jeu.
 * L'identifiant 3 est confirme par un item dont la condition vaut "PG=3".
 *
 * Le Forgelance porte 20, pas 19 : les identifiants suivent l'ordre de sortie
 * et laissent un trou. Une condition d'equipement "PG=20" ne se lit qu'avec le
 * bon numero, sinon la piece reste refusee au Forgelance.
 */
export const CLASSES = Object.freeze([
  { id: 1, fr: 'Feca' }, { id: 2, fr: 'Osamodas' }, { id: 3, fr: 'Enutrof' },
  { id: 4, fr: 'Sram' }, { id: 5, fr: 'Xelor' }, { id: 6, fr: 'Ecaflip' },
  { id: 7, fr: 'Eniripsa' }, { id: 8, fr: 'Iop' }, { id: 9, fr: 'Cra' },
  { id: 10, fr: 'Sadida' }, { id: 11, fr: 'Sacrieur' }, { id: 12, fr: 'Pandawa' },
  { id: 13, fr: 'Roublard' }, { id: 14, fr: 'Zobal' }, { id: 15, fr: 'Steamer' },
  { id: 16, fr: 'Eliotrope' }, { id: 17, fr: 'Huppermage' }, { id: 18, fr: 'Ouginak' },
  { id: 20, fr: 'Forgelance' },
]);

/** Identifiant repris quand celui garde n'existe pas. */
const DEFAUT = 5;

/** Rend l'identifiant de classe utilisable le plus proche de celui donne. */
export function classeConnue(id) {
  const numero = Number(id);
  if (CLASSES.some((c) => c.id === numero)) return numero;
  // Le Forgelance a longtemps porte 19 dans ce projet : un etat garde avant
  // la correction doit retrouver sa classe, pas basculer sur une autre.
  if (numero === 19) return 20;
  return DEFAUT;
}

/** Rend le nom francais d'une classe. */
export function nomDeClasse(id) {
  return CLASSES.find((c) => c.id === classeConnue(id))?.fr ?? '';
}

/**
 * Chemin de l'avatar d'une classe.
 *
 * Les avatars viennent de l'encyclopedie Dofus 3 et sont importes par
 * scripts/fetch-avatars.mjs. Le sexe suit l'application : 0 pour l'homme,
 * 1 pour la femme.
 *
 * @param {number} id Identifiant de classe.
 * @param {number} sexe 0 ou 1.
 */
export function avatarDeClasse(id, sexe) {
  return `assets/avatars/${classeConnue(id)}-${Number(sexe) === 1 ? 1 : 0}.png`;
}

/** Chemin de l'embleme d'une classe, pour les listes compactes. */
export function emblemeDeClasse(id) {
  return `assets/breeds/${classeConnue(id)}.png`;
}
