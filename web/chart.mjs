/**
 * Courbe d'evolution du score au fil des generations.
 *
 * Un trace par fil de calcul. La courbe se redessine pendant la recherche :
 * on voit la remontee, le franchissement du zero, puis le palier.
 */

/** Couleurs successives attribuees aux fils, quand le theme n'en propose pas. */
const COULEURS = ['#7c6cf6', '#4ec9a0', '#f0a94c', '#e0644c', '#4aa6e0', '#c07ce0', '#63c98a', '#e0b04a'];

/**
 * Couleurs des fils du theme courant.
 *
 * Le jeton `--graphe-fils` porte une liste separee par des virgules. Un theme
 * qui n'en definit pas garde les couleurs de depart.
 */
function couleursFils() {
  const brut = getComputedStyle(document.documentElement).getPropertyValue('--graphe-fils').trim();
  if (!brut) return COULEURS;
  const liste = brut.split(',').map((c) => c.trim()).filter(Boolean);
  return liste.length > 0 ? liste : COULEURS;
}

/** Marges interieures du trace. */
const MARGE = { haut: 12, bas: 20, gauche: 52, droite: 10 };

const nombre = (v) => Math.round(v).toLocaleString('fr-FR');

/** Couleur attribuee au fil d'indice donne. */
export const couleurFil = (index) => {
  const liste = couleursFils();
  return liste[index % liste.length];
};

/** Nombre maximal de points traces par courbe : au-dela, un pas d'echantillonnage. */
const POINTS_MAX = 600;

/**
 * Echantillonne une courbe trop longue. Le dernier point reste toujours la.
 * @param {number[]} history
 * @returns {[number, number][]} Paires [generation, valeur].
 */
function echantillonner(history) {
  const pas = Math.max(1, Math.ceil(history.length / POINTS_MAX));
  const points = [];
  for (let i = 0; i < history.length; i += pas) points.push([i, history[i]]);
  const dernier = history.length - 1;
  if (points[points.length - 1][0] !== dernier) points.push([dernier, history[dernier]]);
  return points;
}

/**
 * Couleurs du trace, lues sur le theme courant.
 *
 * Le graphe se dessine dans un canvas : il ne recoit pas la cascade CSS. Il lit
 * donc les memes jetons que la feuille de style, pour suivre le theme choisi.
 */
function palette() {
  const style = getComputedStyle(document.documentElement);
  const lire = (nom, defaut) => style.getPropertyValue(nom).trim() || defaut;
  return {
    faible: lire('--faible', '#7d89a6'),
    grille: lire('--graphe-grille', '#232d45'),
    zero: lire('--graphe-zero', '#57628a'),
    aire: lire('--graphe-aire', '124, 108, 246'),
    fils: couleursFils(),
    etiquette: lire('--graphe-etiquette', 'rgba(14, 18, 26, 0.85)'),
  };
}

/**
 * Dessine les courbes. Le dernier point atteint se place au bord droit :
 * l'axe des generations couvre exactement l'historique connu.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{seed: number, history: number[]}[]} series
 * @param {{enCours?: boolean}} [contexte]
 */
