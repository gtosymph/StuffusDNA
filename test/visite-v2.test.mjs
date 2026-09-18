/**
 * La visite guidee, et la version affichee.
 *
 * Une visite pourrit en silence. Elle vise des commandes par leur
 * identifiant ; le jour ou l'une d'elles est renommee, la visite ne casse
 * pas — elle saute l'etape, et personne ne s'en apercoit avant de la lancer.
 * Le premier test confronte donc chaque cible a la vraie coquille.
 *
 * La version se dedouble de la meme facon : `package.json` et le module de la
 * page ne peuvent pas se lire l'un l'autre, et rien ne les tient ensemble a
 * part ce test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  avancer, ETAPES, ETAPES_TELEPHONE, etapesVisibles, visitePour,
} from '../web/v2/visite.mjs';
import { LARGEUR_TELEPHONE } from '../web/v2/volets.mjs';
import { VERSION, VERSION_LUE } from '../web/version.mjs';

const ici = (chemin) => new URL(chemin, import.meta.url);

/* ------------------------------------------------- Les cibles existent --- */

test('les etapes de la visite', async (t) => {
  const coquille = await readFile(ici('../web/v2/index.html'), 'utf8');

  await t.test('chaque etape vise une commande qui existe', () => {
    for (const { cible } of [...ETAPES, ...ETAPES_TELEPHONE]) {
      assert.match(cible, /^#[a-z-]+$/, `cible mal formee : ${cible}`);
      assert.ok(coquille.includes(`id="${cible.slice(1)}"`),
        `la coquille ne porte aucun « ${cible} »`);
    }
  });

  await t.test('aucune commande n\'est montree deux fois', () => {
    const cibles = ETAPES.map((etape) => etape.cible);
    assert.equal(new Set(cibles).size, cibles.length);
  });

  await t.test('chaque etape dit quelque chose', () => {
    for (const etape of [...ETAPES, ...ETAPES_TELEPHONE]) {
      assert.ok(etape.titre?.length > 0, `titre vide : ${etape.cible}`);
      assert.ok(etape.texte?.length > 20, `texte trop court : ${etape.cible}`);
    }
  });
});

/* ------------------------------ Une commande absente ne coince pas tout --- */

test('les etapes retenues', async (t) => {
  await t.test('une commande absente de l\'ecran saute', () => {
    const retenues = etapesVisibles((cible) => cible !== '#plateau');
    assert.equal(retenues.length, ETAPES.length - 1);
    assert.ok(!retenues.some((etape) => etape.cible === '#plateau'));
  });

  await t.test('un ecran sans rien a montrer rend une visite vide', () => {
    assert.deepEqual(etapesVisibles(() => false), []);
  });

  await t.test('l\'ordre des gestes se garde', () => {
    const retenues = etapesVisibles(() => true);
    assert.deepEqual(retenues.map((e) => e.cible), ETAPES.map((e) => e.cible));
  });
});

/* --------------------------------------------- Le compteur des etapes --- */

test('le deplacement d\'etape', async (t) => {
  await t.test('il ne sort pas de la visite', () => {
    assert.equal(avancer(0, -1, 5), 0);
    assert.equal(avancer(4, 1, 5), 4);
    assert.equal(avancer(2, 1, 5), 3);
    assert.equal(avancer(2, -1, 5), 1);
  });

  await t.test('une visite vide ne pointe nulle part', () => {
    assert.equal(avancer(3, 1, 0), 0);
  });

  await t.test('une valeur abimee vaut zero', () => {
    assert.equal(avancer(Number.NaN, 1, 5), 1);
    assert.equal(avancer(1, Number.NaN, 5), 1);
  });
});

/* ------------------------------------------------- La version publiee --- */

test('la version', async (t) => {
  await t.test('le paquet et la page portent la meme', async () => {
    const paquet = JSON.parse(await readFile(ici('../package.json'), 'utf8'));
    assert.equal(paquet.version, VERSION,
      'package.json et web/version.mjs ne disent pas la meme version');
  });

  await t.test('elle se lit avec son « v »', () => {
    assert.equal(VERSION_LUE, `v${VERSION}`);
    assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  });
});

/* ------------------------------------------- La visite du telephone --- */

/*
 * Vingt-cinq bulles a faire defiler au pouce se font quitter avant la moitie.
 * La visite du telephone n'est pas la version courte de l'autre : elle
 * raconte une autre application, celle qui tient en trois ecrans.
 */
test('la visite du telephone', async (t) => {
  await t.test('elle tient en six etapes', () => {
    assert.equal(ETAPES_TELEPHONE.length, 6);
    assert.ok(ETAPES_TELEPHONE.length < ETAPES.length / 3);
  });

  await t.test('elle nomme les trois ecrans', () => {
    const cibles = ETAPES_TELEPHONE.map((e) => e.cible);
    for (const attendue of ['#quai-onglets', '#onglet-gauche', '#onglet-droit']) {
      assert.ok(cibles.includes(attendue), `la visite oublie ${attendue}`);
    }
  });

  await t.test('la largeur decide de la visite', () => {
    assert.equal(visitePour(390), ETAPES_TELEPHONE);
    assert.equal(visitePour(LARGEUR_TELEPHONE), ETAPES_TELEPHONE);
    assert.equal(visitePour(LARGEUR_TELEPHONE + 1), ETAPES);
    assert.equal(visitePour(1600), ETAPES);
  });
});
