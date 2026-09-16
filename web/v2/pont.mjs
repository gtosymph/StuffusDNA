/**
 * Pont entre les modules de v1 et la coquille de v2.
 *
 * Les modules de v1 ne recoivent pas leurs noeuds : ils recoivent un « $ » et
 * vont chercher des identifiants. `recherche.mjs` en reclame huit, dont trois
 * — les fils, l'intensite, « Recommencer » — que la nouvelle interface ne
 * montre plus : ils sont passes dans les reglages.
 *
 * Reecrire ces modules pour qu'ils prennent des noeuds serait le geste propre,
 * mais il casse v1 le jour ou l'on veut les deux ecrans cote a cote. Le pont
 * fait l'inverse : il rend un « $ » qui sert d'abord les noeuds de v2, puis
 * fabrique a la demande un noeud muet pour ceux qui manquent. Aucun module de
 * v1 ne change, et rien ne tombe en silence sur un identifiant absent.
 *
 * Le noeud muet est un vrai element, hors de l'ecran : il porte une valeur,
 * accepte `replaceChildren` et `disabled`, et personne ne le voit.
 */

/**
 * Valeurs de depart des reglages que la nouvelle interface ne montre plus.
 *
 * Elles doivent exister avant la premiere lecture : `recherche.mjs` lit
 * `$('fils').value` au moment du lancement, et un champ vide donnerait un fil.
 */
const DEFAUTS_CACHES = Object.freeze({
  fils: '4',
  intensite: '1',
});

/**
 * Cree le « $ » que les modules de v1 attendent.
 *
 * `fabrique` est pris en parametre plutot que lu sur `document` : c'est ce qui
 * rend le pont verifiable hors d'un navigateur, ou `document` n'existe pas.
 *
 * @param {object} liens
 * @param {{getElementById?: (id: string) => any, querySelector?: (s: string) => any}} liens.racine
 * @param {(tag: string) => any} liens.fabrique Cree un element vide.
 * @param {Record<string, string>} [liens.defauts] Valeurs des champs caches.
 * @returns {{$: (id: string) => any, muets: Map<string, any>}}
 */
export function creerPont({ racine, fabrique, defauts = DEFAUTS_CACHES }) {
  /** Noeuds fabriques pour les identifiants que v2 ne montre pas. */
  const muets = new Map();

  const chercher = (id) => (racine.getElementById
    ? racine.getElementById(id)
    : racine.querySelector(`#${id}`));

  /** Fabrique le noeud absent, une seule fois, et le garde. */
  function muet(id) {
    const deja = muets.get(id);
    if (deja) return deja;

    // Un input porte une valeur ; tout le reste n'a besoin que d'etre un
    // element. Le choix suit ce que les modules de v1 font du noeud.
    const estChamp = Object.hasOwn(defauts, id);
    const noeud = fabrique(estChamp ? 'input' : 'div');
    noeud.id = id;
    if (estChamp) noeud.value = defauts[id];
    noeud.hidden = true;
    muets.set(id, noeud);
    return noeud;
  }

  return { $: (id) => chercher(id) ?? muet(id), muets };
}
