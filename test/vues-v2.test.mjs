/**
 * Ce que les vues de v2 decident, hors du DOM.
 *
 * Une vue dessine ; elle ne devrait rien decider. Chaque fois qu'elle decide
 * quand meme, la decision sort du fichier de rendu et vient ici. Ce test
 * couvre ce qui en est sorti : les deux pourcentages du curseur mixte, la
 * signature qui commande la reconstruction du bloc, la liste des mesures
 * encore libres, et le catalogue des habillages.
 *
 * Ce qui reste dans les vues est du placement : il se verifie a l'ecran, pas
 * ici, et pretendre le contraire donnerait des tests qui passent sur une page
 * illisible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { bornesEnPourcent, choixAuClic, signatureCourbe } from '../web/v2/melange.mjs';
import { mesuresLibres, MINIMUM_NEUF } from '../web/v2/minimums.mjs';
import { THEMES_V2, THEME_V2_DEFAUT } from '../web/v2/catalogue-themes.mjs';
import { grouperParFamille } from '../web/v2/comparaison.mjs';
import { estPlein, PICTOGRAMMES } from '../web/v2/icones.mjs';
import { lignesCompletes, RESISTANCES_APPARIEES } from '../web/v2/fiche.mjs';

/* ------------------------------------------- Les bornes du curseur mixte --- */

test('les deux pourcentages sous le curseur', async (t) => {
  await t.test('ils totalisent toujours cent', () => {
    // Deux arrondis separes donneraient 55 et 46 pour une part de 0,455.
    for (const part of [0, 0.111, 0.333, 0.455, 0.5, 0.787, 1]) {
      const { frapper, encaisser } = bornesEnPourcent(part);
      assert.equal(frapper + encaisser, 100, `part ${part}`);
    }
  });

  await t.test('les extremes se lisent en toutes lettres', () => {
    assert.deepEqual(bornesEnPourcent(0), { frapper: 0, encaisser: 100 });
    assert.deepEqual(bornesEnPourcent(1), { frapper: 100, encaisser: 0 });
  });

  await t.test('une part absente vaut le milieu', () => {
    // Le curseur se pose au milieu tant que rien n'a ete regle : montrer
    // « 0 % frapper » ferait croire a un choix que personne n'a fait.
    assert.deepEqual(bornesEnPourcent(null), { frapper: 50, encaisser: 50 });
    assert.deepEqual(bornesEnPourcent(undefined), { frapper: 50, encaisser: 50 });
    assert.deepEqual(bornesEnPourcent(Number.NaN), { frapper: 50, encaisser: 50 });
  });

  await t.test('une part hors bornes est ramenee dedans', () => {
    assert.deepEqual(bornesEnPourcent(-2), { frapper: 0, encaisser: 100 });
    assert.deepEqual(bornesEnPourcent(7), { frapper: 100, encaisser: 0 });
  });
});

/* ------------------------------------------- La signature de la courbe --- */

test('la signature de la courbe', async (t) => {
  const ligne = (damage, endurance) => ({ palier: { damage, endurance } });

  await t.test('memes paliers, meme signature', () => {
    assert.equal(
      signatureCourbe([ligne(100, 200), ligne(150, 180)]),
      signatureCourbe([ligne(100, 200), ligne(150, 180)]),
    );
  });

  await t.test('un palier qui bouge change la signature', () => {
    assert.notEqual(
      signatureCourbe([ligne(100, 200)]),
      signatureCourbe([ligne(101, 200)]),
    );
  });

  await t.test('l\'ordre compte : la courbe se lit de haut en bas', () => {
    // Le rang d'un point sert a le designer au clic. Deux courbes de memes
    // paliers dans un autre ordre ne se remplacent donc pas l'une l'autre.
    assert.notEqual(
      signatureCourbe([ligne(100, 200), ligne(150, 180)]),
      signatureCourbe([ligne(150, 180), ligne(100, 200)]),
    );
  });

  await t.test('une courbe vide a une signature, et elle est stable', () => {
    assert.equal(signatureCourbe([]), '');
    assert.equal(signatureCourbe(null), '');
  });
});

/* --------------------------------------- Le clic sur un point de la courbe --- */

