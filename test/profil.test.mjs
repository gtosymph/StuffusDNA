/**
 * Profil du joueur : rangement, export et import.
 *
 * L'application ne demande pas de compte. Le profil d'un joueur vit donc dans
 * son navigateur, et le fichier exporte est la seule sauvegarde qui lui
 * survive. Deux promesses tiennent tout : un export n'oublie rien, et un
 * import repose exactement ce qui a ete exporte.
 *
 * La troisieme promesse est plus discrete mais tout aussi importante : une
 * ecriture refusee se DIT. Un rangement plein qui echoue en silence fait
 * croire au joueur que son travail est garde.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/** Rangement en memoire, du meme contrat que celui du navigateur. */
class Rangement {
  constructor({ limite = Infinity } = {}) {
    this.donnees = new Map();
    this.limite = limite;
  }

  getItem(cle) { return this.donnees.has(cle) ? this.donnees.get(cle) : null; }

  setItem(cle, valeur) {
    const taille = [...this.donnees].reduce((n, [k, v]) => n + k.length + v.length, 0);
    if (taille + cle.length + String(valeur).length > this.limite) {
      const erreur = new Error('quota depasse');
      erreur.name = 'QuotaExceededError';
      throw erreur;
    }
    this.donnees.set(cle, String(valeur));
  }

  removeItem(cle) { this.donnees.delete(cle); }
}

globalThis.localStorage = new Rangement();

const stockage = await import('../web/stockage.mjs');
const profil = await import('../web/profil.mjs');
const { CLES } = stockage;

test.beforeEach(() => { globalThis.localStorage = new Rangement(); });

test('le rangement lit et ecrit ce qu\'on lui donne', () => {
  assert.equal(stockage.ecrire(CLES.theme, 'cockpit'), true);
  assert.equal(stockage.lireTexte(CLES.theme), 'cockpit');

  assert.equal(stockage.ecrireJson(CLES.etat, { niveau: 190 }), true);
  assert.deepEqual(stockage.lireJson(CLES.etat, null), { niveau: 190 });
});

test('une valeur absente ou illisible rend la valeur par defaut', () => {
  assert.equal(stockage.lireTexte('inconnue', 'rien'), 'rien');
  assert.deepEqual(stockage.lireJson('inconnue', []), []);

  globalThis.localStorage.setItem(CLES.etat, '{ pas du json');
  assert.deepEqual(stockage.lireJson(CLES.etat, { vide: true }), { vide: true });
});

test('une ecriture refusee se dit au lieu de disparaitre', () => {
  globalThis.localStorage = new Rangement({ limite: 40 });
  const vus = [];
  const arreter = stockage.surEchec((echec) => vus.push(echec));

  const ecrit = stockage.ecrireJson(CLES.simulations, { gros: 'x'.repeat(500) });

  assert.equal(ecrit, false, 'l\'ecriture rend faux');
  assert.equal(vus.length, 1, 'le temoin est prevenu');
  assert.equal(vus[0].sature, true, 'la saturation est reconnue');
  assert.equal(vus[0].cle, CLES.simulations);

  arreter();
});

test('un export n\'oublie aucune partie du profil', () => {
  for (const cle of stockage.CLES_PROFIL) stockage.ecrire(cle, `valeur de ${cle}`);

  const exporte = profil.lireProfil();

  assert.equal(exporte.format, profil.FORMAT);
  assert.equal(exporte.version, profil.VERSION);
  assert.deepEqual(Object.keys(exporte.donnees).sort(), [...stockage.CLES_PROFIL].sort());
});

test('un import repose exactement ce qui a ete exporte', () => {
  stockage.ecrire(CLES.etat, '{"niveau":193}');
  stockage.ecrire(CLES.theme, 'cockpit');
  const fichier = JSON.stringify(profil.lireProfil());

  globalThis.localStorage = new Rangement();
  const rapport = profil.importerProfil(fichier);

  assert.equal(rapport.refusees.length, 0);
  assert.equal(stockage.lireTexte(CLES.etat), '{"niveau":193}');
  assert.equal(stockage.lireTexte(CLES.theme), 'cockpit');
});

test('un import ne melange pas deux profils', () => {
  // Le navigateur d'arrivee porte deja des simulations : elles n'appartiennent
  // pas au profil repris, elles doivent partir.
  stockage.ecrire(CLES.simulations, '[{"id":"ancien"}]');
  stockage.ecrire(CLES.etat, '{"niveau":1}');

  profil.importerProfil(JSON.stringify({
    format: profil.FORMAT, version: 1, donnees: { [CLES.etat]: '{"niveau":200}' },
  }));

  assert.equal(stockage.lireTexte(CLES.etat), '{"niveau":200}');
  assert.equal(stockage.lireTexte(CLES.simulations), null, 'l\'ancienne liste est partie');
});

