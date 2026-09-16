/**
 * Les cinq panneaux qui repondent apres une recherche.
 *
 * Chacun repond a une question differente, et c'est la seule raison pour
 * laquelle ils ne se fondent pas en un seul :
 *
 *   score       — ou en est le build pose ?
 *   analyse     — d'ou vient ce score, et ou investir pour le monter ?
 *   proximite   — si je n'achete que une a trois pieces, que puis-je gagner ?
 *   survie      — combien de degats coute un point de vie de plus ?
 *   candidats   — quels autres builds le solveur a-t-il trouves ?
 *
 * Ils partagent en revanche leur matiere : l'etat, le catalogue et les
 * statistiques du build pose. Les tenir ensemble evite de passer cinq fois
 * les memes liens, et met cote a cote les regles qu'ils ont en commun — le
 * gain se lit toujours face a la reference, jamais face au build pose.
 */
import * as vue from './render.mjs';
import { renderAnalyse } from './analyse-panel.mjs';
import { paliersUtiles, renderPaliers, renderReglageProximite } from './proximite-panel.mjs';
import { renderSurvie } from './survie-panel.mjs';
import { cibleAffichee, objectif, passifsActifs, profilDe, scoreAffiche, valeurDeReference } from './objectif.mjs';
import * as geste from './equipement.mjs';
import { axeDe } from '../src/solver/survie.mjs';
import { SEARCH_MODES } from '../src/solver/score.mjs';

const nombre = (n) => n.toLocaleString('fr-FR');

/**
 * Cree les cinq panneaux de resultat.
 *
 * @param {object} liens
 * @param {(id: string) => HTMLElement} liens.$
 * @param {() => any} liens.lireEtat
 * @param {() => any} liens.lireCatalogue
 * @param {(patch: any) => void} liens.setEtat
 * @param {(texte: string, type?: string) => void} liens.message
 * @param {() => {porterAlaMain: (build: any) => void}} liens.lireRecherche
 * @param {{figerReference: Function, oublierReference: Function, reprendreReference: Function}} liens.reference
 * @param {(combo: any) => any[]} liens.sortsDuCombo
 * @param {(combo: any) => void} liens.garderCombo
 */
