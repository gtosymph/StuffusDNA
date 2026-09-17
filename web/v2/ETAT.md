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
- La comparaison : cocher des stuffs dans les TROIS listes — trouves, paliers
  d'achat, essais gardes — et les mettre cote a cote.
- Les essais gardes : garder, renommer, mettre en favori, reposer, figer.
- Le combo de sorts et la carte de l'arme portee, sous les degats.
- Les reglages du moteur : fils, intensite, et « Recommencer ».
- Regler ses minimums : objectif, poids, maximum, absolu.
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

Elle est resorbee pour l'essentiel. `web/composants.css` tient desormais, une
seule fois, les sept familles dessinees par des modules partages : la fiche
d'une piece et son infobulle, le choix des sorts, les stuffs trouves, les
paliers de « proche de mon stuff », les panoplies, l'analyse du stuff et les
essais gardes. Les deux coquilles la chargent AVANT leur propre feuille,
donc chacune peut encore la corriger sans lutte de specificite.

Elle ne connait que des jetons — `--surface-2`, `--filet`, `--jade`,
`--mono` — jamais une couleur en dur. v2 les definit dans `socle.css` ; v1
les aliase sur sa propre palette dans `styles.css`, si bien que ses themes
continuent de les teindre sans rien savoir du fichier partage. `styles.css` y
a perdu cent soixante-seize regles redondantes.

Ce qui reste : les familles a moins de sept dixiemes de partage — la feuille
des points, celle des minimums, le profil. Leurs regles communes valent moins
que le risque de deplacer de l'habillage de v1 avant la bascule.

## Ce qui survit a un rechargement

L'etat range porte desormais les PROPOSITIONS du solveur — `candidats`,
`paliers`, `survie` — bornees a quarante par liste. Leur absence se lisait
comme une perte de tout le travail : le joueur revenait, retrouvait son stuff,
ses sorts et ses interdictions, mais plus une seule des propositions qu'il
comparait, ni la courbe du compromis, qui n'est faite que de ces paliers.

Corollaire : une recherche qui continue n'efface plus ces listes au depart.
Elle ne les jette que si elle repart de zero — ce que « Chercher » fait
maintenant tout seul quand les reglages ont bouge depuis le dernier
lancement, parce qu'une population porte les reponses a la question qu'on lui
a posee.

## Les habillages de v2

`web/v2/themes/` en porte quatre, et `catalogue-themes.mjs` les decrit sans
rien importer : cle, feuille, apercu de trois couleurs, phrase. Le choix vit
dans la feuille des reglages, sous forme de cartes qui posent l'habillage au
survol — un nom ne montre pas un habillage, et l'essayer un par un coutait
cinq allers-retours.

La cle de rangement differe de celle de v1 : « braise » n'existe pas dans sa
liste, et une cle commune ferait retomber v1 sur son habillage de depart des
que v2 aurait ecrit le sien.
