import test from 'node:test';
import assert from 'node:assert/strict';
import { flux, comparerJeux, tauxDeRendement, differences, listerParametres,
  PARAMETRES, JEUX, STANDARD, jeu, NON_PRIS_EN_COMPTE } from '../js/finances.js';
import { etudier, HYPOTHESES } from '../js/etude.js';

const E = etudier({ consommationAnnuelle: 7200, montantAnnuel: 2040,
  gouvernorat: 'sfax', puissance: 4, orientation: 'sud', pente: 'moyenne' });
const ENTREES = { puissance: E.puissance, autoconsomme: E.autoconsomme,
  surplus: E.surplus, prixKwh: E.prixKwh };

test('LES DEUX MOTEURS DONNENT LE MÊME TEMPS DE RETOUR', () => {
  // C'est le test le plus important de ce fichier. Deux temps de retour
  // différents sur la même page — l'un dans le tableau de bord, l'autre dans
  // l'analyse financière — feraient douter de tout le reste.
  for (const kwc of [1.5, 2, 4, 6.5, 10, 20, 30]) {
    const e = etudier({ consommationAnnuelle: 7200, montantAnnuel: 2040,
      gouvernorat: 'sfax', puissance: kwc, orientation: 'sud', pente: 'moyenne' });
    const f = flux({ puissance: e.puissance, autoconsomme: e.autoconsomme,
      surplus: e.surplus, prixKwh: e.prixKwh }, STANDARD);
    if (e.retour === null) { assert.equal(f.retour, null, `${kwc} kWc`); continue; }
    assert.ok(Math.abs(e.retour - f.retour) < 0.01,
      `${kwc} kWc : étude ${e.retour} contre finances ${f.retour}`);
  }
});

test('les paramètres du jeu standard sont ceux de l’étude', () => {
  for (const cle of ['coutParKwc', 'hausseElectricite', 'degradation', 'duree',
    'valeurSurplus', 'maintenanceAnnuelle', 'inflation']) {
    assert.equal(STANDARD[cle], HYPOTHESES[cle], `divergence sur ${cle}`);
  }
});

test('l’entretien pèse réellement sur le résultat', () => {
  // L'omettre flattait le projet : sur 4 kWc, le retour avançait de six mois.
  const avec = flux(ENTREES, STANDARD);
  const sans = flux(ENTREES, { ...STANDARD, maintenanceAnnuelle: 0 });
  assert.ok(sans.retour < avec.retour, 'sans entretien, le retour doit être plus court');
  assert.ok(avec.gainNet < sans.gainNet);
  assert.ok(avec.annees[0].entretien > 0);
});

test('chaque année du flux s’additionne exactement au cumul', () => {
  const f = flux(ENTREES);
  let somme = -f.investissement;
  for (const a of f.annees) {
    somme += a.net;
    assert.ok(Math.abs(somme - a.cumul) < 1e-6, `année ${a.an}`);
    assert.ok(Math.abs(a.net - (a.recette - a.entretien)) < 1e-9, `année ${a.an}`);
  }
  assert.ok(Math.abs(f.gainNet - somme) < 1e-6);
});

test('l’électricité renchérit, les modules s’usent, l’entretien enfle', () => {
  const f = flux(ENTREES);
  assert.ok(f.annees.at(-1).recette > f.annees[0].recette,
    'la recette doit croître : la hausse du tarif dépasse l’usure');
  assert.ok(f.annees.at(-1).entretien > f.annees[0].entretien,
    'l’entretien doit suivre l’inflation');
  assert.ok(f.annees.at(-1).actualise < f.annees[0].actualise,
    'un dinar lointain vaut moins qu’un dinar proche');
});

test('le retour actualisé arrive après le retour simple', () => {
  const f = flux(ENTREES);
  assert.ok(f.retourActualise > f.retour,
    'actualiser retarde toujours le remboursement, jamais l’inverse');
});

test('la valeur actuelle nette suit le taux d’actualisation', () => {
  const bas = flux(ENTREES, { ...STANDARD, tauxActualisation: 0.02 });
  const haut = flux(ENTREES, { ...STANDARD, tauxActualisation: 0.12 });
  assert.ok(bas.van > haut.van);
  // À taux nul, la VAN doit valoir exactement le gain net.
  const nul = flux(ENTREES, { ...STANDARD, tauxActualisation: 0 });
  assert.ok(Math.abs(nul.van - nul.gainNet) < 1e-6);
});

test('le taux de rendement interne annule bien la valeur actuelle nette', () => {
  const f = flux(ENTREES);
  assert.ok(f.tri > 0 && f.tri < 1, `TRI invraisemblable : ${f.tri}`);
  const van = f.annees.reduce((s, a, i) => s + a.net / (1 + f.tri) ** (i + 1),
    -f.investissement);
  assert.ok(Math.abs(van) < 1, `la VAN au TRI vaut ${van}, elle devrait valoir zéro`);
});