export function creerResultats(liens) {
  const { $, lireEtat, lireCatalogue, setEtat, message, lireRecherche } = liens;
  const { reference: gestesReference, sortsDuCombo, garderCombo } = liens;

  /** Montre le score du build pose, son libelle et le combo retenu. */
  function montrerScore(detail, build) {
    const etat = lireEtat();
    const noeud = $('score');
    noeud.textContent = nombre(Math.round(detail.score));
    noeud.className = `score ${detail.satisfied ? 'pos' : 'neg'}`;

    // Sans sort ni arme, le score ne mesure pas des degats mais la marge prise
    // sur les conditions : l'annoncer « degats totaux » trompait la lecture.
    const mode = objectif(etat).mode;
    const enDegats = mode === SEARCH_MODES.DAMAGE;
    const enEndurance = mode === SEARCH_MODES.ENDURANCE;
    const enMixte = mode === SEARCH_MODES.MIXTE;
    $('score-libelle').textContent = detail.satisfied
      ? (enDegats ? 'Degats totaux'
        : (enEndurance ? 'Pdv effectifs'
          : (enMixte ? 'Score mixte' : 'Marge sur les conditions')))
      : 'Minimums non tenus';

    const invalides = build?.invalid?.length ?? 0;
    // Le score mixte compose deux mesures : seul, il ne dit ni combien le build
    // frappe ni combien il tient. Les deux nombres se lisent donc a cote.
    const composantes = enMixte
      ? ` ${nombre(Math.round(detail.damage ?? 0))} degats, `
        + `${nombre(Math.round(detail.endurance ?? 0))} pdv effectifs.`
      : '';
    const marge = (enDegats || enEndurance || enMixte)
      ? '' : ' Le score somme ce que le build depasse.';
    $('score-note').textContent = detail.satisfied
      ? `Toutes les conditions sont tenues.${composantes}${marge}${invalides ? ` ${invalides} piece(s) non equipable(s).` : ''}`
      : `${detail.unmet.length} minimum(s) non tenu(s).${invalides ? ` ${invalides} piece(s) non equipable(s).` : ''}`;

    vue.renderCombo($('carte-combo'), detail.combo ?? null, {
      onAppliquer: (combo) => {
        const sorts = sortsDuCombo(combo);
        if (sorts.length === 0) return;
        setEtat({ sorts });
        message(`La liste des sorts reprend le combo : ${sorts.length} sort(s).`, 'info');
      },
      onGarder: garderCombo,
    });
  }

  /** Montre ce que chaque piece apporte, ou investir, et quoi remplacer. */
  function montrerAnalyse(stats) {
    const etat = lireEtat();
    const catalogue = lireCatalogue();
    const bloc = $('bloc-analyse');
    bloc.hidden = !stats || etat.equipped.size === 0;
    if (bloc.hidden) return;

    renderAnalyse(
      { apports: $('apports'), sensibilite: $('sensibilite'), remplacements: $('remplacements') },
      {
        etat,
        catalogue,
        stats,
        cible: cibleAffichee(etat),
        tenu: scoreAffiche(etat, stats).satisfied,
        contexte: {
          level: etat.niveau,
          allocation: etat.allocation,
          scrolls: etat.scrolls,
          passives: passifsActifs(etat),
          profile: profilDe(etat),
          setById: catalogue.setById,
        },
        onRemplacer: (proposition) => {
          setEtat(geste.remplacer(lireEtat(), proposition.actuel, proposition.remplacant));
          message(`${proposition.remplacant.fr} posee`
            + `${proposition.actuel ? ` a la place de ${proposition.actuel.fr}` : ''}.`, 'info');
        },
      });
  }

  /** Montre les paliers « proche de mon stuff », avec ce qu'il faut acheter. */
  function montrerProximite() {
    const etat = lireEtat();
    const catalogue = lireCatalogue();

    renderReglageProximite($('reglage-proximite'), {
      reference: etat.reference,
      max: etat.changementsMax,
      possedees: etat.possedees.size,
      portees: etat.equipped.size,
    }, {
      onFiger: gestesReference.figerReference,
      onOublier: gestesReference.oublierReference,
      onReprendre: gestesReference.reprendreReference,
      onMax: (valeur) => setEtat({ changementsMax: valeur }),
    });

    const paliers = etat.reference ? (etat.paliers ?? []) : [];

    // Le gain se lit face au stuff de reference, jamais face au build pose :
    // c'est l'achat qui se decide, pas l'essai en cours.
    const reference = valeurDeReference(etat, catalogue);

    // Le compteur annonce ce que le joueur verra : les paliers qui n'apportent
    // rien ne se montrent pas, ils ne doivent pas se compter non plus.
    $('compte-paliers').textContent = String(paliersUtiles(paliers, reference).length);

    renderPaliers($('paliers'), paliers, {
      reference,
      itemById: catalogue?.itemById ?? new Map(),
      piecesReference: etat.reference?.itemIds ?? [],
      max: etat.changementsMax,
      possedees: etat.possedees,
      onPorter: (palier) => {
        lireRecherche().porterAlaMain(palier);
        message(`Build porte : ${palier.changements} piece(s) a acheter, `
          + `${nombre(Math.floor(palier.damage))} de degats.`, 'info');
      },
    });
  }

  /**
   * Montre la courbe degats contre points de vie.
   * @param {Record<string, number>|null} stats Statistiques du build porte.
   */
  function montrerSurvie(stats) {
    const etat = lireEtat();
    const bloc = $('bloc-survie');
    const paliers = etat.survie ?? [];
    const mode = objectif(etat).mode;

    // L'axe suit le mode, et le titre du bloc avec lui. Le titre se pose meme
    // quand le bloc est cache : il doit etre juste des qu'il se montre.
    const axe = axeDe(mode);
    const parEndurance = axe.cle === 'endurance';
    $('titre-survie').textContent = parEndurance ? 'Degats ou survie' : 'Survie ou degats';
    // Le sous-titre dit la question a laquelle le bloc repond, et elle
    // s'inverse avec l'axe : le titre seul ne suffisait pas a la deviner.
    $('question-survie').textContent = parEndurance
      ? 'Combien de degats me coute un point de vie de plus ?'
      : 'Combien de vie me coute un point de degat de plus ?';

    // Le bloc n'a de sens qu'avec des degats a compter : en mode
    // caracteristiques, il n'y a rien a echanger contre de la vie.
    //
    // Il se montre en revanche AVANT la premiere recherche, avec son invite :
    // cache tant qu'il n'a pas de paliers, il n'existait que pour qui savait
    // deja qu'il existait.
    bloc.hidden = mode === SEARCH_MODES.STATS;
    if (bloc.hidden) return;

    const porte = stats
      ? { pdv: stats.pdv, endurance: stats.pdvEffectifs, damage: scoreAffiche(etat, stats).damage }
      : null;

    const montrees = renderSurvie($('survie'), paliers, {
      axe,
      porte,
      // Hors mode mixte, aucun reglage ne choisit de point : rien n'est marque.
      part: mode === SEARCH_MODES.MIXTE ? etat.partDegats : null,
      portees: new Set([...etat.equipped.values()].map((piece) => piece.id)),
      itemById: lireCatalogue().itemById,
      onPorter: (palier) => {
        lireRecherche().porterAlaMain(palier);
        // Un palier sous la condition de vie la laisse en defaut : le joueur
        // l'a choisi, mais il doit le lire tout de suite.
        const tenu = palier.stats ? scoreAffiche(lireEtat(), palier.stats).satisfied : true;
        const manque = axe.cle === 'endurance' ? 'Votre condition de vie' : 'Votre condition de degats';
        message(`Build porte : ${nombre(Math.floor(palier.pdv))} points de vie, `
          + `${nombre(Math.floor(palier.endurance))} une fois les resistances comptees, `
          + `${nombre(Math.floor(palier.damage))} de degats.`
          + (tenu ? '' : ` ${manque} n'est plus tenue : baissez-la si ce build vous convient.`),
        tenu ? 'info' : 'alerte');
      },
    });
    $('compte-survie').textContent = String(montrees);
  }

  /** Montre les autres builds trouves, avec ce qu'il faut changer pour chacun. */
  function montrerCandidats(stats) {
    const etat = lireEtat();
    const bloc = $('bloc-candidats');
    const candidats = etat.candidats ?? [];
    bloc.hidden = candidats.length === 0;
    $('compte-candidats').textContent = String(candidats.length);
    if (candidats.length === 0) return;

    const portes = new Set([...etat.equipped.values()].map((piece) => piece.id));
    // Le build porte sert de point de comparaison : ses degats et l'etat de ses
    // conditions, pas son score — celui-ci change d'echelle selon qu'elles
    // tiennent ou non.
    const porte = stats ? scoreAffiche(etat, stats) : null;

    vue.renderCandidats($('candidats'), candidats, {
      portes,
      itemById: lireCatalogue().itemById,
      porte,
      onPorter: (candidat) => {
        lireRecherche().porterAlaMain(candidat);
        message(`Build remplace par un candidat a ${nombre(Math.floor(candidat.score))}.`, 'info');
      },
    });
  }

  return { montrerScore, montrerAnalyse, montrerProximite, montrerSurvie, montrerCandidats };
}
