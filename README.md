# The Best Roxxeur

Optimiseur de stuff pour Dofus. Il cherche, par algorithme genetique, le meilleur
equipement pour un personnage : celui qui frappe le plus fort, ou celui qui tient
le plus longtemps, sous les conditions que le joueur pose.

Le projet ne demande aucun compte et ne parle a aucun serveur. Tout le calcul
tourne dans le navigateur. Les donnees du joueur vivent dans son navigateur, et
un fichier de profil les emporte ailleurs.

## Lancer le projet

```sh
npm run serve     # ouvre http://localhost:4173/web/index.html
npm test          # lance les tests (node:test, aucune dependance)
npm run bench     # mesure la convergence du solveur
npm run bench:gate  # le meme banc, en garde-fou : il echoue si le score baisse
```

Node 22 ou plus recent est necessaire. Le projet n'a aucune dependance de
production ni de developpement.

## Les formules qui portent tout

### 1. Les degats d'un coup

`src/engine/damage.mjs` suit l'ordre du jeu, avec ses arrondis :

```
h = floor(base * (100 + caracteristique + puissance) / 100 + degats_fixes)
h = floor(h * facteur_sorts_ou_armes * facteur_melee_ou_distance * facteur_finaux)
```

Les trois familles de pourcentages composent un seul produit, arrondi une seule
fois. Cet ordre vient du calcul de reference de RoxxSolver ; il est verifie a
l'unite pres sur un build reel (voir `test/parity.test.mjs`).

### 2. Les points de vie effectifs

`src/engine/defense.mjs` mesure ce qu'un build encaisse vraiment. Une resistance
fixe s'enleve d'abord, un pourcentage s'applique ensuite :

```
subi(element) = max(0, coup - res_fixe) * (1 - min(plafond, res_pct) / 100)
reduction     = moyenne des cinq elements / coup
reduction    *= 1 - (res_melee + res_distance) / 200
pdv_effectifs = pdv / reduction
```

Le coup de reference vaut 300 par defaut et le plafond de resistance 50 %. Le
joueur change les deux dans les reglages, groupe « Defense ». Ce modele
d'adversaire voyage dans `objective.menace` : le solveur, la fiche de personnage
et la courbe lisent tous la meme valeur.

### 3. Le score, en ordre lexicographique

`src/solver/score.mjs` classe deux builds en une seule valeur :

```
score = conditions_tenues ? mesure : -penalite
```

Un build qui manque une condition passe donc TOUJOURS sous un build qui les
tient toutes, quelle que soit sa mesure. La `mesure` depend du mode :

| Mode | Mesure maximisee | Condition possible sur |
|---|---|---|
| `DAMAGE` | les degats totaux | les pdv effectifs |
| `ENDURANCE` | les pdv effectifs | les degats totaux |
| `MIXTE` | les deux, dans la proportion reglee | les deux |
| `STATS` | la somme ponderee des conditions | — |

Les modes `DAMAGE` et `ENDURANCE` sont symetriques : `src/solver/survie.mjs`
tranche l'un des deux axes et maximise l'autre, ce qui donne la courbe
« Degats ou survie ».

### 4. Le score mixte

Le mode `MIXTE` compose les deux mesures en une moyenne geometrique ponderee,
reglee par la part des degats `a` entre zero et un :

```
score = degats^a * pdvEffectifs^(1 - a)
```

Cette forme, et pas une somme ponderee, pour trois raisons :

1. **Les bornes sont les deux modes purs.** `a = 1` rend exactement le mode
   degats, `a = 0` exactement le mode endurance. Le mixte est le cas general.
2. **Aucune echelle a regler.** Multiplier une mesure par une constante
   multiplie tous les scores par la meme constante : le classement ne bouge
   pas. Une somme ponderee, elle, exige de regler un taux entre deux mesures
   qui n'ont ni la meme unite ni le meme ordre de grandeur.
