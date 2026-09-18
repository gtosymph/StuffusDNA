/**
 * La pose des feuilles d'habillage.
 *
 * Survoler les cartes d'habillage demande une pose par carte, et une feuille
 * met un instant a se lire. Deux defauts sont nes de la : sept feuilles
 * empilees dans l'en-tete apres huit survols, et l'attribut `data-theme` qui
 * nommait un habillage pendant que la feuille en posait un autre.
 *
 * L'invariant tient en une phrase, et c'est tout ce que ce fichier verifie :
 *
 *   quoi qu'il arrive, il reste UNE feuille, et c'est celle du dernier
 *   habillage demande.
 *
 * Le module touche au document ; le depot n'a pas de navigateur. Un document
 * de pacotille suffit : il ne sait que ce dont `appliquerTheme` se sert, et
 * il rend les lectures explicites — notamment le moment ou une feuille finit
 * d'etre lue, qui est precisement ce que les deux defauts mettaient en jeu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/** Element de pacotille : juste assez pour porter un lien de feuille. */
function creerElement(nom) {
  const element = {
    nom,
    attributs: new Map(),
    dataset: {},
    ecouteurs: new Map(),
    parent: null,
    get id() { return element.attributs.get('id') ?? ''; },
    set id(valeur) { element.attributs.set('id', valeur); },
    get rel() { return element.attributs.get('rel') ?? ''; },
    set rel(valeur) { element.attributs.set('rel', valeur); },
    get href() { return element.attributs.get('href') ?? ''; },
    set href(valeur) { element.attributs.set('href', valeur); },
    getAttribute: (cle) => element.attributs.get(cle) ?? null,
    addEventListener(type, suite) { element.ecouteurs.set(type, suite); },
    /** Comme dans un navigateur : enlever un element deja detache ne fait rien. */
    remove() {
      const rang = element.parent?.enfants.indexOf(element) ?? -1;
      if (rang >= 0) element.parent.enfants.splice(rang, 1);
    },
    /** Dit que la feuille vient d'etre lue : c'est le moment qui compte. */
    lue() { element.ecouteurs.get('load')?.(); },
    echouee() { element.ecouteurs.get('error')?.(); },
  };
  return element;
}

/** Document de pacotille, avec le seul selecteur dont le module se sert. */
function creerDocument() {
  const tete = { enfants: [], append(...n) { for (const e of n) { e.parent = tete; tete.enfants.push(e); } } };
  return {
    head: tete,
    documentElement: { dataset: {} },
    createElement: (nom) => creerElement(nom),
    querySelectorAll(selecteur) {
      assert.match(selecteur, /feuille-theme/, 'le module change de selecteur : ce faux document ment');
      return tete.enfants.filter((e) => e.getAttribute('id') === 'feuille-theme'
        || e.dataset.themeFeuille !== undefined);
    },
    /** Les feuilles encore posees, dans l'ordre de la cascade. */
    feuilles: () => tete.enfants.map((e) => e.getAttribute('href')),
    /** Celles qui attendent encore d'etre lues. */
    enAttente: () => tete.enfants.filter((e) => e.ecouteurs.has('load')),
  };
}

/** Charge le module avec un document neuf. Chaque essai part de zero. */
async function poserLeDecor() {
  const doc = creerDocument();
  globalThis.document = doc;
  globalThis.window = { dispatchEvent() {}, CustomEvent: class {} };
  globalThis.CustomEvent = class { constructor(nom, init) { this.nom = nom; this.detail = init?.detail; } };
  globalThis.location = { search: '' };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

  // Chaque essai veut un module neuf : `themeDemande` vit dans le module.
  const theme = await import(`../web/theme.mjs?essai=${Math.random()}`);
  theme.configurerThemes({ themes: theme.THEMES_V2, defaut: 'studio', cle: 'essai' });
  return { doc, theme };
}

test('une pose laisse une seule feuille', async () => {
  const { doc, theme } = await poserLeDecor();

  theme.appliquerTheme('braise');
  doc.enAttente().forEach((f) => f.lue());

  assert.deepEqual(doc.feuilles(), ['themes/braise.css']);
  assert.equal(doc.documentElement.dataset.theme, 'braise');
});

test('huit survols n\'empilent pas huit feuilles', async () => {
  const { doc, theme } = await poserLeDecor();

  // Le survol demande, la lecture suit — dans le desordre, car une feuille
  // deja en cache arrive avant une feuille demandee plus tot.
  for (const cle of ['ardoise', 'braise', 'abysse', 'vigne', 'parchemin', 'lin', 'neige']) {
    theme.appliquerTheme(cle);
  }
  theme.appliquerTheme('terminal');
  for (const feuille of [...doc.enAttente()].reverse()) feuille.lue();

  assert.deepEqual(doc.feuilles(), ['themes/terminal.css'],
    'les feuilles abandonnees doivent partir, pas s\'empiler');
  assert.equal(doc.documentElement.dataset.theme, 'terminal');
});

test('une feuille lue en retard n\'ecrase pas le choix', async () => {
  const { doc, theme } = await poserLeDecor();

  theme.appliquerTheme('braise');
  const braise = doc.enAttente()[0];
  theme.appliquerTheme('neige');
  const neige = doc.enAttente().find((f) => f !== braise);

  // La feuille abandonnee arrive la derniere : posee plus tard, elle gagnerait
  // la cascade. Elle doit donc s'enlever elle-meme.
  neige.lue();
  braise.lue();

  assert.deepEqual(doc.feuilles(), ['themes/neige.css']);
  assert.equal(doc.documentElement.dataset.theme, 'neige');
});

test('choisir apres avoir survole garde la feuille choisie', async () => {
  const { doc, theme } = await poserLeDecor();

  // Le geste reel : on survole, on clique, et la sortie de la carte redemande
  // le meme habillage. Le module ne doit pas prendre ce rappel pour un
  // abandon — c'est ce qui laissait la page sans aucune feuille.
  theme.appliquerTheme('vigne');
  theme.appliquerTheme('neige');
  theme.appliquerTheme('neige');
  doc.enAttente().forEach((f) => f.lue());

  assert.deepEqual(doc.feuilles(), ['themes/neige.css']);
});

test('l\'habillage de base enleve toute feuille', async () => {
  const { doc, theme } = await poserLeDecor();

  theme.appliquerTheme('braise');
  doc.enAttente().forEach((f) => f.lue());
  theme.appliquerTheme('studio');

  assert.deepEqual(doc.feuilles(), []);
  assert.equal(doc.documentElement.dataset.theme, 'studio');
});

test('une feuille introuvable s\'enleve au lieu de rester vide', async () => {
  const { doc, theme } = await poserLeDecor();

  theme.appliquerTheme('braise');
  doc.enAttente()[0].echouee();

  assert.deepEqual(doc.feuilles(), []);
});
