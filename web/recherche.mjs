/**
 * Conduite d'une recherche : lancement, suivi des fils, pause et reprise.
 *
 * Le module garde tout ce qui n'appartient qu'a la recherche en cours : la
 * promesse de la boucle, les courbes par fil, le drapeau de suivi
 * automatique. L'application lui prete ce dont il a besoin pour toucher
 * l'etat et l'ecran, et ne voit plus qu'une poignee de gestes.
 */
import { dessinerEvolution } from './chart.mjs';
import { lireResultat, sauverResultat } from './etat-stockage.mjs';
import { objectif } from './objectif.mjs';
import { runSearch } from './solver-client.mjs';
import { normaliserIntensite } from '../src/solver/intensite.mjs';
import { limiteAtteinte, normaliserLimite, phraseArretAuto } from './limite-generations.mjs';
import { configPassifsDefaut } from '../src/data/passives-defaults.mjs';
import { el } from './render.mjs';

/** Delai minimal entre deux dessins du graphe pendant une recherche. */
const INTERVALLE_GRAPHE_MS = 250;

/** Delai minimal entre deux enregistrements de la courbe pendant une recherche. */
const INTERVALLE_ENREGISTREMENT_MS = 3000;

/** Fils de calcul admis, au plus. */
const FILS_MAX = 8;

const nombre = (n) => n.toLocaleString('fr-FR');

/**
 * Prepare la conduite des recherches.
 *
 * @param {object} deps
 * @param {(id: string) => HTMLElement} deps.$
 * @param {() => any} deps.lireEtat Etat courant de l'application.
 * @param {(patch: object) => void} deps.setEtat
 * @param {(resultat: any, aussi?: object) => void} deps.appliquer Pose un build
 *   sur le personnage, avec au besoin des reglages poses dans le meme etat.
 * @param {(texte: string, type?: string) => void} deps.message
 * @param {() => void} deps.garderSimulation Range le build porte, s'il est nouveau.
 */
