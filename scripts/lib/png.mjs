/**
 * Lecture et ecriture PNG, reduites a ce que l'import des avatars demande.
 *
 * Les sprites d'Ankama sont des PNG RGBA 8 bits non entrelaces : le cas le
 * plus simple de la norme. Un decodeur de vingt lignes evite ici une
 * dependance de plusieurs megaoctets, et le projet reste installable sans
 * rien telecharger.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Octets par pixel, par type de couleur PNG. */
const CANAUX = Object.freeze({ 0: 1, 2: 3, 4: 2, 6: 4 });

/**
 * Defait le filtre d'une ligne, en place.
 *
 * @param {number} type Filtre de la ligne, de 0 a 4.
 * @param {Buffer} ligne Ligne courante, deja sans son octet de filtre.
 * @param {Buffer|null} dessus Ligne du dessus, deja defiltree.
 * @param {number} bpp Octets par pixel.
 */
function defiltrer(type, ligne, dessus, bpp) {
  for (let i = 0; i < ligne.length; i += 1) {
    const gauche = i >= bpp ? ligne[i - bpp] : 0;
    const haut = dessus ? dessus[i] : 0;
    const coin = dessus && i >= bpp ? dessus[i - bpp] : 0;

    switch (type) {
      case 0: break;
      case 1: ligne[i] = (ligne[i] + gauche) & 0xff; break;
      case 2: ligne[i] = (ligne[i] + haut) & 0xff; break;
      case 3: ligne[i] = (ligne[i] + ((gauche + haut) >> 1)) & 0xff; break;
      case 4: {
        // Predicteur de Paeth : la reference la plus proche des trois voisins.
        const p = gauche + haut - coin;
        const dg = Math.abs(p - gauche);
        const dh = Math.abs(p - haut);
        const dc = Math.abs(p - coin);
        const choix = dg <= dh && dg <= dc ? gauche : (dh <= dc ? haut : coin);
        ligne[i] = (ligne[i] + choix) & 0xff;
        break;
      }
      default: throw new Error(`Filtre PNG inconnu : ${type}.`);
    }
  }
}

/**
 * Lit un PNG et rend son image en RGBA.
 *
 * @param {Buffer} fichier
 * @returns {{largeur: number, hauteur: number, pixels: Buffer}}
 */
export function lirePng(fichier) {
  if (!fichier.subarray(0, 8).equals(SIGNATURE)) throw new Error('Ce fichier n\'est pas un PNG.');

  let largeur = 0;
  let hauteur = 0;
  let profondeur = 0;
  let couleur = 0;
  const morceaux = [];

  for (let i = 8; i < fichier.length;) {
    const taille = fichier.readUInt32BE(i);
    const nom = fichier.toString('ascii', i + 4, i + 8);
    const corps = fichier.subarray(i + 8, i + 8 + taille);

    if (nom === 'IHDR') {
      largeur = corps.readUInt32BE(0);
      hauteur = corps.readUInt32BE(4);
      profondeur = corps[8];
      couleur = corps[9];
      if (corps[12] !== 0) throw new Error('PNG entrelace : hors du perimetre.');
    } else if (nom === 'IDAT') {
      morceaux.push(corps);
    } else if (nom === 'IEND') {
      break;
    }
    i += 12 + taille;
  }

  if (profondeur !== 8) throw new Error(`Profondeur ${profondeur} bits : hors du perimetre.`);
  const canaux = CANAUX[couleur];
  if (!canaux) throw new Error(`Type de couleur ${couleur} : hors du perimetre.`);

  const brut = inflateSync(Buffer.concat(morceaux));
  const pixels = Buffer.alloc(largeur * hauteur * 4);
  const parLigne = largeur * canaux;
  let dessus = null;

  for (let y = 0; y < hauteur; y += 1) {
    const depart = y * (parLigne + 1);
    const ligne = Buffer.from(brut.subarray(depart + 1, depart + 1 + parLigne));
    defiltrer(brut[depart], ligne, dessus, canaux);
    dessus = ligne;

    for (let x = 0; x < largeur; x += 1) {
      const source = x * canaux;
      const cible = (y * largeur + x) * 4;
      if (canaux >= 3) {
        pixels[cible] = ligne[source];
        pixels[cible + 1] = ligne[source + 1];
        pixels[cible + 2] = ligne[source + 2];
        pixels[cible + 3] = canaux === 4 ? ligne[source + 3] : 255;
      } else {
        pixels[cible] = ligne[source];
        pixels[cible + 1] = ligne[source];
        pixels[cible + 2] = ligne[source];
        pixels[cible + 3] = canaux === 2 ? ligne[source + 1] : 255;
      }
    }
  }

  return { largeur, hauteur, pixels };
}

