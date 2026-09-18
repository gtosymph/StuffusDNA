/**
 * Gestes sur l'equipement.
 *
 * Chaque geste rend un morceau d'etat neuf et laisse l'original intact :
 * c'est ce qui rend « Annuler » fiable. Les tests verifient les deux : ce
 * qui change, et ce qui ne bouge pas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appliquerBuild, autoriserPieces, bannirPieces, basculerBanni, basculerVerrou,
  casesDeLaFamille, equiper, equiperDans, posseder, remplacementAuChoix, retirer,
} from '../web/equipement.mjs';
import { etatInitial } from '../web/reglages.mjs';

const piece = (id, slot, extra = {}) => ({ id, slot, fr: `Piece ${id}`, ...extra });

const ANNEAU_A = piece(1, 'anneau');
const ANNEAU_B = piece(2, 'anneau');
const ANNEAU_C = piece(3, 'anneau');
const EPEE = piece(10, 'arme');
const MARTEAU = piece(11, 'arme', { twoHanded: true });
const BOUCLIER = piece(20, 'bouclier');

/** Etat de depart avec quelques pieces portees. */
function etatAvec(pieces = []) {
  const etat = etatInitial();
  for (const [cle, item] of pieces) etat.equipped.set(cle, item);
  return etat;
}

test('equiper', async (t) => {
  await t.test('pose dans la premiere case libre et marque la piece comme posee', () => {
    const patch = equiper(etatAvec([['anneau:0', ANNEAU_A]]), ANNEAU_B);
    assert.equal(patch.equipped.get('anneau:1'), ANNEAU_B);
    assert.ok(patch.posees.has('anneau:1'));
  });

  await t.test('remplace la derniere case quand tout est plein', () => {
    const patch = equiper(etatAvec([['anneau:0', ANNEAU_A], ['anneau:1', ANNEAU_B]]), ANNEAU_C);
    assert.equal(patch.equipped.get('anneau:1'), ANNEAU_C);
    assert.equal(patch.equipped.get('anneau:0'), ANNEAU_A);
  });

  await t.test('une piece deja portee change de case sans se dedoubler', () => {
    const patch = equiper(etatAvec([['anneau:1', ANNEAU_A]]), ANNEAU_A);
    const portees = [...patch.equipped.values()].filter((p) => p.id === ANNEAU_A.id);
    assert.equal(portees.length, 1);
  });

  await t.test('une arme a deux mains fait tomber le bouclier, et l\'inverse', () => {
    const sansBouclier = equiper(etatAvec([['bouclier:0', BOUCLIER]]), MARTEAU);
    assert.equal(sansBouclier.equipped.has('bouclier:0'), false);

    const sansMarteau = equiper(etatAvec([['arme:0', MARTEAU]]), BOUCLIER);
    assert.equal(sansMarteau.equipped.has('arme:0'), false);

    const avecEpee = equiper(etatAvec([['arme:0', EPEE]]), BOUCLIER);
    assert.equal(avecEpee.equipped.get('arme:0'), EPEE);
  });

  await t.test('rend null pour un type de piece inconnu', () => {
    assert.equal(equiper(etatInitial(), piece(99, 'chapeau-invisible')), null);
  });

  await t.test('ne touche pas l\'etat de depart', () => {
    const etat = etatAvec([['anneau:0', ANNEAU_A]]);
    equiper(etat, ANNEAU_B);
    assert.equal(etat.equipped.size, 1);
    assert.equal(etat.posees.size, 0);
  });
});

test('retirer vide la case et leve le verrou de la piece', () => {
  const etat = etatAvec([['arme:0', EPEE]]);
  etat.verrous.add(EPEE.id);

  const patch = retirer(etat, 'arme:0');
  assert.equal(patch.equipped.has('arme:0'), false);
  assert.equal(patch.verrous.has(EPEE.id), false);
  assert.ok(etat.verrous.has(EPEE.id), 'l\'original garde son verrou');
});

