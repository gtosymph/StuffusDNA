/**
 * Panneau du profil : sauvegarder, reprendre, effacer.
 *
 * Le joueur ne voit jamais son rangement. Il croit son travail garde pour
 * toujours, alors qu'il tient dans un navigateur, sur une machine, sous une
 * limite de place. Ce panneau lui montre les trois choses qu'il doit savoir :
 * ce que pese son profil, comment l'emporter, et comment le reprendre.
 */
import {
  effacerProfil, importerProfil, lireProfil, nomFichier, resumeOccupation,
} from './profil.mjs';
import { disponible, surEchec } from './stockage.mjs';

/** Cree un element avec sa classe et son texte. */
function el(nom, classe, texte) {
  const noeud = document.createElement(nom);
  if (classe) noeud.className = classe;
  if (texte !== undefined) noeud.textContent = texte;
  return noeud;
}

/**
 * Propose un fichier au telechargement.
 * @param {string} nom
 * @param {string} contenu
 */
function telecharger(nom, contenu) {
  const lien = document.createElement('a');
  const adresse = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  lien.href = adresse;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  // L'adresse temporaire tient la memoire du fichier : elle se rend une fois
  // le telechargement lance.
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}

/** Construit le contenu du panneau. */
function garnir(panneau, message) {
  const occupation = resumeOccupation();

  const place = el('div', 'profil-place');
  place.append(
    el('span', null, 'Place occupée'),
    el('strong', occupation.sature ? 'alerte' : null, occupation.texte),
  );

  const explication = disponible()
    ? 'Votre profil vit dans ce navigateur, sur cette machine. Un nettoyage des '
      + 'données de navigation, la navigation privée ou un autre appareil ne le '
      + 'retrouveront pas. Le fichier exporté, lui, vous suit partout.'
    : 'Ce navigateur refuse d\'enregistrer : votre travail ne survivra pas au '
      + 'rechargement. Exportez-le avant de fermer la page.';

  // Un enfant null deviendrait le texte « null » : il est ecarte.
  panneau.replaceChildren(...[
    el('div', 'profil-titre', 'Profil'),
    place,
    occupation.sature
      ? el('div', 'profil-alerte',
          'Le rangement approche de sa limite. Enlevez des simulations gardées, '
          + 'sinon les prochains enregistrements seront refusés.')
      : null,
    el('p', 'profil-note', explication),
    el('div', 'profil-actions'),
    message ? el('div', message.erreur ? 'profil-alerte' : 'profil-succes', message.texte) : null,
  ].filter(Boolean));

  return panneau.querySelector('.profil-actions');
}

/**
 * Installe le bouton du profil dans la barre du haut.
 * @param {HTMLElement|null} hote
 */
export function installerProfil(hote) {
  if (!hote) return () => {};

  const bouton = el('button', 'bascule-tiroir bascule-profil');
  bouton.type = 'button';
  bouton.append(el('span', null, 'Profil'));
  bouton.title = 'Sauvegarder, reprendre ou effacer votre profil';
  bouton.setAttribute('aria-expanded', 'false');

  const panneau = el('div', 'panneau-profil');
  panneau.hidden = true;

  let message = null;

  const fichier = el('input');
  fichier.type = 'file';
  fichier.accept = 'application/json,.json';
  fichier.hidden = true;

  const dessiner = () => {
    const actions = garnir(panneau, message);

    const exporter = el('button', 'primaire', 'Exporter');
    exporter.type = 'button';
    exporter.title = 'Ecrit tout votre profil dans un fichier à garder';
    exporter.addEventListener('click', () => {
      telecharger(nomFichier(), `${JSON.stringify(lireProfil(), null, 2)}\n`);
      message = { texte: 'Profil exporté. Gardez ce fichier : il vous rend tout.' };
      dessiner();
    });

    const importer = el('button', null, 'Importer');
    importer.type = 'button';
    importer.title = 'Reprend un profil exporté. Le profil de ce navigateur est remplacé.';
    importer.addEventListener('click', () => fichier.click());

    const effacer = el('button', 'danger', 'Tout effacer');
    effacer.type = 'button';
    effacer.title = 'Enleve build, simulations, jeux et réglages de ce navigateur';
    effacer.addEventListener('click', () => {
      const sur = window.confirm(
        'Effacer tout le profil de ce navigateur ?\n\n'
        + 'Build, simulations gardées, jeux de sorts et de conditions, réglages : '
        + 'tout part. Cette action ne se defait pas.\n\n'
        + 'Exportez d\'abord si vous voulez pouvoir revenir.',
      );
      if (!sur) return;
      effacerProfil();
      location.reload();
    });

    actions.append(exporter, importer, effacer);
  };

  fichier.addEventListener('change', async () => {
    const choisi = fichier.files?.[0];
    fichier.value = '';
    if (!choisi) return;

    try {
      const rapport = importerProfil(await choisi.text());
      if (rapport.refusees.length > 0) {
        message = {
          erreur: true,
          texte: `Profil repris en partie. Refusé par le rangement : ${rapport.refusees.join(', ')}.`,
        };
        dessiner();
        return;
      }
      // La page entiere lit le rangement au demarrage : la relire est le seul
      // moyen sur de montrer le profil repris, sans etat a moitie repose.
      location.reload();
    } catch (erreur) {
      message = { erreur: true, texte: erreur.message };
      dessiner();
    }
  });

  const ouvrir = (ouvert) => {
    panneau.hidden = !ouvert;
    bouton.setAttribute('aria-expanded', String(ouvert));
    if (ouvert) dessiner();
  };

  bouton.addEventListener('click', () => ouvrir(panneau.hidden));

  // Un clic hors du panneau le referme, comme tout menu.
  document.addEventListener('click', (evenement) => {
    if (panneau.hidden) return;
    if (panneau.contains(evenement.target) || bouton.contains(evenement.target)) return;
    ouvrir(false);
  });

  const enveloppe = el('div', 'menu-profil');
  enveloppe.append(bouton, panneau, fichier);
  hote.append(enveloppe);

  // Une ecriture refusee ne doit pas passer inapercue : c'est le moment ou le
  // joueur perd son travail sans le savoir.
  const arreter = surEchec((echec) => {
    bouton.classList.add('alerte');
    bouton.title = echec.sature
      ? 'Le rangement du navigateur est plein : vos derniers changements ne sont pas gardés.'
      : 'Ce navigateur refuse d\'enregistrer : vos derniers changements ne sont pas gardés.';
    message = {
      erreur: true,
      texte: echec.sature
        ? 'Le rangement est plein. Exportez votre profil, puis enlevez des simulations gardées.'
        : 'Ce navigateur refuse d\'enregistrer. Exportez votre profil avant de fermer la page.',
    };
    if (!panneau.hidden) dessiner();
  });

  return () => arreter();
}
