import test from 'node:test';
import assert from 'node:assert/strict';
import { evite, eviteSurDuree, enArbres, enKilometres, formater, FACTEUR, VERIFIE }
  from '../js/co2.js';
import { etudier } from '../js/etude.js';

test('le CO₂ évité suit la production', () => {
  assert.equal(evite(1000), FACTEUR * 1000);
  assert.ok(evite(6000) > evite(3000));
  assert.equal(evite(0), 0);
  assert.equal(evite(-5), 0);
  assert.equal(evite('bonjour'), 0);
});

test('le facteur se présente comme non vérifié tant qu’il ne l’est pas', () => {
  assert.equal(typeof VERIFIE, 'boolean');
  // Ordre de grandeur d'un réseau au gaz : ni charbon, ni nucléaire.
  assert.ok(FACTEUR > 0.3 && FACTEUR < 0.8, `facteur invraisemblable : ${FACTEUR}`);
});

test('sur vingt-cinq ans, la dégradation compte mais ne renverse rien', () => {
  const an = evite(6000);
  const total = eviteSurDuree(6000, 25, 0.005);
  assert.ok(total < an * 25, 'les modules s’usent : le total doit rester en deçà');
  assert.ok(total > an * 22, 'mais l’usure ne mange pas trois années entières');
  assert.equal(eviteSurDuree(0), 0);
});

test('les équivalents restent des ordres de grandeur crédibles', () => {
  const kg = evite(6000); // ≈ 2,8 t
  assert.ok(enArbres(kg) > 50 && enArbres(kg) < 300, `${enArbres(kg)} arbres`);
  assert.ok(enKilometres(kg) > 5000 && enKilometres(kg) < 40000);
  assert.equal(enArbres(0), 0);
  assert.equal(enKilometres(-1), 0);
});

test('le chiffre passe en tonnes dès qu’il devient gros', () => {
  assert.equal(formater(430), '430 kg');
  assert.equal(formater(2820), '2,8 t');
  assert.equal(formater(0), '0 kg');
});

test('l’étude porte son CO₂, annuel et sur la durée', () => {
  const e = etudier({ consommationAnnuelle: 7200, montantAnnuel: 2040,
    gouvernorat: 'sfax', puissance: 4 });
  assert.ok(e.co2Annuel > 0);
  assert.ok(e.co2SurDuree > e.co2Annuel * 20);
  assert.equal(Math.round(e.co2Annuel), Math.round(evite(e.production)));
});