test('bannir', async (t) => {
  await t.test('une piece bannie tombe du build et perd son verrou', () => {
    const etat = etatAvec([['arme:0', EPEE]]);
    etat.verrous.add(EPEE.id);
    etat.posees.add('arme:0');

    const patch = bannirPieces(etat, [EPEE]);
    assert.ok(patch.bannis.has(EPEE.id));
    assert.equal(patch.equipped.has('arme:0'), false);
    assert.equal(patch.posees.has('arme:0'), false);
    assert.equal(patch.verrous.has(EPEE.id), false);
  });

  await t.test('autoriser enleve du ban sans toucher au reste', () => {
    const etat = etatInitial();
    etat.bannis.add(EPEE.id).add(ANNEAU_A.id);
    const patch = autoriserPieces(etat, [EPEE]);
    assert.deepEqual([...patch.bannis], [ANNEAU_A.id]);
    assert.equal(Object.keys(patch).length, 1);
  });

  await t.test('la bascule bannit puis autorise', () => {
    const etat = etatInitial();
    const premier = basculerBanni(etat, EPEE);
    assert.equal(premier.bannie, true);

    const second = basculerBanni({ ...etat, ...premier.patch }, EPEE);
    assert.equal(second.bannie, false);
    assert.equal(second.patch.bannis.has(EPEE.id), false);
  });
});

test('verrouiller', async (t) => {
  await t.test('une piece absente est posee du meme geste', () => {
    const { patch, verrouillee } = basculerVerrou(etatInitial(), EPEE);
    assert.equal(verrouillee, true);
    assert.ok(patch.verrous.has(EPEE.id));
    assert.equal(patch.equipped.get('arme:0'), EPEE);
  });

  await t.test('une piece portee garde sa case', () => {
    const { patch } = basculerVerrou(etatAvec([['anneau:1', ANNEAU_A]]), ANNEAU_A);
    assert.ok(patch.verrous.has(ANNEAU_A.id));
    assert.equal(patch.equipped, undefined, 'rien a reposer');
  });

  await t.test('un second geste deverrouille', () => {
    const etat = etatInitial();
    etat.verrous.add(EPEE.id);
    const { patch, verrouillee } = basculerVerrou(etat, EPEE);
    assert.equal(verrouillee, false);
    assert.equal(patch.verrous.has(EPEE.id), false);
  });
});

test('posseder ajoute ou enleve des pieces de la banque', () => {
  const etat = etatInitial();
  const ajout = posseder(etat, [EPEE, ANNEAU_A], true);
  assert.deepEqual([...ajout.possedees].sort(), [EPEE.id, ANNEAU_A.id].sort());

  const retrait = posseder({ ...etat, ...ajout }, [EPEE], false);
  assert.deepEqual([...retrait.possedees], [ANNEAU_A.id]);
  assert.equal(etat.possedees.size, 0, 'l\'original ne bouge pas');
});

test('appliquerBuild', async (t) => {
  const itemById = new Map([ANNEAU_A, ANNEAU_B, ANNEAU_C, EPEE].map((p) => [p.id, p]));

  await t.test('range les pieces case par case, aucune posee a la main', () => {
    const etat = etatInitial();
    etat.posees.add('arme:0');
    const patch = appliquerBuild(etat, { itemIds: [EPEE.id, ANNEAU_A.id, ANNEAU_B.id] }, itemById);

    assert.equal(patch.equipped.get('arme:0'), EPEE);
    assert.equal(patch.equipped.get('anneau:0'), ANNEAU_A);
    assert.equal(patch.equipped.get('anneau:1'), ANNEAU_B);
    assert.equal(patch.posees.size, 0);
  });

  await t.test('un troisieme anneau ne trouve pas de case', () => {
    const patch = appliquerBuild(etatInitial(), { itemIds: [1, 2, 3] }, itemById);
    assert.equal(patch.equipped.size, 2);
  });

  await t.test('les verrous qui ne portent plus sur le build tombent', () => {
    const etat = etatInitial();
    etat.verrous.add(EPEE.id).add(ANNEAU_C.id);
    const patch = appliquerBuild(etat, { itemIds: [EPEE.id] }, itemById);
    assert.deepEqual([...patch.verrous], [EPEE.id]);
  });

  await t.test('la repartition des points suit le build quand il en apporte une', () => {
    const avec = appliquerBuild(etatInitial(), { itemIds: [], allocation: { force: 100 } }, itemById);
    assert.equal(avec.allocation.force, 100);
    assert.equal(avec.allocation.vitalite, 0);

    const sans = appliquerBuild(etatInitial(), { itemIds: [] }, itemById);
    assert.equal(sans.allocation, undefined);
  });

  await t.test('une piece inconnue du catalogue est ignoree', () => {
    const patch = appliquerBuild(etatInitial(), { itemIds: [999, EPEE.id] }, itemById);
    assert.equal(patch.equipped.size, 1);
  });
});

