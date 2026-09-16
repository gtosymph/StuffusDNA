/**
 * Gestes du choix des sorts.
 *
 * Le contenu de l'overlay appartient a `spell-picker.mjs` ; ce qui se passe
 * quand on y prend un sort appartient ici. La regle qui compte n'est pas
 * l'ajout : c'est la bascule. Un joueur qui pose son premier sort alors que la
 * recherche visait les caracteristiques veut des degats, pas un rappel que son
 * mode ne compte pas les degats. L'outil bascule donc tout seul, et le dit.
 *
 * Les deux coquilles s'en servent : v1 par `branchements.mjs`, v2 directement.
 * Un seul endroit garde la regle, donc les deux ecrans basculent pareil.
 */
import { ouvrirPicker } from './spell-picker.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

/**
 * Cree les gestes du choix des sorts.
 *
 * @param {object} liens
 * @param {() => any} liens.lireEtat
 * @param {(patch: object) => void} liens.setEtat
 * @param {(texte: string, type?: string) => void} liens.message
 * @param {() => any[]|null} liens.lireClassesSorts Sorts par classe, ou null.
 * @returns {{ouvrir: () => void, toutEnlever: () => void}}
 */
export function creerGestesSorts({ lireEtat, setEtat, message, lireClassesSorts }) {
  /** Enleve tous les sorts retenus. */
  const toutEnlever = () => setEtat({ sorts: [] });

  /**
   * Pose des sorts, et bascule le mode s'il le faut.
   *
   * Un seul rendu pour toute la liste : poser huit sorts un par un redessinait
   * l'ecran huit fois. La bascule vaut pour un sort comme pour huit — un
   * joueur qui vient d'en prendre un veut des degats, pas un rappel que son
   * mode ne les compte pas.
   */
  function ajouterPlusieurs(nouveaux) {
    const courant = lireEtat();
    const ids = new Set(nouveaux.map((s) => s.id));
    const sorts = [...courant.sorts.filter((s) => !ids.has(s.id)), ...nouveaux];

    const bascule = courant.mode === SEARCH_MODES.STATS && sorts.length > 0;
    setEtat({ sorts, ...(bascule ? { mode: SEARCH_MODES.DAMAGE } : {}) });
    if (bascule) message('La recherche maximise maintenant les degats.', 'info');
  }

  /** Ouvre l'overlay sur la classe du personnage. */
  function ouvrir() {
    const etat = lireEtat();
    const classe = lireClassesSorts()?.find((c) => c.id === etat.classe) ?? null;
    if (!classe) {
      message('Sorts indisponibles pour cette classe.', 'erreur');
      return;
    }

    ouvrirPicker({
      classe,
      niveau: etat.niveau,
      pris: new Set(etat.sorts.map((s) => s.id)),
      onAjouter: (sort) => ajouterPlusieurs([sort]),
      onAjouterPlusieurs: ajouterPlusieurs,
      onEnlever: (id) => setEtat({ sorts: lireEtat().sorts.filter((s) => s.id !== id) }),
    });
  }

  return { ouvrir, toutEnlever };
}
