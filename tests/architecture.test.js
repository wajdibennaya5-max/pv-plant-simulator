import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES RÈGLES D'ARCHITECTURE, VÉRIFIÉES PLUTÔT QU'ÉCRITES.
 *
 * Une architecture décrite dans un document se dégrade au premier ajout
 * pressé. Celles-ci sont tenues par des tests : la couche de calcul ne peut
 * plus toucher à la page, et la couche de présentation ne peut plus calculer.
 *
 * C'est cette séparation qui rend les tests possibles sans navigateur : on
 * joue une séquence d'exploitation entière — ouvrir, consigner, injecter un
 * défaut, réparer, réarmer — en important un module et en l'appelant.
 */

const RACINE = new URL('../js/', import.meta.url).pathname;
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

/** Tous les modules, sous-dossiers compris. */
function modules(prefixe = '') {
  return readdirSync(join(RACINE, prefixe), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? modules(join(prefixe, e.name))
      : (e.name.endsWith('.js') ? [join(prefixe, e.name)] : [])));
}
const tous = modules();

/** DOMAINE : le calcul. Ne connaît ni la page, ni le stockage, ni le réseau. */
export const DOMAINE = [
  // Le dimensionnement photovoltaïque réutilisable.
  'etude.js', 'gisement.js', 'calepinage.js', 'technique.js', 'validation.js',
  'materiel.js', 'orientation.js', 'batiment.js', 'co2.js', 'finances.js',
  // LE SIMULATEUR DE CENTRALE — modèle et moteur. `modele` et `catalogue`
  // sont des données pures ; les cinq autres transforment un graphe en
  // réponses. Aucun ne connaît la page.
  'centrale/modele.js', 'centrale/catalogue.js', 'centrale/topologie.js',
  'centrale/generation.js', 'centrale/propagation.js', 'centrale/commandes.js',
  'centrale/defauts.js',
];

/** APPLICATION : orchestre le domaine. Ne dessine rien. */
const APPLICATION = ['centrale/simulateur.js'];

/** PRÉSENTATION : met en forme. Ne décide de rien. */
const PRESENTATION = ['centrale/symboles.js', 'centrale/vue-plan.js',
  'centrale/vue-schema.js', 'centrale/vue-scada.js', 'centrale/ecran.js'];

/** INFRASTRUCTURE : le monde extérieur. Ici, le stockage du navigateur. */
const INFRASTRUCTURE = ['centrale/stockage.js'];

/** CONTRÔLEUR : le seul à toucher au document. */
const CONTROLEUR = ['app.js'];

const CLASSES = { DOMAINE, APPLICATION, PRESENTATION, INFRASTRUCTURE, CONTROLEUR };

test('chaque fichier appartient à exactement une couche', () => {
  // Un fichier non classé est un fichier dont personne ne sait ce qu'il a le
  // droit de faire.
  const classes = Object.values(CLASSES).flat();
  for (const f of tous) {
    const n = classes.filter((c) => c === f).length;
    assert.equal(n, 1, `${f} : classé ${n} fois au lieu d’une`);
  }
  for (const f of classes) {
    assert.ok(tous.includes(f), `${f} est classé mais n’existe pas`);
  }
});

