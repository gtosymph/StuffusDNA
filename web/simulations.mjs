/**
 * Simulations gardees.
 *
 * Une recherche ne donne pas un resultat, elle en donne une suite : on change
 * une condition, on relance, le score bouge. Sans trace, la version d'avant
 * est perdue, et l'on ne sait plus si le changement a servi.
 *
 * Une simulation est donc l'instantane complet d'un moment : le score, les
 * pieces portees, le niveau, et tout ce qu'il faut pour revenir exactement
 * a cet etat. Deux simulations se comparent piece par piece et chiffre par
 * chiffre.
 *
 * Le module ne touche pas au document : il ne fait que ranger et relire. La
 * liste vit dans le navigateur, la plus recente en tete.
 */

const CLE = 'copyroxx_simulations';

/** Au dela, les plus anciennes partent : le rangement du navigateur est borne. */
export const MAX_SIMULATIONS = 40;

/** Lit la liste rangee, de la plus recente a la plus ancienne. */
export function lireSimulations() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '[]');
    return Array.isArray(brut) ? brut.filter((s) => s && typeof s.id === 'string') : [];
  } catch {
    // Un rangement illisible ne doit pas bloquer l'interface.
    return [];
  }
}

/** Ecrit la liste, bornee. */
function ecrire(liste) {
  const gardees = liste.slice(0, MAX_SIMULATIONS);
  try {
    localStorage.setItem(CLE, JSON.stringify(gardees));
  } catch (erreur) {
    throw new Error(`Enregistrement impossible : ${erreur.message}`);
  }
  return gardees;
}

/** Rend un identifiant qui ne se repete pas dans une meme milliseconde. */
function identifiant() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Signature d'une simulation : le score entier et les pieces portees.
 *
 * Deux enregistrements de suite sur le meme build n'apprennent rien ; la
 * signature sert a ne pas les empiler.
 *
 * @param {{score?: number, pieces?: {id: number}[]}} simulation
 */
export function signature(simulation) {
  const pieces = (simulation.pieces ?? []).map((p) => p.id).sort((a, b) => a - b);
  return `${Math.round(simulation.score ?? 0)}:${pieces.join(',')}`;
}

/**
 * Ajoute une simulation en tete de liste.
 *
 * @param {any} simulation Instantane, sans identifiant ni date.
 * @param {{siNouvelle?: boolean}} [choix] siNouvelle : ne rien ajouter quand
 *   la liste porte deja le meme score sur les memes pieces.
 * @returns {{liste: any[], ajoutee: any|null}}
 */
export function ajouterSimulation(simulation, choix = {}) {
  const liste = lireSimulations();

  if (choix.siNouvelle) {
    const empreinte = signature(simulation);
    if (liste.some((s) => signature(s) === empreinte)) return { liste, ajoutee: null };
  }

  const ajoutee = { ...simulation, id: identifiant(), date: new Date().toISOString() };
  return { liste: ecrire([ajoutee, ...liste]), ajoutee };
}

/** Enleve une simulation. */
export function enleverSimulation(id) {
  return ecrire(lireSimulations().filter((s) => s.id !== id));
}

/** Renomme une simulation. Un nom vide rend son nom automatique. */
export function renommerSimulation(id, nom) {
  const propre = String(nom ?? '').trim();
  return ecrire(lireSimulations().map((s) => (s.id === id ? { ...s, nom: propre } : s)));
}

/** Enleve toutes les simulations. */
export function viderSimulations() {
  return ecrire([]);
}

/**
 * Nom montre pour une simulation : celui donne, sinon celui de son build.
 *
 * @param {any} simulation
 * @param {(id: number) => string} nomDeClasse
 */
export function libelle(simulation, nomDeClasse) {
  if (simulation.nom) return simulation.nom;
  return `${nomDeClasse(simulation.classe)} ${simulation.niveau}`;
}

/**
 * Reglages qui different entre deux simulations, hors stuff.
 *
 * Deux essais peuvent porter le meme stuff et ne pas donner le meme score :
 * un niveau plus bas, une condition ajoutee, une option cochee suffisent.
 * Sans cette liste, l'ecart resterait sans explication.
 *
 * @param {any} gauche
 * @param {any} droite
 * @returns {{quoi: string, avant: string, apres: string}[]}
 */
export function reglagesChanges(gauche, droite) {
  const lignes = [];
  const ajouter = (quoi, avant, apres) => {
    if (String(avant) !== String(apres)) lignes.push({ quoi, avant: String(avant), apres: String(apres) });
  };

  ajouter('Niveau', gauche.niveau ?? '', droite.niveau ?? '');
  ajouter('Conditions', (gauche.conditions ?? []).length, (droite.conditions ?? []).length);
  ajouter('Sorts', (gauche.sorts ?? []).length, (droite.sorts ?? []).length);
  ajouter('Pieces bannies', (gauche.bannis ?? []).length, (droite.bannis ?? []).length);

  const cles = new Set([...Object.keys(gauche.options ?? {}), ...Object.keys(droite.options ?? {})]);
  for (const cle of cles) {
    const avant = gauche.options?.[cle];
    const apres = droite.options?.[cle];
    if (avant === apres) continue;
    const dire = (v) => (typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v ?? '—'));
    lignes.push({ quoi: cle, avant: dire(avant), apres: dire(apres) });
  }
  return lignes;
}

/**
 * Compare deux simulations.
 *
 * L'ecart de score se lit dans le sens « de la gauche vers la droite » : une
 * valeur positive dit que la seconde frappe plus fort.
 *
 * @param {any} gauche
 * @param {any} droite
 * @param {readonly string[]} statsSuivies Cles de statistiques a comparer.
 */
export function comparer(gauche, droite, statsSuivies) {
  const piecesDe = (s) => new Map((s.pieces ?? []).map((p) => [p.id, p]));
  const aGauche = piecesDe(gauche);
  const aDroite = piecesDe(droite);

  const communes = [...aGauche.keys()].filter((id) => aDroite.has(id));
  const enlevees = [...aGauche.values()].filter((p) => !aDroite.has(p.id));
  const ajoutees = [...aDroite.values()].filter((p) => !aGauche.has(p.id));

  const chiffres = statsSuivies
    .map((cle) => {
      const avant = gauche.stats?.[cle] ?? 0;
      const apres = droite.stats?.[cle] ?? 0;
      return { cle, avant, apres, ecart: apres - avant };
    })
    .filter((ligne) => ligne.avant !== 0 || ligne.apres !== 0);

  return {
    ecartScore: (droite.score ?? 0) - (gauche.score ?? 0),
    communes: communes.length,
    enlevees,
    ajoutees,
    chiffres,
    reglages: reglagesChanges(gauche, droite),
  };
}
