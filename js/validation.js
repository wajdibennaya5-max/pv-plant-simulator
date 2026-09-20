/**
 * ELECTRICAL VALIDATION ENGINE — les contrôles électriques, et rien d'autre.
 *
 * CE FICHIER NE DIMENSIONNE PAS ET N'AFFICHE RIEN. Il reçoit une
 * configuration déjà décidée et dit, contrôle par contrôle, si elle tient.
 * Séparer les deux permet de vérifier une configuration qui vient d'ailleurs
 * — saisie à la main par un installateur, importée d'un autre logiciel — sans
 * repasser par notre propre logique de dimensionnement.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ LA RÈGLE QUI GOUVERNE TOUT CE FICHIER : une donnée absente ne vaut   │
 * │ JAMAIS une validation positive. Elle vaut INCONNU.                    │
 * │                                                                       │
 * │ C'est un défaut réel qui a été trouvé ici : une fiche d'onduleur      │
 * │ privée de son courant de court-circuit admissible faisait planter le  │
 * │ calcul ; et une fiche privée d'un coefficient de température aurait   │
 * │ produit des comparaisons avec `undefined`, toutes fausses, toutes     │
 * │ silencieusement « conformes ». Le jour où ce catalogue sera remplacé  │
 * │ par un vrai catalogue fournisseur, une fiche incomplète est certaine. │
 * └──────────────────────────────────────────────────────────────────────┘
 */
import { TEMPERATURES, vocA, vmpA } from './materiel.js';

/** Les quatre états d'un contrôle, du plus rassurant au plus grave. */
export const ETATS = {
  pass: { rang: 0, signe: '✓', nom: 'Conforme', court: 'PASS' },
  unknown: { rang: 1, signe: '?', nom: 'Non vérifiable', court: 'UNKNOWN' },
  warning: { rang: 2, signe: '⚠', nom: 'À vérifier', court: 'WARNING' },
  fail: { rang: 3, signe: '✕', nom: 'Hors limites', court: 'FAIL' },
};

/** Marge de surirradiance appliquée au courant de court-circuit. */
export const MARGE_COURANT = 1.25;

/** Plage de rapport puissance crête / puissance onduleur jugée saine. */
export const RATIO = { bas: 0.95, haut: 1.35, plancher: 0.85, plafond: 1.50 };

/**
 * Un nombre exploitable, ou `null`. Jamais `NaN`, jamais `undefined`.
 *
 * `Number(null)` vaut ZÉRO et `Number(false)` aussi : un test naïf sur
 * `Number.isFinite` déclare donc « connue » une donnée absente, et la
 * validation repart sur des zéros. C'est exactement ce qui s'est produit ici
 * — une configuration sans longueur de chaîne ressortait avec un rapport
 * DC/AC de 0,00 et un verdict « hors limites », au lieu de « non
 * vérifiable ». Le fil conducteur de tout ce fichier, encore une fois :
 * l'absence de donnée doit rester visible jusqu'au bout.
 */
const nb = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Les champs manquants d'une fiche, nommés pour pouvoir les réclamer. */
function manquants(fiche, champs, ou) {
  return champs.filter((c) => nb(fiche?.[c]) === null).map((c) => `${ou}.${c}`);
}

const volts = (n) => `${Math.round(n).toLocaleString('fr-FR')} V`;
const amperes = (n) => `${n.toLocaleString('fr-FR',
  { minimumFractionDigits: 1, maximumFractionDigits: 1 })} A`;

/** Un contrôle qu'on ne peut pas faire : il le dit, et dit ce qui lui manque. */
const inconnu = (cle, nom, absents, quoi) => ({
  cle,
  nom,
  etat: 'unknown',
  mesure: '—',
  limite: '—',
  donneesManquantes: absents,
  pourquoi: `Ce contrôle n’a pas pu être fait : ${quoi} ${
    absents.length > 1 ? 'manquent' : 'manque'} (${absents.join(', ')}). `
    + 'Une donnée absente ne vaut pas une validation positive : complétez la '
    + 'fiche, ou faites vérifier ce point par l’installateur.',
});