test('LE DOMAINE NE TOUCHE JAMAIS À LA PAGE', () => {
  const interdits = [/\bdocument\./, /\bwindow\./, /\.innerHTML\b/, /localStorage/,
    /getElementById/, /addEventListener/, /requestAnimationFrame/, /\bfetch\(/];
  for (const f of [...DOMAINE, ...APPLICATION]) {
    const code = lire(f);
    for (const motif of interdits) {
      const ligne = code.split('\n').findIndex((l) => motif.test(l) && !l.trim().startsWith('*')
        && !l.trim().startsWith('//'));
      assert.equal(ligne, -1,
        `${f}:${ligne + 1} — le calcul touche à la page : ${motif}`);
    }
  }
});

test('le domaine n’importe jamais la présentation ni l’infrastructure', () => {
  // Un calcul qui dépend d'un graphique ne peut plus servir au rapport, ni au
  // serveur, ni à un test.
  for (const f of DOMAINE) {
    const code = lire(f);
    for (const interdit of [...PRESENTATION, ...INFRASTRUCTURE, ...APPLICATION, ...CONTROLEUR]) {
      const nom = interdit.split('/').pop();
      assert.ok(!new RegExp(`from\\s+['"][./]*(?:centrale/)?${nom.replace('.', '\\.')}['"]`)
        .test(code),
      `${f} importe ${interdit} : le calcul dépend d’une couche supérieure`);
    }
  }
});

test('la présentation ne calcule pas : elle reçoit des résultats', () => {
  // Les vues reçoivent un état déjà calculé. Si elles pouvaient appeler le
  // moteur, deux chemins produiraient deux chiffres, et ils divergeraient.
  //
  // `modele.js` et `symboles.js` échappent à l'interdit, et c'est voulu : le
  // premier est un catalogue d'états et de constantes, le second de la mise
  // en forme. Ni l'un ni l'autre ne décide quoi que ce soit.
  const moteurs = [...DOMAINE.filter((f) => f !== 'centrale/modele.js'), ...APPLICATION];
  for (const f of PRESENTATION) {
    const code = lire(f);
    for (const m of moteurs) {
      const nom = m.split('/').pop();
      assert.ok(!new RegExp(`from\\s+['"][./]*(?:centrale/)?${nom.replace('.', '\\.')}['"]`)
        .test(code),
      `${f} importe ${m} : la présentation se met à calculer`);
    }
  }
});

test('personne n’importe le contrôleur', () => {
  // `app.js` est le point d'entrée. Un module qui l'importerait créerait un
  // cycle et rendrait l'ordre de chargement imprévisible.
  for (const f of tous.filter((x) => x !== 'app.js')) {
    assert.ok(!lire(f).includes("'./app.js'"), `${f} importe le contrôleur`);
  }
});

test('le contrôleur est le seul à interroger le document', () => {
  // `ecran.js` assemble les vues et écoute les appuis, mais il ne CHERCHE
  // rien : il construit son propre sous-arbre et en garde la référence.
  for (const f of tous) {
    if (CONTROLEUR.includes(f)) continue;
    assert.ok(!/getElementById|querySelector/.test(lire(f)),
      `${f} interroge le document : cela revient au contrôleur`);
  }
});

test('l’écran ne connaît ni le moteur ni le stockage', () => {
  // C'est ce qui le maintient en présentation malgré ses écoutes : le
  // simulateur et la persistance lui sont REMIS par le contrôleur. Il ne peut
  // donc ni calculer une tension, ni écrire dans le navigateur.
  const code = lire('centrale/ecran.js');
  for (const interdit of [...INFRASTRUCTURE, ...APPLICATION]) {
    const nom = interdit.split('/').pop();
    assert.ok(!code.includes(`./${nom}`),
      `ecran.js importe ${interdit} : il doit le recevoir, pas aller le chercher`);
  }
});

test('aucun import ne pointe hors du projet', () => {
  // Pas de dépendance externe : l'application doit fonctionner sans réseau
  // une fois chargée, et sans chaîne d'approvisionnement à surveiller.
  for (const f of tous) {
    for (const m of lire(f).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(m[1].startsWith('./') || m[1].startsWith('../'),
        `${f} importe ${m[1]} depuis l’extérieur`);
    }
  }
});

test('chaque module exporte quelque chose et porte un en-tête', () => {
  for (const f of tous) {
    const code = lire(f);
    // Le contrôleur n'exporte rien : il est le point d'entrée, et rien ne
    // doit pouvoir l'importer. C'est la règle vérifiée juste au-dessus.
    if (!CONTROLEUR.includes(f)) {
      assert.ok(/^export /m.test(code), `${f} n’exporte rien`);
    }
    assert.ok(code.trimStart().startsWith('/**'),
      `${f} ne commence pas par un en-tête expliquant ce qu’il fait`);
  }
});

test('les hypothèses de calcul restent groupées, jamais dispersées', () => {
  // Une constante économique qui apparaît dans deux fichiers finit par
  // diverger.
  const chiffres = ['coutParKwc', 'hausseElectricite', 'valeurSurplus', 'degradation'];
  const proprietaires = ['etude.js', 'finances.js'];
  for (const f of tous.filter((x) => !proprietaires.includes(x))) {
    const code = lire(f);
    for (const c of chiffres) {
      assert.ok(!new RegExp(`^\\s*${c}\\s*:\\s*[0-9]`, 'm').test(code),
        `${f} redéfinit l’hypothèse ${c}`);
    }
  }
});
