import test from 'node:test';
import assert from 'node:assert/strict';
import { dimensionner, bornesChaine, nombreDeModules, verdictGlobal, VERDICTS,
  MARGE_COURANT, RATIO, manquePourConclure } from '../js/technique.js';
import { valider, etatGlobal, ETATS } from '../js/validation.js';
import { MODULES, MODULE_DEFAUT, ONDULEURS, onduleurPour, vocA, vmpA, TEMPERATURES }
  from '../js/materiel.js';

const PUISSANCES = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 25, 30];

test('la tension à vide monte quand il fait froid, et c’est ce qui dimensionne', () => {
  // Si cette relation s'inversait, tout le dimensionnement des chaînes
  // deviendrait faux sans qu'aucun autre test ne le voie.
  const m = MODULE_DEFAUT;
  assert.ok(vocA(m, TEMPERATURES.min) > m.voc, 'le froid doit monter la tension');
  assert.ok(vocA(m, TEMPERATURES.max) < m.voc, 'la chaleur doit la faire chuter');
  assert.ok(vmpA(m, TEMPERATURES.max) < m.vmp * 0.9,
    'à 70 °C, la tension MPP doit chuter nettement');
});

test('les bornes de chaîne encadrent bien la plage utile', () => {
  for (const mod of MODULES) {
    for (const ond of ONDULEURS) {
      const b = bornesChaine(mod, ond);
      assert.ok(b.max >= 1, `${mod.id}/${ond.id} : aucune longueur possible`);
      assert.ok(b.min >= 1);
      // La chaîne la plus longue admise ne doit jamais dépasser la tension max.
      assert.ok(b.max * b.vocFroid <= ond.vMax,
        `${mod.id}/${ond.id} : ${b.max} modules dépassent ${ond.vMax} V`);
      // La chaîne la plus courte admise doit rester dans la plage MPPT à chaud.
      if (b.min <= b.max) {
        assert.ok(b.min * b.vmpChaud >= ond.vMpptMin,
          `${mod.id}/${ond.id} : ${b.min} modules sortent de la plage MPPT à chaud`);
      }
    }
  }
});

test('aucune configuration proposée ne dépasse la tension maximale', () => {
  // C'est la faute qui détruit une entrée d'onduleur : elle ne doit jamais
  // sortir d'ici, quel que soit le module ou la puissance demandée.
  for (const mod of MODULES) {
    for (const kwc of PUISSANCES) {
      const d = dimensionner({ puissance: kwc, module: mod });
      assert.ok(d, `${mod.id} ${kwc} kWc : aucun dimensionnement`);
      assert.ok(d.vocChaine <= d.onduleur.vMax,
        `${mod.id} ${kwc} kWc : ${d.vocChaine.toFixed(0)} V pour ${d.onduleur.vMax} V max`);
    }
  }
});

test('aucune configuration proposée ne sort de la plage MPPT en plein été', () => {
  for (const mod of MODULES) {
    for (const kwc of PUISSANCES) {
      const d = dimensionner({ puissance: kwc, module: mod });
      assert.ok(d.vmpChaineChaud >= d.onduleur.vMpptMin,
        `${mod.id} ${kwc} kWc : ${d.vmpChaineChaud.toFixed(0)} V sous ${d.onduleur.vMpptMin} V`);
    }
  }
});

test('les deux courants sont contrôlés séparément, contre deux limites', () => {
  // Comparer l'Isc majoré au seul courant de fonctionnement déclarait hors
  // limites des installations parfaitement saines.
  const d = dimensionner({ puissance: 10 });
  assert.ok(d.courantCourtCircuit > d.courantFonctionnement);
  const cles = d.controles.map((c) => c.cle);
  assert.ok(cles.includes('courant'));
  assert.ok(cles.includes('court-circuit'));
  assert.equal(d.courantFonctionnement, d.module.imp * d.chainesParMppt);
  assert.equal(d.courantCourtCircuit, d.module.isc * MARGE_COURANT * d.chainesParMppt);
});

test('le module de référence tient sur chaque onduleur du catalogue', () => {
  // Un catalogue dont le module courant ne passe sur aucun onduleur ne sert
  // à rien : c'est ce que faisaient des limites de courant trop basses.
  for (const ond of ONDULEURS) {
    assert.ok(MODULE_DEFAUT.imp <= ond.iMpptMax,
      `${ond.id} : ${MODULE_DEFAUT.imp} A dépasse ${ond.iMpptMax} A dès une seule chaîne`);
    assert.ok(MODULE_DEFAUT.isc * MARGE_COURANT <= ond.iScMax, ond.id);
  }
});

test('les chaînes sont toutes de même longueur', () => {
  for (const kwc of PUISSANCES) {
    const d = dimensionner({ puissance: kwc });
    assert.equal(d.modules, d.longueur * d.chaines, `${kwc} kWc`);
    assert.ok(d.chaines <= d.onduleur.mppt * d.onduleur.chainesParMppt,
      `${kwc} kWc : ${d.chaines} chaînes pour ${d.onduleur.mppt} MPPT`);
  }
});