test('un projet jamais remboursé n’affiche pas de rendement inventé', () => {
  assert.equal(tauxDeRendement(100000, [10, 10, 10]), null);
  assert.equal(tauxDeRendement(0, [10]), null);
  assert.equal(tauxDeRendement(1000, []), null);
  const perdu = flux(ENTREES, { ...STANDARD, coutParKwc: 60000 });
  assert.equal(perdu.retour, null);
  assert.equal(perdu.tri, null);
});

test('le coût actualisé du kWh se compare au tarif payé', () => {
  // C'est le chiffre le plus défendable de toute l'étude : ce que revient un
  // kilowattheure solaire, entretien et actualisation compris.
  const f = flux(ENTREES);
  assert.ok(f.lcoe > 0.05 && f.lcoe < 0.6, `LCOE invraisemblable : ${f.lcoe}`);
  assert.ok(f.lcoe < E.prixKwh,
    'sur ce cas, le kWh solaire doit revenir moins cher que celui de la STEG');
  // Un projet plus cher produit un kWh plus cher.
  const cher = flux(ENTREES, { ...STANDARD, coutParKwc: 5000 });
  assert.ok(cher.lcoe > f.lcoe);
});

test('les trois jeux existent, se distinguent, et l’un est le défaut', () => {
  assert.equal(JEUX.length, 3);
  assert.equal(JEUX.filter((j) => j.defaut).length, 1);
  assert.equal(jeu('standard').id, 'standard');
  assert.equal(jeu('inconnu').id, 'standard', 'un jeu inconnu retombe sur le standard');
  const c = comparerJeux(ENTREES);
  assert.equal(c.length, 3);
  const [cons, std, opt] = c;
  assert.ok(cons.flux.gainNet < std.flux.gainNet);
  assert.ok(std.flux.gainNet < opt.flux.gainNet);
  assert.ok(cons.flux.retour > opt.flux.retour);
});

test('chaque jeu dit ce qui le distingue du standard', () => {
  // Deux courbes sans leurs paramètres passent pour un tour de passe-passe.
  for (const j of comparerJeux(ENTREES)) {
    if (j.defaut) { assert.deepEqual(j.ecarts, []); continue; }
    assert.ok(j.ecarts.length >= 3, `${j.id} ne dit pas assez ce qui le distingue`);
    for (const e of j.ecarts) {
      assert.ok(e.libelle && e.de && e.a, `${j.id} : écart incomplet`);
      assert.notEqual(e.de, e.a);
    }
  }
});

test('même la version conservatrice reste défendable sur ce cas', () => {
  const cons = comparerJeux(ENTREES).find((j) => j.id === 'conservateur');
  assert.ok(cons.flux.retour < 15, `retour conservateur : ${cons.flux.retour}`);
  assert.ok(cons.flux.lcoe < E.prixKwh,
    'même au pire, le kWh solaire doit rester sous le tarif STEG sur ce cas');
});

test('tous les paramètres sont visibles, bornés et expliqués', () => {
  for (const p of PARAMETRES) {
    assert.ok(p.cle && p.libelle && p.aide, `${p.cle} incomplet`);
    assert.ok(p.aide.length > 25, `${p.cle} : aide trop courte pour servir`);
    assert.ok(p.min < p.max && p.pas > 0, `${p.cle} : bornes incohérentes`);
    assert.ok(STANDARD[p.cle] !== undefined, `${p.cle} absent du jeu standard`);
  }
  const listee = listerParametres(STANDARD);
  assert.equal(listee.length, PARAMETRES.length);
  for (const l of listee) assert.ok(l.ecrit && l.ecrit !== '—', l.cle);
});

test('ce qui n’est pas calculé est dit, pas supposé', () => {
  assert.ok(NON_PRIS_EN_COMPTE.length >= 3);
  const tout = NON_PRIS_EN_COMPTE.join(' ');
  assert.match(tout, /subvention/i);
  assert.match(tout, /crédit/i);
});

test('des entrées inexploitables ne rendent aucun flux', () => {
  assert.equal(flux({ puissance: 0, prixKwh: 0.28 }), null);
  assert.equal(flux({ puissance: 4, prixKwh: 0 }), null);
  assert.equal(flux({}), null);
});

test('les écarts entre deux jeux identiques sont vides', () => {
  assert.deepEqual(differences(STANDARD, STANDARD), []);
  assert.ok(differences(STANDARD, { ...STANDARD, coutParKwc: 4000 }).length === 1);
});
