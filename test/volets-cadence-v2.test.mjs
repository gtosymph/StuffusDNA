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
import {
  basculer, choisirOnglet, classesDeVolets, ongletCourant, ouvertureDepart,
} from '../web/v2/volets.mjs';
import {
  contexteEnLigne, FORMULAIRE, lienFormulaire, navigateurLisible, rapportACopier,
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

/* ============================================ Les trois ecrans === */

/*
 * Sur telephone, les deux memes etats disent TROIS ecrans : un volet ouvert
 * nomme le sien, aucun volet ouvert nomme le milieu. Rien de nouveau a
 * garder, donc rien qui puisse se contredire.
 */
test('les onglets du telephone', async (t) => {
  await t.test('l\'etat des volets nomme l\'ecran', () => {
    assert.equal(ongletCourant({ gauche: false, droit: false }), 'stuff');
    assert.equal(ongletCourant({ gauche: true, droit: false }), 'gauche');
    assert.equal(ongletCourant({ gauche: false, droit: true }), 'droit');
  });

  await t.test('un etat abime retombe sur le milieu', () => {
    assert.equal(ongletCourant(null), 'stuff');
    assert.equal(ongletCourant({}), 'stuff');
  });

  await t.test('un onglet n\'est pas un interrupteur', () => {
    // Appuyer sur l'onglet ou l'on est deja doit y rester. `basculer`
    // ramenerait ailleurs, ce qui est exactement ce qu'un onglet ne fait pas.
    const gauche = { gauche: true, droit: false };
    assert.deepEqual(choisirOnglet(gauche, 'gauche'), gauche);
  });

  await t.test('un onglet ferme les deux autres', () => {
    assert.deepEqual(choisirOnglet({ gauche: true, droit: false }, 'droit'),
      { gauche: false, droit: true });
    assert.deepEqual(choisirOnglet({ gauche: true, droit: false }, 'stuff'),
      { gauche: false, droit: false });
  });

  await t.test('un onglet inconnu ne change rien', () => {
    const depart = { gauche: true, droit: false };
    assert.equal(choisirOnglet(depart, 'ailleurs'), depart);
  });

  await t.test('l\'aller-retour est stable', () => {
    for (const onglet of ['gauche', 'stuff', 'droit']) {
      assert.equal(ongletCourant(choisirOnglet({ gauche: false, droit: false }, onglet)), onglet);
    }
  });
});

/* ================================================ Le rapport qui part === */

const CONTEXTE = contexteEnLigne({
  navigateur: 'Firefox 141 · macOS', page: 'https://exemple.test/',
  personnage: 'Xelor 196', pieces: 16, sorts: 8,
});

test('le contexte du rapport', async (t) => {
  await t.test('il tient sur une ligne', () => {
    // Il voyage dans un champ cache d'une adresse : un retour a la ligne y
    // survit mal, et le rapport arriverait coupe.
    assert.ok(!CONTEXTE.includes('\n'));
  });

  await t.test('il porte les quatre faits', () => {
    for (const mot of ['Firefox 141', 'Xelor 196', '16 piece', '8 sort', 'exemple.test']) {
      assert.ok(CONTEXTE.includes(mot), `le contexte oublie ${mot}`);
    }
  });
});

test('le lien du formulaire', async (t) => {
  /*
   * Les trois noms de champ sont ceux poses dans le formulaire, et ils sont
   * sensibles a la casse. Une faute de frappe ne fait aucune erreur : elle
   * fait arriver un rapport vide, et personne ne s'en apercoit avant d'avoir
   * perdu des retours. Ce test est le seul garde-fou de ces trois mots.
   */
  await t.test('il remplit les trois champs caches, par leur nom exact', () => {
    const adresse = new URL(lienFormulaire({
      version: 'v1.0.0', contexte: CONTEXTE, lien: 'https://x.test/#b=abc' }));

    assert.equal(adresse.searchParams.get('version'), 'v1.0.0');
    assert.equal(adresse.searchParams.get('contexte'), CONTEXTE);
    assert.equal(adresse.searchParams.get('lien'), 'https://x.test/#b=abc');
    assert.deepEqual([...adresse.searchParams.keys()], ['version', 'contexte', 'lien']);
  });

  await t.test('il vise le formulaire, pas un ticket', () => {
    assert.ok(lienFormulaire({ version: 'v1', contexte: '', lien: null }).startsWith(FORMULAIRE));
    // Un compte a creer perd la plupart des retours avant le premier mot.
    assert.ok(!FORMULAIRE.includes('github'));
  });

  await t.test('sans lien de reglage, le champ ne part pas du tout', () => {
    // Un champ portant le mot « null » est pire que pas de champ : il se lit
    // comme une reponse.
    const adresse = new URL(lienFormulaire({ version: 'v1', contexte: 'x', lien: null }));
    assert.equal(adresse.searchParams.has('lien'), false);
  });

  await t.test('le lien de partage traverse l\'adresse sans s\'abimer', () => {
    // Il porte un fragment et des caracteres de base64 : mal encode, il
    // arrive tronque au premier « # », et ne rouvre plus rien.
    const partage = 'https://x.test/web/v2/index.html#b=1XZ-Dbt_MBE+g/Fc=';
    const adresse = new URL(lienFormulaire({ version: 'v1', contexte: 'x', lien: partage }));
    assert.equal(adresse.searchParams.get('lien'), partage);
  });
});

test('le rapport a coller', async (t) => {
  await t.test('il porte la version, le contexte et le lien', () => {
    const texte = rapportACopier({
      version: 'v1.0.0', contexte: CONTEXTE, lien: 'https://x.test/#b=abc' });

    assert.match(texte, /^The Best Roxxeur v1\.0\.0$/m);
    assert.ok(texte.includes(CONTEXTE));
    assert.ok(texte.includes('https://x.test/#b=abc'));
  });

  await t.test('sans lien, il ne laisse pas de ligne vide', () => {
    const texte = rapportACopier({ version: 'v1.0.0', contexte: CONTEXTE, lien: null });
    assert.equal(texte.split('\n').length, 2);
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
