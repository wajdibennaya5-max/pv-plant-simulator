/**
 * L'étude est ce que le client va payer. Un chiffre faux ici n'est pas une
 * imprécision : c'est une promesse de rentabilité qu'il découvrira démentie
 * sur sa facture, deux ans plus tard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prixDuKwh, puissanceRecommandee, etudier, HYPOTHESES, PUISSANCE } from '../js/etude.js';
import { productible, zoneSolaire } from '../js/gisement.js';

const FOYER = { consommationAnnuelle: 4800, montantAnnuel: 1200, gouvernorat: 'sfax' };

/* ------------------------------------------------------------------ */
/* Le prix du kWh se déduit, il ne se suppose pas                      */
/* ------------------------------------------------------------------ */

test('le prix du kWh vient de la facture du client, non d\'une moyenne', () => {
  // 1200 DT pour 4800 kWh : 0,250 DT le kWh, chez lui.
  assert.equal(prixDuKwh(FOYER), 0.25);
});

test('sans chiffres exploitables, aucun prix n\'est inventé', () => {
  for (const cas of [
    { consommationAnnuelle: 0, montantAnnuel: 1200 },
    { consommationAnnuelle: 4800, montantAnnuel: 0 },
    { consommationAnnuelle: -100, montantAnnuel: 1200 },
    { consommationAnnuelle: 'beaucoup', montantAnnuel: 1200 },
    {},
  ]) {
    assert.equal(prixDuKwh(cas), null, `prix inventé pour ${JSON.stringify(cas)}`);
  }
});

/* ------------------------------------------------------------------ */
/* Le gisement                                                         */
/* ------------------------------------------------------------------ */

test('les vingt-quatre gouvernorats ont un productible', () => {
  const ids = ['tunis', 'ariana', 'ben-arous', 'manouba', 'bizerte', 'nabeul',
    'zaghouan', 'beja', 'jendouba', 'kef', 'siliana', 'sousse', 'monastir',
    'mahdia', 'sfax', 'kairouan', 'kasserine', 'sidi-bouzid', 'gabes',
    'medenine', 'tataouine', 'gafsa', 'tozeur', 'kebili'];
  for (const id of ids) {
    assert.ok(productible(id) > 0, `productible manquant : ${id}`);
    assert.ok(zoneSolaire(id), `zone manquante : ${id}`);
  }
  assert.equal(ids.length, 24);
});

test('le sud produit davantage que le nord', () => {
  assert.ok(productible('tozeur') > productible('sfax'));
  assert.ok(productible('sfax') > productible('tunis'));
});

test('un gouvernorat inconnu n\'a pas de productible inventé', () => {
  assert.equal(productible('atlantide'), null);
  assert.equal(zoneSolaire(''), null);
});

/* ------------------------------------------------------------------ */
/* Le dimensionnement                                                  */
/* ------------------------------------------------------------------ */

test('la puissance couvre la consommation, arrondie au demi-kilowatt', () => {
  // 4800 kWh à Sfax (1640 kWh/kWc) → 2,93 kWc → 3,0 kWc
  assert.equal(puissanceRecommandee(FOYER), 3);
});

test('un même foyer n\'a jamais besoin de plus de puissance dans le sud', () => {
  // Le pas d'un demi-kilowatt peut masquer l'écart sur une petite
  // installation — 3,08 et 2,78 kWc s'arrondissent tous deux à 3,0, et on
  // n'achète pas 2,775 kWc. L'ordre, lui, ne doit jamais s'inverser.
  for (const conso of [2000, 4800, 9000, 12000, 20000]) {
    const nord = puissanceRecommandee({ consommationAnnuelle: conso, gouvernorat: 'tunis' });
    const sud = puissanceRecommandee({ consommationAnnuelle: conso, gouvernorat: 'tozeur' });
    assert.ok(sud <= nord, `à ${conso} kWh, le sud demande plus que le nord`);
  }
});

test('sur une installation assez grande, l\'écart nord-sud se voit', () => {
  // 12 000 kWh : 7,5 kWc à Tunis contre 7,0 à Tozeur — le pas ne masque plus.
  const nord = puissanceRecommandee({ consommationAnnuelle: 12000, gouvernorat: 'tunis' });
  const sud = puissanceRecommandee({ consommationAnnuelle: 12000, gouvernorat: 'tozeur' });
  assert.ok(sud < nord, `attendu sud < nord, obtenu ${sud} et ${nord}`);
});