test('le nombre de modules proposé reste proche de celui visé', () => {
  for (const kwc of PUISSANCES) {
    const d = dimensionner({ puissance: kwc });
    const ecart = Math.abs(d.modules - d.modulesVises) / d.modulesVises;
    assert.ok(ecart <= 0.25, `${kwc} kWc : ${d.modules} au lieu de ${d.modulesVises}`);
    assert.equal(d.repartitionExacte, d.modules === d.modulesVises);
  }
});

test('un écart de modules est signalé, jamais passé sous silence', () => {
  const d = dimensionner({ puissance: 30 });
  if (!d.repartitionExacte) {
    const c = d.controles.find((x) => x.cle === 'repartition');
    assert.ok(c, 'un écart non signalé serait une surprise sur le chantier');
    assert.equal(c.verdict, 'verifier');
    assert.ok(c.mesure.includes(String(d.modules)));
  }
});

test('les cas courants sortent conformes ou tout au plus à vérifier', () => {
  // Si les tailles les plus vendues sortaient « hors limites », c'est le
  // catalogue ou les règles qui seraient faux, pas les installations.
  for (const kwc of [4, 5, 10, 12, 20, 25]) {
    const v = verdictGlobal(dimensionner({ puissance: kwc }).controles);
    assert.notEqual(v, 'hors', `${kwc} kWc sort hors limites`);
  }
});

test('une chaîne trop longue pour son onduleur est refusée en nommant la tension', () => {
  // On force un onduleur trop petit pour voir le contrôle mordre.
  const petit = ONDULEURS.find((o) => o.id === 'ond-2');
  const d = dimensionner({ puissance: 12, onduleur: petit });
  const v = verdictGlobal(d.controles);
  assert.equal(v, 'hors');
  for (const c of d.controles.filter((x) => x.verdict !== 'conforme')) {
    assert.ok(c.mesure && c.limite, `${c.cle} ne dit pas sa mesure ou sa limite`);
    assert.ok(c.pourquoi.length > 30, `${c.cle} n’explique pas quoi corriger`);
  }
});

test('chaque contrôle porte une mesure, une limite et une explication', () => {
  for (const c of dimensionner({ puissance: 10 }).controles) {
    assert.ok(VERDICTS[c.verdict], `verdict inconnu : ${c.verdict}`);
    assert.ok(c.nom && c.mesure && c.limite && c.pourquoi);
  }
});

test('le verdict global est le plus grave de tous', () => {
  // Aucun contrôle du tout, c'est « on n'a rien vérifié » — pas « conforme ».
  assert.equal(verdictGlobal([]), 'inconnu');
  assert.equal(verdictGlobal([{ verdict: 'conforme' }, { verdict: 'verifier' }]), 'verifier');
  assert.equal(verdictGlobal([{ verdict: 'hors' }, { verdict: 'verifier' }]), 'hors');
  // Un contrôle non vérifiable ne doit jamais s'effacer derrière un conforme.
  assert.equal(verdictGlobal([{ verdict: 'conforme' }, { verdict: 'inconnu' }]), 'inconnu');
  assert.equal(verdictGlobal([{ verdict: 'inconnu' }, { verdict: 'hors' }]), 'hors');
});

test('l’onduleur est choisi sur la puissance réellement posée', () => {
  // Cinq modules de 550 font 2,75 kWc et non 3 : l'écart suffit à faire
  // basculer le rapport hors de la plage saine.
  const d = dimensionner({ puissance: 3 });
  const attendu = onduleurPour((d.modules * d.module.puissance) / 1000);
  assert.equal(d.onduleur.id, attendu.id);
  assert.ok(Math.abs(d.puissanceDc - (d.modules * d.module.puissance) / 1000) < 1e-9);
});

test('le rapport DC/AC visé reste dans la plage saine pour les tailles courantes', () => {
  for (const kwc of [4, 5, 10, 12, 20, 25]) {
    const d = dimensionner({ puissance: kwc });
    assert.ok(d.ratio >= RATIO.bas && d.ratio <= RATIO.haut,
      `${kwc} kWc : rapport ${d.ratio.toFixed(2)}`);
  }
});

test('des données inexploitables ne rendent aucun dimensionnement', () => {
  assert.equal(dimensionner({ puissance: 0 }), null);
  assert.equal(dimensionner({ puissance: -4 }), null);
  assert.equal(dimensionner({ puissance: 4, module: null }), null);
});

test('le nombre de modules suit la puissance et le format', () => {
  assert.equal(nombreDeModules(5.5, MODULE_DEFAUT), 10);
  assert.equal(nombreDeModules(4, MODULE_DEFAUT), 8, 'vers le haut, jamais vers le bas');
  assert.ok(nombreDeModules(5.5, MODULES.find((m) => m.id === 'mono-450')) > 10);
  assert.equal(nombreDeModules(0), 0);
});