/**
 * Les longueurs de chaîne électriquement admissibles.
 *
 * @returns {{min:number|null, max:number|null, vocFroid:number|null,
 *   vmpChaud:number|null, manquants:Array<string>}}
 *   Des `null` plutôt qu'un `NaN` : un `NaN` se propage en silence dans toutes
 *   les comparaisons qui suivent, et chacune répond « faux ».
 */
export function bornesChaine(mod, onduleur) {
  const absents = [
    ...manquants(mod, ['voc', 'vmp', 'coeffVoc'], 'module'),
    ...manquants(onduleur, ['vMax', 'vMpptMin'], 'onduleur'),
  ];
  if (absents.length) {
    return { min: null, max: null, vocFroid: null, vmpChaud: null, manquants: absents };
  }
  const vocFroid = vocA(mod, TEMPERATURES.min);
  const vmpChaud = vmpA(mod, TEMPERATURES.max);
  if (!(vocFroid > 0) || !(vmpChaud > 0)) {
    return { min: null, max: null, vocFroid: null, vmpChaud: null,
      manquants: ['module.coeffVoc (valeur aberrante)'] };
  }
  return {
    max: Math.floor(onduleur.vMax / vocFroid),
    min: Math.max(1, Math.ceil(onduleur.vMpptMin / vmpChaud)),
    vocFroid,
    vmpChaud,
    manquants: [],
  };
}

/**
 * Valide une configuration électrique.
 *
 * @param {object} cfg
 * @param {object} cfg.module fiche du module
 * @param {object} cfg.onduleur fiche de l'onduleur
 * @param {number} cfg.longueur modules par chaîne
 * @param {number} cfg.chaines nombre de chaînes
 * @param {number} [cfg.chainesParMppt] chaînes en parallèle sur une entrée
 * @returns {Array<object>} un contrôle par règle, jamais vide
 */
