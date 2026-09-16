/**
 * Pliage des sections.
 *
 * Un onglet impose un choix : il cache ce que l'on veut comparer et coute un
 * clic pour retrouver ce que l'on voyait. Le pliage rend le meme service sans
 * rien imposer : chaque section se replie quand elle ne sert pas, plusieurs
 * peuvent rester ouvertes, et l'ecran garde exactement ce que l'on veut voir.
 *
 * Repliee, une section garde son titre et son compteur : « Conditions 5 » se
 * lit encore, seule la matiere disparait. L'etat tient par titre, donc il
 * survit au changement de disposition, qui deplace les sections.
 */
import { CLES, ecrireJson, lireJson } from './stockage.mjs';

const CLE = CLES.plie;

/** Sections que le pliage laisse tranquilles : leur titre est leur contenu. */
const JAMAIS = new Set(['Catalogue']);

/**
 * Ou trouver les titres et les sections.
 *
 * Les deux coquilles ne nomment pas leurs blocs pareil : v1 titre en « h2 »
 * dans un « .bloc », v2 en « .chapeau » dans une « .section ». Le pliage ne
 * depend pas de ces noms, seulement du fait qu'un titre commande une section.
 * `installerPliage` les pose une fois ; `montrerSection` les relit.
 */
let ou = { titres: '.bloc > h2', section: '.bloc', compteur: '.compteur' };

/** Lit l'ensemble des sections repliees. */
function lire() {
  const brut = lireJson(CLE, []);
  return new Set(Array.isArray(brut) ? brut : []);
}

/** Garde l'ensemble des sections repliees. */
function garder(plies) {
  ecrireJson(CLE, [...plies]);
}

/**
 * Nom stable d'une section.
 *
 * Le compteur d'un titre change a chaque rendu ; seul le libelle sert de cle.
 */
function nom(titre) {
  const copie = titre.cloneNode(true);
  for (const compteur of copie.querySelectorAll(ou.compteur)) compteur.remove();
  return copie.textContent.trim();
}

/** Rend une section pliable par son titre. */
function equiper(titre, plies) {
  const section = titre.closest(ou.section);
  const cle = nom(titre);
  if (!section || JAMAIS.has(cle)) return;

  titre.setAttribute('role', 'button');
  titre.setAttribute('tabindex', '0');
  titre.title = 'Replie ou deplie cette section';

  const poser = (replie) => {
    section.classList.toggle('replie', replie);
    titre.setAttribute('aria-expanded', String(!replie));
  };

  const basculer = () => {
    const replie = !section.classList.contains('replie');
    poser(replie);
    if (replie) plies.add(cle); else plies.delete(cle);
    garder(plies);
    // La courbe se dessine dans un canvas : sa largeur peut avoir change.
    window.dispatchEvent(new CustomEvent('copyroxx:theme', { detail: 'pliage' }));
  };

  poser(plies.has(cle));
  titre.addEventListener('click', basculer);
  titre.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'Enter' && evenement.key !== ' ') return;
    evenement.preventDefault();
    basculer();
  });
}

/**
 * Ouvre une section et l'amene sous les yeux.
 *
 * @param {string} cle Libelle de la section, sans son compteur.
 */
export function montrerSection(cle) {
  const titre = [...document.querySelectorAll(ou.titres)].find((h) => nom(h) === cle);
  const section = titre?.closest(ou.section);
  if (!section) return;

  if (section.classList.contains('replie')) titre.click();
  section.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Un cadre passager montre ou l'on vient d'arriver.
  section.classList.add('vise');
  setTimeout(() => section.classList.remove('vise'), 1400);
}

/**
 * Installe le pliage sur toutes les sections titrees.
 *
 * @param {{titres?: string, section?: string, compteur?: string}} [reglage]
 *   Ou trouver les titres et les sections, quand la coquille ne les nomme pas
 *   comme v1.
 */
export function installerPliage(reglage = {}) {
  ou = { ...ou, ...reglage };
  const plies = lire();
  for (const titre of document.querySelectorAll(ou.titres)) equiper(titre, plies);

  // La note du score dit combien de conditions manquent : elle mene a la
  // section qui permet de les corriger.
  const note = document.getElementById('score-note');
  if (!note) return;
  note.classList.add('note-score');
  note.addEventListener('click', () => {
    if (!note.classList.contains('cliquable')) return;
    montrerSection('Conditions');
  });

  // Le texte de la note est reecrit a chaque rendu : la marque de clic suit.
  const suivre = () => {
    const manque = /en defaut/.test(note.textContent);
    note.classList.toggle('cliquable', manque);
    note.title = manque ? 'Va aux conditions' : '';
  };
  new MutationObserver(suivre).observe(note, { childList: true, characterData: true, subtree: true });
  suivre();
}
