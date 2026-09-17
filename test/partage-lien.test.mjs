/**
 * Partage d'un reglage par un lien.
 *
 * Le lien doit rendre exactement la question posee, sans rien ecraser tant
 * qu'on ne l'a pas adopte, et se taire quand il est abime.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

class Rangement {
  constructor() { this.donnees = new Map(); }

  getItem(cle) { return this.donnees.has(cle) ? this.donnees.get(cle) : null; }

  setItem(cle, valeur) { this.donnees.set(cle, String(valeur)); }

  removeItem(cle) { this.donnees.delete(cle); }
}

globalThis.localStorage = new Rangement();

const {
  adopter, CHAMP, coder, decoder, formePartagee, formeRangee, lienPartage,
  reglageDuFragment, resume, VERSION,
} = await import('../web/partage-lien.mjs');
const { SLOTS } = await import('../src/data/slots.mjs');
const minimums = await import('../web/v2/minimums.mjs');
const { etatInitial } = await import('../web/reglages.mjs');
const { enBase64 } = await import('../src/partage/base64.mjs');

const EPEE = { id: 10, slot: 'arme', fr: 'Epee' };
const ANNEAU = { id: 1, slot: 'anneau', fr: 'Anneau' };
const CATALOGUE = { itemById: new Map([[EPEE.id, EPEE], [ANNEAU.id, ANNEAU]]) };

const PAGE = 'http://localhost:4173/web/v2/index.html?test=v2';

/** Un reglage complet, tel qu'un joueur en a un apres une seance. */
function etatRegle() {
  return {
    ...etatInitial(),
    niveau: 196,
    classe: 9,
    sexe: 1,
    mode: 'mixte',
    partDegats: 0.62,
    changementsMax: 3,
    equipped: new Map([['arme:0', EPEE], ['anneau:0', ANNEAU]]),
    posees: new Set(['arme:0']),
    sorts: [{
      id: 1, name: 'Fleche Magique', exclusiveGroup: null, telefragCible: null,
      icon: 'http://poste-de-karim:4173/web/assets/spells/1.png',
      lines: [{ element: 'air', min: 30, max: 34 }],
    }],
    conditions: [{ stat: 'pa', target: 11, max: null, absolute: true, weight: 500 }],
    bannis: new Set([77, 88]),
    verrous: new Set([10]),
    possedees: new Set([1]),
    allocation: { chance: 250 },
    scrolls: { vitalite: true },
    options: { ...etatInitial().options, arme: true, distance: true },
  };
}

test('formePartagee : la question, jamais les reponses', () => {
  const forme = formePartagee({ ...etatRegle(), candidats: [{ x: 1 }], paliers: [{ y: 2 }], survie: [{ z: 3 }] });
  assert.equal(forme.v, VERSION);
  assert.equal(forme.candidats, undefined);
  assert.equal(forme.paliers, undefined);
  assert.equal(forme.survie, undefined);
  assert.equal(forme.niveau, 196);
});

test('un aller-retour rend exactement le reglage', async () => {
  const depart = etatRegle();
  const forme = await decoder(await coder(depart));
  const arrivee = adopter(forme, CATALOGUE);

  assert.equal(arrivee.niveau, 196);
  assert.equal(arrivee.classe, 9);
  assert.equal(arrivee.sexe, 1);
  assert.equal(arrivee.mode, 'mixte');
  assert.equal(arrivee.partDegats, 0.62);
  assert.equal(arrivee.changementsMax, 3);
  assert.deepEqual([...arrivee.equipped.keys()], ['arme:0', 'anneau:0']);
  assert.equal(arrivee.equipped.get('arme:0').id, EPEE.id);
  assert.deepEqual([...arrivee.posees], ['arme:0']);
  // Un sort ne voyage que par son identifiant : le catalogue le refabrique.
  assert.deepEqual(arrivee.sorts, [{ id: 1 }]);
  assert.deepEqual(arrivee.conditions, depart.conditions);
  assert.deepEqual([...arrivee.bannis], [77, 88]);
  assert.deepEqual([...arrivee.verrous], [10]);
  assert.deepEqual([...arrivee.possedees], [1]);
  assert.equal(arrivee.allocation.chance, 250);
  assert.equal(arrivee.scrolls.vitalite, true);
  assert.equal(arrivee.options.arme, true);
  assert.equal(arrivee.options.distance, true);
});

