# L'APK Android

> Ce que la chaîne produit, comment la récupérer, et ce qu'elle ne fait pas.

## D'abord : avez-vous besoin d'un APK ?

Probablement pas. L'application est une **PWA** : ouverte dans Chrome sur
Android, menu → « Ajouter à l'écran d'accueil », elle s'installe avec son
icône, s'ouvre en plein écran sans barre d'adresse, et **fonctionne hors
connexion**. C'est une seule manipulation, rien à signer, rien à distribuer,
et la mise à jour est automatique.

L'APK n'apporte en plus que deux choses : l'installation par fichier (sans
passer par un navigateur) et la possibilité d'une publication sur le Play
Store.

## Récupérer l'APK

La chaîne `.github/workflows/apk.yml` le construit à chaque envoi sur `main`.

1. Onglet **Actions** du dépôt → dernier passage du workflow **APK** ;
2. section **Artifacts** en bas → `centrale-pv-debug-apk` ;
3. décompressez, transférez le `.apk` sur le téléphone, ouvrez-le.

Android demandera d'autoriser l'installation depuis cette source. C'est normal
pour un fichier qui ne vient pas du Play Store.

Sur une **étiquette de version** (`git tag v1.0.0 && git push --tags`), l'APK
est en plus attaché à la page *Releases*, ce qui donne un lien de
téléchargement direct.

## Ce qu'est l'APK de développement

C'est un `assembleDebug` : installable immédiatement, signé avec la clé de
développement d'Android. **Il porte `android:debuggable`**, ce qui convient
pour essayer et pour un usage interne, mais pas pour une distribution large —
un appareil branché en USB peut inspecter son contenu.

Pour une vraie publication, il faut une clé à vous.

## Signer une version de publication

La clé **n'est pas dans le dépôt, et ne doit jamais y être** : une clé
versionnée est une clé perdue, et quiconque lit le dépôt peut alors publier
une mise à jour de votre application.

Créez-la une fois, gardez-la :

```bash
keytool -genkeypair -v -keystore centrale.jks \
  -keyalg RSA -keysize 4096 -validity 10000 -alias centrale
```

> **Conservez ce fichier et son mot de passe.** Le Play Store refuse toute
> mise à jour signée par une autre clé. La perdre, c'est republier
> l'application sous une nouvelle identité et perdre les installations.

Puis, dans **Settings → Secrets and variables → Actions** du dépôt :

| Secret | Contenu |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 centrale.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | le mot de passe du magasin |
| `ANDROID_KEY_ALIAS` | `centrale` |
| `ANDROID_KEY_PASSWORD` | le mot de passe de la clé |

Dès que `ANDROID_KEYSTORE_BASE64` existe, la chaîne produit **en plus** un
`centrale-pv-release-apk` signé. Sans lui, ces étapes sont sautées et l'APK de
développement reste disponible : il n'y a rien à changer dans le workflow.

## Comment c'est construit

L'APK est une **WebView** autour des fichiers de l'application. Le projet
Gradle recopie lui-même `index.html`, `js/` et `icons/` dans ses assets
(tâche `copierApplicationWeb`), de sorte qu'il n'existe **qu'une seule source
de vérité** : modifier l'application web suffit, il n'y a pas de copie à tenir
à jour dans `android/`.

### Le piège qui coûte une journée

Les fichiers ne sont **pas** servis en `file://`, et c'est délibéré.

Un module ES chargé depuis `file://` est refusé par la politique d'origine du
navigateur. Une WebView pointée sur `file:///android_asset/www/index.html`
afficherait donc une **page blanche, sans message**, alors que le même dossier
marche parfaitement sur un serveur. Le service worker, lui, est carrément
interdit en `file://`.

`WebViewAssetLoader` sert les fichiers embarqués sous une véritable origine
`https://appassets.androidplatform.net`. Les modules se chargent, le cache
hors ligne s'installe, et le stockage local devient persistant au lieu d'être
attaché à une origine opaque — sans quoi une consignation posée puis
l'application fermée serait perdue.

## Construire en local

Il faut le SDK Android (`ANDROID_HOME`) et un JDK 17 :

```bash
cd android
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

## Limites connues

- **Le projet Android n'a pas été compilé sur la machine qui l'a écrit** : son
  réseau bloque `dl.google.com`, donc ni le SDK ni le greffon Gradle n'y sont
  téléchargeables. Le premier passage de la chaîne GitHub Actions est donc sa
  première compilation réelle. Les scripts sont analysés sans erreur de
  syntaxe et le wrapper Gradle est vérifié, mais ce n'est pas la même chose
  qu'un APK produit.
- Pas d'icône adaptative Android (`mipmap-anydpi-v26`) : l'icône est une image
  simple, qu'Android rognera selon le lanceur.
- Pas de mise à jour dans l'application : on réinstalle l'APK. La PWA, elle,
  se met à jour toute seule.