test('les nombres affichés sont écrits en français', () => {
  // Un point décimal anglais au milieu d'une page française se lit comme une
  // coquille, et fait douter du reste des chiffres.
  for (const c of dimensionner({ puissance: 10 }).controles) {
    assert.ok(!/\d\.\d/.test(c.mesure), `${c.cle} : « ${c.mesure} » garde un point décimal`);
    assert.ok(!/\d\.\d/.test(c.limite), `${c.cle} : « ${c.limite} » garde un point décimal`);
  }
});

/* ------------------------------------------------------------------ */
/* Fiches incomplètes — une donnée absente ne vaut jamais un « conforme » */
/* ------------------------------------------------------------------ */

test('une fiche d’onduleur incomplète ne fait plus planter le calcul', () => {
  // Elle levait une TypeError en pleine construction du tableau de bord :
  // la page de résultat entière disparaissait.
  const ond = { ...ONDULEURS.at(-2) };
  delete ond.iScMax;
  const d = dimensionner({ puissance: 10, onduleur: ond });
  assert.ok(d, 'aucun dimensionnement rendu');
  const c = d.controles.find((x) => x.cle === 'court-circuit');
  assert.equal(c.verdict, 'inconnu');
  assert.deepEqual(c.donneesManquantes, ['onduleur.iScMax']);
});

test('un champ manquant sort en INCONNU, jamais en conforme', () => {
  const cas = [
    ['module.imp', { puissance: 10, module: { ...MODULE_DEFAUT, imp: undefined } }, 'courant'],
    ['module.isc', { puissance: 10, module: { ...MODULE_DEFAUT, isc: null } }, 'court-circuit'],
  ];
  for (const [quoi, arg, cle] of cas) {
    const d = dimensionner(arg);
    const c = d.controles.find((x) => x.cle === cle);
    assert.equal(c.verdict, 'inconnu', `${quoi} : ${c.verdict}`);
    assert.ok(c.donneesManquantes.includes(quoi), `${quoi} non nommé`);
    assert.ok(c.pourquoi.includes('ne vaut pas'), 'le contrôle n’explique pas pourquoi');
  }
});

test('sans coefficient de température, aucun contrôle électrique n’est prétendu', () => {
  const d = dimensionner({ puissance: 10, module: { ...MODULE_DEFAUT, coeffVoc: undefined } });
  assert.equal(d.incomplet, true);
  assert.equal(verdictGlobal(d.controles), 'inconnu');
  assert.ok(manquePourConclure(d).includes('module.coeffVoc'),
    'le champ réellement absent doit être nommé');
  assert.ok(!d.controles.some((c) => c.verdict === 'conforme'),
    'aucun contrôle ne doit se déclarer conforme sur des données absentes');
});

test('une valeur nulle ou absente n’est jamais lue comme un zéro valide', () => {
  // `Number(null)` vaut zéro : un test naïf déclarerait la donnée connue et
  // repartirait sur des zéros — un rapport DC/AC de 0,00 « hors limites »
  // au lieu de « non vérifiable ».
  const c = valider({ module: MODULE_DEFAUT, onduleur: ONDULEURS.at(-1),
    longueur: null, chaines: null });
  assert.equal(c.length, 1);
  assert.equal(c[0].etat, 'unknown');
  assert.equal(etatGlobal(c), 'unknown');
});

test('les quatre états existent et s’ordonnent du plus rassurant au plus grave', () => {
  assert.deepEqual(Object.keys(ETATS), ['pass', 'unknown', 'warning', 'fail']);
  assert.ok(ETATS.pass.rang < ETATS.unknown.rang);
  assert.ok(ETATS.unknown.rang < ETATS.warning.rang);
  assert.ok(ETATS.warning.rang < ETATS.fail.rang);
  // INCONNU ne s'efface pas derrière un CONFORME, et n'accuse pas non plus.
  assert.equal(etatGlobal([{ etat: 'pass' }, { etat: 'unknown' }]), 'unknown');
  assert.equal(etatGlobal([{ etat: 'unknown' }, { etat: 'warning' }]), 'warning');
  assert.equal(etatGlobal([]), 'unknown');
});

test('une configuration venue d’ailleurs se valide sans passer par notre dimensionnement', () => {
  // C'est la raison d'être du moteur séparé : vérifier ce qu'un installateur
  // a décidé lui-même.
  const c = valider({ module: MODULE_DEFAUT, onduleur: ONDULEURS.find((o) => o.id === 'ond-10'),
    longueur: 40, chaines: 1, chainesParMppt: 1 });
  const froid = c.find((x) => x.cle === 'tension-froid');
  assert.equal(froid.etat, 'fail', '40 modules en série doivent être refusés');
  assert.match(froid.pourquoi, /détruite/);
});