test('le lien n\'emporte pas l\'adresse locale des icones de sorts', async () => {
  const code = await coder(etatRegle());
  const texte = JSON.stringify(await decoder(code));

  assert.ok(!texte.includes('poste-de-karim'), 'le nom de machine ne doit pas voyager');
  assert.ok(!texte.includes('/assets/spells/'), 'ni le chemin de l\'icone');
});

test('adopter : aucun resultat de recherche ne suit le reglage recu', async () => {
  const arrivee = adopter(await decoder(await coder(etatRegle())), CATALOGUE);

  assert.deepEqual(arrivee.candidats, []);
  assert.deepEqual(arrivee.paliers, []);
  assert.deepEqual(arrivee.survie, []);
});

/*
 * La liste des cases est ecrite a la main dans le module, pour qu'un lien
 * deja partage se relise toujours de la meme facon. Ce test est le garde-fou
 * de ce choix : elle doit couvrir exactement ce que le personnage porte.
 */
test('les cases du lien couvrent exactement celles du personnage', () => {
  const attendues = SLOTS.flatMap((slot) => Array.from(
    { length: slot.capacity }, (_, i) => `${slot.key}:${i}`));

  const forme = formePartagee({
    ...etatInitial(),
    equipped: new Map(attendues.map((cle, i) => [cle, { id: 500 + i }])),
  });

  assert.equal(forme.equipped.length, attendues.length, 'autant de positions que de cases');
  assert.equal(forme.equipped.filter((id) => id > 0).length, attendues.length,
    'aucune piece ne tombe faute de position');

  const rendues = formeRangee(forme).equipped.map(([cle]) => cle);
  assert.deepEqual([...rendues].sort(), [...attendues].sort());
});

/*
 * Le lien ne porte que l'ecart au reglage de depart. C'est la moitie de ce
 * qui l'a raccourci, et c'est aussi ce qui oblige `adopter` a repartir d'un
 * etat neuf : un champ absent veut dire « celui d'origine », pas « garde le
 * tien ».
 */
test('ce qui vaut le reglage de depart ne voyage pas', () => {
  assert.deepEqual(Object.keys(formePartagee(etatInitial())), ['v']);
});

test('une option changee voyage seule, sans ses vingt voisines', () => {
  const etat = { ...etatInitial(), options: { ...etatInitial().options, arme: true } };

  assert.deepEqual(formePartagee(etat).options, { arme: true });
});

test('celui qui recoit ne garde pas ses propres options', async () => {
  // L'expediteur laisse « arme » au defaut ; le destinataire l'avait allumee.
  const arrivee = adopter(
    await decoder(await coder({ ...etatInitial(), niveau: 150 })), CATALOGUE);

  assert.equal(arrivee.niveau, 150);
  assert.equal(arrivee.options.arme, etatInitial().options.arme,
    'le lien impose le reglage de depart, pas celui de l\'ecran d\'arrivee');
});

test('les cases posees a la main tiennent dans un seul nombre', () => {
  const forme = formePartagee({
    ...etatInitial(),
    equipped: new Map([['amulette:0', { id: 1 }], ['arme:0', { id: 2 }]]),
    posees: new Set(['arme:0']),
  });

  assert.equal(typeof forme.posees, 'number');
  assert.deepEqual(formeRangee(forme).posees, ['arme:0']);
});

test('une piece que le catalogue ne connait pas ne se pose pas', async () => {
  const etat = { ...etatInitial(), equipped: new Map([['arme:0', EPEE], ['cape:0', { id: 9999 }]]) };
  const arrivee = adopter(await decoder(await coder(etat)), CATALOGUE);

  assert.deepEqual([...arrivee.equipped.keys()], ['arme:0']);
});

test('lienPartage : le reglage voyage dans le fragment, pas dans la requete', async () => {
  const lien = await lienPartage(etatRegle(), PAGE);
  const url = new URL(lien);

  assert.equal(url.search, '?test=v2', 'la requete de la page reste intacte');
  assert.match(url.hash, new RegExp(`^#${CHAMP}=`));
  assert.equal(url.pathname, '/web/v2/index.html');
});