export function valider({ module: mod, onduleur: ond, longueur, chaines,
  chainesParMppt = null } = {}) {
  const controles = [];
  const n = nb(longueur);
  const c = nb(chaines);
  const parMppt = nb(chainesParMppt) ?? (c && nb(ond?.mppt) ? Math.ceil(c / ond.mppt) : null);

  if (n === null || c === null) {
    return [inconnu('configuration', 'Configuration de la chaîne',
      ['longueur', 'chaines'].filter((k) => nb({ longueur, chaines }[k]) === null),
      'la configuration')];
  }

  const bornes = bornesChaine(mod, ond);

  /* ---- 1. Tension à vide, modules froids ---- */
  const absentsFroid = [...manquants(mod, ['voc', 'coeffVoc'], 'module'),
    ...manquants(ond, ['vMax'], 'onduleur')];
  if (absentsFroid.length) {
    controles.push(inconnu('tension-froid',
      `Tension à vide à ${TEMPERATURES.min} °C`, absentsFroid, 'la fiche'));
  } else {
    const voc = n * bornes.vocFroid;
    controles.push({
      cle: 'tension-froid',
      nom: `Tension à vide à ${TEMPERATURES.min} °C`,
      mesure: volts(voc),
      limite: `maximum ${volts(ond.vMax)}`,
      valeur: voc,
      etat: voc > ond.vMax ? 'fail' : voc > ond.vMax * 0.95 ? 'warning' : 'pass',
      donneesManquantes: [],
      pourquoi: voc > ond.vMax
        ? `${n} modules en série dépassent la tension maximale de l’onduleur un `
          + 'matin d’hiver. Raccourcissez la chaîne : l’entrée serait détruite.'
        : voc > ond.vMax * 0.95
          ? 'La marge est inférieure à 5 %. Vérifiez la température minimale du '
            + 'site avant de valider — un site d’altitude descend plus bas.'
          : 'La chaîne reste sous la tension maximale, modules froids et à vide.',
    });
  }

  /* ---- 2. Tension MPP par forte chaleur ---- */
  const absentsChaud = [...manquants(mod, ['vmp', 'coeffVoc'], 'module'),
    ...manquants(ond, ['vMpptMin'], 'onduleur')];
  if (absentsChaud.length) {
    controles.push(inconnu('tension-chaud',
      `Tension MPP à ${TEMPERATURES.max} °C de cellule`, absentsChaud, 'la fiche'));
  } else {
    const vmpChaud = n * bornes.vmpChaud;
    controles.push({
      cle: 'tension-chaud',
      nom: `Tension MPP à ${TEMPERATURES.max} °C de cellule`,
      mesure: volts(vmpChaud),
      limite: `plage MPPT ${volts(ond.vMpptMin)} – ${
        nb(ond.vMpptMax) === null ? '?' : volts(ond.vMpptMax)}`,
      valeur: vmpChaud,
      etat: vmpChaud < ond.vMpptMin ? 'fail'
        : vmpChaud < ond.vMpptMin * 1.08 ? 'warning' : 'pass',
      donneesManquantes: [],
      pourquoi: vmpChaud < ond.vMpptMin
        ? 'En plein été, la chaîne sort de la plage MPPT : l’onduleur cesse de '
          + 'suivre le point de puissance au moment où le champ produit le plus. '
          + `Il faut au moins ${bornes.min} modules par chaîne.`
        : vmpChaud < ond.vMpptMin * 1.08
          ? 'La chaîne frôle le bas de la plage MPPT par forte chaleur. Une '
            + 'toiture mal ventilée peut dépasser 70 °C de cellule.'
          : 'La chaîne reste dans la plage MPPT même par forte chaleur.',
    });
  }

  /* ---- 3. Tension MPP aux conditions standard ---- */
  const absentsStc = [...manquants(mod, ['vmp'], 'module'),
    ...manquants(ond, ['vMpptMin', 'vMpptMax'], 'onduleur')];
  if (absentsStc.length) {
    controles.push(inconnu('tension-stc',
      'Tension MPP aux conditions standard', absentsStc, 'la fiche'));
  } else {
    const vmpStc = n * mod.vmp;
    controles.push({
      cle: 'tension-stc',
      nom: 'Tension MPP aux conditions standard',
      mesure: volts(vmpStc),
      limite: `plage MPPT ${volts(ond.vMpptMin)} – ${volts(ond.vMpptMax)}`,
      valeur: vmpStc,
      etat: (vmpStc > ond.vMpptMax || vmpStc < ond.vMpptMin) ? 'warning' : 'pass',
      donneesManquantes: [],
      pourquoi: vmpStc > ond.vMpptMax
        ? 'Au-dessus de la plage MPPT en conditions standard : l’onduleur '
          + 'écrêtera une partie de l’année.'
        : vmpStc < ond.vMpptMin
          ? 'Sous la plage MPPT en conditions standard : le rendement de '
            + 'conversion sera dégradé une bonne partie de l’année.'
          : 'La chaîne travaille au cœur de la plage MPPT.',
    });
  }

  /* ---- 4. Courant de fonctionnement ---- */
  const absentsI = [...manquants(mod, ['imp'], 'module'),
    ...manquants(ond, ['iMpptMax'], 'onduleur'),
    ...(parMppt === null ? ['configuration.chainesParMppt'] : [])];
  if (absentsI.length) {
    controles.push(inconnu('courant',
      'Courant de fonctionnement par MPPT', absentsI, 'la fiche'));
  } else {
    const i = mod.imp * parMppt;
    controles.push({
      cle: 'courant',
      nom: `Courant de fonctionnement par MPPT (${parMppt} chaîne${
        parMppt > 1 ? 's' : ''} en parallèle)`,
      mesure: amperes(i),
      limite: `maximum ${amperes(ond.iMpptMax)}`,
      valeur: i,
      etat: i > ond.iMpptMax ? 'fail' : i > ond.iMpptMax * 0.95 ? 'warning' : 'pass',
      donneesManquantes: [],
      pourquoi: i > ond.iMpptMax
        ? 'Trop de chaînes en parallèle sur une même entrée : l’onduleur écrêtera '
          + 'le courant. Répartissez sur davantage de MPPT, prenez un onduleur qui '
          + 'accepte plus de courant, ou scindez le champ sur deux onduleurs.'
        : 'Le courant au point de puissance reste dans les limites de l’entrée.',
    });
  }

  /* ---- 5. Courant de court-circuit majoré ---- */
  const absentsIsc = [...manquants(mod, ['isc'], 'module'),
    ...manquants(ond, ['iScMax'], 'onduleur'),
    ...(parMppt === null ? ['configuration.chainesParMppt'] : [])];
  if (absentsIsc.length) {
    controles.push(inconnu('court-circuit',
      'Courant de court-circuit majoré', absentsIsc, 'la fiche'));
  } else {
    const isc = mod.isc * MARGE_COURANT * parMppt;
    controles.push({
      cle: 'court-circuit',
      nom: `Courant de court-circuit majoré (marge ${
        String(MARGE_COURANT).replace('.', ',')})`,
      mesure: amperes(isc),
      limite: `maximum ${amperes(ond.iScMax)}`,
      valeur: isc,
      etat: isc > ond.iScMax ? 'fail' : isc > ond.iScMax * 0.95 ? 'warning' : 'pass',
      donneesManquantes: [],
      pourquoi: isc > ond.iScMax
        ? 'Un ciel voilé qui se déchire peut dépasser les conditions standard. '
          + 'L’entrée doit tenir ce courant sans être endommagée.'
        : 'L’entrée tient le court-circuit, marge de surirradiance comprise.',
    });
  }

  /* ---- 6. Rapport DC/AC ---- */
  const absentsR = [...manquants(mod, ['puissance'], 'module'),
    ...manquants(ond, ['puissance'], 'onduleur')];
  if (absentsR.length) {
    controles.push(inconnu('ratio',
      'Rapport puissance crête / puissance onduleur', absentsR, 'la fiche'));
  } else {
    const ratio = (n * c * mod.puissance) / 1000 / ond.puissance;
    controles.push({
      cle: 'ratio',
      nom: 'Rapport puissance crête / puissance onduleur',
      mesure: ratio.toFixed(2).replace('.', ','),
      limite: `plage saine ${RATIO.bas.toFixed(2)} – ${RATIO.haut.toFixed(2)}`
        .replace(/\./g, ','),
      valeur: ratio,
      etat: (ratio < RATIO.plancher || ratio > RATIO.plafond) ? 'fail'
        : (ratio < RATIO.bas || ratio > RATIO.haut) ? 'warning' : 'pass',
      donneesManquantes: [],
      pourquoi: ratio > RATIO.haut
        ? 'Le champ est nettement plus gros que l’onduleur : l’écrêtage sera '
          + 'sensible aux heures de pointe. Ce peut être un choix assumé sur un '
          + 'toit très bien exposé, ce n’est pas un accident acceptable ailleurs.'
        : ratio < RATIO.bas
          ? 'L’onduleur est plus grand que le champ : il travaillera souvent à '
            + 'faible charge, là où son rendement est le moins bon.'
          : 'Le champ est légèrement surdimensionné par rapport à l’onduleur, '
            + 'comme il se doit : les conditions standard ne sont presque jamais '
            + 'atteintes.',
    });
  }

  return controles;
}

/**
 * L'état le plus grave d'une liste de contrôles.
 *
 * INCONNU compte comme plus grave que CONFORME et moins que À VÉRIFIER : une
 * configuration qu'on n'a pas pu vérifier ne doit pas s'afficher comme
 * validée, mais elle ne doit pas non plus s'afficher comme fautive.
 */
export function etatGlobal(controles) {
  if (!controles?.length) return 'unknown';
  return controles.reduce((pire, c) =>
    (ETATS[c.etat].rang > ETATS[pire].rang ? c.etat : pire), 'pass');
}

/** Tout ce qui manque, sans doublon, pour le réclamer d'un coup. */
export function donneesManquantes(controles) {
  return [...new Set((controles ?? []).flatMap((c) => c.donneesManquantes ?? []))];
}