test('remplacer', async (t) => {
  const { remplacer } = await import('../web/equipement.mjs');

  await t.test('pose la piece dans la case de celle qu\'elle remplace', () => {
    const etat = etatAvec([['anneau:0', ANNEAU_A], ['anneau:1', ANNEAU_B]]);
    etat.verrous.add(ANNEAU_B.id);
    const patch = remplacer(etat, ANNEAU_B, ANNEAU_C);
    assert.equal(patch.equipped.get('anneau:1'), ANNEAU_C);
    assert.equal(patch.equipped.get('anneau:0'), ANNEAU_A);
    assert.ok(patch.posees.has('anneau:1'));
    assert.equal(patch.verrous.has(ANNEAU_B.id), false);
  });

  await t.test('sans piece a remplacer, prend la premiere case libre', () => {
    const patch = remplacer(etatAvec([['anneau:0', ANNEAU_A]]), null, ANNEAU_C);
    assert.equal(patch.equipped.get('anneau:1'), ANNEAU_C);
  });

  await t.test('une piece introuvable retombe sur une pose ordinaire', () => {
    const patch = remplacer(etatInitial(), ANNEAU_B, ANNEAU_C);
    assert.equal(patch.equipped.get('anneau:0'), ANNEAU_C);
  });
});

/* ==================================== Quelle case remplacer ===

   Passe la sixieme, `equiper` ecrasait TOUJOURS la derniere case : le joueur
   posait un dofus et en voyait disparaitre un autre sans savoir lequel. La
   question ne se pose que quand elle a une reponse a plusieurs choix. */

test('le choix de la case a remplacer', async (t) => {
  const item = (id, slot) => ({ id, slot, fr: `piece ${id}` });
  const etatAvec = (paires) => ({
    equipped: new Map(paires), posees: new Set(paires.map(([cle]) => cle)),
    verrous: new Set(), bannis: new Set(), possedees: new Set(),
  });

  await t.test('une famille a une seule case ne demande rien', () => {
    const etat = etatAvec([['amulette:0', item(1, 'amulette')]]);
    assert.equal(remplacementAuChoix(etat, item(2, 'amulette')), false);
  });

  await t.test('une case libre ne demande rien non plus', () => {
    const etat = etatAvec([['anneau:0', item(1, 'anneau')]]);
    assert.equal(remplacementAuChoix(etat, item(2, 'anneau')), false);
  });

  await t.test('six artefacts pris posent la question', () => {
    const etat = etatAvec(Array.from({ length: 6 },
      (_, i) => [`artefact:${i}`, item(10 + i, 'artefact')]));
    assert.equal(remplacementAuChoix(etat, item(99, 'artefact')), true);
  });

  await t.test('une piece deja portee se deplace, elle ne remplace rien', () => {
    const etat = etatAvec(Array.from({ length: 6 },
      (_, i) => [`artefact:${i}`, item(10 + i, 'artefact')]));
    assert.equal(remplacementAuChoix(etat, item(12, 'artefact')), false);
  });

  await t.test('une famille inconnue ne pose pas de question', () => {
    assert.equal(remplacementAuChoix(etatAvec([]), item(1, 'chapeau-magique')), false);
  });

  await t.test('les cases d\'une famille se listent avec ce qu\'elles portent', () => {
    const etat = etatAvec([['anneau:1', item(7, 'anneau')]]);
    assert.deepEqual(casesDeLaFamille(etat, item(8, 'anneau')).map((c) => c.cle),
      ['anneau:0', 'anneau:1']);
    assert.equal(casesDeLaFamille(etat, item(8, 'anneau'))[1].porte.id, 7);
    assert.equal(casesDeLaFamille(etat, item(8, 'anneau'))[0].porte, null);
  });

  await t.test('poser dans une case nommee remplace ce qu\'elle portait', () => {
    const etat = etatAvec(Array.from({ length: 6 },
      (_, i) => [`artefact:${i}`, item(10 + i, 'artefact')]));
    const patch = equiperDans(etat, item(99, 'artefact'), 'artefact:2');

    assert.equal(patch.equipped.get('artefact:2').id, 99);
    assert.equal(patch.equipped.get('artefact:5').id, 15, 'la derniere case ne bouge plus');
    assert.equal(patch.equipped.size, 6);
    assert.ok(patch.posees.has('artefact:2'));
  });

  await t.test('une case etrangere a la famille se refuse', () => {
    const etat = etatAvec([]);
    assert.equal(equiperDans(etat, item(1, 'anneau'), 'artefact:0'), null);
    assert.equal(equiperDans(etat, item(1, 'anneau'), 'anneau:9'), null);
  });

  await t.test('l\'etat de depart ne bouge pas', () => {
    const etat = etatAvec([['anneau:0', item(1, 'anneau')]]);
    equiperDans(etat, item(2, 'anneau'), 'anneau:0');
    assert.equal(etat.equipped.get('anneau:0').id, 1);
  });
});