test('cliquer un point de la courbe', async (t) => {
  // Deux paliers qui s'echangent survie et degats : chacun gagne sur une
  // moitie du curseur, donc chacun a une part qui le designe.
  const courbe = [
    { palier: { damage: 100, endurance: 400, itemIds: [1, 2] }, porte: false },
    { palier: { damage: 300, endurance: 200, itemIds: [3, 4] }, porte: false },
  ];

  await t.test('le stuff du point se pose, et le reglage avec lui', () => {
    // Sans le stuff, le joueur restait devant le meme personnage qu'avant son
    // clic. Sans le reglage, la recherche suivante visait encore l'ancien
    // compromis et reprenait le stuff choisi.
    const choix = choixAuClic(courbe, 1);
    assert.deepEqual(choix.palier.itemIds, [3, 4]);
    assert.ok(choix.part > 0 && choix.part < 1);
  });

  await t.test('le stuff porte ne se repose pas', () => {
    // Il figure dans la courbe comme les autres, mais le reposer ne ferait
    // rien — et il ne porte pas toujours la liste de ses pieces.
    const avecPorte = [{ palier: { damage: 200, endurance: 300 }, porte: true }, ...courbe];
    assert.equal(choixAuClic(avecPorte, 0).palier, null);
  });

  await t.test('un palier sans pieces ne bouge que le curseur', () => {
    const sansPieces = [
      { palier: { damage: 100, endurance: 400 }, porte: false },
      { palier: { damage: 300, endurance: 200 }, porte: false },
    ];
    const choix = choixAuClic(sansPieces, 1);
    assert.equal(choix.palier, null);
    assert.ok(Number.isFinite(choix.part));
  });

  await t.test('un rang qui ne designe rien ne fait rien', () => {
    assert.equal(choixAuClic(courbe, 9), null);
    assert.equal(choixAuClic([], 0), null);
    assert.equal(choixAuClic(null, 0), null);
  });
});

/* ----------------------------------------------- Les minimums a poser --- */

test('les mesures encore libres', async (t) => {
  const STATS = [{ key: 'pa', fr: 'PA' }, { key: 'pm', fr: 'PM' }, { key: 'vitalite', fr: 'Vitalite' }];
  const DEGATS = { cle: 'degatsTotaux', libelle: 'Degats totaux' };

  await t.test('sans aucun minimum, tout est libre', () => {
    assert.deepEqual(mesuresLibres([], STATS, DEGATS), [
      ['pa', 'PA'], ['pm', 'PM'], ['vitalite', 'Vitalite'], ['degatsTotaux', 'Degats totaux'],
    ]);
  });

  await t.test('une mesure deja posee ne se propose plus', () => {
    // Elle serait refusee au clic suivant : la proposer ne mene qu'a un
    // message d'erreur que le joueur ne pouvait pas eviter.
    const libres = mesuresLibres([{ stat: 'pm' }], STATS, DEGATS);
    assert.ok(!libres.some(([cle]) => cle === 'pm'));
    assert.equal(libres.length, 3);
  });

  await t.test('les degats se posent comme les autres, et se retirent de meme', () => {
    const libres = mesuresLibres([{ stat: 'degatsTotaux' }], STATS, DEGATS);
    assert.deepEqual(libres, [['pa', 'PA'], ['pm', 'PM'], ['vitalite', 'Vitalite']]);
  });

  await t.test('tout pose : la liste est vide, pas fausse', () => {
    const toutes = [...STATS.map((s) => ({ stat: s.key })), { stat: 'degatsTotaux' }];
    assert.deepEqual(mesuresLibres(toutes, STATS, DEGATS), []);
  });
});

test('un minimum neuf est une preference, pas un couperet', () => {
  // Le poids 1 laisse le solveur tenir la ligne s'il peut. Un poids fort des
  // la creation ferait chuter le score sans que personne l'ait demande.
  assert.deepEqual(MINIMUM_NEUF('pa'),
    { stat: 'pa', target: 0, weight: 1, max: null, absolute: false });
});

/* ------------------------------------------------ Le catalogue des themes --- */

