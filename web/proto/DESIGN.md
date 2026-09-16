# Refonte de l'interface — les decisions

Ce dossier porte des maquettes, pas du code de production. Elles ne touchent
ni `styles.css`, ni les themes, ni `layouts.mjs`.

- `studio.html` — la proposition retenue, version 2.
- `socle.css` — le systeme de design : couleur, typographie, rythme, controles.

Ouvrir : `http://localhost:4173/web/proto/studio.html`

---

## Le probleme que la mise en page ne corrige pas

Avant d'obtenir un seul resultat utile, l'ecran actuel demande de comprendre
**huit concepts inventes par l'outil** : le mode de recherche, les conditions
et leurs quatre champs, les sorts obligatoires, les pdv effectifs, le stuff de
reference a figer, les fils et l'intensite, les bannies / verrous / possedees,
et les paliers.

Un joueur de Dofus connait PA, PM et Vitalite. Il ne connait rien de cette
liste. Aucune disposition ne corrige cela.

> **L'ecran doit produire un resultat utile avec zero reglage, puis enseigner
> chaque concept au moment ou il devient utile.**

Choisir sa classe suffit. L'outil pose le niveau 190, les sorts d'attaque de
la classe, les planchers de PA et PM, et cherche. Un stuff apparait. Tout le
reste devient du raffinage, propose apres coup.

---

## Les six decisions de structure

### 1. Trois volets

La requete a gauche, le stuff au centre, le detail a droite. C'est le patron
de tout outil de metier, et il tient ici parce que les trois questions sont
distinctes : ce que je veux, ce que j'ai, ce que cela donne.

### 2. Les six blocs de chiffres deviennent un volet d'inspection

`Principales`, `Caracteristiques`, `Points`, `Secondaires`, `Dommages` et
`Resistances` repondaient tous a « detail de quoi ? ». La reponse depend de ce
qui est selectionne :

| Selection | Ce que le volet montre |
| --- | --- |
| rien | la fiche du personnage |
| une piece | ce que la piece pese et ce qu'elle donne |
| un stuff trouve | ce qui change face au stuff porte |
| le score | d'ou il vient, et ou investir |

Six sections deviennent une, et elle dit toujours quelque chose d'utile.

### 3. L'inspecteur ouvre huit lignes, pas trente-neuf

Un mur de chiffres ne se lit pas, il se subit. Huit mesures suffisent presque
toujours ; « Tout voir » donne le reste. Chaque ligne est cliquable : elle
pose une exigence a la valeur atteinte.

### 4. Le catalogue devient une palette

Chercher une piece est une tache ponctuelle, pas une reference constante :
cela ne merite pas un quart de l'ecran en permanence. `⌘K` l'ouvre, et les
trois blocs `Catalogue`, `Pieces bannies` et `Pieces possedees` disparaissent
au profit de trois bascules par piece.

### 5. La courbe vit sous le curseur

Le curseur mixte et la courbe degats / survie sont **deux vues du meme
reglage**. Separees par deux metres d'ecran, aucune des deux ne se comprenait.
Elles se touchent, et un clic sur la courbe deplace le curseur.

Le curseur ne montre pas son pourcentage : il montre ce qu'il coute et ce
qu'il rapporte. C'est cela que le joueur arbitre.

### 6. La comparaison n'est pas une page

Cocher un stuff trouve l'ouvre. Elle **masque les lignes identiques** : ce qui
ne change pas n'aide pas a choisir, et le compte des lignes masquees reste
visible pour qu'on puisse les rappeler.

Les minimums s'y lisent en valeur absolue — ce qui compte est s'ils sont
tenus — et le reste en ecart face au stuff porte.

---

## Le vocabulaire

C'est le gain le plus fort pour un debutant, et le moins couteux a livrer.

| Aujourd'hui | Propose |
| --- | --- |
| Mode de recherche | Ce que je veux |
| Degats / Endurance / Mixte | Frapper fort / Encaisser / Les deux |
| Caracteristiques (mode) | *(disparait : s'applique seul quand il n'y a pas de sorts)* |
| Conditions | Au minimum |
| Pdv effectifs | *(le nom reste ; la phrase manquait)* « Tu encaisses 9 245 degats bruts avant de tomber. » |
| Figer le stuff de reference | Mon stuff actuel |
| Paliers | *(disparait : c'est la courbe)* |
| Candidats / Autres builds | Les stuffs trouves |
| Simulations | Mes stuffs gardes |
| Bannir / Verrouiller / Posseder | Interdire / Toujours garder / Je l'ai deja |
| Fils / Intensite / Recommencer | *(disparaissent dans les reglages)* |

---

## Comment les blocs se lient

Le principe : **chaque nombre est une porte.**

- un chiffre de la fiche → « garde au moins ca » pose une exigence ;
- le score → « pourquoi ce chiffre ? » ouvre l'analyse ;
- une piece → l'inspecteur, avec interdire / toujours garder / je l'ai ;
- un stuff trouve → l'inspecteur montre ce qui change ;
- un point de la courbe → il se porte ;
- deux stuffs coches → la comparaison s'ouvre.

Un stuff trouve se lit comme une **difference**, jamais comme une fiche de
plus : ce qui change, ce que cela rapporte, ce que cela coute. Une ligne.

---

## Le bouton « Chercher »

Il reste. La recherche est longue et couteuse, elle se lance quand le joueur
le decide.

Ce qui change : il **dit que les reglages ont bouge** depuis la derniere fois.
Oublier de relancer apres un reglage etait la vraie gene, pas le clic — et
l'ecran n'en disait rien.

---

## Le systeme de design

**Couleur.** Fond bleu-noir `#0d1017`, surfaces `#141824` / `#1b2030`, filets
`#242a3a`. Neutres teintes vers l'iris : un gris pur se lit comme un defaut,
un gris legerement iris se lit comme un choix. Iris `#7f74ff`, jade `#3fcf8e`,
rose `#ff6b81`, ambre `#f0b429`.

**Typographie.** Pile systeme pour l'interface, mono tabulaire pour tout
chiffre : une colonne de nombres ne danse jamais d'une ligne a l'autre.

**Structure.** Barre de 44 px, filets d'un pixel, rythme de 8 px. Aucune carte
bordee : l'elevation et le blanc separent.

**Controles.** Segmentes plutot que menus deroulants — un menu cache ses
options et coute deux clics. Lignes a survol plutot que boites. Chips
modifiables.

**La couleur ne porte jamais seule.** Une exigence en defaut porte un halo en
plus du rose ; une piece neuve porte un lisere en plus de l'ambre.

---

## Ce qui reste a decider avant de construire

1. **Les points de caracteristique** n'ont pas encore de place. Ils sont
   experts et lourds ; probablement une feuille depuis la section
   « Caracteristiques » de l'inspecteur.
2. **Les options** — une vingtaine de cases — vont dans les reglages, sauf les
   deux ou trois qui changent vraiment le resultat. Lesquelles ?
3. **La palette de pieces** n'est pas maquettee.
4. **Le mobile** n'est pas traite au-dela de l'empilement des volets.
