# Architecture du simulateur

> Les décisions techniques, et ce qu'elles coûtent.

## Ce que l'application fait

On donne une puissance crête visée, un module, un onduleur et les
températures du site ; le moteur en déduit une architecture complète —
longueur de chaîne, nombre de chaînes, d'onduleurs, de transformateurs, de
cellules, de protections, de câbles — puis la fait vivre. On ouvre un
disjoncteur, on simule un défaut, et on voit ce qui tombe.

Trois vues : le **plan** (où sont les choses), le **schéma unifilaire**
(comment elles sont reliées), la **supervision** (ce qu'elles font). Trois
lectures : exploitation, ingénierie, chantier.

## Ce qu'elle ne fait pas

- **Elle ne remplace pas une étude d'exécution signée.** Les caractéristiques de
  matériel sont génériques et annoncées comme telles à l'écran.
- Pas de vue 3D, pas de trackers animés, pas de stockage batterie, pas de
  bibliothèque de modèles 3D fabricants. La place est faite — `photo`,
  `fiche`, `modele3d` existent sur chaque fiche du catalogue, vides — mais
  rien n'est implémenté.
- Pas d'ombrage géométrique calculé : l'ombrage est un taux qu'on impose,
  pas une ombre portée qu'on projette.

---

## Les décisions, et pourquoi

### 1. Le dépôt ne garde que ce qui sert au simulateur

Ce code est né dans [Solarys](https://github.com/wajdibennaya5-max/Solarys),
un site d'estimation photovoltaïque résidentielle, où le simulateur vivait à
côté du tunnel de contact, des pages marketing et de la lecture de facture
STEG. Rien de tout cela n'a suivi.

Les modules conservés sont **la fermeture transitive exacte** des dépendances
du simulateur et du dimensionnement photovoltaïque : vingt-quatre fichiers,
calculée plutôt que choisie à la main. Trente-deux autres sont restés —
contact, supervision du site, mise en page du rapport, intégration PVGIS.

Une conséquence qui dit bien ce que vaut le calcul : `prix.js`, qui formate
des dinars, n'est pas venu. Le simulateur a sa propre mise en forme dans
`symboles.js`, qui met une puissance à l'échelle de ce qu'elle vaut —
425 225 kW ne se lit pas, 425 MW se lit.

### 2. Quatre couches, et un test qui les tient

Les couches ne sont pas décrites, elles sont **vérifiées**
(`tests/architecture.test.js`). Un fichier non classé fait échouer la suite :
personne ne peut ajouter un module sans dire ce qu'il a le droit de faire.

| Rôle      | Couche           | Fichiers |
|-----------|------------------|----------|
| `model/`  | DOMAINE          | `modele.js`, `catalogue.js` |
| `engine/` | DOMAINE          | `topologie.js`, `generation.js`, `propagation.js`, `commandes.js`, `defauts.js` |
| —         | APPLICATION      | `simulateur.js` |
| `ui/`     | PRÉSENTATION     | `symboles.js`, `vue-plan.js`, `vue-schema.js`, `vue-scada.js`, `ecran.js` |
| `store/`  | INFRASTRUCTURE   | `stockage.js` |
| —         | CONTRÔLEUR       | `app.js` |

Tous les fichiers sont déclarés dans le test d'architecture, les dix modules
de calcul photovoltaïque compris.

### 3. `ecran.js` est en présentation, et il le reste

C'est le fichier qui assemble les vues et écoute les appuis. Il pourrait
prétendre au rang de contrôleur ; il ne l'est pas, pour deux raisons
vérifiables :

- **il ne cherche rien dans la page** — il construit son propre sous-arbre
  et garde la référence de ce qu'il a créé ;
- **il ne connaît ni le moteur ni le stockage** — `app.js` lui remet un
  simulateur déjà construit et la persistance sous forme de fonctions.

Il ne peut donc ni calculer une tension, ni écrire dans le navigateur. Il
ne peut que montrer et transmettre.

### 4. La topologie est un graphe, et les questions se posent au graphe

« Cet équipement est-il alimenté, isolé, en défaut ? » ne se répond jamais
par une règle écrite à l'avance. Une règle codée en dur devient fausse à la
première modification de l'architecture, et personne ne s'en aperçoit avant
de la croire.

Trois choix qui en découlent :

- **L'alimentation se propage dans les deux sens.** Un transformateur est
  sous tension par le réseau comme par les onduleurs. Ne suivre les
  liaisons que dans le sens de la production ferait croire qu'un poste
  consigné côté modules est hors tension. C'est l'erreur qui tue un
  intervenant.
- **Un équipement qui ne conduit pas reste alimenté d'un côté.** Un
  disjoncteur ouvert est sous tension en amont. Il est donc marqué
  alimenté, mais il ne transmet rien.
- **La terre n'est pas un chemin d'énergie.** Le conducteur de protection
  relie tout à tout : l'emprunter faisait passer la production d'un
  transformateur par le réseau de terre, et le poste d'arrivée affichait
  zéro mégawatt pendant que la centrale produisait à pleine charge. Le
  défaut a été trouvé par le contrôle d'ingénierie du module lui-même.

`enAval(id)` — ce qu'on perd en coupant — est la **différence entre deux
parcours**, l'un avec l'appareil conducteur, l'autre sans. Aucune liste
d'équipements « à couper avec » n'est tenue nulle part.

### 5. L'état commandé et l'état constaté sont deux choses

`status` porte ce qu'un opérateur ou un défaut a imposé — ouvert, consigné,
déclenché. La propagation y ajoute ce qu'elle observe — isolé, en attente,
en avertissement — et c'est le plus grave des deux qui s'affiche.

Sans cette séparation, un recalcul effacerait une consignation. Et la
consignation est précisément ce qu'on ne doit jamais perdre. Un test le
vérifie.

### 6. Couleur, icône et animation dérivent de l'état

Jamais l'inverse. `ETATS` porte, pour chaque état, sa couleur, son icône,
son animation **et** sa conduction. Les vues demandent l'apparence ; elles
ne la choisissent pas. C'est ce qui garantit qu'un disjoncteur déclenché
est rouge sur le plan, sur le schéma et dans la supervision.

Les couleurs sont des variables CSS (`--cen-*`), donc le thème sombre du
site s'applique au simulateur sans une ligne de plus.

### 7. L'agrégation est ce qui rend 500 MWc jouable

Un parc de 500 MWc compte près d'un million de modules. Les matérialiser un
par un remplirait la mémoire d'un téléphone avant d'avoir affiché quoi que
ce soit.

Le graphe porte donc des **nœuds agrégés qui connaissent leur effectif** :
un nœud `String` représente les trente chaînes d'un onduleur, une `Row` les
vingt rangées d'un bloc. `detailler()` descend au détail du nœud demandé,
et de lui seul. Un test vérifie qu'aucune chaîne ne se perd dans
l'agrégation — la somme des effectifs doit retomber sur le plan.

Résultat : **500 MWc tiennent en ~5 200 nœuds**, et un instantané
persistable pèse **environ un kilo-octet**, parce qu'on range les
paramètres et les écarts, jamais le graphe.

### 8. Trois mécanismes pour la fluidité, pas un

- **Niveaux de détail** : au dézoom, un bloc est un rectangle ; en
  approchant apparaissent les équipements, les rangées, les modules.
- **Virtualisation** : seul ce qui tombe dans la fenêtre visible est
  produit. Se déplacer ne coûte pas plus cher sur 500 MWc que sur 5.
- **Plafond dur** : au-delà de 1 200 formes on s'arrête, **et on l'écrit à
  l'écran**. Un écran qui rame sans explication passe pour cassé ; un écran
  qui annonce « 1 200 objets affichés, 3 400 hors champ » reste utilisable.

Une seule écoute d'événement sur la racine, et `closest()` retrouve la
cible : le coût ne dépend plus du nombre d'objets.

### 9. Les interverrouillages sont des données

Chaque règle est un objet avec une condition et un message. Ajouter une
règle, c'est ajouter une ligne au tableau — on ne réécrit pas la machine,
donc on ne casse pas les règles existantes en ajoutant la suivante.

**Un refus dit toujours pourquoi et quoi faire.** « Commande impossible »
n'apprend rien : l'opérateur réessaie, puis contourne. Chaque refus nomme
la condition non remplie, l'état actuel et l'état qu'il faudrait. Les refus
sont journalisés : c'est ce qu'on relit après coup.

### 10. Le catalogue refuse de prétendre

**Aucune fiche n'est une fiche constructeur.** Ce sont des classes de
matériel aux ordres de grandeur courants, et chacune porte
`verified: false`. Une fiche inventée sous un nom de marque est pire qu'une
absence de fiche : elle se recopie dans un dossier d'exécution, elle sert à
commander, et l'écart se découvre sur le chantier.

`verifierCatalogue()` refuse toute fiche déclarée vérifiée sans `source`, et
un test le vérifie. Les modules basse puissance viennent de `materiel.js`,
déjà utilisé par l'étude résidentielle : un seul catalogue de modules pour
tout le dépôt.

### 11. L'application s'installe, et marche sans réseau

Un simulateur qui exige une connexion pour s'ouvrir ne sert à rien sur un
chantier — et c'est précisément là qu'on s'en sert. Le service worker met donc
tout en cache à l'installation : page, modules, icônes, manifeste.

**La liste de pré-cache est vérifiée par un test** (`tests/pwa.test.js`). Une
liste tenue à la main finit toujours par oublier un fichier, et le défaut est
alors invisible : l'application marche en ligne, et s'ouvre cassée dans le
tunnel. Personne ne s'en aperçoit au moment de la modification. Le test
compare la liste aux fichiers réellement présents, dans les deux sens.

Le même test refuse tout script en ligne dans la page : il obligerait à
relâcher la politique de sécurité, qui n'a d'intérêt que stricte.

### 12. L'APK ne sert pas ses fichiers en `file://`

C'est le piège de tout portage d'application web en APK, et il ne se voit
qu'à l'exécution. Un module ES chargé depuis `file://` est refusé par la
politique d'origine du navigateur : la WebView afficherait une **page
blanche, sans message**, alors que le même dossier marche sur un serveur. Le
service worker, lui, est carrément interdit en `file://`.

`WebViewAssetLoader` sert les fichiers embarqués sous une véritable origine
`https://`. Les modules se chargent, le cache hors ligne s'installe, et le
stockage local devient persistant au lieu d'être attaché à une origine
opaque — sans quoi une consignation posée puis l'application fermée serait
perdue, ce que la persistance existe précisément pour éviter.

Le projet Gradle recopie lui-même l'application web dans ses assets : il n'y a
**qu'une seule source de vérité**, et pas de copie à tenir à jour. Voir
`docs/apk.md`.

---

## Les défauts que l'écriture de ce code a révélés

Tous ont été trouvés par les contrôles du module lui-même ou par les tests,
et tous sont corrigés :

| Défaut | Conséquence | Correction |
|---|---|---|
| La terre servait de chemin d'énergie | Le poste d'arrivée affichait 0 MW pendant que la centrale produisait | Les parcours de puissance ne suivent que les liaisons d'énergie |
| Le transit additionnait les deux côtés d'un nœud | Toute l'énergie comptée deux fois ; **tous** les disjoncteurs généraux hors calibre | Le transit se dépose le long des routes réellement conductrices |
| Sectionneur DC calibré sur une entrée MPPT | Calibre six fois trop petit, rejeté à chaque plan | Calibré sur toutes les chaînes de l'onduleur |
| Irradiance figée à 1 000 W/m² sur les chaînes | L'énergie du jour sortait au triple du réel — la centrale produisait à midi 24 h sur 24 | L'irradiance vient de l'ambiance et suit l'heure |
| Onduleur central : entrées comptées comme des entrées de chaîne | Taille admissible divisée par seize, dix fois trop d'onduleurs | Les entrées d'un central comptent des coffrets |
| Cellule de comptage sans liaison de terre | Masse MT non reliée | Liaison `pe` ajoutée |
| Chaînes réparties par division arrondie | La somme des effectifs ne retombait plus sur le plan | Répartition à reste courant, sans arrondi |
| `String`, `Row` et `Grid` sans commande `RESET` | Une chaîne en défaut ou un réseau perdu ne revenaient **jamais** en service | `RESET` ajouté ; `GRID_LOST` et `STOPPED` rendus réarmables |
| Recherche de route par onduleur | 372 ms par recalcul à 500 MWc — une demi-seconde d'écran figé par commande | Un seul arbre depuis le réseau : **34 ms** |
| Étiquettes du plan toujours écrites | 873 ko de balisage à 500 MWc, illisible et lent | Étiquettes conditionnées au nombre **et** à l'échelle |
| Onduleurs alignés sur une ligne | Les blocs débordaient sur leurs voisins, étiquettes superposées | Onduleurs en grille, pas des blocs calculé sur leur contenu |

## Performances mesurées

| Parc | Nœuds | Propagation | Instantané | Plan (défaut) |
|---|---|---|---|---|
| 5 MWc | 62 | 3 ms | ~1,0 ko | 5 ko |
| 100 MWc | 1 061 | 8 ms | ~1,0 ko | — |
| 500 MWc | 5 246 | **34 ms** | ~1,0 ko | 136 ko |

Montage de l'écran dans un navigateur, en portrait 390 × 844 : **~100 ms**.
Aucune cible tactile sous 44 px, aucun débordement horizontal.

## Ce qui reste à faire

- **Le projet Android n'a jamais été compilé sur la machine qui l'a écrit.**
  Son réseau bloque `dl.google.com` : ni le SDK Android ni le greffon Gradle
  n'y sont téléchargeables. Les scripts sont analysés sans erreur de syntaxe
  et le wrapper Gradle est vérifié de bout en bout, mais le premier passage de
  la chaîne GitHub Actions reste sa première compilation réelle.

- **Section de câble continu bornée par la chute de tension**, et pas
  seulement par le courant admissible. Aujourd'hui le câble est choisi sur
  l'intensité ; la chute est *contrôlée et affichée* en mode ingénierie,
  mais elle ne fait pas revenir le choix. Une chaîne de 120 m sur 4 mm²
  ressort à 1,7 % — conforme, mais juste.
- **Longueurs de câble forfaitaires en continu** (120 m). Les longueurs
  moyenne tension, elles, viennent des positions du plan.
- **Les cibles tactiles de 44 px se chevauchent** dans un plan dense : le
  symbole du dessus l'emporte. Zoomer sépare les cibles.
- Les vues hors v1 — 3D, trackers animés, stockage batterie, modèles
  fabricants — ont leur place dans le modèle mais rien derrière.

## Fichiers

```
js/
  app.js           le point d'entrée, seul à voir le document
  centrale/
    modele.js      états, liaisons typées, commandes, fabrique d'équipement
    catalogue.js   bibliothèque de composants, tous non vérifiés
    topologie.js   le graphe et les questions qu'on lui pose
    generation.js  dimensionnement automatique et construction du graphe
    propagation.js production, transit, états constatés, mode ingénierie
    commandes.js   interverrouillages et manœuvres
    defauts.js     quinze défauts, avec conséquence réelle
    simulateur.js  orchestration, énergie, historique, instantané
    symboles.js    couleurs, icônes, symboles de schéma, mises en forme
    vue-plan.js    plan, niveaux de détail, virtualisation
    vue-schema.js  schéma unifilaire d'un bloc
    vue-scada.js   supervision, panneau d'équipement, ingénierie, chantier
    ecran.js       assemblage et interactions
    stockage.js    l'instantané dans le navigateur
  etude.js · gisement.js · calepinage.js · technique.js · validation.js
  materiel.js · orientation.js · batiment.js · co2.js · finances.js
                   le dimensionnement photovoltaïque réutilisable

sw.js              le cache hors ligne — sa liste est vérifiée par un test
android/           l'enveloppe WebView qui produit l'APK (voir docs/apk.md)
tests/             198 tests, dont 80 pour le simulateur
```
