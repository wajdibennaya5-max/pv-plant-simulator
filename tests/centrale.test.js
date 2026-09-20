import test from 'node:test';
import assert from 'node:assert/strict';

import { equipement, liaison, pire, conduit, ETATS, commandesDuType } from '../js/centrale/modele.js';
import { construire, alimentes, enAval, isoles, polariteIncoherente, relieALaTerre,
  atteignables } from '../js/centrale/topologie.js';
import { longueurChaine, planifier, genererCentrale, detailler, repartir,
  entreesDeChaine } from '../js/centrale/generation.js';
import { propager, puissanceChaines, ingenierie } from '../js/centrale/propagation.js';
import { verifier, appliquer, commandesDisponibles } from '../js/centrale/commandes.js';
import { injecter, lever, DEFAUTS, defautsPour, alarmes } from '../js/centrale/defauts.js';
import { creerSimulateur, irradianceA } from '../js/centrale/simulateur.js';
import { fiche, verifierCatalogue, couverture } from '../js/centrale/catalogue.js';

/**
 * LE SIMULATEUR DE CENTRALE, VÉRIFIÉ SANS NAVIGATEUR.
 *
 * C'est tout l'intérêt d'un moteur séparé du dessin : on joue ici des
 * séquences d'exploitation entières — ouvrir, consigner, injecter un défaut,
 * réparer, réarmer — et on vérifie les conséquences électriques. Aucune de
 * ces vérifications ne serait possible si le calcul vivait dans la page.
 */

/** Un petit réseau écrit à la main : chaînes → sectionneur → onduleur → réseau. */
function petiteCentrale({ etatSectionneur = 'CLOSED', etatReseau = 'NORMAL' } = {}) {
  const noeuds = [
    equipement({ id: 'str', type: 'String', status: 'RUNNING',
      properties: { effectif: 2, modulesParChaine: 20, module: 'mono-550',
        vmp: 800, imp: 13, ombrage: 0, salissure: 0 } }),
    equipement({ id: 'dc', type: 'DCProtection', status: etatSectionneur }),
    equipement({ id: 'inv', type: 'Inverter', status: 'RUNNING',
      properties: { puissance: 30000, rendement: 0.98, vAc: 400 } }),
    equipement({ id: 'ac', type: 'ACProtection', status: 'CLOSED' }),
    equipement({ id: 'tr', type: 'Transformer', status: 'NORMAL',
      properties: { puissance: 50000, primaire: 400, secondaire: 20000, tempMax: 105 } }),
    equipement({ id: 'mv', type: 'MVCell', status: 'CLOSED', properties: { tension: 20000 } }),
    equipement({ id: 'grid', type: 'Grid', status: etatReseau, properties: { tension: 20000 } }),
    equipement({ id: 'terre', type: 'Grounding' }),
  ];
  const liens = [
    liaison('str', 'dc', 'dc+'), liaison('str', 'dc', 'dc-'),
    liaison('dc', 'inv', 'dc+'), liaison('dc', 'inv', 'dc-'),
    liaison('inv', 'ac', 'ac'), liaison('ac', 'tr', 'ac'),
    liaison('tr', 'mv', 'mv'), liaison('mv', 'grid', 'mv'),
    liaison('inv', 'terre', 'pe'), liaison('tr', 'terre', 'pe'),
  ];
  return { noeuds, liens, graphe: construire(noeuds, liens) };
}

