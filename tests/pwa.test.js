import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'APPLICATION S'INSTALLE, ET ELLE MARCHE SANS RÉSEAU.
 *
 * Ces deux promesses tiennent à des listes tenues à la main : la liste de
 * pré-cache du service worker, et les icônes du manifeste. Une liste tenue à
 * la main finit toujours par oublier un fichier — et le défaut est alors
 * invisible : l'application marche en ligne, et s'ouvre cassée dans le
 * tunnel. Personne ne s'en aperçoit au moment de la modification.
 *
 * D'où ces tests. Ils ne vérifient pas que le cache fonctionne — cela
 * demanderait un navigateur — mais que rien n'a été oublié, ce qui est le
 * seul défaut qu'on commette réellement.
 */

const RACINE = new URL('../', import.meta.url).pathname;
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

/** Tous les modules, sous-dossiers compris. */
function modules(prefixe = 'js') {
  return readdirSync(join(RACINE, prefixe), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? modules(join(prefixe, e.name))
      : (e.name.endsWith('.js') ? [join(prefixe, e.name)] : [])));
}

/** Les chemins listés dans la coquille du service worker. */
function coquille() {
  const code = lire('sw.js');
  const bloc = code.slice(code.indexOf('const COQUILLE = ['), code.indexOf('];'));
  return [...bloc.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1].replace(/^\.\//, ''));
}

test('LE SERVICE WORKER MET EN CACHE TOUS LES MODULES', () => {
  const listes = coquille();
  for (const f of modules()) {
    assert.ok(listes.includes(f),
      `${f} manque dans la coquille de sw.js : l’application s’ouvrira cassée hors ligne`);
  }
});

test('la coquille ne cite aucun fichier absent', () => {
  for (const chemin of coquille()) {
    if (chemin === '') continue; // « ./ », la racine servie par l'hébergeur
    assert.ok(existsSync(join(RACINE, chemin)),
      `sw.js met en cache ${chemin}, qui n’existe pas : l’installation échouera en entier`);
  }
});

test('la page et le manifeste sont dans la coquille', () => {
  const listes = coquille();
  for (const f of ['index.html', 'manifest.webmanifest']) {
    assert.ok(listes.includes(f), `${f} doit être mis en cache`);
  }
});

test('le manifeste est un JSON valide et complet', () => {
  const m = JSON.parse(lire('manifest.webmanifest'));
  for (const champ of ['name', 'short_name', 'start_url', 'scope', 'display',
    'background_color', 'theme_color', 'icons']) {
    assert.ok(m[champ], `le manifeste n’a pas de ${champ}`);
  }
  assert.equal(m.display, 'standalone',
    'sans « standalone », l’application garde la barre d’adresse et n’a plus l’air installée');
  // Chrome refuse l'installation sans une icône de 192 et une de 512.
  const tailles = m.icons.map((i) => i.sizes);
  assert.ok(tailles.includes('192x192'), 'icône 192 manquante : Chrome refusera l’installation');
  assert.ok(tailles.includes('512x512'), 'icône 512 manquante : Chrome refusera l’installation');
  // Sans icône « maskable », Android rogne les angles sur l'écran d'accueil.
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'icône maskable manquante');
});

test('chaque icône déclarée existe vraiment', () => {
  const m = JSON.parse(lire('manifest.webmanifest'));
  for (const icone of m.icons) {
    const chemin = icone.src.replace(/^\.\//, '');
    assert.ok(existsSync(join(RACINE, chemin)), `icône déclarée mais absente : ${chemin}`);
    assert.ok(coquille().includes(chemin), `icône hors cache : ${chemin}`);
  }
});

test('la page déclare le manifeste et charge le contrôleur', () => {
  const html = lire('index.html');
  assert.match(html, /rel="manifest"/, 'sans balise manifest, rien ne s’installe');
  assert.match(html, /<script type="module" src="\.\/js\/app\.js">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /name="theme-color"/);
});

test('AUCUN SCRIPT EN LIGNE : la politique de sécurité doit pouvoir rester stricte', () => {
  const html = lire('index.html');
  // Un `<script>` sans `src` serait un script en ligne, et forcerait à
  // autoriser `unsafe-inline` — ce qui vide la politique de son intérêt.
  const enLigne = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
  assert.deepEqual(enLigne.map((m) => m[0]), [],
    'un script en ligne obligerait à relâcher la politique de sécurité');
  assert.match(html, /Content-Security-Policy/);
  assert.ok(!/onclick=|onload=/i.test(html),
    'un gestionnaire en attribut est un script en ligne déguisé');
});

test('la version du cache est nommée, pour que la mise à jour prenne', () => {
  const code = lire('sw.js');
  const m = code.match(/const VERSION = '([^']+)'/);
  assert.ok(m, 'sans version nommée, un navigateur garde l’ancienne application pour toujours');
  assert.ok(m[1].length > 3);
});
