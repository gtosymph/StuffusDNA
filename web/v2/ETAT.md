# v2 — ou en est la coquille

Seconde entree, a cote de v1, pas a sa place. Les deux tournent en meme temps :

- v1 : `http://localhost:4173/web/index.html`
- v2 : `http://localhost:4173/web/v2/index.html`

Le design vient de `../proto/studio.html`. Ce dossier le branche au vrai
moteur ; la maquette garde les chiffres inventes et sert de reference visuelle.

## Ce qui marche

- L'ecran vide, ses dix-neuf emblemes de classe, et le passage a l'atelier en
  un clic.
- Le catalogue et les sorts reels, charges depuis `data/`.
- Les seize cases du personnage, leurs infobulles, et la fiche d'une piece avec
  ses quatre gestes : retirer, toujours garder, interdire, je l'ai deja.
- Le choix des sorts, et la bascule automatique vers « frapper fort » au
  premier sort pose.
- Les trois mesures du verdict, dont les degats qui se TAISENT sans sorts.
- Les minimums, montres face a la valeur que le moteur leur compare.
- La fiche du volet droit, en deux listes : l'essentiel et « tout voir ».
- Les stuffs trouves, lus comme des differences face au stuff porte.
- La recherche : lancer, pause, courbe, reprise de l'etat range, et le rappel
  quand un reglage a bouge depuis le dernier lancement.
- Le personnage : classe, niveau et sexe, dans une feuille ouverte par la
  pastille de la barre.
- Poser un minimum en cliquant un chiffre de la fiche, et l'enlever la ou il
  se lit.
- La palette de pieces, ouverte par `⌘K` ou par « Toutes les pieces ».
- « Mon stuff actuel » : figer le stuff porte, et compter les achats.
- La comparaison : cocher des stuffs trouves, masquer les lignes identiques.
- La feuille des points, ouverte depuis la famille qu'elle commande.
- Le mode « les deux » : son curseur et la courbe degats / survie sous lui,
  qui se commandent l'un l'autre.
- Les vingt options de calcul : cinq a cote du nombre qu'elles definissent,
  quinze dans la feuille des reglages.

## Ce qui n'est pas encore branche

1. **Les essais gardes** : `garderSimulation` ne fait rien pour l'instant.
2. **Le poids d'un minimum** : un minimum pose a la main prend le poids 1,
   donc une preference, pas un couperet. Rien ne permet encore de le monter.
3. **« Proche de mon stuff »** : les paliers d'achat ne sont pas montres.

## Les trois decisions de structure

**Le pont** (`pont.mjs`). Les modules de v1 ne recoivent pas des noeuds, ils
recoivent un `$` et vont chercher des identifiants. `recherche.mjs` en reclame
huit, dont trois que la nouvelle interface ne montre plus. Le pont rend les
noeuds de v2 quand ils existent, et fabrique un noeud muet sinon. Aucun module
de v1 ne change, et rien ne tombe en silence sur un identifiant absent.

**Les chemins ancres au module.** Un chemin relatif se resolvait contre
l'adresse de la PAGE. Une seconde coquille dans un sous-dossier faisait donc
echouer `data/items.json` en 404, et les icones de sorts avec. `catalog-web`,
`spells-data`, `classes` et `icons` passent par `import.meta.url`. v1 en
profite : le meme piege l'attendait a la premiere page deplacee.

**La peremption** (`peremption.mjs`). Une recherche est longue ; ses resultats
restent a l'ecran pendant que le joueur continue de regler. On lisait des
degats a zero sur des stuffs cherches avant le premier sort, sans pouvoir
comprendre pourquoi. La signature ne retient que ce qui entre dans la requete
du solveur — le stuff porte en est exclu, puisque la recherche le pose
elle-meme.

## La dette d'habillage

`item-panel`, `hover-card`, `spell-picker` et `renderCandidats` se reutilisent
tels quels, mais leur habillage vit dans `styles.css`, que v2 ne charge pas.
Leurs regles sont donc ecrites DEUX FOIS : une fois avec les variables de v1,
une fois avec les jetons de v2, dans `coquille.css`.

C'est voulu pour l'instant, et ce n'est pas tenable longtemps. La sortie tient
en un geste : extraire ces composants de `styles.css` vers un
`web/composants.css` commun, que les deux coquilles chargent, chacune
definissant les memes variables depuis ses propres couleurs. A faire quand v2
sera complete — le faire maintenant deplacerait des regles de v1 sans que
personne ne regarde v1.
