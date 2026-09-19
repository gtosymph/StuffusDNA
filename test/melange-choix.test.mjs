/**
 * Ce qu'un clic sur la courbe du compromis doit poser.
 *
 * La courbe montre des stuffs entiers. Cliquer un point pose ce stuff ET le
 * reglage qui le designe — c'est ce couple qui doit rester vrai, sans quoi le
 * marqueur, la bande de consequence et le message se contredisent.
 *
 * Le piege est un palier qui ne gagne POUR AUCUN reglage : il existe sur la
 * courbe, il se clique, mais aucune part des degats ne le retient. Lui
 * inventer une part — la moitie, faute de mieux — posait son stuff et
 * designait le stuff d'un autre : le point clique virait au cyan, un point
 * sans rapport virait a l'ambre, et la bande annoncait les chiffres de ce
 * dernier pendant que le message annoncait ceux du premier.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { choixAuClic, partPourPalier, rangDuPalier } from '../web/v2/melange.mjs';

/**
 * Une courbe de solveur.
 *
 * Elle est CONVEXE par endroits, et c'est voulu : un solveur ne rend pas une
 * belle courbe concave. Les paliers creuses, ceux qui passent sous la corde
 * tendue entre leurs voisins, ne gagnent pour aucun reglage — et ce sont eux
 * qui revelent le defaut.
 */
const courbe = () => {
  const mesures = [
    [5400, 2900], [5230, 3130], [5060, 3360], [4890, 3590],
    // Les trois suivants sont creuses : leurs voisins les dominent.
    [4500, 3820], [4300, 4050], [4150, 4280],
    [4137, 4506], [3900, 4740], [3700, 4970],
    [3400, 5200], [3100, 5430], [2800, 5660], [2500, 5890],
  ];
  return mesures.map(([damage, endurance], i) => ({
    palier: { damage, endurance, itemIds: [i] },
    porte: false,
  }));
};

test('un palier qui ne gagne jamais rend une part nulle', () => {
  const lignes = courbe();
  const jamais = lignes
    .map((_, rang) => rang)
    .filter((rang) => partPourPalier(lignes, rang) === null);

  // Sans un tel palier, l'essai suivant ne prouverait rien.
  assert.ok(jamais.length > 0, 'la courbe d\'essai doit contenir un palier domine');
});

test('cliquer un palier domine pose le stuff sans inventer de reglage', () => {
  const lignes = courbe();
  const rang = lignes.map((_, i) => i).find((i) => partPourPalier(lignes, i) === null);

  const choix = choixAuClic(lignes, rang);
  assert.equal(choix.part, null, 'aucune part ne retient ce palier : il ne faut pas en inventer une');
  assert.ok(choix.palier, 'le stuff se pose quand meme : c\'est ce que le clic demande');
  assert.equal(choix.palier.itemIds[0], rang);
});

test('cliquer un palier qui gagne pose la part qui le retient', () => {
  const lignes = courbe();
  const rang = lignes.map((_, i) => i).find((i) => partPourPalier(lignes, i) !== null);

  const choix = choixAuClic(lignes, rang);
  assert.ok(choix.part !== null);
  assert.equal(choix.palier.itemIds[0], rang);
});

test('un palier se retrouve dans une courbe recalculee', () => {
  // Poser un stuff change le build porte, donc la courbe : des paliers
  // disparaissent et les rangs glissent. Le rang ne peut donc pas servir
  // d'identite d'un dessin a l'autre — c'est le palier lui-meme qui compte.
  const avant = courbe();
  const vise = avant[6].palier;
  const apres = avant.filter((_, i) => i !== 2 && i !== 4);

  assert.equal(rangDuPalier(apres, vise), 4);
  assert.notEqual(rangDuPalier(apres, vise), 6);
});

test('un palier absent de la courbe ne designe aucun rang', () => {
  const lignes = courbe();
  assert.equal(rangDuPalier(lignes, { damage: 1, endurance: 1 }), null);
  assert.equal(rangDuPalier(lignes, null), null);
  assert.equal(rangDuPalier(null, lignes[0].palier), null);
});
