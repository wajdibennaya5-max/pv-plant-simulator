import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, typeBatiment, autoconsommationDe, TYPE_DEFAUT } from '../js/batiment.js';
import { etudier } from '../js/etude.js';

const BASE = {
  consommationAnnuelle: 7200, montantAnnuel: 2040, gouvernorat: 'sfax',
  orientation: 'sud', pente: 'moyenne', puissance: 4,
};

test('les quatre types existent, avec de quoi les afficher', () => {
  assert.equal(TYPES.length, 4);
  for (const t of TYPES) {
    assert.ok(t.id && t.nom && t.resume && t.note && t.profil);
    assert.ok(t.autoconsommation > 0 && t.autoconsommation <= 1);
  }
});

test('un bâtiment occupé à midi autoconsomme plus qu’un logement', () => {
  // C'est le fait physique qui justifie tout ce fichier : le soleil produit
  // à midi, une maison est vide à midi, un atelier tourne.
  const maison = autoconsommationDe('maison');
  assert.ok(autoconsommationDe('commerce') > maison);
  assert.ok(autoconsommationDe('industrie') > autoconsommationDe('commerce'));
  assert.ok(autoconsommationDe('agricole') > maison);
});

test('le logement est le défaut, parce que c’est le plus prudent', () => {
  const defaut = autoconsommationDe(TYPE_DEFAUT);
  for (const t of TYPES) assert.ok(t.autoconsommation >= defaut);
  assert.equal(autoconsommationDe('inconnu'), defaut);
  assert.equal(autoconsommationDe(undefined), defaut);
});

test('le type de bâtiment change réellement le résultat de l’étude', () => {
  const maison = etudier({ ...BASE, batiment: 'maison' });
  const usine = etudier({ ...BASE, batiment: 'industrie' });
  assert.ok(usine.tauxAutoconsommation > maison.tauxAutoconsommation);
  assert.ok(usine.economieAnnuelle > maison.economieAnnuelle,
    'un atelier consomme sur place ce que la maison revend à moitié prix');
  assert.ok(usine.retour < maison.retour);
  // La production, elle, ne dépend pas de qui habite dessous.
  assert.equal(usine.production, maison.production);
});

test('sans type précisé, l’étude reste celle d’un logement', () => {
  assert.equal(etudier(BASE).tauxAutoconsommation,
    etudier({ ...BASE, batiment: 'maison' }).tauxAutoconsommation);
  assert.equal(etudier(BASE).batiment, TYPE_DEFAUT);
});

test('l’étude rend le type retenu et sa référence, pour pouvoir l’afficher', () => {
  const e = etudier({ ...BASE, batiment: 'commerce' });
  assert.equal(e.batiment, 'commerce');
  assert.equal(e.autoconsommationReference, typeBatiment('commerce').autoconsommation);
});