test('une toiture trop petite bride le projet', () => {
  // 10 m² ne portent que 10/6 ≈ 1,67 kWc, quelle que soit la consommation.
  const bride = puissanceRecommandee({ ...FOYER, surfaceDisponible: 10 });
  assert.ok(bride < 3, 'la toiture doit limiter la puissance');
  assert.ok(bride >= PUISSANCE.min);
});

test('la puissance reste dans les bornes du raisonnable', () => {
  const enorme = puissanceRecommandee({ ...FOYER, consommationAnnuelle: 900000 });
  assert.equal(enorme, PUISSANCE.max);
  const minuscule = puissanceRecommandee({ ...FOYER, consommationAnnuelle: 50 });
  assert.equal(minuscule, PUISSANCE.min);
});

test('sans lieu, aucun dimensionnement', () => {
  assert.equal(puissanceRecommandee({ ...FOYER, gouvernorat: 'atlantide' }), null);
});

/* ------------------------------------------------------------------ */
/* L'étude complète                                                    */
/* ------------------------------------------------------------------ */

test('une étude complète tient debout de bout en bout', () => {
  const e = etudier(FOYER);
  assert.ok(e, 'étude non produite');
  assert.equal(e.puissance, 3);
  // La production découle du productible du gouvernorat : on la recalcule
  // plutôt que de la figer, pour que l'affiner ne casse pas ce test.
  assert.equal(e.production, Math.round(3 * productible('sfax')));
  assert.equal(e.prixKwh, 0.25);
  assert.ok(e.economieAnnuelle > 0);
  assert.ok(e.cout > 0);
  assert.ok(e.retour > 0 && e.retour < HYPOTHESES.duree);
  assert.equal(e.surface, 18);               // 3 kWc × 6 m²
  assert.equal(e.modules, 6);                // 3 kWc / 550 Wc, arrondi
});

test('une donnée manquante ne produit pas une étude à moitié', () => {
  // Mieux vaut ne rien afficher qu'un résultat que le client croira vrai.
  assert.equal(etudier({ ...FOYER, montantAnnuel: 0 }), null);
  assert.equal(etudier({ ...FOYER, consommationAnnuelle: 0 }), null);
  assert.equal(etudier({ ...FOYER, gouvernorat: 'atlantide' }), null);
});

test('le surplus injecté vaut moins que ce qui est consommé sur place', () => {
  // Une installation surdimensionnée ne rapporte pas proportionnellement.
  const juste = etudier({ ...FOYER, puissance: 3 });
  const double = etudier({ ...FOYER, puissance: 6 });
  assert.ok(double.economieAnnuelle < juste.economieAnnuelle * 2,
    'doubler la puissance ne peut pas doubler l\'économie');
  assert.ok(double.surplus > juste.surplus);
});

test('l\'économie cumulée tient compte de la hausse et de l\'usure', () => {
  const e = etudier(FOYER);
  assert.equal(e.annees.length, HYPOTHESES.duree);
  // L'électricité renchérit de 6 % et les modules perdent 0,5 % : la
  // dernière année doit rapporter davantage que la première.
  assert.ok(e.annees.at(-1).economie > e.annees[0].economie);
  assert.equal(Math.round(e.economieTotale), Math.round(e.annees.at(-1).cumul));
});

test('le temps de retour s\'interpole dans l\'année', () => {
  // « 6,4 ans » se comprend mieux que « 7 ans », et c'est plus juste.
  const e = etudier(FOYER);
  assert.notEqual(e.retour, Math.trunc(e.retour), 'un retour entier trahit un arrondi grossier');
  const avant = e.annees[Math.trunc(e.retour) - 1].cumul;
  assert.ok(avant < e.cout, 'le retour ne peut pas précéder le remboursement');
  assert.ok(e.annees[Math.trunc(e.retour)].cumul >= e.cout);
});

test('un projet qui ne se rembourse jamais le dit', () => {
  // Coût multiplié par cent : aucun retour en vingt-cinq ans.
  const e = etudier({ ...FOYER,
    hypotheses: { ...HYPOTHESES, coutParKwc: HYPOTHESES.coutParKwc * 100 } });
  assert.equal(e.retour, null, 'ne pas promettre un retour qui n\'existe pas');
  assert.ok(e.gainNet < 0);
});

