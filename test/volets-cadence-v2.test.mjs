/**
 * Trois decisions qui ne se voient pas a l'ecran, et qui cassent en silence.
 *
 * La cadence de repeint : un clic perdu ne laisse aucune trace, aucune
 * erreur, rien dans la console. Le joueur dit « parfois ca ne marche pas ».
 *
 * L'etat des volets : un volet replie au demarrage sur un grand ecran, ou un
 * volet ouvert qui en recouvre un autre sur un telephone, se voient — mais
 * seulement sur l'ecran ou la faute se produit.
 *
 * Le rapport de signalement : il part chez quelqu'un. Un titre vide ou une
 * adresse trop longue rendent une page d'erreur au joueur qui essayait
 * justement de signaler quelque chose.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { creerCadence } from '../web/v2/cadence.mjs';
import { basculer, classesDeVolets, ouvertureDepart } from '../web/v2/volets.mjs';
import {
  composerRapport, contexte, lienTicket, LONGUEUR_MAX, NATURES, navigateurLisible,
} from '../web/v2/rapport.mjs';

/* ============================================ La cadence de repeint === */

/** Un peintre qui compte ses passages, et un planificateur qu'on declenche. */
function banc() {
  let passages = 0;
  const attente = [];
  const cadence = creerCadence({
    peindre: () => { passages += 1; },
    planifier: (suite) => attente.push(suite),
  });
  return {
    cadence,
    passages: () => passages,
    image: () => { const suites = attente.splice(0); for (const suite of suites) suite(); },
  };
}

test('la cadence de repeint', async (t) => {
  await t.test('dix demandes rapprochees ne font qu\'un repeint', () => {
    const { cadence, passages, image } = banc();
    for (let i = 0; i < 10; i += 1) cadence.demander();
    image();
    assert.equal(passages(), 1);
  });

  await t.test('rien ne se repeint sous un doigt pose', () => {
    const { cadence, passages, image } = banc();
    cadence.enfoncer();
    cadence.demander();
    image();
    assert.equal(passages(), 0, 'un repeint sous le doigt avale le clic');
  });

  await t.test('le repeint retenu part des que le doigt se leve', () => {
    const { cadence, passages, image } = banc();
    cadence.enfoncer();
    cadence.demander();
    image();
    cadence.relacher();
    assert.equal(passages(), 1);
  });

  await t.test('un doigt leve sans rien demander ne repeint pas', () => {
    const { cadence, passages } = banc();
    cadence.enfoncer();
    cadence.relacher();
    assert.equal(passages(), 0);
  });

  await t.test('vingt vagues pendant un clic ne donnent qu\'un repeint', () => {
    const { cadence, passages, image } = banc();
    cadence.enfoncer();
    for (let i = 0; i < 20; i += 1) { cadence.demander(); image(); }
    cadence.relacher();
    assert.equal(passages(), 1);
  });

  await t.test('apres un clic, la cadence reprend normalement', () => {
    const { cadence, passages, image } = banc();
    cadence.enfoncer();
    cadence.demander();
    image();
    cadence.relacher();
    cadence.demander();
    image();
    assert.equal(passages(), 2);
  });
});

/* ================================================== L'etat des volets === */

test('les volets', async (t) => {
  await t.test('un ecran etroit s\'ouvre sur le personnage', () => {
    assert.deepEqual(
      ouvertureDepart({ garde: { gauche: true, droit: true }, etroit: true }),
      { gauche: false, droit: false });
  });

  await t.test('un ecran large reprend ce qui a ete garde', () => {
    assert.deepEqual(
      ouvertureDepart({ garde: { gauche: false, droit: true }, etroit: false }),
      { gauche: false, droit: true });
  });

  await t.test('sans rien de garde, les deux volets sont la', () => {
    assert.deepEqual(ouvertureDepart({ garde: null, etroit: false }),
      { gauche: true, droit: true });
  });

  await t.test('sur un ecran etroit, un volet ouvert ferme l\'autre', () => {
    const depart = { gauche: true, droit: false };
    assert.deepEqual(basculer(depart, 'droit', true), { gauche: false, droit: true });
  });

  await t.test('sur un ecran large, les deux cohabitent', () => {
    const depart = { gauche: true, droit: false };
    assert.deepEqual(basculer(depart, 'droit', false), { gauche: true, droit: true });
  });

  await t.test('replier n\'ouvre jamais l\'autre', () => {
    assert.deepEqual(basculer({ gauche: true, droit: true }, 'gauche', true),
      { gauche: false, droit: true });
  });

  await t.test('un cote inconnu ne change rien', () => {
    const depart = { gauche: true, droit: true };
    assert.equal(basculer(depart, 'milieu', false), depart);
  });

  await t.test('seul un volet REPLIE porte une classe', () => {
    // Une feuille de style chargee a moitie laisse alors les volets visibles,
    // ce qui est l'etat le moins genant.
    assert.deepEqual(classesDeVolets({ gauche: true, droit: true }, false), []);
    assert.deepEqual(classesDeVolets({ gauche: false, droit: true }, false), ['gauche-replie']);
    assert.deepEqual(classesDeVolets({ gauche: false, droit: false }, true),
      ['gauche-replie', 'droit-replie', 'volets-flottants']);
  });
});