export function dessinerEvolution(canvas, series, contexte = {}) {
  const ratio = window.devicePixelRatio || 1;
  const largeur = canvas.clientWidth || 280;
  const hauteur = canvas.clientHeight || 140;

  canvas.width = Math.round(largeur * ratio);
  canvas.height = Math.round(hauteur * ratio);

  const ctx = canvas.getContext('2d');
  const teintes = palette();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, largeur, hauteur);

  const traces = (series ?? []).filter((s) => Array.isArray(s.history) && s.history.length > 0);
  if (traces.length === 0) {
    ctx.fillStyle = teintes.faible;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Lancez une recherche pour voir la courbe', largeur / 2, hauteur / 2);
    return;
  }

  // Le parcours en boucle evite un depassement de pile : un spread sur des
  // centaines de milliers de points faisait disparaitre le graphe.
  let bas = Infinity;
  let haut = -Infinity;
  for (const serie of traces) {
    for (const v of serie.history) {
      if (v < bas) bas = v;
      if (v > haut) haut = v;
    }
  }
  if (bas === haut) { bas -= 1; haut += 1; }
  // Une marge de cinq pour cent evite que la courbe ne colle aux bords.
  const marge = (haut - bas) * 0.05;
  bas -= marge;
  haut += marge;

  // Le bord droit correspond a la derniere generation atteinte.
  const longueur = Math.max(...traces.map((s) => s.history.length));
  const etendue = Math.max(longueur - 1, 1);

  const zoneL = largeur - MARGE.gauche - MARGE.droite;
  const zoneH = hauteur - MARGE.haut - MARGE.bas;
  const x = (i) => MARGE.gauche + (i / etendue) * zoneL;
  const y = (v) => MARGE.haut + zoneH - ((v - bas) / (haut - bas)) * zoneH;

  // Graduations horizontales.
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i += 1) {
    const valeur = bas + ((haut - bas) * i) / 3;
    const py = Math.round(y(valeur)) + 0.5;
    ctx.strokeStyle = teintes.grille;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGE.gauche, py);
    ctx.lineTo(largeur - MARGE.droite, py);
    ctx.stroke();
    ctx.fillStyle = teintes.faible;
    ctx.fillText(nombre(valeur), MARGE.gauche - 6, py + 3);
  }

  // La ligne du zero marque le passage aux conditions satisfaites.
  if (bas < 0 && haut > 0) {
    const pz = Math.round(y(0)) + 0.5;
    ctx.strokeStyle = teintes.zero;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(MARGE.gauche, pz);
    ctx.lineTo(largeur - MARGE.droite, pz);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = teintes.zero;
    ctx.textAlign = 'left';
    ctx.fillText('conditions tenues', MARGE.gauche + 4, pz - 4);
  }

  // Le meilleur fil recoit une aire, pour se detacher des autres.
  const meilleur = traces.reduce((a, b) => {
    const va = a.history[a.history.length - 1] ?? -Infinity;
    const vb = b.history[b.history.length - 1] ?? -Infinity;
    return vb > va ? b : a;
  });

  traces.forEach((serie, index) => {
    const couleur = teintes.fils[index % teintes.fils.length];
    const estMeilleur = serie === meilleur;

    const points = echantillonner(serie.history);

    if (estMeilleur && points.length > 1) {
      const fond = ctx.createLinearGradient(0, MARGE.haut, 0, MARGE.haut + zoneH);
      fond.addColorStop(0, `rgba(${teintes.aire}, 0.22)`);
      fond.addColorStop(1, `rgba(${teintes.aire}, 0)`);
      ctx.fillStyle = fond;
      ctx.beginPath();
      ctx.moveTo(x(points[0][0]), MARGE.haut + zoneH);
      for (const [i, v] of points) ctx.lineTo(x(i), y(v));
      ctx.lineTo(x(points[points.length - 1][0]), MARGE.haut + zoneH);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = couleur;
    ctx.lineWidth = estMeilleur ? 2 : 1.2;
    ctx.globalAlpha = estMeilleur ? 1 : 0.62;
    ctx.beginPath();
    points.forEach(([i, v], rang) => {
      const px = x(i);
      const py = y(v);
      if (rang === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Le dernier point du meilleur fil porte sa valeur.
    if (estMeilleur && serie.history.length > 0) {
      const dernier = serie.history.length - 1;
      const px = x(dernier);
      const py = y(serie.history[dernier]);
      ctx.fillStyle = couleur;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();

      const texte = nombre(serie.history[dernier]);
      ctx.font = '600 10px ui-monospace, monospace';
      const l = ctx.measureText(texte).width;
      const bx = Math.min(px + 6, largeur - MARGE.droite - l - 6);
      ctx.fillStyle = teintes.etiquette;
      ctx.fillRect(bx - 3, py - 14, l + 6, 13);
      ctx.fillStyle = couleur;
      ctx.textAlign = 'left';
      ctx.fillText(texte, bx, py - 4);
    }
  });

  ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = teintes.faible;
  ctx.textAlign = 'center';
  const legende = contexte.enCours
    ? `generation ${longueur} — recherche en cours`
    : `${longueur} generations · ${traces.length} fil${traces.length > 1 ? 's' : ''}`;
  ctx.fillText(legende, largeur / 2, hauteur - 6);
}