test('lienPartage : un reglage complet tient dans un lien lisible', async () => {
  const etat = etatRegle();
  etat.bannis = new Set(Array.from({ length: 40 }, (_, i) => 20000 + i));
  etat.possedees = new Set(Array.from({ length: 60 }, (_, i) => 21000 + i));
  etat.conditions = Array.from({ length: 8 }, (_, i) => (
    { stat: 'force', target: 100 + i, max: null, absolute: false, weight: 500 }));

  const lien = await lienPartage(etat, PAGE);
  // Mesure du 2026-09-18 : 500 caracteres pour ce reglage-la, adresse de la
  // page comprise. La borne laisse de la marge sans laisser le lien regrossir
  // sans que personne ne le remarque.
  assert.ok(lien.length < 700, `un lien de ${lien.length} caracteres est trop long`);
});

test('reglageDuFragment : lit le champ, et lui seul', async () => {
  const lien = await lienPartage(etatRegle(), PAGE);
  const fragment = new URL(lien).hash;

  assert.equal((await reglageDuFragment(fragment)).niveau, 196);
  assert.equal(await reglageDuFragment(''), null);
  assert.equal(await reglageDuFragment('#autre=chose'), null);
});

test('decoder : un lien abime se lit comme une absence de lien', async () => {
  const bon = await coder(etatRegle());

  assert.equal(await decoder(null), null);
  assert.equal(await decoder(''), null);
  assert.equal(await decoder('1'), null, 'la marque seule ne porte rien');
  assert.equal(await decoder(bon.slice(0, bon.length - 20)), null, 'lien tronque');
  assert.equal(await decoder(`9${bon.slice(1)}`), null, 'marque inconnue');
  assert.equal(await decoder(`0${enBase64(new TextEncoder().encode('{}'), { adresse: true })}`), null);
});

test('decoder : un lien d\'une autre version se refuse', async () => {
  const texte = JSON.stringify({ ...formePartagee(etatRegle()), v: VERSION + 1 });
  const code = `0${enBase64(new TextEncoder().encode(texte), { adresse: true })}`;

  assert.equal(await decoder(code), null);
});

test('decoder : la forme non comprimee se relit aussi', async () => {
  const texte = JSON.stringify(formePartagee(etatRegle()));
  const code = `0${enBase64(new TextEncoder().encode(texte), { adresse: true })}`;

  assert.equal((await decoder(code)).niveau, 196);
});

test('resume : ce que le lien porte, avant de le prendre', async () => {
  const etat = { ...etatRegle(), equipped: new Map([['arme:0', EPEE], ['cape:0', { id: 9999 }]]) };
  const compte = resume(await decoder(await coder(etat)), CATALOGUE);

  assert.deepEqual(compte, {
    pieces: 2, inconnues: 1, sorts: 1, minimums: 1, niveau: 196, classe: 9,
  });
});

/*
 * Un minimum voyage par l'ORDRE de ses champs. Ce test est le garde-fou de ce
 * choix : ajouter un champ a un minimum sans l'ajouter au lien le ferait
 * disparaitre en silence, et le minimum arriverait mutile.
 */
test('un minimum ne porte que les cinq champs que le lien transmet', () => {
  const { MINIMUM_NEUF } = minimums;
  const depart = etatInitial().conditions;

  for (const minimum of [...depart, MINIMUM_NEUF('pa')]) {
    assert.deepEqual(Object.keys(minimum).sort(), ['absolute', 'max', 'stat', 'target', 'weight']);
  }
});

test('un minimum se retrouve entier apres l\'aller-retour', async () => {
  const etat = {
    ...etatInitial(),
    conditions: [
      { stat: 'pa', target: 12, weight: 250, max: 12, absolute: true },
      { stat: 'sagesse', target: 600, weight: 1, max: null, absolute: false },
    ],
  };

  const arrivee = adopter(await decoder(await coder(etat)), CATALOGUE);
  assert.deepEqual(arrivee.conditions, etat.conditions);
});
