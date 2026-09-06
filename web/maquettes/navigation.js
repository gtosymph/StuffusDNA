/**
 * Barre de passage d'une maquette a l'autre.
 *
 * Chaque maquette est une page entiere : sans cette barre, le visiteur entre
 * dans une direction et n'en sort qu'avec le bouton Precedent du navigateur.
 * La barre se pose par dessus la maquette, sans toucher a sa mise en page.
 */
const PAGES = [
  { fichier: 'index.html', nom: 'Toutes' },
  { fichier: 'atelier.html', nom: 'Atelier' },
  { fichier: 'cockpit.html', nom: 'Cockpit' },
  { fichier: 'studio.html', nom: 'Studio' },
];

const courante = location.pathname.split('/').pop() || 'index.html';

const style = document.createElement('style');
style.textContent = `
.barre-maquettes {
  position: fixed; z-index: 9999; left: 50%; bottom: 18px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 2px; padding: 4px;
  background: rgba(16, 18, 22, .82); backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, .12); border-radius: 999px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .38);
  font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.barre-maquettes a {
  color: #b6bdc6; text-decoration: none; padding: 7px 13px; border-radius: 999px;
  white-space: nowrap; transition: background .15s ease, color .15s ease;
}
.barre-maquettes a:hover { background: rgba(255, 255, 255, .09); color: #fff; }
.barre-maquettes a[aria-current="page"] { background: #fff; color: #14171c; }
.barre-maquettes .separation { width: 1px; height: 16px; margin: 0 4px; background: rgba(255, 255, 255, .14); }
.barre-maquettes .appli { color: #8a929c; }
@media print { .barre-maquettes { display: none; } }
`;
document.head.append(style);

const barre = document.createElement('nav');
barre.className = 'barre-maquettes';
barre.setAttribute('aria-label', 'Directions proposees');

for (const page of PAGES) {
  const lien = document.createElement('a');
  lien.href = page.fichier;
  lien.textContent = page.nom;
  if (page.fichier === courante) lien.setAttribute('aria-current', 'page');
  barre.append(lien);
}

const separation = document.createElement('span');
separation.className = 'separation';
barre.append(separation);

const appli = document.createElement('a');
appli.className = 'appli';
appli.href = '../index.html';
appli.textContent = "L'application";
barre.append(appli);

document.body.append(barre);