test('un fichier etranger ou abime se refuse, sans rien casser', async (t) => {
  const refus = [
    ['du texte qui n\'est pas du json', /pas au format JSON/],
    ['{"format":"autre-appli","version":1,"donnees":{}}', /autre application/],
    [JSON.stringify({ format: profil.FORMAT, version: 99, donnees: {} }), /version 99/],
    [JSON.stringify({ format: profil.FORMAT, version: 1 }), /sans donnees/],
    [JSON.stringify({ format: profil.FORMAT, version: 1, donnees: { inconnue: 'x' } }), /vide/],
    ['null', /ne contient pas un profil/],
    ['[]', /ne contient pas un profil/],
  ];

  for (const [texte, attendu] of refus) {
    await t.test(texte.slice(0, 40), () => {
      // Le rangement repart neuf a chaque sous-test : le profil en place s'y
      // repose avant l'essai.
      stockage.ecrire(CLES.etat, '{"niveau":190}');
      assert.throws(() => profil.importerProfil(texte), attendu);
      assert.equal(stockage.lireTexte(CLES.etat), '{"niveau":190}', 'le profil en place est intact');
    });
  }
});

test('une cle inconnue du fichier est ecartee, jamais posee', () => {
  const rapport = profil.importerProfil(JSON.stringify({
    format: profil.FORMAT,
    version: 1,
    donnees: { [CLES.theme]: 'forge', copyroxx_inconnue: 'x', [CLES.etat]: 42 },
  }));

  assert.deepEqual(rapport.inconnues.sort(), ['copyroxx_etat', 'copyroxx_inconnue']);
  assert.equal(stockage.lireTexte('copyroxx_inconnue'), null);
  assert.equal(stockage.lireTexte(CLES.theme), 'forge');
});

test('effacer le profil n\'en laisse rien', () => {
  for (const cle of stockage.CLES_PROFIL) stockage.ecrire(cle, 'x');

  profil.effacerProfil();

  for (const cle of stockage.CLES_PROFIL) assert.equal(stockage.lireTexte(cle), null, cle);
});

test('la place occupee se mesure et previent avant le refus', () => {
  assert.equal(stockage.occupation().octets, 0);

  stockage.ecrire(CLES.simulations, 'x'.repeat(1000));
  const petite = stockage.occupation();
  assert.equal(petite.octets, 1000 + CLES.simulations.length);
  assert.equal(petite.sature, false);
  assert.equal(petite.parCle[0].cle, CLES.simulations);

  stockage.ecrire(CLES.simulations, 'x'.repeat(Math.ceil(stockage.LIMITE_ESTIMEE * 0.9)));
  assert.equal(stockage.occupation().sature, true);
});

test('le nom du fichier porte la date du jour', () => {
  assert.equal(profil.nomFichier(new Date('2026-09-09T12:00:00Z')), 'the-best-roxxeur-2026-09-09.json');
});

/*
 * Un profil exporte depuis un bac d'essai se reprend.
 *
 * « ?test » suffixe toutes les cles du rangement. Le fichier exporte la-bas
 * portait donc des noms que l'import ne reconnaissait pas, et refusait le
 * fichier ENTIER sur un « profil vide : aucune donnee reconnue » qui ne
 * nommait pas la cause. Le suffixe est un detail de notre mode d'essai, pas
 * une propriete du profil du joueur.
 */
test('les cles d\'un bac d\'essai se rabattent sur celles de ce navigateur', () => {
  const venuDuBac = {
    format: profil.FORMAT,
    version: profil.VERSION,
    donnees: {
      copyroxx_etat_test_v2: '{"niveau":196}',
      copyroxx_sets_sorts_test_v2: '[]',
      copyroxx_v2_theme_test: 'braise',
    },
  };

  const { donnees, inconnues } = profil.verifierProfil(venuDuBac);

  assert.deepEqual(inconnues, []);
  assert.equal(donnees[CLES.etat], '{"niveau":196}');
  assert.equal(donnees[CLES.setsSorts], '[]');
  assert.equal(donnees[CLES.themeV2], 'braise');
});

test('cleDici ne reconnait que nos cles', () => {
  assert.equal(stockage.cleDici('copyroxx_etat'), CLES.etat);
  assert.equal(stockage.cleDici('copyroxx_etat_test'), CLES.etat);
  assert.equal(stockage.cleDici('copyroxx_etat_test_mobile'), CLES.etat);
  assert.equal(stockage.cleDici('copyroxx_v2_theme'), CLES.themeV2);
  assert.equal(stockage.cleDici('autre_application'), null);
  assert.equal(stockage.cleDici('copyroxx_inconnue'), null);
});

test('l\'habillage de v2 fait partie du profil', () => {
  assert.ok(stockage.CLES_PROFIL.includes(CLES.themeV2));

  stockage.ecrire(CLES.themeV2, 'abysse');
  assert.equal(profil.lireProfil().donnees[CLES.themeV2], 'abysse');
});

/*
 * Un profil peut ne porter ni piece ni sort.
 *
 * Une classe, un niveau et des minimums font deja un reglage. v2 decidait
 * d'ouvrir son ecran vide d'apres les pieces portees : un tel profil,
 * pourtant repris correctement, disparaissait derriere « Quelle classe
 * joues-tu ? », et l'import avait l'air de n'avoir rien fait.
 */
test('un etat range se reconnait, meme sans piece ni sort', async () => {
  const { etatRange } = await import('../web/etat-stockage.mjs');

  assert.equal(etatRange(), false);
  stockage.ecrireJson(CLES.etat, { niveau: 196, classe: 9, equipped: [], sorts: [] });
  assert.equal(etatRange(), true);
});