test('les habillages de v2', async (t) => {
  await t.test('le defaut existe, et n\'a pas de feuille a poser', () => {
    // Le premier habillage EST la feuille de base : lui donner un fichier
    // poserait deux fois les memes jetons.
    const defaut = THEMES_V2.find((th) => th.cle === THEME_V2_DEFAUT);
    assert.ok(defaut, `${THEME_V2_DEFAUT} absent du catalogue`);
    assert.equal(defaut.fichier, null);
    assert.equal(THEMES_V2[0].cle, THEME_V2_DEFAUT);
  });

  await t.test('chaque cle est unique', () => {
    const cles = THEMES_V2.map((th) => th.cle);
    assert.equal(new Set(cles).size, cles.length);
  });

  await t.test('chaque habillage se presente avant d\'etre pose', () => {
    // Un nom ne montre pas un habillage : la carte a besoin de ses trois
    // couleurs et de sa phrase pour que l'essai ne soit pas un pari.
    for (const theme of THEMES_V2) {
      assert.match(theme.cle, /^[a-z-]+$/, `cle ${theme.cle}`);
      assert.ok(theme.nom, `nom manquant pour ${theme.cle}`);
      assert.ok(theme.phrase?.length > 10, `phrase trop courte pour ${theme.cle}`);
      assert.equal(theme.apercu.length, 3, `apercu de ${theme.cle}`);
      for (const couleur of theme.apercu) {
        assert.match(couleur, /^#[0-9a-f]{6}$/, `${theme.cle} : ${couleur}`);
      }
    }
  });

  await t.test('chaque feuille annoncee existe sur le disque', async () => {
    // Une feuille absente ne leve rien dans le navigateur : le lien echoue
    // en silence et l'habillage reste celui de depart, sans un mot.
    for (const theme of THEMES_V2.filter((th) => th.fichier)) {
      const chemin = fileURLToPath(new URL(`../web/v2/${theme.fichier}`, import.meta.url));
      await assert.doesNotReject(access(chemin), `${theme.cle} : ${theme.fichier} introuvable`);
    }
  });
});


/* ------------------------------------- Les familles du comparateur --- */

test('le comparateur range ses lignes par famille', async (t) => {
  const l = (cle, famille) => ({ cle, famille });

  await t.test('les lignes voisines d\'une meme famille se suivent', () => {
    const groupes = grouperParFamille([
      l('pa', 'Principales'), l('pm', 'Principales'),
      l('force', 'Caracteristiques'),
    ]);
    assert.deepEqual(groupes.map((g) => [g.famille, g.lignes.length]),
      [['Principales', 2], ['Caracteristiques', 1]]);
  });

  await t.test('une famille dont tout est masque n\'apparait pas', () => {
    // Un intitule seul, sans ligne dessous, se lit comme un defaut
    // d'affichage. Le groupe n'existe que si une ligne l'a cree.
    const groupes = grouperParFamille([l('pa', 'Principales'), l('force', 'Caracteristiques')]);
    assert.ok(!groupes.some((g) => g.famille === 'Resistances'));
  });

  await t.test('une ligne sans famille garde son groupe anonyme', () => {
    const groupes = grouperParFamille([l('degats', null), l('pa', 'Principales')]);
    assert.equal(groupes[0].famille, null);
    assert.equal(groupes[0].lignes.length, 1);
  });

  await t.test('une liste vide ne cree aucun groupe', () => {
    assert.deepEqual(grouperParFamille([]), []);
  });
});

/* ------------------------------------- Les resistances appariees --- */

test('les resistances se lisent par element', async (t) => {
  await t.test('le brut et le pourcentage tiennent sur une seule ligne', () => {
    // « 120 » ne veut rien dire sans le « 15 % » qui l'accompagne : les
    // montrer sur deux lignes obligeait a les rapprocher de tete.
    const stats = { resFeu: 120, pctResFeu: 15 };
    const lignes = lignesCompletes(stats);
    const feu = lignes.find((l) => l.cle === 'resFeu');
    assert.equal(feu.libelle, 'Feu');
    assert.equal(feu.valeur, 120);
    assert.equal(feu.pourcent, 15);
    assert.ok(!lignes.some((l) => l.cle === 'pctResFeu'), 'le pourcentage ne fait pas sa ligne');
  });

  await t.test('une mesure qui n\'a qu\'une moitie garde sa ligne', () => {
    // La resistance critique n'existe qu'en brut, la melee qu'en pourcentage.
    const lignes = lignesCompletes({ resCritique: 40, pctResMelee: 12 });
    const critique = lignes.find((l) => l.cle === 'resCritique');
    assert.equal(critique.pourcent, null);
    const melee = lignes.find((l) => l.cle === 'pctResMelee');
    assert.equal(melee.sansBrut, true);
    assert.equal(melee.pourcent, 12);
  });

  await t.test('un element absent des statistiques ne fait pas de ligne', () => {
    const lignes = lignesCompletes({ resFeu: 10 });
    assert.equal(lignes.filter((l) => l.pourcent !== undefined).length, 1);
  });

  await t.test('un minimum pose sur l\'une des deux moities marque la ligne', () => {
    const lignes = lignesCompletes({ resFeu: 120, pctResFeu: 15 }, new Set(['pctResFeu']));
    assert.equal(lignes.find((l) => l.cle === 'resFeu').sousMinimum, true);
  });

  await t.test('chaque paire porte au moins une moitie', () => {
    for (const [libelle, brut, pct] of RESISTANCES_APPARIEES) {
      assert.ok(libelle, 'libelle manquant');
      assert.ok(brut || pct, `${libelle} n'a ni brut ni pourcentage`);
    }
  });
});


/* ------------------------------------------------ Les pictogrammes --- */

test('les pictogrammes de la barre', async (t) => {
  // Le module dessine dans un document ; seule sa table de traces se lit ici.
  // C'est elle qui peut se tromper — un chemin vide sort un bouton nu, et
  // personne ne le remarque avant de voir la barre.
  const ATTENDUS = ['play', 'pause', 'stop', 'poubelle', 'annuler', 'engrenage'];

  await t.test('les six commandes ont leur dessin', () => {
    for (const nom of ATTENDUS) {
      assert.ok(PICTOGRAMMES.includes(nom), `${nom} absent`);
    }
  });

  await t.test('les formes du lecteur se remplissent, les autres se tracent', () => {
    // Un triangle de lecture peint au trait sort creux ; une corbeille
    // remplie sort en pate. Les melanger sous une seule regle donnait l'un
    // ou l'autre.
    for (const nom of ['play', 'pause', 'stop']) {
      assert.equal(estPlein(nom), true, `${nom} devrait etre plein`);
    }
    for (const nom of ['poubelle', 'annuler', 'engrenage']) {
      assert.equal(estPlein(nom), false, `${nom} devrait etre au trait`);
    }
  });

  await t.test('un nom inconnu ne pretend pas exister', () => {
    assert.equal(estPlein('inexistant'), false);
    assert.ok(!PICTOGRAMMES.includes('inexistant'));
  });
});
