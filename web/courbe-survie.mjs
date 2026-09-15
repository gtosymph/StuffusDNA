/**
 * Trace de la courbe « degats ou survie ».
 *
 * La liste des paliers dit chaque compromis, mais pas leur FORME. Un joueur
 * qui lit dix lignes ne voit pas ou la courbe casse — l'endroit ou lacher cent
 * points de vie cesse de rapporter des degats, et ou il vaut donc mieux
 * s'arreter. Le trace le montre d'un coup d'oeil ; la liste garde sous lui le
 * detail des pieces, que le trace ne peut pas porter.
 *
 * Le calcul des points vit hors du canvas : c'est lui qui peut se tromper, et
 * lui seul se teste.
 */

/** Marges interieures du trace, place laissee aux graduations comprise. */
const MARGE = Object.freeze({ haut: 10, bas: 22, gauche: 46, droite: 12 });

/** Rayon d'un point ordinaire, en pixels. */
const RAYON = 3;

/** Distance maximale, en pixels, pour qu'un survol attrape un point. */
export const SEUIL_SURVOL = 22;

const nombre = (v) => Math.round(v).toLocaleString('fr-FR');

/**
 * Points du trace, du plus petit au plus grand sur l'axe tranche.
 *
 * L'axe horizontal porte ce que la courbe tranche, le vertical ce qu'elle
 * maximise. Le rang relie chaque point a sa ligne : cliquer un point doit
 * mener au stuff, qui ne vit que dans la liste.
 *
 * @param {{palier: Record<string, number>, porte?: boolean}[]} lignes
 * @param {{cle: string, valeur: string}} axe
 * @returns {{x: number, y: number, rang: number, porte: boolean}[]}
 */
export function pointsDeCourbe(lignes, axe) {
  const points = [];

  for (let rang = 0; rang < lignes.length; rang += 1) {
    const palier = lignes[rang]?.palier;
    const x = palier?.[axe.cle];
    const y = palier?.[axe.valeur];
    // Un palier sans chiffre lisible ne se place nulle part : il sort du
    // trace plutot que d'y creuser un trou.
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ x, y, rang, porte: lignes[rang].porte === true });
  }

  return points.sort((a, b) => a.x - b.x);
}

/** Etendue d'un axe, jamais nulle et jamais collee aux bords. */
function etendre(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  // Une etendue nulle ferait diviser par zero, et le trace disparaitrait.
  if (min === max) return { min: min - 1, max: max + 1 };
  const marge = (max - min) * 0.08;
  return { min: min - marge, max: max + marge };
}

/**
 * Bornes du trace, marge comprise.
 *
 * @param {{x: number, y: number}[]} points
 * @returns {{xMin: number, xMax: number, yMin: number, yMax: number}}
 */
export function bornesDe(points) {
  if (points.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

  let xMin = Infinity; let xMax = -Infinity;
  let yMin = Infinity; let yMax = -Infinity;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }

  const x = etendre(xMin, xMax);
  const y = etendre(yMin, yMax);
  return { xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max };
}

/**
 * Point trace le plus proche d'une position, dans un rayon donne.
 *
 * Le seuil compte : sans lui, survoler un coin vide surlignerait le point le
 * plus lointain de la courbe.
 *
 * @param {{px: number, py: number}[]} traces Points en pixels.
 * @param {number} x
 * @param {number} y
 * @param {number} seuil
 * @returns {any|null}
 */
export function pointLePlusProche(traces, x, y, seuil = SEUIL_SURVOL) {
  let proche = null;
  let meilleure = seuil * seuil;

  for (const point of traces) {
    const dx = point.px - x;
    const dy = point.py - y;
    const carre = dx * dx + dy * dy;
    if (carre <= meilleure) {
      meilleure = carre;
      proche = point;
    }
  }

  return proche;
}

/**
 * Couleurs du trace, lues sur le theme courant.
 *
 * Le graphe vit dans un canvas : il ne recoit pas la cascade CSS. Il lit donc
 * les memes jetons que la feuille de style, pour suivre le theme choisi.
 */