3. **Le poids agit sur des pourcentages.** A parts egales, le solveur lache un
   pour cent de degats pour gagner un pour cent d'endurance. La pente vaut
   `a / (1 - a)`, montree au joueur sous le curseur.

A parts egales, le carre du score vaut `degats x pdvEffectifs` : divise par le
coup de reference, c'est le nombre de tours tenus multiplie par les degats par
tour, donc les degats infliges avant de tomber.

Le mode mixte ne change pas la courbe « Degats ou survie » : elle montre deja
tous les compromis tenables, et le curseur ne fait que designer un point
dessus. Le panneau le marque « votre reglage ».

## Architecture

```
src/data/     Catalogue : items, panoplies, sorts, effets, criteres d'equipement
src/engine/   Moteur pur : agregation d'un build, degats, defense
src/solver/   Recherche : genetique, descente locale, proximite, survie
web/          Interface : un module par panneau, aucun cadre applicatif
scripts/      Serveur local, bancs, ingestion des donnees
test/         Tests node:test, un fichier par sujet
data/         JSON ingeres depuis les sources du jeu
```

Deux regles tiennent le decoupage :

1. **`src/` ne connait pas le navigateur.** Le moteur et le solveur tournent
   aussi bien dans Node que dans un fil de calcul.
2. **Chaque panneau separe le calcul du rendu.** Une fonction pure rend les
   lignes a montrer, une fonction de rendu les pose dans le document. La
   fonction pure porte les tests ; voir `web/objectifs-panel.mjs` et
   `web/survie-panel.mjs` pour le patron.
3. **`web/app.mjs` ne fait qu'orchestrer.** Il garde l'etat, tient son
   historique pour l'annulation, et appelle le rendu. Tout le reste part en
   modules qu'il branche a la main : `gestes-catalogue.mjs` et
   `gestes-reference.mjs` changent l'etat, `resultats-panel.mjs` montre ce que
   la recherche a rendu, `branchements.mjs` relie les commandes de la page.

### L'ecran

Un **theme** habille l'ecran, une **disposition** en deplace les parties ; les
deux se combinent librement et se choisissent dans la barre du haut.

| Disposition | Ce qu'elle fait |
| --- | --- |
| Colonnes | Quatre colonnes, la disposition d'origine. |
| Bandeau | Le resultat en tete sur toute la largeur, les colonnes dessous. |

Une disposition ne recree jamais une section : elle deplace les noeuds
existants, donc les ecouteurs, les canvas et les champs la suivent. Pour en
ajouter une, il suffit d'un plan dans `web/layouts.mjs` et d'une feuille dans
`web/dispositions/` ; `test/dispositions.test.mjs` verifie que la feuille
existe.

## Les donnees

`data/` porte les JSON ingeres depuis les sources du jeu. Les scripts
`npm run data:items`, `data:sets`, `data:effects` les reconstruisent.
`data/raw/` garde les sources brutes : ne le modifiez jamais a la main.

## Le profil du joueur

Tout vit dans `localStorage`, sous des cles prefixees `copyroxx_`. Trois choses
le font disparaitre : un nettoyage des donnees de navigation, la navigation
privee, et le passage a une autre machine. Le menu « Profil » de la barre
exporte tout dans un fichier et le repose ailleurs : c'est la seule sauvegarde
qui survive au navigateur.

**ATTENTION :** le rangement suit l'origine, pas l'onglet. Deux onglets ouverts
sur la meme adresse partagent donc leurs cles, et une recherche lancee dans l'un
remplace le build porte dans l'autre. Ajoutez `?test=1` a l'adresse pour tourner
sur un jeu de cles separe.

## Conventions

- Le code ne porte pas d'accents ; les textes montres au joueur en portent.
- Les commentaires disent POURQUOI, jamais QUOI.
- Les objets ne se modifient pas en place : chaque changement rend une copie.
- Un fichier depasse rarement 400 lignes, jamais 800.
