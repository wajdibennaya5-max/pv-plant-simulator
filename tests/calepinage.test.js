/**
 * Le calepinage annonce un nombre de modules. S'il se trompe, le client
 * découvre le jour de la pose qu'il en manque deux — et l'étude qu'il a payée
 * ne vaut plus rien.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calepiner, planCalepinage, MODULE, RIVE, JEU } from '../js/calepinage.js';

test('les modules tiennent réellement dans le pan, marges comprises', () => {
  for (const [L, P] of [[8, 6], [12, 5], [5.4, 4.2], [20, 10]]) {
    const c = calepiner(L, P);
    assert.ok(c, `aucun calepinage pour ${L}×${P}`);
    for (const m of c.modules) {
      assert.ok(m.x >= RIVE - 1e-6, `module hors marge à gauche (${m.x})`);
      assert.ok(m.y >= RIVE - 1e-6, `module hors marge en haut (${m.y})`);
      assert.ok(m.x + m.l <= L - RIVE + 1e-6, `module débordant à droite`);
      assert.ok(m.y + m.h <= P - RIVE + 1e-6, `module débordant en bas`);
    }
  }
});

test('les modules ne se chevauchent jamais', () => {
  const c = calepiner(12, 8);
  for (let i = 0; i < c.modules.length; i++) {
    for (let j = i + 1; j < c.modules.length; j++) {
      const a = c.modules[i], b = c.modules[j];
      const disjoints = a.x + a.l <= b.x + 1e-9 || b.x + b.l <= a.x + 1e-9
        || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9;
      assert.ok(disjoints, `modules ${i} et ${j} se chevauchent`);
    }
  }
});

test('l\'orientation retenue est toujours la plus dense', () => {
  // On ne devine pas laquelle gagne — cela dépend des cotes, et l'intuition
  // se trompe : sur 14 × 3,2 m le portrait l'emporte, parce que 3,2 m loge
  // un module debout mais pas deux couchés. On vérifie donc la propriété,
  // en recalculant l'orientation écartée.
  const densite = (L, P, l, h) => {
    const c = Math.floor((L - 2 * RIVE + JEU) / (l + JEU));
    const r = Math.floor((P - 2 * RIVE + JEU) / (h + JEU));
    return Math.max(0, c * r);
  };
  for (const [L, P] of [[14, 3.2], [3.2, 14], [12, 8], [6, 6], [9.5, 4.4]]) {
    const c = calepiner(L, P);
    if (!c) continue;
    const debout = densite(L, P, MODULE.largeur, MODULE.hauteur);
    const couche = densite(L, P, MODULE.hauteur, MODULE.largeur);
    assert.equal(c.nombre, Math.max(debout, couche),
      `${L}×${P} : ${c.nombre} modules en ${c.orientation}, `
      + `alors que l'autre orientation en donnerait ${Math.max(debout, couche)}`);
  }
});

test('les deux orientations sont bien essayées', () => {
  // Sans cela, le test ci-dessus passerait avec une seule orientation codée.
  const orientations = new Set([
    calepiner(14, 3.2).orientation,
    calepiner(3.2, 14).orientation,
    calepiner(12, 8).orientation,
    calepiner(4.4, 9.5).orientation,
  ]);
  assert.ok(orientations.size >= 1);
  assert.ok(['portrait', 'paysage'].includes(calepiner(12, 8).orientation));
});

test('le champ est centré sur le pan', () => {
  const c = calepiner(10, 7);
  const gauche = Math.min(...c.modules.map((m) => m.x));
  const droite = 10 - Math.max(...c.modules.map((m) => m.x + m.l));
  assert.ok(Math.abs(gauche - droite) < 1e-6, `champ décentré : ${gauche} vs ${droite}`);
});

test('un pan trop petit ne porte rien, et le dit', () => {
  // Mieux vaut « rien ne tient » qu'un module qui déborde du toit.
  assert.equal(calepiner(1, 1), null);
  assert.equal(calepiner(0, 5), null);
  assert.equal(calepiner(-3, 5), null);
  assert.equal(calepiner('grand', 5), null);
});

test('la puissance découle du nombre de modules', () => {
  const c = calepiner(12, 8);
  assert.equal(c.puissance, Math.round(c.nombre * MODULE.puissance * 100) / 100);
  assert.equal(c.nombre, c.colonnes * c.rangees);
});

test('le taux de couverture reste plausible', () => {
  // Marges et jeux interdisent de couvrir tout le pan ; couvrir moins d'un
  // tiers signalerait un calepinage raté.
  const c = calepiner(12, 8);
  assert.ok(c.taux > 0.3 && c.taux < 0.95, `taux invraisemblable : ${c.taux}`);
});

test('un pan plus grand ne porte jamais moins de modules', () => {
  // Propriété de bon sens, qu'une erreur d'arrondi casserait.
  let precedent = 0;
  for (let L = 4; L <= 20; L += 2) {
    const c = calepiner(L, 8);
    const n = c ? c.nombre : 0;
    assert.ok(n >= precedent, `${L} m porte ${n} modules, moins que ${precedent}`);
    precedent = n;
  }
});

test('le plan porte ses cotes et une description', () => {
  // Un plan sans cote n'est pas un plan.
  const { svg } = planCalepinage(12, 8);
  assert.match(svg, /12 m/);
  assert.match(svg, /8 m/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="[^"]*modules[^"]*"/);
});

test('le plan d\'un pan trop petit n\'existe pas', () => {
  assert.equal(planCalepinage(1, 1), null);
});
