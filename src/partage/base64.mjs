/**
 * Base64, dans les deux alphabets dont le partage a besoin.
 *
 * Elle est ecrite ici plutot que prise dans `btoa` ou dans `Buffer` : le
 * premier n'existe pas sous Node, le second pas dans le navigateur, et le
 * partage sert aux deux — le navigateur fabrique les liens, les tests les
 * relisent.
 *
 * Deux alphabets, parce que deux destinations :
 *
 *   - l'ordinaire, avec « + », « / » et le remplissage, pour Dofusbook, qui
 *     l'attend ainsi ;
 *   - celui des adresses, avec « - », « _ » et sans remplissage, pour nos
 *     propres liens : les trois caracteres que l'ordinaire emploie obligent
 *     sinon a echapper l'adresse entiere, ce qui la rallonge et la rend
 *     illisible dans une conversation.
 */

const ORDINAIRE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ADRESSE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Passe des octets en base64.
 *
 * @param {Uint8Array} octets
 * @param {{adresse?: boolean}} [choix] adresse : alphabet des adresses, sans
 *   remplissage.
 * @returns {string}
 */
export function enBase64(octets, choix = {}) {
  const alphabet = choix.adresse ? ADRESSE : ORDINAIRE;
  const remplir = !choix.adresse;
  let sortie = '';

  for (let i = 0; i < octets.length; i += 3) {
    const reste = octets.length - i;
    const bloc = (octets[i] << 16) | ((octets[i + 1] ?? 0) << 8) | (octets[i + 2] ?? 0);

    sortie += alphabet[(bloc >> 18) & 63] + alphabet[(bloc >> 12) & 63];
    if (reste > 1) sortie += alphabet[(bloc >> 6) & 63];
    else if (remplir) sortie += '=';
    if (reste > 2) sortie += alphabet[bloc & 63];
    else if (remplir) sortie += '=';
  }
  return sortie;
}

/** Position de chaque caractere, les deux alphabets melanges. */
const POSITIONS = (() => {
  const table = new Map();
  for (let i = 0; i < ORDINAIRE.length; i += 1) {
    table.set(ORDINAIRE[i], i);
    table.set(ADRESSE[i], i);
  }
  return table;
})();

/**
 * Relit de la base64, dans l'un ou l'autre alphabet.
 *
 * @param {string} texte
 * @returns {Uint8Array}
 * @throws {TypeError} Sur un caractere etranger aux deux alphabets. Un lien
 *   tronque par un client de discussion doit se dire, pas se deviner.
 */
export function versOctets(texte) {
  const propre = String(texte ?? '').replace(/=+$/, '');
  const octets = [];
  let bloc = 0;
  let bits = 0;

  for (const caractere of propre) {
    const valeur = POSITIONS.get(caractere);
    if (valeur === undefined) throw new TypeError(`Caractere hors base64 : ${caractere}`);
    bloc = (bloc << 6) | valeur;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      octets.push((bloc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(octets);
}
