/**
 * Panneau des simulations gardees.
 *
 * La liste montre ce qui distingue deux essais : les degats, le stuff et le
 * niveau. Une ligne se remet en place d'un clic. Deux lignes cochees se
 * comparent dans une fenetre, piece par piece et chiffre par chiffre.
 *
 * Le panneau garde lui-meme quelles lignes sont cochees : c'est un etat
 * d'ecran, il n'a rien a faire dans l'etat du build.
 */
import { el } from './render.mjs';
import { STAT_KEYS } from '../src/data/stats.mjs';
import { cacherBulle, montrerBulle, suivreBulle } from './hover-card.mjs';
import {
  basculerFavori, comparer, enleverSimulation, favorisEnTete, libelle,
  lireSimulations, renommerSimulation, viderSimulations,
} from './simulations.mjs';
import { comparerDegats } from './simulation-degats.mjs';
import { piegerFocus } from './focus-piege.mjs';

/**
 * Statistiques comparees : toutes celles du moteur.
 *
 * La comparaison ne garde ensuite que les lignes qui bougent ; choisir a
 * l'avance quelles statistiques comptent ferait manquer justement celle qui
 * explique l'ecart.
 */
const STATS_COMPAREES = STAT_KEYS;

const entier = (v) => Math.floor(v).toLocaleString('fr-FR');
const signe = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('fr-FR')}`;

/** Racine de la fenetre de comparaison, creee une seule fois. */
let fondComparaison = null;

/** Libere le clavier quand la fenetre se ferme. */
let libererFocus = null;

/** Date courte, lisible d'un coup d'oeil. */
function quand(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Ferme la fenetre de comparaison. */
export function fermerComparaison() {
  if (!fondComparaison) return;
  fondComparaison.hidden = true;
  libererFocus?.();
  libererFocus = null;
}

/** Vignette d'une piece, avec sa bulle au survol. */
function vignette(piece, classe) {
  if (!piece) return null;
  return el('img', {
    class: `piece-simulation ${classe}`.trim(),
    src: piece.img, alt: piece.fr, title: piece.fr, decoding: 'async',
    onMouseenter: (ev) => montrerBulle(piece, ev.clientX, ev.clientY, { ancre: ev.currentTarget }),
    onMousemove: (ev) => suivreBulle(ev.clientX, ev.clientY),
    onMouseleave: cacherBulle,
  });
}

/**
 * Bandeau d'une mesure comparee : avant, ecart, apres.
 *
 * Deux mesures decident d'un build — ce qu'il envoie et ce qu'il encaisse.
 * Elles passent donc en tete, avant le detail piece par piece.
 *
 * @param {string} titre
 * @param {{avant: number, apres: number, ecart: number}} mesure
 */
function bandeauMesure(titre, mesure) {
  return el('div', { class: 'compare-mesure' },
    el('span', { class: 'compare-mesure-nom', text: titre }),
    el('span', { class: 'chiffre', text: entier(mesure.avant) }),
    el('span', { class: `compare-mesure-ecart ${mesure.ecart >= 0 ? 'pos' : 'neg'}`,
      text: signe(mesure.ecart) }),
    el('span', { class: 'chiffre', text: entier(mesure.apres) }));
}

/**
 * Ouvre la fenetre qui compare deux simulations.
 *
 * @param {any} gauche Simulation la plus ancienne des deux.
 * @param {any} droite Simulation la plus recente.
 * @param {{itemById: Map<number, any>, libelles: Record<string, string>,
 *   libellesOptions: Record<string, string>, nomDeClasse: (id: number) => string,
 *   onRestaurer: (s: any) => void, onFiger?: (s: any) => void}} options
 */
export function ouvrirComparaison(gauche, droite, options) {
  const { itemById, libelles, libellesOptions = {}, nomDeClasse, onRestaurer, onFiger } = options;
  const bilan = comparer(gauche, droite, STATS_COMPAREES);

  // Les degats se recalculent sort par sort : le total seul cache les
  // compromis, et c'est justement eux que le joueur veut peser.
  const combat = comparerDegats(gauche, droite, itemById);

  if (!fondComparaison) {
    fondComparaison = el('div', { class: 'picker-fond', hidden: true,
      onClick: (ev) => { if (ev.target === fondComparaison) fermerComparaison(); } });
    document.body.append(fondComparaison);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && fondComparaison && !fondComparaison.hidden) fermerComparaison();
    });
  }

  const colonne = (simulation, cote) => el('div', { class: `compare-cote ${cote}` },
    el('div', { class: 'compare-nom', text: libelle(simulation, nomDeClasse) }),
    el('div', { class: `compare-score ${simulation.tenu ? 'pos' : 'neg'}`,
      text: entier(simulation.score ?? 0) }),
    el('div', { class: 'compare-sous',
      text: `${nomDeClasse(simulation.classe)} ${simulation.niveau} · ${quand(simulation.date)}` }),
    el('div', { class: 'compare-sous',
      text: simulation.tenu
        ? 'Conditions tenues'
        : `${simulation.manquantes ?? 0} minimum(s) non tenu(s)` }),
    el('div', { class: 'compare-gestes' },
      el('button', { class: 'mini large', type: 'button', text: 'Remettre celle-ci',
        onClick: () => { fermerComparaison(); onRestaurer(simulation); } }),
      onFiger ? el('button', { class: 'mini', type: 'button', text: 'Figer',
        title: 'Prend ce stuff comme stuff porté en jeu, sans toucher au build pose',
        onClick: () => { fermerComparaison(); onFiger(simulation); } }) : null));

  // Les pdv effectifs ont leur bandeau en tete : les repeter ici n'apprend rien.
  const lignesStats = bilan.chiffres
    .filter((ligne) => ligne.ecart !== 0 && ligne.cle !== 'pdvEffectifs');
  const lignesCombat = combat.lignes.filter((ligne) => ligne.avant !== 0 || ligne.apres !== 0);

  fondComparaison.replaceChildren(el('div', { class: 'picker compare', role: 'dialog',
    'aria-label': 'Comparaison de deux simulations' },

    el('div', { class: 'picker-tete' },
      el('div', {},
        el('div', { class: 'picker-titre', text: 'Comparaison' }),
        el('div', { class: 'picker-sous',
          text: `${bilan.communes} pièce(s) en commun · ${bilan.ajoutees.length} changement(s)` })),
      el('button', { class: 'mini', type: 'button', text: '×', title: 'Fermer',
        onClick: fermerComparaison })),

    el('div', { class: 'compare-entete' },
      colonne(gauche, 'avant'),
      el('div', { class: 'compare-fleche' },
        el('div', { class: `compare-ecart ${combat.total.ecart >= 0 ? 'pos' : 'neg'}`,
          text: signe(combat.total.ecart) }),
        el('div', { class: 'compare-sous', text: 'degats' })),
      colonne(droite, 'apres')),

    // Les deux mesures qui decident d'un build, avant tout le detail.
    el('div', { class: 'compare-mesures' },
      bandeauMesure('Dégâts totaux', combat.total),
      bandeauMesure('Pdv effectifs', combat.endurance)),

    el('div', { class: 'picker-liste' },
      lignesCombat.length === 0 ? null
        : el('h3', { class: 'sous-titre', text: 'Dégâts par sort' }),
      lignesCombat.length === 0 ? null
        : el('table', { class: 'compare-table' },
            el('tbody', {}, lignesCombat.map((ligne) => el('tr', {},
              el('td', { text: ligne.nom }),
              el('td', { class: 'chiffre', text: entier(ligne.avant) }),
              el('td', { class: 'chiffre', text: entier(ligne.apres) }),
              el('td', { class: `chiffre ${ligne.ecart >= 0 ? 'pos' : 'neg'}`,
                text: signe(ligne.ecart) }))))),

      el('h3', { class: 'sous-titre', text: 'Pièces changées' }),
      bilan.ajoutees.length === 0 && bilan.enlevees.length === 0
        ? el('p', { class: 'note', text: 'Le même stuff des deux cotes.' })
        : el('div', { class: 'compare-pieces' },
            el('span', { class: 'candidat-legende', text: 'enlevees' }),
            bilan.enlevees.map((p) => vignette(itemById.get(p.id), 'sortante')),
            el('span', { class: 'candidat-legende', text: 'mises' }),
            bilan.ajoutees.map((p) => vignette(itemById.get(p.id), 'entrante'))),

      el('h3', { class: 'sous-titre', text: 'Chiffres qui changent' }),
      lignesStats.length === 0
        ? el('p', { class: 'note', text: 'Aucun écart sur les statistiques.' })
        : el('table', { class: 'compare-table' },
            el('tbody', {}, lignesStats.map((ligne) => el('tr', {},
              el('td', { text: libelles[ligne.cle] ?? ligne.cle }),
              el('td', { class: 'chiffre', text: entier(ligne.avant) }),
              el('td', { class: 'chiffre', text: entier(ligne.apres) }),
              el('td', { class: `chiffre ${ligne.ecart > 0 ? 'pos' : 'neg'}`,
                text: signe(ligne.ecart) }))))),

      // Meme stuff et memes chiffres peuvent donner deux scores : le niveau,
      // une condition de plus ou une option cochee suffisent a tout changer.
      bilan.reglages.length === 0 ? null : el('h3', { class: 'sous-titre', text: 'Réglages changes' }),
      bilan.reglages.length === 0 ? null : el('table', { class: 'compare-table' },
        el('tbody', {}, bilan.reglages.map((ligne) => el('tr', {},
          el('td', { text: libellesOptions[ligne.quoi] ?? ligne.quoi }),
          el('td', { class: 'chiffre', text: ligne.avant }),
          el('td', { class: 'chiffre', text: ligne.apres }),
          el('td', { class: 'chiffre', text: '' }))))))));

  fondComparaison.hidden = false;
  libererFocus?.();
  libererFocus = piegerFocus(fondComparaison);
}

/**
 * Installe le panneau des simulations.
 *
 * @param {HTMLElement} racine Conteneur de la liste.
 * @param {{compteur: HTMLElement|null, itemById: () => Map<number, any>,
 *   libelles: Record<string, string>, nomDeClasse: (id: number) => string,
 *   embleme: (id: number) => string, onRestaurer: (s: any) => void,
 *   onFiger: (s: any) => void, onGarder: () => void,
 *   onMessage: (texte: string) => void}} options
 * @returns {{rafraichir: () => void}}
 */
export function installerSimulations(racine, options) {
  const { compteur, itemById, libelles, libellesOptions, nomDeClasse, embleme,
    onRestaurer, onFiger, onGarder, onMessage, selection = null } = options;

  /** Lignes cochees pour la comparaison, au plus deux. */
  const cochees = new Set();

  /** Vrai quand la liste ne montre que les favoris. Etat d'ecran, non range. */
  let favorisSeuls = false;

  /**
   * Met les coches a jour sans reconstruire la liste.
   *
   * Un redessin complet ferait sauter la position de defilement, et il n'y a
   * rien a reconstruire : seules deux classes et un bouton changent.
   */
  const rafraichirCoches = () => {
    for (const ligne of racine.querySelectorAll('.simulation')) {
      const cochee = cochees.has(ligne.dataset.simulation);
      ligne.classList.toggle('cochee', cochee);
      const case_ = ligne.querySelector('input[type="checkbox"]');
      if (case_ && case_.checked !== cochee) case_.checked = cochee;
    }
    const comparer_ = racine.querySelector('[data-role="comparer"]');
    if (!comparer_) return;
    comparer_.disabled = cochees.size !== 2;
    comparer_.title = cochees.size === 2
      ? 'Compare les deux simulations cochées'
      : 'Cochez deux simulations';
  };

  const basculer = (id) => {
    if (cochees.has(id)) cochees.delete(id);
    else {
      // La plus ancienne coche cede sa place : on compare toujours deux essais.
      if (cochees.size >= 2) cochees.delete([...cochees][0]);
      cochees.add(id);
    }
    rafraichirCoches();
  };

  const comparerLesDeux = (liste) => {
    const choisies = liste.filter((s) => cochees.has(s.id));
    if (choisies.length !== 2) return;
    // L'ecart se lit dans le sens du temps, de l'essai d'avant vers celui
    // d'apres. Les favoris remontent en tete de la liste montree : l'ordre
    // des lignes ne dit plus l'anciennete, la date si.
    const [avant, apres] = [...choisies]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    ouvrirComparaison(avant, apres, {
      itemById: itemById(), libelles, libellesOptions, nomDeClasse, onRestaurer, onFiger,
    });
  };

  /** Demande un nouveau nom, et le pose. */
  function renommer(simulation) {
    const donne = window.prompt('Nom de la simulation :', simulation.nom ?? '');
    if (donne === null) return;
    renommerSimulation(simulation.id, donne);
    dessiner();
  }

  function ligne(simulation) {
    const pieces = simulation.pieces ?? [];
    const nom = libelle(simulation, nomDeClasse);
    const catalogue = itemById();

    const marques = [
      'simulation',
      cochees.has(simulation.id) ? 'cochee' : '',
      simulation.favori ? 'favori' : '',
    ].filter(Boolean).join(' ');

    return el('div', { class: marques, 'data-simulation': simulation.id },
      el('label', { class: 'simulation-coche',
        title: selection
          ? 'Comparer cet essai avec les autrès stuffs choisis'
          : 'Cocher deux simulations pour les comparer' },
        selection
          ? el('input', { type: 'checkbox',
              ...(selection.choisis.has(simulation) ? { checked: true } : {}),
              onChange: () => selection.onBasculer(simulation) })
          : el('input', { type: 'checkbox', ...(cochees.has(simulation.id) ? { checked: true } : {}),
              onChange: () => basculer(simulation.id) })),

      // L'etoile remonte l'essai en tete et le met a l'abri du menage : la
      // liste est bornee, un favori ne part jamais pour faire de la place.
      el('button', { class: `simulation-favori ${simulation.favori ? 'actif' : ''}`.trim(),
        type: 'button', text: simulation.favori ? '\u2605' : '\u2606',
        'aria-pressed': simulation.favori ? 'true' : 'false',
        title: simulation.favori
          ? 'Enlever des favoris'
          : 'Mettre en favori : la simulation remonte en tête et reste gardée',
        onClick: () => { basculerFavori(simulation.id); dessiner(); } }),

      el('img', { class: 'simulation-embleme', src: embleme(simulation.classe),
        alt: '', title: nomDeClasse(simulation.classe), decoding: 'async' }),

      el('div', { class: 'simulation-corps' },
        el('div', { class: 'simulation-tete' },
          el('span', { class: 'simulation-nom', text: nom, title: 'Cliquer pour renommér',
            onClick: () => renommer(simulation) }),
          // Le crayon dit que le nom se change. Le clic sur le texte marche
          // toujours, mais rien ne l'annoncait : un essai garde restait
          // « Iop 190 » parmi dix autres « Iop 190 ».
          el('button', { class: 'mini simulation-renommer', type: 'button', text: '✎',
            title: 'Renommér cette simulation',
            'aria-label': `Renommér ${nom}`,
            onClick: () => renommer(simulation) }),
          el('span', { class: `simulation-score ${simulation.tenu ? 'pos' : 'neg'}`,
            text: entier(simulation.score ?? 0),
            title: simulation.tenu
              ? 'Toutes les conditions sont tenues'
              : `${simulation.manquantes ?? 0} minimum(s) non tenu(s)` })),
        el('div', { class: 'simulation-sous',
          text: `${nomDeClasse(simulation.classe)} ${simulation.niveau}`
            + ` · ${pieces.length} pièce(s) · ${quand(simulation.date)}` }),
        // Le stuff se lit sur la ligne meme : sans lui, deux essais au meme
        // score restent indiscernables.
        el('div', { class: 'simulation-stuff' },
          pieces.map(({ id }) => {
            const piece = catalogue.get(id);
            return piece ? el('img', {
              src: piece.img, alt: '', title: piece.fr, decoding: 'async', loading: 'lazy',
              onMouseenter: (ev) => montrerBulle(piece, ev.clientX, ev.clientY, { ancre: ev.currentTarget }),
              onMousemove: (ev) => suivreBulle(ev.clientX, ev.clientY),
              onMouseleave: cacherBulle,
            }) : null;
          }))),

      el('div', { class: 'simulation-actions' },
        el('button', { class: 'mini large', type: 'button', text: 'Remettre',
          title: 'Remet ce build, ses conditions, ses sorts et ses réglages',
          onClick: () => onRestaurer(simulation) }),
        // Figer ne touche pas au build pose : le joueur garde son essai en
        // cours et change seulement le point de comparaison des achats.
        onFiger ? el('button', { class: 'mini', type: 'button', text: 'Figer',
          title: 'Prend ce stuff comme stuff porté en jeu, sans toucher au build pose',
          onClick: () => onFiger(simulation) }) : null,
        el('button', { class: 'mini', type: 'button', text: '×', title: 'Enlever cette simulation',
          onClick: () => {
            enleverSimulation(simulation.id);
            cochees.delete(simulation.id);
            dessiner();
          } })),
    );
  }

  function dessiner() {
    const rangees = lireSimulations();
    for (const id of [...cochees]) if (!rangees.some((s) => s.id === id)) cochees.delete(id);

    const favoris = rangees.filter((s) => s.favori);
    // Le filtre ne tient que tant qu'il reste un favori : sinon la liste
    // paraitrait vide alors que des essais sont gardes.
    if (favorisSeuls && favoris.length === 0) favorisSeuls = false;

    // Les favoris passent devant : ce sont les essais que l'on revient voir.
    const liste = favorisEnTete(favorisSeuls ? favoris : rangees);

    if (compteur) {
      compteur.textContent = favoris.length > 0
        ? `${rangees.length} · ${favoris.length} ★`
        : String(rangees.length);
    }

    // Un menage garde les favoris : seuls les essais ordinaires partent.
    const aEnlever = rangees.length - favoris.length;

    racine.replaceChildren(
      el('div', { class: 'rangee-ajout' },
        el('button', { class: 'primaire', type: 'button', text: 'Garder cette simulation',
          title: 'Range le build porté, son score et tous ses réglages',
          onClick: onGarder }),
        el('button', { type: 'button', text: 'Comparer', 'data-role': 'comparer',
          disabled: cochees.size !== 2,
          title: cochees.size === 2
            ? 'Compare les deux simulations cochées'
            : 'Cochez deux simulations',
          onClick: () => comparerLesDeux(liste) }),
        favoris.length === 0 ? null : el('label', {
          class: `filtre-case ${favorisSeuls ? 'actif' : ''}`.trim(),
          title: 'Ne montrer que les simulations mises en favori' },
          el('input', { type: 'checkbox', ...(favorisSeuls ? { checked: true } : {}),
            onChange: () => { favorisSeuls = !favorisSeuls; dessiner(); } }),
          ' Favoris'),
        aEnlever === 0 ? null : el('button', { class: 'mini', type: 'button',
          text: favoris.length > 0 ? 'Enlever les autrès' : 'Tout enlever',
          title: favoris.length > 0
            ? 'Enleve les simulations qui ne sont pas en favori'
            : 'Enleve toutes les simulations gardées',
          onClick: () => {
            if (!window.confirm(`Enlever ${aEnlever} simulation(s) gardées ?`)) return;
            viderSimulations();
            cochees.clear();
            dessiner();
            onMessage(favoris.length > 0
              ? 'Simulations enlevées. Les favoris restent.'
              : 'Simulations enlevées.');
          } })),

      liste.length === 0
        ? el('p', { class: 'note',
            text: 'Aucune simulation gardée. Chaque recherche mise en pause en range une.' })
        : el('div', { class: 'simulations' }, liste.map(ligne)),
    );
  }

  dessiner();
  return { rafraichir: dessiner };
}
