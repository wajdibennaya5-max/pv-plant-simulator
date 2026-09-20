/**
 * L'orientation est le facteur le plus lourd de l'étude. L'ignorer, c'était
 * annoncer la même production à un toit plein sud et à un toit plein nord —
 * une erreur qui se découvre sur la première facture après la pose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIENTATIONS, PENTES, facteurOrientation, expliquerOrientation, TERRASSE }
  from '../js/orientation.js';

test('le plein sud est la référence, et rien ne le dépasse', () => {
  const sud = ORIENTATIONS.find((o) => o.id === 'sud');
  assert.equal(sud.facteur, 1);
  for (const o of ORIENTATIONS) {
    assert.ok(o.facteur <= 1, `${o.nom} ne peut pas dépasser le plein sud`);
    assert.ok(o.facteur > 0.4, `${o.nom} : facteur invraisemblable`);
  }
});

test('les orientations symétriques valent autant', () => {
  // Est et ouest reçoivent la même énergie sur l'année : les distinguer
  // serait une fausse précision.
  const paires = [['est', 'ouest'], ['sud-est', 'sud-ouest'], ['nord-est', 'nord-ouest']];
  for (const [a, b] of paires) {
    const fa = ORIENTATIONS.find((o) => o.id === a).facteur;
    const fb = ORIENTATIONS.find((o) => o.id === b).facteur;
    assert.equal(fa, fb, `${a} et ${b} devraient valoir autant`);
  }
});

test('la production décroît quand on s\'écarte du sud', () => {
  const ordre = ['sud', 'sud-est', 'est', 'nord-est', 'nord'];
  let precedent = Infinity;
  for (const id of ordre) {
    const f = ORIENTATIONS.find((o) => o.id === id).facteur;
    assert.ok(f <= precedent, `${id} devrait produire moins que le précédent`);
    precedent = f;
  }
});

test('un toit plat ignore l\'orientation du bâtiment', () => {
  // Les modules s'y posent sur châssis plein sud : pénaliser la maison
  // serait une erreur, et elle découragerait un client sans raison.
  const versNord = facteurOrientation('nord', 'plat');
  const versSud = facteurOrientation('sud', 'plat');
  assert.equal(versNord.facteur, versSud.facteur);
  assert.equal(versNord.terrasse, true);
  assert.match(expliquerOrientation('nord', 'plat'), /supports inclinés/);
});

test('sur un toit en pente, l\'orientation compte pleinement', () => {
  const sud = facteurOrientation('sud', 'moyenne');
  const nord = facteurOrientation('nord', 'moyenne');
  assert.equal(sud.facteur, 1);
  assert.ok(nord.facteur < 0.6, 'un plein nord doit perdre près de la moitié');
  assert.ok(sud.facteur > nord.facteur * 1.8);
});

test('la pente moyenne est l\'optimum, le plat et le très raide en dessous', () => {
  const f = (id) => PENTES.find((p) => p.id === id).facteur;
  assert.equal(f('moyenne'), 1);
  assert.ok(f('plat') < f('moyenne'));
  assert.ok(f('forte') < f('moyenne'));
  assert.ok(f('faible') < f('moyenne'));
});

test('une orientation ou une pente inconnue ne produit aucun facteur', () => {
  assert.equal(facteurOrientation('atlantide', 'moyenne'), null);
  assert.equal(facteurOrientation('sud', 'verticale'), null);
  assert.equal(facteurOrientation('', ''), null);
  assert.equal(expliquerOrientation('x', 'y'), null);
});

test('chaque cas porte une explication qui dit quoi en penser', () => {
  // Un client à qui l'on montre la perte comprend pourquoi son voisin produit
  // davantage, et n'accuse pas l'installateur.
  for (const o of ORIENTATIONS) {
    const texte = expliquerOrientation(o.id, 'moyenne');
    assert.ok(texte && texte.length > 30, `explication manquante pour ${o.nom}`);
  }
  assert.match(expliquerOrientation('sud', 'moyenne'), /optimale/);
  assert.match(expliquerOrientation('nord', 'moyenne'), /défavorable/);
});

test('la perte annoncée correspond au facteur', () => {
  for (const o of ORIENTATIONS) {
    const f = facteurOrientation(o.id, 'moyenne');
    assert.ok(Math.abs(f.perte - (1 - f.facteur)) < 1e-9);
  }
});