export function creerRecherche({ $, lireEtat, setEtat, appliquer, message, garderSimulation }) {
  /** Recherche en cours, ou null. */
  let recherche = null;

  /**
   * Promesse de la boucle de recherche en cours.
   *
   * Elle se resout quand la boucle a fini son menage, donc apres « recherche =
   * null ». Un depart de zero l'attend : sans cela, il relancerait avant que la
   * boucle precedente ait rendu la main, et le nouveau depart serait refuse.
   */
  let boucle = null;

  /** Numero du dernier depart demande : il departage deux clics rapproches. */
  let departs = 0;

  /** Historique du score par fil, pour la courbe. */
  let historiques = [];

  /** Vrai pendant une recherche : la courbe se redessine a chaque avancee. */
  let enCours = false;

  /**
   * Vrai entre la demande de pause et la conclusion.
   *
   * Un fil ne lit l'ordre d'arret qu'entre deux vagues : la pause met donc un
   * instant a prendre, et parfois plusieurs secondes quand les fils se
   * partagent les coeurs. Pendant ce temps, les vagues deja parties
   * continuaient d'arriver, de reecrire « en cours » sous le compteur et de
   * reposer un build sur le personnage.
   *
   * L'ecran contredisait donc le geste : on demandait la pause, le compteur
   * montait toujours, le bouton restait gris. La seule lecture possible etait
   * « mon clic n'a rien fait ».
   */
  let enPause = false;

  /**
   * Vrai tant que le personnage suit le meilleur build de la recherche.
   *
   * Chaque vague qui ameliore le score repose son build sur le personnage. Un
   * joueur qui porte une proposition a la main pendant ce temps voyait son
   * choix efface a la vague suivante : le bouton « Porter » paraissait inerte.
   * Un choix a la main arrete donc le suivi jusqu'a la prochaine recherche.
   */
  let suiviAuto = true;

  const dessiner = () => dessinerEvolution($('graphe'), historiques, { enCours });

  const enregistrer = (generationMax, fils) => sauverResultat({
    generationMax, fils, intensite: $('intensite').value, historiques,
    limite: $('limite-generations')?.value,
  });

  const montrerFils = (suivi) => {
    $('etat-fils').replaceChildren(...[...suivi.values()].map((p) => el('div', { class: 'fil' },
      el('span', { text: `fil ${p.seed}` }),
      el('span', { class: 'valeur', text: p.failed ? 'echec' : nombre(Math.round(p.best ?? 0)) }),
    )));
  };

  /** Reprend le dernier resultat enregistre : courbes, fils et compteur. */
  function reprendre() {
    const data = lireResultat();
    if (!data) return;

    historiques = data.historiques;
    if (Number.isFinite(data.fils) && data.fils >= 1) $('fils').value = String(data.fils);
    if (data.intensite != null) $('intensite').value = String(data.intensite);
    if (data.limite != null && $('limite-generations')) {
      $('limite-generations').value = String(data.limite);
    }
    if (Number.isFinite(data.generationMax) && data.generationMax > 0) {
      $('compteur-generations').textContent = `generation ${nombre(data.generationMax)} — en pause`;
    }
  }

  /**
   * Pose un build choisi a la main, et arrete le suivi de la recherche.
   *
   * @param {any} resultat
   * @param {object} [aussi] Reglages a poser dans le MEME etat que le build.
   *   Choisir un point sur la courbe pose a la fois le stuff et la part des
   *   degats qui le designe : deux etats separes rendraient l'annulation
   *   fausse, puisqu'un seul Ctrl+Z laisserait le curseur ailleurs que le
   *   stuff qu'il a fait porter.
   */
  function porterAlaMain(resultat, aussi = null) {
    const suivait = suiviAuto && recherche !== null;
    suiviAuto = false;
    appliquer(resultat, aussi);
    if (suivait) {
      message('Le personnage ne suit plus la recherche : votre choix reste en place. '
        + 'Le prochain lancement rend la main au solveur.', 'info');
    }
  }

  /** Vrai entre la demande de pause et la conclusion. */
  const sePause = () => enPause;

  /**
   * Met la recherche en pause : chaque fil rend son meilleur build avant de
   * conclure.
   *
   * L'attente se DIT, et elle se dit la ou le joueur regarde deja — sous le
   * compteur, pas dans un message qui s'efface. Elle dit aussi la sortie :
   * « Arreter » coupe net, sans attendre les fils.
   */
  function arreter() {
    if (!enCours || enPause) return;
    enPause = true;
    $('arreter').disabled = true;
    $('compteur-generations').textContent = 'mise en pause…';
    message('Mise en pause : chaque fil termine sa vague et rend son meilleur '
      + 'stuff. « Arrêter » coupe net, sans rien garder.', 'info');
    recherche?.stop();
  }

  /**
   * Coupe la recherche net.
   *
   * La difference avec la pause n'est pas une nuance : la pause DEMANDE aux
   * fils de conclure et attend leur meilleur build, ce qui prend plusieurs
   * secondes ; l'arret les coupe au milieu de leur vague et ne garde rien de
   * ce qu'ils avaient en main.
   *
   * @returns {boolean} Vrai si une recherche a ete coupee.
   */
  function abandonner() {
    if (!recherche) return false;
    // L'etat passe a « arretee » tout de suite : la boucle met encore un
    // instant a rendre la main, et pendant ce temps le bouton continuait
    // d'annoncer une recherche qui n'existait plus.
    enCours = false;
    recherche.abandon();
    return true;
  }

  /** Vrai tant qu'une recherche tourne. */
  const tourne = () => enCours;

  /**
   * Lance une recherche continue.
   * @param {{deZero?: boolean}} [choix] deZero : population neuve, sans le
   *   build courant en graine — pour repartir apres un changement de reglages.
   */
  async function lancer(choix = {}) {
    const deZero = choix.deZero === true;
    const jeton = (departs += 1);

    // Une recherche tourne deja. « Lancer » n'a alors rien a dire, mais
    // « Recommencer » veut justement couper celle-ci pour repartir de zero.
    if (recherche) {
      if (!deZero) return;
      recherche.abandon();
      await boucle;
      // Deux clics rapproches attendent la meme boucle : seul le dernier part.
      if (jeton !== departs) return;
    }

    let finBoucle;
    boucle = new Promise((resolve) => { finBoucle = resolve; });

    // Une recherche neuve rend la main au solveur.
    //
    // Elle n'efface ses propositions QUE si elle repart de zero. Les effacer a
    // chaque lancement faisait disparaitre la courbe du compromis pendant
    // toute la recherche — plusieurs minutes d'ecran vide, alors que les
    // points d'avant restaient la meilleure reponse connue jusqu'a ce que les
    // nouveaux arrivent. Un depart de zero, lui, jette vraiment le passe.
    suiviAuto = true;
    const depart = lireEtat();
    if (deZero && [depart.candidats, depart.paliers, depart.survie]
      .some((liste) => (liste ?? []).length > 0)) {
      setEtat({ candidats: [], paliers: [], survie: [] });
    }

    const fils = Math.max(1, Math.min(FILS_MAX, Number($('fils').value) || 1));
    const intensite = normaliserIntensite($('intensite').value);
    // La limite se lit au lancement, pas a chaque vague : la changer en cours
    // de route ne doit pas couper une recherche deja partie.
    const limite = normaliserLimite($('limite-generations')?.value);
    // Une pause demandee n'est demandee qu'une fois : sans ce drapeau, chaque
    // vague qui arrive apres la limite en redemanderait une, et le message
    // se repeterait a l'ecran pendant que les fils concluent.
    let arretDemande = false;

    $('lancer').disabled = true;
    // « Recommencer » reste actif : il coupe la recherche en cours et repart.
    $('recommencer').disabled = false;
    $('arreter').disabled = false;
    message(deZero ? 'Nouvelle recherche, population neuve.' : '');
    $('etat-fils').replaceChildren();
    enCours = true;

    const suivi = new Map();
    // Chaque fil accumule sa courbe, vague apres vague. Une reprise repart des
    // courbes existantes : le graphe continue au lieu de se remettre a zero.
    const courbes = new Map();
    let decalage = 0;
    if (deZero) {
      historiques = [];
    } else {
      for (const { seed, history } of historiques) courbes.set(seed, [...history]);
      for (const { history } of historiques) decalage = Math.max(decalage, history.length - 1);
    }

    // Meilleur score deja applique a l'interface : le build ne bouge que s'il monte.
    let meilleurApplique = Number.NEGATIVE_INFINITY;
    let dernierGraphe = 0;
    let dernierEnregistrement = 0;
    let generationMax = decalage;
    $('compteur-generations').textContent = decalage > 0
      ? `reprise à la génération ${nombre(decalage)}…`
      : 'demarrage…';

    const etat = lireEtat();
    recherche = runSearch(
      {
        level: etat.niveau,
        allocation: etat.allocation,
        scrolls: etat.scrolls,
        passivesConfig: etat.options.passifs ? configPassifsDefaut() : null,
        profile: { classe: etat.classe, sexe: etat.sexe },
        bannedIds: [...etat.bannis],
        lockedIds: [...etat.verrous],
        // Une reprise seme le build courant ; un depart de zero ne seme rien.
        currentItemIds: deZero ? [] : [...etat.equipped.values()].map((piece) => piece.id),
        objective: objectif(etat),
        intensite,
        options: { populationSize: 160 },
      },
      {
        threads: fils,
        onProgress: (info) => {
          suivi.set(info.seed, { ...suivi.get(info.seed), ...info });
          montrerFils(suivi);
        },
        onWave: (vague) => {
          suivi.set(vague.seed, { seed: vague.seed, best: vague.best });
          generationMax = Math.max(generationMax, decalage + vague.generation);

          // Une vague partie avant l'ordre d'arret arrive encore apres lui.
          // Son travail se garde — c'est tout l'interet d'une pause — mais
          // elle ne touche plus a l'ecran : le compteur doit continuer de
          // dire « mise en pause », et le personnage ne doit plus bouger
          // sous les yeux de quelqu'un qui vient de demander l'arret.
          if (enPause) {
            if (!courbes.has(vague.seed)) courbes.set(vague.seed, []);
            courbes.get(vague.seed).push(...(vague.history ?? []));
            historiques = [...courbes.entries()].map(([seed, history]) => ({ seed, history }));
            return;
          }

          $('compteur-generations').textContent = `generation ${nombre(generationMax)} — en cours`;

          // La courbe du fil s'allonge de la vague ecoulee.
          if (!courbes.has(vague.seed)) courbes.set(vague.seed, []);
          courbes.get(vague.seed).push(...(vague.history ?? []));
          historiques = [...courbes.entries()].map(([seed, history]) => ({ seed, history }));
          montrerFils(suivi);

          // Chaque fil rend une vague par seconde environ. Repeindre le graphe
          // et reecrire les courbes a chaque fois occupait le fil principal
          // pour rien : l'oeil ne suit pas, et l'enregistrement traverse tout
          // l'historique. Les deux se font donc au rythme qui se voit.
          const maintenant = Date.now();
          if (maintenant - dernierGraphe >= INTERVALLE_GRAPHE_MS) {
            dernierGraphe = maintenant;
            dessiner();

            // Les paliers de la vague passent dans l'etat au meme rythme : la
            // courbe du compromis se construit sous les yeux du joueur au lieu
            // de rester celle de la recherche precedente jusqu'a la pause.
            const frontieres = {};
            if (Array.isArray(vague.paliersFondus)) frontieres.paliers = vague.paliersFondus;
            if (Array.isArray(vague.survieFondue)) frontieres.survie = vague.survieFondue;
            if (Object.keys(frontieres).length > 0) setEtat(frontieres);
          }
          if (maintenant - dernierEnregistrement >= INTERVALLE_ENREGISTREMENT_MS) {
            dernierEnregistrement = maintenant;
            enregistrer(generationMax, fils);
          }

          // Le compte part du lancement : une reprise a la generation 40 000
          // avec une limite de 20 000 s'arrete a 60 000. L'arret est une
          // PAUSE, pas un abandon — chaque fil rend son meilleur build, et le
          // clic suivant repart d'ici.
          if (!arretDemande && limiteAtteinte(generationMax - decalage, limite)) {
            arretDemande = true;
            // Le meme chemin que le bouton : l'arret automatique doit poser
            // l'etat de pause, sinon le compteur continue d'annoncer « en
            // cours » pendant que les fils concluent.
            arreter();
            message(phraseArretAuto(limite), 'info');
          }

          // Le meilleur build du moment s'applique en direct au personnage,
          // tant que le joueur n'a pas pose son propre choix.
          if (suiviAuto && vague.resume && vague.resume.score > meilleurApplique) {
            meilleurApplique = vague.resume.score;
            appliquer(vague.resume);
          }
        },
      },
    );

    try {
      const { best, candidats, paliers, survie, abandonnee } = await recherche.promise;
      // Un abandon jette la recherche : rien a appliquer, rien a garder.
      if (abandonnee) return;
      if (suiviAuto && best.score > meilleurApplique) appliquer(best);
      if (Array.isArray(candidats)) setEtat({ candidats });
      if (Array.isArray(paliers)) setEtat({ paliers });
      if (Array.isArray(survie)) setEtat({ survie });
      // Une recherche mise en pause laisse une trace : c'est la version que
      // l'on voudra comparer au prochain essai.
      garderSimulation();
      // L'arret automatique a deja dit pourquoi il s'arretait : le repeter
      // effacerait la seule phrase qui nomme la limite.
      if (!arretDemande) {
        message(`Recherche en pause après ${nombre(generationMax)} générations sur ${fils} fil(s).`, 'info');
      }
      $('compteur-generations').textContent = `generation ${nombre(generationMax)} — en pause`;
    } catch (error) {
      message(`La recherche a échoué : ${error.message}`, 'erreur');
    } finally {
      recherche = null;
      enCours = false;
      enPause = false;
      $('lancer').disabled = false;
      $('recommencer').disabled = false;
      $('arreter').disabled = true;
      dessiner();
      enregistrer(generationMax, fils);
      finBoucle();
    }
  }

  return { lancer, arreter, abandonner, tourne, sePause, porterAlaMain, reprendre, dessiner };
}