/** Ajoute un morceau PNG complet, taille et CRC compris. */
function morceau(nom, corps) {
  const entete = Buffer.alloc(8);
  entete.writeUInt32BE(corps.length, 0);
  entete.write(nom, 4, 'ascii');

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([entete.subarray(4), corps])), 0);
  return Buffer.concat([entete, corps, crc]);
}

/** Table du CRC-32, construite une fois. */
const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(octets) {
  let c = 0xffffffff;
  for (const octet of octets) c = TABLE[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Ecrit une image RGBA en PNG.
 *
 * Chaque ligne part sans filtre : l'image reste un peu plus grosse, mais le
 * code garde une seule branche a verifier.
 *
 * @param {{largeur: number, hauteur: number, pixels: Buffer}} image
 * @returns {Buffer}
 */
export function ecrirePng({ largeur, hauteur, pixels }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const brut = Buffer.alloc(hauteur * (largeur * 4 + 1));
  for (let y = 0; y < hauteur; y += 1) {
    const depart = y * (largeur * 4 + 1);
    brut[depart] = 0;
    pixels.copy(brut, depart + 1, y * largeur * 4, (y + 1) * largeur * 4);
  }

  return Buffer.concat([
    SIGNATURE,
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Reduit une image, par moyenne des pixels de chaque bloc.
 *
 * La moyenne sur le bloc entier — et non un pixel pris au hasard dedans —
 * est ce qui distingue une reduction propre d'un escalier : une icone de jeu
 * est faite de traits fins, et en jeter un pixel sur quatre les hache.
 *
 * La moyenne se fait sur la couleur DEJA multipliee par son opacite, puis se
 * redivise. Sans cela, le bord d'une icone melange sa couleur avec celle,
 * arbitraire, des pixels transparents voisins — le halo noir ou blanc que
 * l'on voit autour des sprites mal reduits.
 *
 * @param {{largeur: number, hauteur: number, pixels: Buffer}} image
 * @param {number} cote Cote de l'image rendue, en pixels.
 * @returns {{largeur: number, hauteur: number, pixels: Buffer}}
 */
export function reduire(image, cote) {
  if (cote >= image.largeur && cote >= image.hauteur) return image;

  const pixels = Buffer.alloc(cote * cote * 4);
  const pasX = image.largeur / cote;
  const pasY = image.hauteur / cote;

  for (let y = 0; y < cote; y += 1) {
    const hautSource = Math.floor(y * pasY);
    const basSource = Math.max(hautSource + 1, Math.floor((y + 1) * pasY));

    for (let x = 0; x < cote; x += 1) {
      const gaucheSource = Math.floor(x * pasX);
      const droiteSource = Math.max(gaucheSource + 1, Math.floor((x + 1) * pasX));

      let r = 0; let v = 0; let b = 0; let a = 0; let compte = 0;
      for (let sy = hautSource; sy < basSource; sy += 1) {
        for (let sx = gaucheSource; sx < droiteSource; sx += 1) {
          const i = (sy * image.largeur + sx) * 4;
          const alpha = image.pixels[i + 3];
          r += image.pixels[i] * alpha;
          v += image.pixels[i + 1] * alpha;
          b += image.pixels[i + 2] * alpha;
          a += alpha;
          compte += 1;
        }
      }

      const sortie = (y * cote + x) * 4;
      // Un bloc entierement transparent n'a aucune couleur a rendre : la
      // division par son opacite serait une division par zero.
      pixels[sortie] = a > 0 ? Math.round(r / a) : 0;
      pixels[sortie + 1] = a > 0 ? Math.round(v / a) : 0;
      pixels[sortie + 2] = a > 0 ? Math.round(b / a) : 0;
      pixels[sortie + 3] = Math.round(a / compte);
    }
  }
  return { largeur: cote, hauteur: cote, pixels };
}

/**
 * Rend la partie d'une image comprise dans un rectangle.
 *
 * @param {{largeur: number, hauteur: number, pixels: Buffer}} image
 * @param {{x: number, y: number, largeur: number, hauteur: number}} cadre
 */
export function decouper(image, cadre) {
  const pixels = Buffer.alloc(cadre.largeur * cadre.hauteur * 4);
  for (let y = 0; y < cadre.hauteur; y += 1) {
    const source = ((cadre.y + y) * image.largeur + cadre.x) * 4;
    image.pixels.copy(pixels, y * cadre.largeur * 4, source, source + cadre.largeur * 4);
  }
  return { largeur: cadre.largeur, hauteur: cadre.hauteur, pixels };
}
