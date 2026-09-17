/**
 * Ecriture MessagePack, reduite a ce que le partage demande.
 *
 * Dofusbook lit ses liens dans ce format : le stuff voyage en MessagePack
 * passe en base64. Le projet n'ayant aucune dependance, l'ecriture tient ici ;
 * le passage en base64 vit a cote, dans `base64.mjs`, parce que nos propres
 * liens s'en servent aussi.
 *
 * Seule l'ECRITURE existe. Rien dans le projet ne lit un lien Dofusbook : ce
 * qui revient de l'exterieur passe par notre propre format, qui est du JSON.
 * Une lecture partielle inviterait a s'en servir comme d'un decodeur complet,
 * ce qu'elle ne serait pas.
 *
 * Les types couverts sont ceux du format de Dofusbook : entiers positifs,
 * chaines courtes, tableaux, tables. Tout le reste leve, plutot que d'ecrire
 * des octets que personne ne relira.
 */

/** Octets d'une valeur, en MessagePack. */
export function ecrire(valeur) {
  const octets = [];
  poser(valeur, octets);
  return Uint8Array.from(octets);
}

/** Ecrit un entier non signe, dans la plus petite forme qui le contient. */
function poserEntier(n, octets) {
  if (n <= 0x7f) { octets.push(n); return; }
  if (n <= 0xff) { octets.push(0xcc, n); return; }
  if (n <= 0xffff) { octets.push(0xcd, n >> 8, n & 0xff); return; }
  if (n <= 0xffffffff) {
    octets.push(0xce, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    return;
  }
  throw new RangeError(`Entier trop grand pour ce format : ${n}`);
}

function poser(valeur, octets) {
  if (typeof valeur === 'number') {
    if (!Number.isInteger(valeur) || valeur < 0) {
      throw new TypeError(`Seuls les entiers positifs s'ecrivent ici : ${valeur}`);
    }
    poserEntier(valeur, octets);
    return;
  }

  if (typeof valeur === 'string') {
    const brut = new TextEncoder().encode(valeur);
    if (brut.length > 31) throw new RangeError('Chaine trop longue pour ce format.');
    octets.push(0xa0 | brut.length);
    octets.push(...brut);
    return;
  }

  if (Array.isArray(valeur)) {
    if (valeur.length < 16) octets.push(0x90 | valeur.length);
    else if (valeur.length <= 0xffff) octets.push(0xdc, valeur.length >> 8, valeur.length & 0xff);
    else throw new RangeError('Tableau trop long pour ce format.');
    for (const element of valeur) poser(element, octets);
    return;
  }

  if (valeur && typeof valeur === 'object') {
    const paires = Object.entries(valeur);
    if (paires.length < 16) octets.push(0x80 | paires.length);
    else if (paires.length <= 0xffff) octets.push(0xde, paires.length >> 8, paires.length & 0xff);
    else throw new RangeError('Table trop longue pour ce format.');
    for (const [cle, sous] of paires) { poser(cle, octets); poser(sous, octets); }
    return;
  }

  throw new TypeError(`Valeur que ce format ne sait pas ecrire : ${String(valeur)}`);
}
