/**
 * Rappel du resultat dans la barre du haut.
 *
 * Le score est la boussole du travail : c'est lui qui dit si la derniere
 * modification a servi. Des que l'on descend dans le catalogue ou dans les
 * sorts, il sort de l'ecran, et il faut remonter pour le lire.
 *
 * La barre du haut porte une phrase qui ne sert a rien une fois l'application
 * connue. Elle prend donc le relais : quand le bloc du resultat quitte
 * l'ecran, elle montre le score et l'etat des conditions ; quand il revient,
 * elle reprend son texte d'origine.
 */

/** Marque le rappel comme actif, pour que la feuille puisse l'habiller. */
const CLASSE = 'rappel-score';

/**
 * Fait suivre le score dans la barre du haut.
 *
 * @returns {() => void} Fonction qui arrete le suivi.
 */
export function installerRappelScore() {
  const barre = document.getElementById('barre-info');
  const resultat = document.querySelector('.bloc-recherche');
  const score = document.getElementById('score');
  const note = document.getElementById('score-note');
  if (!barre || !resultat || !score) return () => {};

  const texteOrigine = barre.textContent;
  let visible = true;

  const rafraichir = () => {
    if (visible) {
      barre.textContent = texteOrigine;
      barre.classList.remove(CLASSE, 'tenu', 'defaut');
      return;
    }
    const tenu = score.classList.contains('pos');
    barre.textContent = `${score.textContent} — ${note?.textContent?.trim() ?? ''}`;
    barre.classList.add(CLASSE);
    barre.classList.toggle('tenu', tenu);
    barre.classList.toggle('defaut', !tenu);
  };

  /**
   * Le resultat compte comme visible tant qu'il depasse sous la barre.
   *
   * Une mesure directe au defilement se comporte de la meme facon partout,
   * la ou un observateur d'intersection reste muet dans un onglet au repos.
   */
  const mesurer = () => {
    const hauteurBarre = document.querySelector('.barre')?.getBoundingClientRect().height ?? 46;
    const dessous = resultat.getBoundingClientRect().bottom > hauteurBarre;
    if (dessous === visible) return;
    visible = dessous;
    rafraichir();
  };

  window.addEventListener('scroll', mesurer, { passive: true });
  window.addEventListener('resize', mesurer, { passive: true });
  // Un changement de disposition, de theme ou de pliage deplace le resultat :
  // sa position doit etre reprise sans attendre le prochain defilement.
  window.addEventListener('copyroxx:theme', mesurer);
  mesurer();

  // Le score est reecrit a chaque rendu : le rappel doit suivre sa valeur.
  const suiveur = new MutationObserver(() => { if (!visible) rafraichir(); });
  suiveur.observe(score, { childList: true, characterData: true, subtree: true, attributes: true });

  // Un clic sur le rappel ramene au resultat.
  barre.addEventListener('click', () => {
    if (!barre.classList.contains(CLASSE)) return;
    resultat.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  return () => {
    window.removeEventListener('scroll', mesurer);
    window.removeEventListener('resize', mesurer);
    window.removeEventListener('copyroxx:theme', mesurer);
    suiveur.disconnect();
  };
}