function palette() {
  const style = getComputedStyle(document.documentElement);
  const lire = (nom, defaut) => style.getPropertyValue(nom).trim() || defaut;
  return {
    faible: lire('--faible', '#7d89a6'),
    grille: lire('--graphe-grille', '#232d45'),
    trait: lire('--accent', '#7c6cf6'),
    porte: lire('--cyan', '#7ec8e0'),
    retenu: lire('--ambre', '#f0a94c'),
    fond: lire('--champ', '#0a0f1a'),
    texte: lire('--texte', '#d5dceb'),
  };
}

/**
 * Dessine la courbe et rend les points en pixels, pour le survol.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{lignes: any[], axe: any, retenu: number|null, survole: number|null,
 *   libelles: {x: string, y: string}}} vue
 * @returns {{px: number, py: number, rang: number, porte: boolean}[]}
 */
export function dessinerCourbe(canvas, vue) {
  const { lignes, axe, retenu = null, survole = null, libelles } = vue;
  const ratio = window.devicePixelRatio || 1;
  const largeur = canvas.clientWidth || 280;
  const hauteur = canvas.clientHeight || 160;

  canvas.width = Math.round(largeur * ratio);
  canvas.height = Math.round(hauteur * ratio);

  const ctx = canvas.getContext('2d');
  const teintes = palette();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, largeur, hauteur);

  const points = pointsDeCourbe(lignes, axe);
  if (points.length === 0) return [];

  const { xMin, xMax, yMin, yMax } = bornesDe(points);
  const zoneL = largeur - MARGE.gauche - MARGE.droite;
  const zoneH = hauteur - MARGE.haut - MARGE.bas;
  const versX = (v) => MARGE.gauche + ((v - xMin) / (xMax - xMin)) * zoneL;
  const versY = (v) => MARGE.haut + zoneH - ((v - yMin) / (yMax - yMin)) * zoneH;

  const traces = points.map((p) => ({ ...p, px: versX(p.x), py: versY(p.y) }));

  // Graduations horizontales : trois suffisent a donner l'echelle sans
  // encombrer un graphe de cette taille.
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 2; i += 1) {
    const valeur = yMin + ((yMax - yMin) * i) / 2;
    const py = Math.round(versY(valeur)) + 0.5;
    ctx.strokeStyle = teintes.grille;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGE.gauche, py);
    ctx.lineTo(largeur - MARGE.droite, py);
    ctx.stroke();
    ctx.fillStyle = teintes.faible;
    ctx.fillText(nombre(valeur), MARGE.gauche - 6, py + 3);
  }

  // Bornes de l'axe horizontal : les deux extremites suffisent a situer.
  ctx.fillStyle = teintes.faible;
  ctx.textAlign = 'left';
  ctx.fillText(nombre(points[0].x), MARGE.gauche, hauteur - 11);
  ctx.textAlign = 'right';
  ctx.fillText(nombre(points[points.length - 1].x), largeur - MARGE.droite, hauteur - 11);

  // Noms des deux axes : sans eux, deux nombres du meme ordre ne se
  // distinguent pas.
  ctx.textAlign = 'center';
  ctx.fillText(libelles.x, largeur / 2, hauteur - 2);
  ctx.save();
  ctx.translate(9, MARGE.haut + zoneH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(libelles.y, 0, 0);
  ctx.restore();

  // Le trait relie les compromis : c'est sa pente qui dit ou la courbe casse.
  ctx.strokeStyle = teintes.trait;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  traces.forEach((p, i) => (i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py)));
  ctx.stroke();

  for (const point of traces) {
    const estRetenu = point.rang === retenu;
    const estSurvole = point.rang === survole;
    const rayon = estRetenu || estSurvole ? RAYON + 2 : RAYON;

    ctx.beginPath();
    ctx.arc(point.px, point.py, rayon, 0, Math.PI * 2);
    // Trois etats se distinguent d'un coup d'oeil : le build pose, le point
    // que le reglage retient, et les autres.
    if (point.porte) ctx.fillStyle = teintes.porte;
    else if (estRetenu) ctx.fillStyle = teintes.retenu;
    else ctx.fillStyle = teintes.trait;
    ctx.fill();

    if (point.porte || estRetenu) {
      ctx.strokeStyle = teintes.fond;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  return traces;
}