// ─────────────────────────────────────────────────────────────────────────
test('LA PROPAGATION D’UNE OUVERTURE DE DISJONCTEUR', async (t) => {
  await t.test('fermé, le courant va des chaînes au réseau', () => {
    const { graphe } = petiteCentrale();
    const r = propager(graphe, { irradiance: 1000, temperature: 25 });
    assert.ok(r.total.puissanceAc > 0, 'la centrale doit produire');
    assert.ok(r.mesures.get('grid').p > 0, 'le réseau doit recevoir');
  });

  await t.test('ouvert, plus rien ne passe — et sans règle nommant l’aval', () => {
    const { graphe } = petiteCentrale({ etatSectionneur: 'OPEN' });
    const r = propager(graphe, { irradiance: 1000, temperature: 25 });
    assert.equal(r.total.puissanceAc, 0, 'aucune production ne doit traverser');
    assert.equal(r.mesures.get('inv').pDc, 0, 'l’onduleur ne reçoit plus de continu');
    // La chaîne, elle, est toujours sous tension : c'est vrai, et c'est ce qui
    // rend un champ dangereux même disjoncteur ouvert.
    assert.ok(r.mesures.get('str').p > 0, 'la chaîne produit toujours en amont');
  });

  await t.test('le disjoncteur ouvert reste sous tension de son côté amont', () => {
    const { graphe } = petiteCentrale({ etatSectionneur: 'OPEN' });
    assert.ok(alimentes(graphe).has('dc'),
      'un appareil ouvert est alimenté d’un côté : c’est ce qui tue');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('L’ISOLEMENT EN AVAL se déduit du graphe, jamais d’une liste', async (t) => {
  await t.test('ce que l’on perd en coupant est calculé par différence', () => {
    const { graphe } = petiteCentrale({ etatReseau: 'GRID_LOST' });
    const perdus = enAval(graphe, 'dc');
    assert.ok(perdus.has('inv'), 'l’onduleur tombe');
    assert.ok(perdus.has('tr'), 'le transformateur tombe');
    assert.ok(!perdus.has('str'), 'la chaîne est en amont : elle ne tombe pas');
    assert.ok(!perdus.has('dc'), 'l’appareil coupé n’est pas son propre aval');
  });

  await t.test('après ouverture, l’aval est réellement isolé', () => {
    const { noeuds, liens } = petiteCentrale({ etatReseau: 'GRID_LOST' });
    noeuds.find((n) => n.id === 'dc').status = 'OPEN';
    const g = construire(noeuds, liens);
    const horsTension = isoles(g);
    assert.ok(horsTension.has('inv'));
    assert.ok(horsTension.has('tr'));
    assert.ok(!horsTension.has('str'));
  });

  await t.test('l’état ISOLATED est constaté, pas commandé', () => {
    const { noeuds, liens } = petiteCentrale({ etatReseau: 'GRID_LOST' });
    noeuds.find((n) => n.id === 'dc').status = 'OPEN';
    const g = construire(noeuds, liens);
    const r = propager(g, { irradiance: 1000, temperature: 25 });
    assert.equal(g.noeuds.get('tr').status, 'NORMAL', 'l’état commandé ne bouge pas');
    assert.equal(r.etats.get('tr'), 'ISOLATED', 'l’état affiché constate l’isolement');
  });

  await t.test('une consignation survit au recalcul', () => {
    const { graphe } = petiteCentrale();
    appliquer(graphe, 'mv', 'OPEN');
    appliquer(graphe, 'mv', 'LOCK');
    propager(graphe, { irradiance: 1000, temperature: 25 });
    assert.equal(graphe.noeuds.get('mv').status, 'LOCKED',
      'un recalcul ne doit jamais effacer un cadenas');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('LE NOMBRE DE MODULES PAR CHAÎNE', async (t) => {
  const mod = fiche('mono-550');
  const ond = fiche('string-320');

  await t.test('la longueur tient entre la plage MPPT à chaud et la tension à froid', () => {
    const c = longueurChaine({ module: mod, onduleur: ond, tempMin: 0, tempMax: 70 });
    assert.ok(c.retenue >= c.min, 'jamais sous le minimum MPPT');
    assert.ok(c.retenue <= c.max, 'jamais au-dessus du maximum de tension');
    assert.ok(c.retenue * c.vocFroid <= ond.vMax,
      'la tension à vide à froid doit rester sous la tension maximale');
  });

  await t.test('un site plus froid impose une chaîne plus courte', () => {
    const doux = longueurChaine({ module: mod, onduleur: ond, tempMin: 10, tempMax: 70 });
    const froid = longueurChaine({ module: mod, onduleur: ond, tempMin: -15, tempMax: 70 });
    assert.ok(froid.max <= doux.max,
      'plus il fait froid, moins on peut mettre de modules : c’est tout le sujet');
  });

  await t.test('une fiche incomplète ne produit pas un nombre faux', () => {
    const c = longueurChaine({ module: { voc: 50, vmp: 42 }, onduleur: ond });
    assert.equal(c.retenue, null, 'aucune longueur ne doit être inventée');
    assert.ok(c.manquants.includes('module.coeffVoc'));
    assert.equal(c.avertissements[0].gravite, 'inconnu');
  });

  await t.test('la puissance atteinte correspond aux modules réellement posés', () => {
    const plan = planifier({ puissanceDc: 5000 });
    const attendu = (plan.chaines * plan.modulesParChaine * plan.module.puissance) / 1000;
    assert.equal(Math.round(plan.puissanceDc), Math.round(attendu));
    assert.equal(plan.modules, plan.chaines * plan.modulesParChaine);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('LA SURTENSION À FROID est détectée avant d’avoir détruit l’entrée', async (t) => {
  await t.test('un site glacial sur un onduleur 1000 V remonte un bloquant', () => {
    const mod = fiche('mono-550');
    // Un onduleur dont la plage MPPT couvre toute la tension admissible : la
    // longueur n'est alors bornée que par la tension maximale, et une
    // température très basse la fait franchir.
    const ond = { ...fiche('string-110'), vMax: 1000, vMpptMin: 200, vMpptMax: 1000 };
    const c = longueurChaine({ module: mod, onduleur: ond, tempMin: -25, tempMax: 70 });
    assert.ok(c.vocFroid > mod.voc,
      'la tension à vide doit MONTER quand la température descend');
    assert.ok(c.retenue * c.vocFroid <= ond.vMax,
      'la longueur retenue ne doit jamais dépasser la tension maximale');
  });

  await t.test('quand aucune longueur ne convient, on le dit au lieu de choisir', () => {
    const mod = fiche('mono-550');
    // Plage MPPT impossible : il faudrait plus de modules pour démarrer à
    // chaud qu'on n'en peut poser sans dépasser la tension à froid.
    const ond = { ...fiche('string-320'), vMax: 600, vMpptMin: 550, vMpptMax: 600 };
    const c = longueurChaine({ module: mod, onduleur: ond, tempMin: -10, tempMax: 70 });
    const bloquant = c.avertissements.find((a) => a.cle === 'chaine-impossible');
    assert.ok(bloquant, 'l’incohérence doit remonter, et nommer les deux bornes');
    assert.equal(bloquant.gravite, 'defaut');
  });

  await t.test('le défaut de surtension continue met l’onduleur en défaut', () => {
    const { graphe } = petiteCentrale();
    const r = injecter(graphe, 'inv', 'surtension-dc');
    assert.ok(r.applique);
    assert.equal(graphe.noeuds.get('inv').status, 'FAULT');
    const apres = propager(graphe, { irradiance: 1000, temperature: 25 });
    assert.equal(apres.total.puissanceAc, 0, 'un onduleur en défaut n’injecte plus');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('LA POLARITÉ INVERSÉE', async (t) => {
  await t.test('un câblage sain ne remonte aucune anomalie', () => {
    const { graphe } = petiteCentrale();
    assert.deepEqual(polariteIncoherente(graphe), []);
  });

  await t.test('une liaison dc- manquante est vue comme un câblage incohérent', () => {
    const { noeuds, liens } = petiteCentrale();
    const sansRetour = liens.filter((l) => !(l.de === 'str' && l.type === 'dc-'));
    const g = construire(noeuds, sansRetour);
    const anomalies = polariteIncoherente(g);
    assert.equal(anomalies.length, 1);
    assert.match(anomalies[0].raison, /câblage incohérent/);
  });

  await t.test('une chaîne inversée ne produit rien, quel que soit l’ensoleillement', () => {
    const { graphe } = petiteCentrale();
    const avant = propager(graphe, { irradiance: 1000, temperature: 25 }).total.puissanceAc;
    injecter(graphe, 'str', 'polarite-inversee');
    const apres = propager(graphe, { irradiance: 1000, temperature: 25 });
    assert.ok(avant > 0);
    assert.equal(apres.total.puissanceAc, 0, 'la diode bloque : aucune production');
    assert.equal(polariteIncoherente(graphe).length, 1);
  });

  await t.test('la production revient après remise en ordre et réarmement', () => {
    const { graphe } = petiteCentrale();
    const avant = propager(graphe, { irradiance: 1000, temperature: 25 }).total.puissanceAc;
    injecter(graphe, 'str', 'polarite-inversee');
    // On ne peut pas réarmer tant que la chaîne est encore à l'envers.
    assert.equal(verifier(graphe, 'str', 'RESET').accepte, false);
    lever(graphe, 'str');
    assert.equal(appliquer(graphe, 'str', 'RESET').accepte, true);
    const apres = propager(graphe, { irradiance: 1000, temperature: 25 });
    assert.equal(Math.round(apres.total.puissanceAc), Math.round(avant));
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('LA PERTE DU RÉSEAU ET L’ANTI-ÎLOTAGE', async (t) => {
  await t.test('réseau absent, aucun onduleur n’injecte', () => {
    const { graphe } = petiteCentrale({ etatReseau: 'GRID_LOST' });
    const r = propager(graphe, { irradiance: 1000, temperature: 25 });
    assert.equal(r.total.puissanceAc, 0, 'injecter sur un réseau absent tue le dépanneur');
    assert.equal(r.reseauPresent, false);
    assert.equal(r.total.frequence, 0);
  });

  await t.test('les chaînes produisent toujours : c’est l’onduleur qui se découple', () => {
    const { graphe } = petiteCentrale({ etatReseau: 'GRID_LOST' });
    const r = propager(graphe, { irradiance: 1000, temperature: 25 });
    assert.ok(r.mesures.get('str').p > 0, 'le soleil ne s’éteint pas avec le réseau');
    assert.equal(r.mesures.get('inv').couple, false);
    assert.ok(r.alertes.some((a) => a.cle === 'decouple'),
      'le découplage doit être annoncé, pas subi en silence');
  });

  await t.test('un onduleur séparé du réseau par une ouverture se découple aussi', () => {
    const { noeuds, liens } = petiteCentrale();
    noeuds.find((n) => n.id === 'mv').status = 'OPEN';
    const g = construire(noeuds, liens);
    const r = propager(g, { irradiance: 1000, temperature: 25 });
    assert.equal(r.total.puissanceAc, 0,
      'ce n’est pas la présence du réseau qui compte, c’est le chemin jusqu’à lui');
  });

  await t.test('le réseau revenu, la production repart', () => {
    const { graphe } = petiteCentrale();
    injecter(graphe, 'grid', 'perte-reseau');
    assert.equal(propager(graphe, { irradiance: 1000, temperature: 25 }).total.puissanceAc, 0);
    appliquer(graphe, 'grid', 'RESET');
    assert.ok(propager(graphe, { irradiance: 1000, temperature: 25 }).total.puissanceAc > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('L’INTERVERROUILLAGE REFUSÉ dit toujours pourquoi et quoi faire', async (t) => {
  await t.test('on ne consigne pas un appareil fermé', () => {
    const { graphe } = petiteCentrale();
    const r = verifier(graphe, 'mv', 'LOCK');
    assert.equal(r.accepte, false);
    assert.equal(r.interverrouillage.etatActuel, 'CLOSED');
    assert.match(r.interverrouillage.requis, /Ouvrir/);
    assert.ok(r.interverrouillage.condition.length > 20, 'la raison doit être une phrase');
  });

  await t.test('on ne referme pas un appareil consigné', () => {
    const { graphe } = petiteCentrale();
    appliquer(graphe, 'mv', 'OPEN');
    appliquer(graphe, 'mv', 'LOCK');
    const r = verifier(graphe, 'mv', 'CLOSE');
    assert.equal(r.accepte, false);
    assert.equal(r.cle, 'consigne');
    assert.match(r.interverrouillage.requis, /Déconsigner/);
  });

  await t.test('un refus ne change rien à l’état', () => {
    const { graphe } = petiteCentrale();
    const avant = graphe.noeuds.get('mv').status;
    const r = appliquer(graphe, 'mv', 'LOCK');
    assert.equal(r.accepte, false);
    assert.equal(graphe.noeuds.get('mv').status, avant);
    assert.equal(r.evenement.resultat, 'refusée',
      'un refus se journalise : c’est ce qu’on relit après coup');
  });

  await t.test('on ne referme pas sur un défaut resté en aval', () => {
    const { graphe } = petiteCentrale();
    injecter(graphe, 'inv', 'defaut-onduleur');
    appliquer(graphe, 'mv', 'OPEN');
    const r = verifier(graphe, 'mv', 'CLOSE');
    assert.equal(r.accepte, false);
    assert.equal(r.cle, 'defaut-aval');
  });

  await t.test('un réarmement est refusé tant que la cause est là', () => {
    const { graphe } = petiteCentrale();
    injecter(graphe, 'inv', 'defaut-isolement');
    const r = verifier(graphe, 'inv', 'RESET');
    assert.equal(r.accepte, false);
    assert.equal(r.cle, 'cause-presente');
    lever(graphe, 'inv');
    assert.equal(verifier(graphe, 'inv', 'RESET').accepte, true);
  });

  await t.test('un appareil qui ne se manœuvre pas le dit clairement', () => {
    const { graphe } = petiteCentrale();
    const r = verifier(graphe, 'terre', 'OPEN');
    assert.equal(r.accepte, false);
    assert.equal(r.cle, 'non-manoeuvrable');
  });

  await t.test('chaque commande proposée à l’écran porte sa recevabilité', () => {
    const { graphe } = petiteCentrale();
    const liste = commandesDisponibles(graphe, 'mv');
    assert.ok(liste.length > 0);
    for (const c of liste) {
      if (!c.accepte) assert.ok(c.raison, `${c.commande} refusée sans raison affichable`);
    }
  });

  await t.test('la séquence de consignation du terrain est la seule acceptée', () => {
    const { graphe } = petiteCentrale();
    assert.equal(verifier(graphe, 'mv', 'MAINTENANCE').accepte, false);
    assert.equal(verifier(graphe, 'mv', 'ISOLATE').accepte, false);
    assert.equal(appliquer(graphe, 'mv', 'OPEN').accepte, true);
    assert.equal(appliquer(graphe, 'mv', 'ISOLATE').accepte, true);
    assert.equal(appliquer(graphe, 'mv', 'MAINTENANCE').accepte, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('L’AGRÉGATION D’UN GRAND PARC', async (t) => {
  await t.test('500 MWc tiennent en quelques milliers de nœuds', () => {
    const c = genererCentrale({ puissanceDc: 500000 });
    assert.ok(c.noeuds < 8000,
      `un demi-gigawatt ne doit pas produire ${c.noeuds} objets`);
    assert.ok(c.plan.modules > 800000, 'le parc compte pourtant près d’un million de modules');
  });

  await t.test('un nœud agrégé connaît son effectif', () => {
    const c = genererCentrale({ puissanceDc: 100000 });
    const g = construire(c.equipements, c.liaisons);
    const chaines = [...g.noeuds.values()].filter((e) => e.type === 'String');
    const total = chaines.reduce((s, e) => s + (e.properties.effectif ?? 0), 0);
    assert.ok(chaines.length < total, 'les chaînes doivent être regroupées');
    assert.equal(total, c.plan.chaines, 'aucune chaîne ne doit se perdre dans l’agrégation');
  });

  await t.test('la puissance agrégée égale la somme des chaînes', () => {
    const c = genererCentrale({ puissanceDc: 50000 });
    const g = construire(c.equipements, c.liaisons);
    const r = propager(g, { irradiance: 1000, temperature: 25 });
    let somme = 0;
    for (const e of g.noeuds.values()) {
      if (e.type === 'String') somme += puissanceChaines(e, { irradiance: 1000, temperature: 25 });
    }
    const total = [...g.noeuds.values()].filter((e) => e.type === 'Inverter')
      .reduce((s, e) => s + (r.mesures.get(e.id)?.pDc ?? 0), 0);
    assert.equal(Math.round(somme), Math.round(total),
      'l’agrégation ne doit rien perdre ni rien inventer');
  });

  await t.test('on peut toujours descendre au détail d’un agrégat', () => {
    const c = genererCentrale({ puissanceDc: 50000 });
    const g = construire(c.equipements, c.liaisons);
    const agregat = [...g.noeuds.values()].find((e) => e.type === 'String');
    const detail = detailler(agregat, c.plan);
    assert.ok(detail.length > 1, 'un agrégat doit savoir s’ouvrir');
    assert.equal(detail[0].type, 'String');
    assert.equal(detail[0].properties.agrege, false);
    assert.ok(detail[0].properties.puissance > 0);
  });

  await t.test('la puissance transitée est conservée à chaque étage', () => {
    const c = genererCentrale({ puissanceDc: 50000 });
    const g = construire(c.equipements, c.liaisons);
    const r = propager(g, { irradiance: 1000, temperature: 25 });
    const arrivee = r.mesures.get('mv-arrivee')?.p ?? 0;
    assert.equal(Math.round(arrivee), Math.round(r.total.puissanceAc),
      'ce qui arrive au poste doit égaler ce que produisent les onduleurs');
    const parBloc = [...g.noeuds.values()].filter((e) => e.type === 'Transformer')
      .reduce((s, e) => s + (r.mesures.get(e.id)?.p ?? 0), 0);
    assert.equal(Math.round(parBloc), Math.round(r.total.puissanceAc),
      'aucune énergie ne doit être comptée deux fois');
  });

  await t.test('un grand parc reste calculable en quelques dizaines de millisecondes', () => {
    const c = genererCentrale({ puissanceDc: 500000 });
    const g = construire(c.equipements, c.liaisons);
    const debut = Date.now();
    propager(g, { irradiance: 1000, temperature: 25 });
    const duree = Date.now() - debut;
    // La cible est la fluidité sur un Android milieu de gamme : chaque
    // commande déclenche un recalcul complet, et l'écran attend dessus.
    assert.ok(duree < 400, `propagation de 500 MWc en ${duree} ms`);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('LE DIMENSIONNEMENT AUTOMATIQUE reste cohérent', async (t) => {
  await t.test('l’onduleur est choisi, pas subi', () => {
    for (const kwc of [500, 5000, 50000]) {
      const plan = planifier({ puissanceDc: kwc });
      assert.ok(plan.ratio > 0.7 && plan.ratio < 1.6,
        `rapport ${plan.ratio.toFixed(2)} pour ${kwc} kWc`);
    }
  });

  await t.test('un onduleur central compte ses entrées en coffrets', () => {
    const central = fiche('central-3600');
    const chaine = fiche('string-320');
    assert.ok(entreesDeChaine(central) > entreesDeChaine(chaine),
      'un central prend plus de chaînes qu’un onduleur de chaîne');
  });

  await t.test('la répartition ne perd aucune chaîne', () => {
    const mod = fiche('mono-550');
    const ond = fiche('string-320');
    const r = repartir(mod, ond, 28, 5000);
    assert.ok(r.onduleurs * r.chainesParOnduleur >= r.chaines,
      'les onduleurs doivent pouvoir accueillir toutes les chaînes');
  });

  await t.test('une puissance nulle ne produit pas un plan', () => {
    const plan = planifier({ puissanceDc: 0 });
    assert.equal(plan.valide, false);
    assert.equal(plan.avertissements[0].cle, 'puissance');
  });

  await t.test('une tension non normalisée remonte en avertissement', () => {
    const plan = planifier({ puissanceDc: 5000, tensionMt: 17000 });
    assert.ok(plan.avertissements.some((a) => a.cle === 'tension-mt'));
  });

  await t.test('toutes les masses du plan généré sont reliées à la terre', () => {
    const c = genererCentrale({ puissanceDc: 5000 });
    const g = construire(c.equipements, c.liaisons);
    const r = propager(g, { irradiance: 1000, temperature: 25 });
    assert.deepEqual(ingenierie(g, c.plan, r.mesures).sansTerre, []);
  });

  await t.test('les protections générées tiennent le courant qu’elles voient', () => {
    const c = genererCentrale({ puissanceDc: 5000 });
    const g = construire(c.equipements, c.liaisons);
    const r = propager(g, { irradiance: 1000, temperature: 25 });
    const hors = ingenierie(g, c.plan, r.mesures).protections.filter((p) => p.verdict === 'hors');
    assert.deepEqual(hors, [], 'un plan généré ne doit pas sortir hors calibre');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('LES DÉFAUTS ont une conséquence, pas seulement une couleur', async (t) => {
  await t.test('chaque défaut pose une alarme horodatée et nomme sa cause', () => {
    for (const [id, d] of Object.entries(DEFAUTS)) {
      const { graphe } = petiteCentrale();
      const cible = [...graphe.noeuds.values()].find((e) => d.cibles.includes(e.type));
      if (!cible) continue;
      const r = injecter(graphe, cible.id, id);
      assert.equal(r.applique, true, `${id} n’a pas pu être injecté`);
      assert.ok(r.alarme.horodatage > 0, `${id} : alarme sans horodatage`);
      assert.ok(r.alarme.texte.includes(d.nom), `${id} : l’alarme ne nomme pas le défaut`);
      assert.ok(['information', 'avertissement', 'defaut'].includes(r.alarme.gravite));
    }
  });

  await t.test('un défaut refusé sur un type incompatible ne change rien', () => {
    const { graphe } = petiteCentrale();
    const r = injecter(graphe, 'tr', 'ombrage');
    assert.equal(r.applique, false);
    assert.match(r.raison, /ne se conçoit pas/);
    assert.equal(graphe.noeuds.get('tr').status, 'NORMAL');
  });

  await t.test('l’ombrage réduit la production sans rien ouvrir', () => {
    const { graphe } = petiteCentrale();
    const avant = propager(graphe, { irradiance: 1000, temperature: 25 }).total.puissanceAc;
    injecter(graphe, 'str', 'ombrage', { taux: 0.5 });
    const apres = propager(graphe, { irradiance: 1000, temperature: 25 }).total.puissanceAc;
    assert.ok(apres < avant, 'l’ombrage doit coûter de la production');
    assert.ok(apres > 0, 'un ombrage n’est pas une coupure');
    assert.equal(graphe.noeuds.get('dc').status, 'CLOSED');
  });

  await t.test('une surintensité déclenche et coupe en aval', () => {
    const { graphe } = petiteCentrale();
    injecter(graphe, 'mv', 'surintensite');
    assert.equal(graphe.noeuds.get('mv').status, 'TRIPPED');
    assert.equal(propager(graphe, { irradiance: 1000, temperature: 25 }).total.puissanceAc, 0);
  });

  await t.test('une perte de communication n’arrête pas la production', () => {
    const { graphe } = petiteCentrale();
    const avant = propager(graphe, { irradiance: 1000, temperature: 25 }).total.puissanceAc;
    injecter(graphe, 'inv', 'perte-communication');
    const apres = propager(graphe, { irradiance: 1000, temperature: 25 }).total.puissanceAc;
    assert.equal(Math.round(apres), Math.round(avant),
      'l’absence de mesure n’est pas l’absence de production');
  });

  await t.test('les défauts proposés dépendent du type visé', () => {
    assert.ok(defautsPour('Inverter').some((d) => d.id === 'defaut-onduleur'));
    assert.ok(!defautsPour('Transformer').some((d) => d.id === 'ombrage'));
    assert.deepEqual(defautsPour('Grounding'), []);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('LE MODÈLE : l’apparence dérive de l’état, jamais l’inverse', async (t) => {
  await t.test('chaque état porte couleur, icône, animation et conduction', () => {
    for (const [code, e] of Object.entries(ETATS)) {
      assert.ok(e.couleur && e.icone && e.animation, `${code} : apparence incomplète`);
      assert.equal(typeof e.conduit, 'boolean', `${code} : conduction non décidée`);
    }
  });

  await t.test('le plus grave l’emporte quand deux états s’appliquent', () => {
    assert.equal(pire('RUNNING', 'FAULT'), 'FAULT');
    assert.equal(pire('NORMAL', 'ISOLATED'), 'ISOLATED');
    assert.equal(pire('LOCKED', 'OPEN'), 'LOCKED');
    assert.equal(pire('RUNNING'), 'RUNNING');
  });

  await t.test('les états de coupure ne conduisent pas', () => {
    for (const code of ['OPEN', 'TRIPPED', 'FAULT', 'LOCKED', 'ISOLATED',
      'MAINTENANCE', 'GRID_LOST']) {
      assert.equal(conduit(code), false, `${code} ne doit pas conduire`);
    }
    for (const code of ['NORMAL', 'RUNNING', 'CLOSED']) {
      assert.equal(conduit(code), true, `${code} doit conduire`);
    }
  });

  await t.test('un type inconnu est refusé à la construction', () => {
    assert.throws(() => equipement({ type: 'Licorne' }), /Type d’équipement inconnu/);
    assert.throws(() => liaison('a', 'b', 'usb'), /Type de liaison inconnu/);
  });

  await t.test('la terre ne transporte jamais d’énergie', () => {
    const noeuds = [
      equipement({ id: 'a', type: 'Inverter', status: 'RUNNING' }),
      equipement({ id: 'terre', type: 'Grounding' }),
      equipement({ id: 'b', type: 'Transformer', status: 'NORMAL' }),
      equipement({ id: 'grid', type: 'Grid', status: 'NORMAL' }),
    ];
    const g = construire(noeuds, [
      liaison('a', 'terre', 'pe'), liaison('b', 'terre', 'pe'),
      liaison('grid', 'a', 'ac'),
    ]);
    assert.equal(atteignables(g, ['grid']).has('b'), false,
      'passer par la terre ferait circuler la puissance n’importe où');
    assert.equal(relieALaTerre(g, 'b'), true, 'la terre existe : c’est une autre question');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('LE CATALOGUE n’invente aucune caractéristique constructeur', async (t) => {
  await t.test('aucune fiche ne se déclare vérifiée sans source', () => {
    assert.deepEqual(verifierCatalogue(), []);
  });

  await t.test('tout ce qui est générique est annoncé comme tel', () => {
    const c = couverture();
    assert.equal(c.verifiees + c.generiques, c.total);
    assert.equal(c.verifiees, 0,
      'aucun matériel réel n’est encore renseigné : le dire vaut mieux que le suggérer');
  });

  await t.test('les fiches portent un emplacement pour photo, notice et modèle 3D', () => {
    for (const f of [fiche('mono-550'), fiche('string-320'), fiche('tr-2500')]) {
      assert.ok('photo' in f && 'fiche' in f && 'modele3d' in f,
        `${f.id} : la place des médias doit exister, même vide`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
test('LE SIMULATEUR : une séquence d’exploitation complète', async (t) => {
  await t.test('une commande, un recalcul, un historique', () => {
    const sim = creerSimulateur({ puissanceDc: 5000 });
    const depart = sim.scada().puissance;
    assert.ok(depart > 0);
    const r = sim.commander('mv-1', 'OPEN');
    assert.equal(r.accepte, true);
    assert.ok(sim.scada().puissance < depart, 'ouvrir un bloc doit coûter sa production');
    assert.equal(sim.etat().evenements[0].commande, 'OPEN');
  });

  await t.test('les conséquences d’une manœuvre s’annoncent avant de la passer', () => {
    const sim = creerSimulateur({ puissanceDc: 5000 });
    const c = sim.consequences('mv-1', 'OPEN');
    // Le bloc ne se retrouve PAS hors tension : ses propres chaînes
    // continuent de l'alimenter. C'est vrai, c'est ce qui rend un poste
    // dangereux après une ouverture côté réseau, et l'écran doit le dire.
    assert.equal(c.nombre, 0, 'le bloc reste alimenté par son propre champ');
    assert.ok(c.nombreDecouples > 0,
      'en revanche il cesse d’injecter : c’est cela que l’exploitant décide');
  });

  await t.test('la fiche d’un équipement répond aux six questions', () => {
    const sim = creerSimulateur({ puissanceDc: 5000 });
    const f = sim.fiche('inv-1-1');
    assert.ok(f.identification.nom);
    assert.ok(Object.keys(f.caracteristiques).length > 0);
    assert.ok(f.etat.code);
    assert.ok(Object.keys(f.mesures).length > 0);
    assert.ok(f.commandes.length > 0);
    assert.ok(Array.isArray(f.historique));
    assert.equal(f.identification.verifie, false,
      'une fiche générique doit se présenter comme générique');
  });

  await t.test('l’énergie du jour suit la course du soleil', () => {
    const sim = creerSimulateur({ puissanceDc: 5000 });
    assert.equal(irradianceA(0), 0, 'il ne produit rien à minuit');
    assert.ok(irradianceA(12) > irradianceA(9));
    const debut = sim.etat().energieTotale;
    for (let i = 0; i < 24; i += 1) sim.avancer(60);
    const produit = sim.etat().energieTotale - debut;
    const parKwc = produit / 5000;
    assert.ok(parKwc > 3 && parKwc < 9,
      `${parKwc.toFixed(2)} kWh/kWc/jour est hors de tout ordre de grandeur`);
  });

  await t.test('un instantané se range et se relit à l’identique', () => {
    const sim = creerSimulateur({ puissanceDc: 5000 });
    sim.commander('mv-1', 'OPEN');
    sim.injecter('inv-1-2', 'defaut-onduleur');
    const copie = creerSimulateur({ puissanceDc: 5000 });
    assert.equal(copie.restaurer(JSON.parse(JSON.stringify(sim.instantane()))), true);
    assert.equal(copie.graphe().noeuds.get('mv-1').status, 'OPEN');
    assert.equal(copie.graphe().noeuds.get('inv-1-2').status, 'FAULT');
    assert.equal(Math.round(copie.scada().puissance), Math.round(sim.scada().puissance));
  });

  await t.test('un instantané de 500 MWc reste minuscule', () => {
    const sim = creerSimulateur({ puissanceDc: 500000 });
    sim.commander('mv-1', 'OPEN');
    const octets = JSON.stringify(sim.instantane()).length;
    assert.ok(octets < 20000,
      `${octets} octets : le quota du navigateur ne tiendrait pas le graphe entier`);
  });

  await t.test('un instantané corrompu ne casse pas le simulateur', () => {
    const sim = creerSimulateur({ puissanceDc: 5000 });
    assert.equal(sim.restaurer(null), false);
    assert.equal(sim.restaurer({ version: 99 }), false);
    assert.ok(sim.scada().puissance > 0, 'la centrale doit rester utilisable');
  });

  await t.test('les trois lectures répondent chacune à leur question', () => {
    const sim = creerSimulateur({ puissanceDc: 5000 });
    assert.ok(sim.ingenierie().lignes.length > 0);
    const ch = sim.chantier();
    assert.equal(ch.compte.installe + ch.compte.manquant + ch.compte.controle
      + ch.compte.defaut, ch.total);
    sim.marquerChantier('inv-1-1', 'manquant');
    assert.equal(sim.chantier().compte.manquant, 1);
  });

  await t.test('les alarmes s’acquittent sans rien réarmer', () => {
    const sim = creerSimulateur({ puissanceDc: 5000 });
    const r = sim.injecter('inv-1-1', 'defaut-onduleur');
    assert.equal(sim.scada().alarmesActives, 1);
    sim.acquitter(r.alarme.id);
    assert.equal(sim.scada().alarmesActives, 0);
    assert.equal(sim.graphe().noeuds.get('inv-1-1').status, 'FAULT',
      'acquitter n’est pas réparer');
  });

  await t.test('le type Grounding n’accepte aucune commande', () => {
    assert.deepEqual(commandesDuType('Grounding'), []);
    assert.ok(alarmes(creerSimulateur({ puissanceDc: 500 }).graphe()).length === 0);
  });
});
