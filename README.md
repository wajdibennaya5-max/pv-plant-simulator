# Simulateur de centrale photovoltaïque

Donnez une puissance crête visée : le moteur en déduit une architecture
complète — longueur de chaîne, onduleurs, transformateurs, cellules,
protections, câbles — puis la fait vivre. Ouvrez un disjoncteur, simulez un
défaut, et regardez ce qui tombe.

**Aucune dépendance, aucune étape de construction.** Des modules JavaScript
natifs servis tels quels. L'application s'installe sur un téléphone et
fonctionne **sans réseau**.

## Le parti pris

**La topologie est un graphe, et les questions se posent au graphe.**
« Cet équipement est-il alimenté, isolé, en défaut ? » ne se répond jamais par
une règle écrite à l'avance. Une règle codée en dur devient fausse à la
première modification de l'architecture, et personne ne s'en aperçoit avant de
la croire.

Trois conséquences, et elles ne sont pas théoriques :

- **L'alimentation se propage dans les deux sens.** Un transformateur est sous
  tension par le réseau comme par les onduleurs. Ne suivre les liaisons que
  dans le sens de la production ferait croire qu'un poste consigné côté
  modules est hors tension. C'est l'erreur qui tue un intervenant.
- **Un appareil ouvert reste sous tension en amont.** Il est donc marqué
  alimenté, mais il ne transmet rien.
- **La terre n'achemine pas d'énergie.** Le conducteur de protection relie
  tout à tout ; l'emprunter faisait passer la production d'un transformateur
  par le réseau de terre.

**Aucune fiche constructeur n'est inventée.** Tout le catalogue porte
`verified: false` et s'affiche comme générique. Une fiche inventée sous un nom
de marque se recopie dans un dossier d'exécution, sert à commander, et l'écart
se découvre sur le chantier. Un test refuse toute fiche déclarée vérifiée sans
source.

## Ce que l'outil ne fait pas

- **Il ne remplace pas une étude d'exécution signée.**
- Pas de vue 3D, pas de trackers animés, pas de stockage batterie. La place
  est faite dans le modèle — `photo`, `fiche`, `modele3d` existent sur chaque
  composant, vides — mais rien n'est implémenté derrière.
- L'ombrage est un taux qu'on impose, pas une ombre portée qu'on projette.

## Les trois vues

| Vue | La question à laquelle elle répond |
|---|---|
| **Plan** | Où sont les choses — avec niveaux de détail et virtualisation |
| **Schéma unifilaire** | Comment elles sont reliées, et où le courant s'arrête |
| **Supervision** | Ce qu'elles font — puissance, énergie, alarmes, historique |

Et trois lectures : **exploitation**, **ingénierie** (sections, chutes de
tension, pertes, protections, mise à la terre), **chantier** (installé,
manquant, contrôlé, en défaut).

## Structure

```
index.html              la page, entière
manifest.webmanifest    ce qui rend l'application installable
sw.js                   le cache hors ligne
js/app.js               le point d'entrée, seul à voir le document
js/centrale/            le simulateur : modèle, moteur, vues, stockage
js/                     le dimensionnement photovoltaïque réutilisable
android/                l'enveloppe WebView qui produit l'APK
tests/                  198 tests
```

Les couches sont **vérifiées par un test**, pas seulement décrites : le calcul
ne peut pas toucher à la page, la présentation ne peut pas calculer, et un
fichier non classé fait échouer la suite. Voir `docs/architecture.md`.

## Démarrer

```bash
npm start   # http://localhost:8080
npm test    # 198 tests, sans navigateur
```

Aucune dépendance à installer.

## Télécharger l'APK

**[app-debug.apk](https://github.com/wajdibennaya5-max/pv-plant-simulator/releases/download/dernier/app-debug.apk)** —
reconstruit à chaque modification de `main`, l'adresse ne bouge pas.

Ouvrez-le sur le téléphone ; Android demandera d'autoriser l'installation
depuis cette source, ce qui est normal pour un fichier qui ne vient pas du
Play Store. Cet APK porte `android:debuggable` : bon pour essayer et pour un
usage interne, pas pour une distribution large. Pour une version signée par
vos soins, voir `docs/apk.md`.

## Installer sur un téléphone

**Sans APK** — ouvrez le site dans Chrome, menu → « Ajouter à l'écran
d'accueil ». Icône, plein écran, et l'application fonctionne hors connexion.
C'est le chemin le plus court, et il suffit dans la plupart des cas.

**Avec APK** — voir `docs/apk.md`. La chaîne GitHub Actions construit l'APK à
chaque envoi sur `main` ; on le télécharge depuis l'onglet **Actions**.

## Performances

| Parc | Nœuds | Propagation | Instantané |
|---|---|---|---|
| 5 MWc | 62 | 3 ms | ~1 ko |
| 100 MWc | 1 061 | 8 ms | ~1 ko |
| 500 MWc | 5 246 | 34 ms | ~1 ko |

Un parc de 500 MWc compte près d'un million de modules. Le graphe porte des
nœuds **agrégés qui connaissent leur effectif**, et l'on descend au détail du
nœud demandé, et de lui seul. C'est ce qui rend un demi-gigawatt jouable sur
un téléphone.

## Origine

Extrait du dépôt [Solarys](https://github.com/wajdibennaya5-max/Solarys), où
le simulateur vivait à côté de l'estimation résidentielle. Ce dépôt ne garde
que le simulateur et les modules de calcul dont il dépend.
