/**
 * Stuff de reference : le stuff VRAIMENT porte en jeu.
 *
 * Il sert de point de comparaison au panneau des achats : chaque palier dit
 * ce qu'un changement de piece rapporterait face a lui. Il ne bouge donc pas
 * quand le joueur essaie un build, c'est tout son interet.
 *
 * Ce module ne fait que le fabriquer. Le poser dans l'etat et le dire au
 * joueur restent le travail de l'application.
 */

/**
 * Reference tiree d'une simulation gardee.
 *
 * @param {any} simulation
 * @param {Date} [date] Moment du figeage.
 * @returns {{itemIds: number[], date: string}|null} Null quand la simulation
 *   ne porte aucune piece : figer une reference vide rendrait le panneau des
 *   achats muet sans rien dire au joueur.
 */
export function referenceDepuisSimulation(simulation, date = new Date()) {
  const pieces = Array.isArray(simulation?.pieces) ? simulation.pieces : [];
  const itemIds = pieces
    .map((piece) => piece?.id)
    .filter((id) => Number.isFinite(id));

  if (itemIds.length === 0) return null;
  return { itemIds, date: date.toISOString() };
}