test('la couverture ne dépasse jamais cent pour cent', () => {
  const e = etudier({ ...FOYER, puissance: PUISSANCE.max });
  assert.ok(e.couverture <= 1);
});

test('une toiture contraignante ne fait jamais dépasser sa capacité', () => {
  // 20 m² portent 20/6 = 3,33 kWc. Arrondir au plus proche donnerait 3,5 —
  // une installation qui ne tient pas sur le toit, et un client fâché le
  // jour de la pose.
  const max = 20 / HYPOTHESES.surfaceParKwc;
  const kwc = puissanceRecommandee({ ...FOYER, surfaceDisponible: 20 });
  assert.ok(kwc <= max, `${kwc} kWc ne tiennent pas sur 20 m² (max ${max.toFixed(2)})`);
  // Et la surface annoncée doit rester dans la toiture disponible.
  const e = etudier({ ...FOYER, surfaceDisponible: 20 });
  assert.ok(e.surface <= 20, `surface annoncée ${e.surface} m² > 20 m² disponibles`);
});

test('sans contrainte de toiture, l\'arrondi reste au plus proche', () => {
  // 4800 kWh à Sfax donnent 2,93 kWc : sans toit contraignant, 3,0 est juste.
  assert.equal(puissanceRecommandee(FOYER), 3);
});

/* ------------------------------------------------------------------ */
/* L'orientation du toit                                               */
/* ------------------------------------------------------------------ */

test('un toit mal orienté produit moins, à puissance égale', () => {
  const sud = etudier({ ...FOYER, puissance: 3, orientation: 'sud', pente: 'moyenne' });
  const nord = etudier({ ...FOYER, puissance: 3, orientation: 'nord', pente: 'moyenne' });
  assert.ok(nord.production < sud.production * 0.6,
    `plein nord : ${nord.production} kWh contre ${sud.production} au sud`);
});

test('un toit mal orienté demande plus de puissance pour le même besoin', () => {
  // L'ignorer sous-dimensionnerait l'installation sans que personne ne s'en
  // aperçoive avant la première facture.
  const sud = puissanceRecommandee({ ...FOYER, orientation: 'sud', pente: 'moyenne' });
  const est = puissanceRecommandee({ ...FOYER, orientation: 'est', pente: 'moyenne' });
  assert.ok(est > sud, `est : ${est} kWc, sud : ${sud} kWc`);
});

test('sans orientation renseignée, rien n\'est pénalisé', () => {
  // Le visiteur n'a pas encore répondu : supposer le pire l'écarterait à tort.
  const e = etudier(FOYER);
  assert.equal(e.facteurOrientation, 1);
  assert.equal(e.production, Math.round(3 * productible('sfax')));
});

test('une terrasse ne subit pas l\'orientation du bâtiment', () => {
  const a = etudier({ ...FOYER, puissance: 3, orientation: 'nord', pente: 'plat' });
  const b = etudier({ ...FOYER, puissance: 3, orientation: 'sud', pente: 'plat' });
  assert.equal(a.production, b.production);
});

/* ------------------------------------------------------------------ */
/* La production mois par mois                                         */
/* ------------------------------------------------------------------ */

test('les douze mois somment à la production annuelle', () => {
  const e = etudier(FOYER);
  assert.equal(e.mensuel.length, 12);
  const somme = e.mensuel.reduce((a, b) => a + b, 0);
  // Les arrondis mensuels tolèrent quelques kWh d'écart, pas davantage.
  assert.ok(Math.abs(somme - e.production) <= 12,
    `somme ${somme} contre production ${e.production}`);
});

test('l\'été produit plus que l\'hiver, sans que l\'hiver soit nul', () => {
  // Un client croit souvent que l'hiver ne donne rien : la courbe le rassure.
  const e = etudier(FOYER);
  const juillet = e.mensuel[6];
  const decembre = e.mensuel[11];
  assert.ok(juillet > decembre, 'juillet doit dépasser décembre');
  assert.ok(decembre > juillet * 0.35,
    `décembre ne produit que ${Math.round((decembre / juillet) * 100)} % de juillet`);
});

test('le sud a un profil plus régulier que le nord', () => {
  const creux = (g) => {
    const e = etudier({ ...FOYER, gouvernorat: g, puissance: 3 });
    return Math.min(...e.mensuel) / Math.max(...e.mensuel);
  };
  assert.ok(creux('tozeur') > creux('bizerte'),
    'le sud doit varier moins entre été et hiver');
});
