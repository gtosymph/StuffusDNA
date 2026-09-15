/**
 * Degats d'une simulation gardee, sort par sort.
 *
 * Le score seul ne dit pas d'ou vient un ecart. Un build peut gagner cent
 * degats sur un sort de feu et en perdre quarante sur un sort d'air : le
 * total cache le compromis, alors que c'est lui qui decide si le changement
 * vaut la peine. Chaque sort se compare donc pour lui-meme.
 *
 * Une simulation porte ses statistiques figees : tout se recalcule sans le
 * catalogue, sauf l'arme, qui est une piece a retrouver par son identifiant.
 */
import { damageValue } from '../src/solver/score.mjs';
import { attaquesAffichees } from './objectif.mjs';

/**
 * Etat minimal que les fonctions de calcul savent lire.
 *
 * `attaquesAffichees` attend un etat : des sorts, des options, et la piece
 * portee a l'emplacement de l'arme. Une simulation porte les trois, sous une
 * autre forme.
 *
 * @param {any} simulation
 * @param {Map<number, any>} itemById
 */
function etatDe(simulation, itemById) {
  const equipped = new Map();
  for (const { cle, id } of simulation?.pieces ?? []) {
    const piece = itemById?.get(id);
    if (piece) equipped.set(cle, piece);
  }

  return {
    sorts: Array.isArray(simulation?.sorts) ? simulation.sorts : [],
    options: simulation?.options ?? {},
    equipped,
  };
}

/**
 * Degats d'une simulation, attaque par attaque.
 *
 * @param {any} simulation
 * @param {Map<number, any>} itemById
 * @returns {{total: number, lignes: {nom: string, moyenne: number}[]}}
 */
export function degatsDe(simulation, itemById) {
  const stats = simulation?.stats ?? {};
  const { total, perSpell } = damageValue(attaquesAffichees(etatDe(simulation, itemById)), stats);

  const lignes = perSpell.map((attaque) => ({
    nom: attaque.name,
    moyenne: attaque.average * attaque.repeats,
  }));

  return {
    // Une simulation recente porte les degats que le score a vraiment comptes,
    // optimisation de combo comprise. Les recalculer ici donnerait un autre
    // nombre : le total garde prime donc toujours.
    total: Number.isFinite(simulation?.degats) ? simulation.degats : total,
    lignes,
  };
}

/** Points de vie effectifs d'une simulation, ou ses points de vie a defaut. */
function enduranceDe(simulation) {
  const stats = simulation?.stats ?? {};
  return stats.pdvEffectifs ?? stats.pdv ?? 0;
}

/**
 * Compare deux simulations sur ce qu'elles envoient et ce qu'elles encaissent.
 *
 * L'ecart se lit dans le sens « de la gauche vers la droite » : une valeur
 * positive dit que la seconde fait mieux.
 *
 * @param {any} gauche
 * @param {any} droite
 * @param {Map<number, any>} itemById
 * @returns {{total: {avant: number, apres: number, ecart: number},
 *   endurance: {avant: number, apres: number, ecart: number},
 *   lignes: {nom: string, avant: number, apres: number, ecart: number}[]}}
 */
export function comparerDegats(gauche, droite, itemById) {
  const avant = degatsDe(gauche, itemById);
  const apres = degatsDe(droite, itemById);

  const parNom = new Map();
  // Changer de sorts entre deux essais est courant : un sort absent d'un cote
  // compte zero de ce cote, plutot que de disparaitre de la comparaison.
  for (const ligne of avant.lignes) parNom.set(ligne.nom, { avant: ligne.moyenne, apres: 0 });
  for (const ligne of apres.lignes) {
    const connue = parNom.get(ligne.nom);
    if (connue) connue.apres = ligne.moyenne;
    else parNom.set(ligne.nom, { avant: 0, apres: ligne.moyenne });
  }

  const ecart = (a, b) => ({ avant: a, apres: b, ecart: b - a });

  return {
    total: ecart(avant.total, apres.total),
    endurance: ecart(enduranceDe(gauche), enduranceDe(droite)),
    lignes: [...parNom].map(([nom, v]) => ({ nom, ...ecart(v.avant, v.apres) })),
  };
}
