/**
 * Comparer plusieurs stuffs, sans en faire une page.
 *
 * Un tableau qui montre tout ne compare rien : sur trente-sept mesures, deux
 * stuffs proches en partagent trente. Les lignes identiques occupent l'ecran
 * et noient les cinq qui decident. La comparaison les masque donc, et dit
 * combien elle en a masquees — sans ce compte, le joueur ne saurait pas s'il
 * regarde un extrait ou le tout.
 *
 * Deux lectures cohabitent, et le choix ne tient pas au gout :
 *
 *   - un minimum se lit en VALEUR ABSOLUE. Ce qui compte est s'il est tenu,
 *     pas s'il a monte de trois ;
 *   - tout le reste se lit en ECART face au stuff porte. Un joueur ne compare
 *     pas deux fiches, il compare ce qu'il gagne et ce qu'il perd.
 */

/**
 * Les lignes d'une comparaison.
 *
 * @param {{cle: string, libelle: string}[]} mesures Mesures a comparer, en ordre.
 * @param {{nom: string, stats: Record<string, number>}[]} colonnes
 *   Les stuffs compares. La PREMIERE est la reference des ecarts.
 * @param {object} [options]
 * @param {Set<string>} [options.minimums] Mesures lues en valeur absolue.
 * @param {boolean} [options.masquerIdentiques] Vrai par defaut.
 * @returns {{lignes: any[], masquees: number}}
 */
export function lignesComparaison(mesures, colonnes, options = {}) {
  const { minimums = new Set(), masquerIdentiques = true } = options;
  if (colonnes.length === 0) return { lignes: [], masquees: 0 };

  const reference = colonnes[0];

  const toutes = mesures.map((mesure) => {
    const valeurs = colonnes.map((c) => Number(c.stats?.[mesure.cle]) || 0);
    const absolue = minimums.has(mesure.cle);
    const base = Number(reference.stats?.[mesure.cle]) || 0;

    return {
      cle: mesure.cle,
      libelle: mesure.libelle,
      // La famille voyage avec la ligne : le tableau la regroupe a l'affichage.
      // Quarante mesures a la file se lisent comme un mur ; les memes, rangees
      // sous « Dommages » et « Resistances », se parcourent.
      famille: mesure.famille ?? null,
      absolue,
      cellules: valeurs.map((valeur, i) => ({
        valeur,
        // La colonne de reference n'a pas d'ecart avec elle-meme : montrer
        // « +0 » y ferait croire a une mesure qui n'a pas bouge.
        ecart: absolue || i === 0 ? null : valeur - base,
      })),
      // Une mesure identique partout n'aide pas a choisir.
      varie: new Set(valeurs).size > 1,
    };
  });

  const gardees = masquerIdentiques ? toutes.filter((l) => l.varie) : toutes;
  return { lignes: gardees, masquees: toutes.length - gardees.length };
}

/**
 * Les lignes gardees, rangees par famille.
 *
 * Une famille dont toutes les lignes ont ete masquees disparait : un intitule
 * seul se lit comme un defaut d'affichage. Les lignes sans famille se
 * regroupent sous un groupe anonyme, en tete, plutot que de disparaitre.
 *
 * @param {{famille: string|null}[]} lignes
 * @returns {{famille: string|null, lignes: any[]}[]}
 */
export function grouperParFamille(lignes) {
  const groupes = [];
  for (const ligne of lignes) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.famille === (ligne.famille ?? null)) dernier.lignes.push(ligne);
    else groupes.push({ famille: ligne.famille ?? null, lignes: [ligne] });
  }
  return groupes;
}

/**
 * Nom court d'un stuff dans la comparaison.
 *
 * Les colonnes sont etroites : « Stuff trouve numero 3 » ne tient pas, et
 * « 3 » ne dit pas ce qu'on regarde. Le rang suffit, avec le stuff porte
 * nomme pour ce qu'il est.
 *
 * @param {number} rang Zero pour le stuff porte.
 */
export const nomDeColonne = (rang) => (rang === 0 ? 'Porte' : `Trouvé ${rang}`);