/* ================================================ Le rapport qui part === */

const FAITS = contexte({
  version: 'v1.0.0', navigateur: 'Firefox 141 · macOS',
  adresse: 'https://exemple.test/', personnage: 'Xelor 196', pieces: 16, sorts: 8,
});

test('le rapport de signalement', async (t) => {
  await t.test('le titre vient de la premiere ligne du joueur', () => {
    const { titre } = composerRapport({
      nature: 'probleme', texte: 'Le score reste a zero\nmeme apres dix minutes',
      contexte: FAITS, lien: null });
    assert.equal(titre, 'Le score reste a zero');
  });

  await t.test('un titre trop long se coupe proprement', () => {
    const { titre } = composerRapport({
      nature: 'probleme', texte: 'x'.repeat(200), contexte: FAITS, lien: null });
    assert.equal(titre.length, 73);
    assert.ok(titre.endsWith('…'));
  });

  await t.test('un rapport vide reste envoyable', () => {
    const { titre, corps } = composerRapport({
      nature: 'amelioration', texte: '   ', contexte: FAITS, lien: null });
    assert.equal(titre, 'Une amelioration sans titre');
    assert.ok(corps.includes('(rien n\'a ete ecrit)'));
  });

  await t.test('le lien du reglage voyage avec le rapport', () => {
    const { corps } = composerRapport({
      nature: 'probleme', texte: 'Souci', contexte: FAITS, lien: 'https://x.test/#b=abc' });
    assert.ok(corps.includes('https://x.test/#b=abc'));
  });

  await t.test('le contexte porte les cinq faits', () => {
    for (const mot of ['v1.0.0', 'Firefox 141', 'Xelor 196', '16 piece', '8 sort']) {
      assert.ok(FAITS.includes(mot), `le contexte oublie ${mot}`);
    }
  });
});

test('le lien du ticket', async (t) => {
  await t.test('il porte le titre, le corps et l\'etiquette', () => {
    const lien = lienTicket({ titre: 'Un souci', corps: 'Detail', etiquette: 'bug' });
    const adresse = new URL(lien);
    assert.equal(adresse.searchParams.get('title'), 'Un souci');
    assert.equal(adresse.searchParams.get('body'), 'Detail');
    assert.equal(adresse.searchParams.get('labels'), 'bug');
  });

  await t.test('un rapport enorme se coupe plutot que de rendre une erreur', () => {
    // GitHub rend une page « 414 URI Too Long » sans rien expliquer : un
    // rapport ampute vaut mieux que ce mur-la.
    const lien = lienTicket({
      titre: 'Gros', corps: 'a'.repeat(50000), etiquette: 'bug' });
    assert.ok(lien.length <= LONGUEUR_MAX, `adresse de ${lien.length} caracteres`);
    assert.ok(decodeURIComponent(new URL(lien).searchParams.get('body')).endsWith('[…]'));
  });

  await t.test('chaque nature porte une etiquette que GitHub connait', () => {
    assert.deepEqual(NATURES.map((n) => n.etiquette), ['bug', 'enhancement']);
  });
});

test('le navigateur, en trois mots', async (t) => {
  await t.test('il se reconnait sans reciter deux cents caracteres', () => {
    assert.equal(navigateurLisible(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'), 'Chrome 141 · macOS');
    assert.equal(navigateurLisible(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0'),
      'Firefox 141 · Windows');
  });

  await t.test('Edge ne se fait pas passer pour Chrome', () => {
    assert.match(navigateurLisible(
      'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'),
      /^Edge 141/);
  });

  await t.test('un navigateur inconnu ne casse rien', () => {
    assert.equal(navigateurLisible(''), 'inconnu');
    assert.equal(navigateurLisible(null), 'inconnu');
  });
});
