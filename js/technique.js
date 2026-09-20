/**
 * LE MODE TECHNICIEN : ce qu'un installateur doit vérifier avant de commander.
 *
 * Le client veut savoir combien il économise. L'installateur veut savoir si
 * la chaîne tient la tension un matin de janvier, et si le courant passe dans
 * l'entrée de l'onduleur. Ce sont deux métiers, et deux écrans.
 *
 * LES DEUX FAUTES QUE CE FICHIER SERT À NE PLUS COMMETTRE :
 *
 * 1. Dimensionner une chaîne sur la tension à 25 °C. La tension à vide monte
 *    quand il fait FROID : c'est au petit matin d'un jour d'hiver, modules
 *    froids et onduleur pas encore en charge, que la chaîne dépasse la
 *    tension maximale et détruit l'entrée. On calcule donc à la température
 *    minimale retenue, pas à celle de la fiche technique.
 * 2. Oublier que la tension s'effondre en été. À 70 °C de cellule, la tension
 *    au point de puissance chute d'un cinquième : une chaîne trop courte
 *    sort de la plage MPPT en plein mois d'août — au moment précis où elle
 *    devrait produire le plus.
 *
 * Chaque verdict nomme la valeur ET la limite qui l'a produit. « Hors
 * limites » sans le nombre n'aide personne à corriger.
 */
import { MODULE_DEFAUT, onduleurPour, TEMPERATURES } from './materiel.js';
import { valider, bornesChaine as bornesValidation, etatGlobal, donneesManquantes,
  ETATS, MARGE_COURANT as MARGE } from './validation.js';

/**
 * Les verdicts, du plus rassurant au plus grave.
 *
 * `inconnu` a été ajouté après coup, et c'est le plus important des quatre :
 * une fiche technique incomplète produisait auparavant des comparaisons avec
 * `undefined` — toutes fausses, toutes silencieusement « conformes » — ou
 * faisait carrément planter le calcul. Voir `validation.js`.
 */
export const VERDICTS = {
  conforme: { rang: 0, signe: '✓', nom: 'Conforme selon les limites configurées' },
  inconnu: { rang: 1, signe: '?', nom: 'Non vérifiable — données manquantes' },
  verifier: { rang: 2, signe: '⚠', nom: 'À vérifier' },
  hors: { rang: 3, signe: '✕', nom: 'Configuration hors limites configurées' },
};

/** Correspondance avec le vocabulaire du moteur de validation. */
const DEPUIS_ETAT = { pass: 'conforme', unknown: 'inconnu', warning: 'verifier', fail: 'hors' };

/** Marge de sécurité sur le courant, avant l'entrée de l'onduleur. */
export const MARGE_COURANT = MARGE;

/** Plage de rapport puissance crête / puissance onduleur jugée saine. */
/**
 * Un rapport de 1 est parfaitement sain ; c'est en dessous de 0,95 que
 * l'onduleur devient trop grand pour son champ et travaille mal.
 */
export const RATIO = { bas: 0.95, haut: 1.35, plancher: 0.85, plafond: 1.50 };

/**
 * Combien de modules pour atteindre une puissance crête.
 *
 * Vers le HAUT, comme dans `etude.js` : les deux comptages doivent tomber sur
 * le même nombre, sans quoi le rapport se contredit d'une page à l'autre. Et
 * puisque la production annoncée est calculée sur la puissance visée, mieux
 * vaut en installer un peu plus qu'un peu moins.
 */
export function nombreDeModules(puissanceKwc, mod = MODULE_DEFAUT) {
  const kwc = Number(puissanceKwc);
  if (!(kwc > 0) || !mod?.puissance) return 0;
  return Math.max(1, Math.ceil((kwc * 1000) / mod.puissance));
}

/**
 * Les longueurs de chaîne électriquement acceptables.
 * @returns {{min:number, max:number, vocFroid:number, vmpChaud:number}}
 */
export function bornesChaine(mod, onduleur) {
  return bornesValidation(mod ?? MODULE_DEFAUT, onduleur);
}

/**
 * Le dimensionnement complet d'un champ sur un onduleur.
 *
 * @returns {object|null} `null` si les données ne permettent pas de conclure
 */
export function dimensionner({ puissance, module: mod = MODULE_DEFAUT, onduleur = null }) {
  const kwc = Number(puissance);
  if (!(kwc > 0) || !mod) return null;

  const modules = nombreDeModules(kwc, mod);
  // L'onduleur se choisit sur la puissance RÉELLEMENT posée, pas sur celle
  // demandée : cinq modules de 550 font 2,75 kWc et non 3, et l'écart suffit
  // à faire basculer le rapport hors de la plage saine.
  const kwcReel = (modules * mod.puissance) / 1000;
  const ond = onduleur ?? onduleurPour(kwcReel);
  if (!ond) return null;
  const bornes = bornesChaine(mod, ond);

  // FICHE INCOMPLÈTE : on ne devine pas, on le dit. Auparavant, un champ
  // manquant produisait un `NaN` qui se propageait dans toutes les bornes,
  // vidait la recherche de configuration, et rendait `null` sans un mot — ou
  // faisait planter l'affichage du résultat. Le jour où ce catalogue sera
  // remplacé par un vrai catalogue fournisseur, une fiche incomplète est
  // certaine.
  if (bornes.manquants?.length) {
    return {
      onduleur: ond, module: mod, modules, modulesVises: modules,
      repartitionExacte: false, incomplet: true, manquants: bornes.manquants,
      longueur: null, chaines: null, chainesParMppt: null, bornes,
      puissanceDc: kwcReel, puissanceAc: ond.puissance, ratio: null,
      vocChaine: null, vmpChaineChaud: null, vmpChaineStc: null,
      courantFonctionnement: null, courantCourtCircuit: null,
      // Le contrôle dit ce qui manque VRAIMENT — les champs de la fiche —
      // et non « longueur, chaines », qui ne sont absents que parce que la
      // fiche incomplète a empêché de les calculer.
      controles: [{
        cle: 'fiche',
        nom: 'Fiche technique du matériel',
        etat: 'unknown',
        verdict: 'inconnu',
        mesure: '—',
        limite: '—',
        donneesManquantes: bornes.manquants,
        pourquoi: `Aucun contrôle électrique n’a pu être fait : ${
          bornes.manquants.join(', ')} ${bornes.manquants.length > 1
          ? 'manquent' : 'manque'} à la fiche. Une donnée absente ne vaut pas `
          + 'une validation positive. Complétez le catalogue, ou faites vérifier '
          + 'le dimensionnement par l’installateur.',
      }],
    };
  }

  const entrees = ond.mppt * ond.chainesParMppt;

  // TOUTES les répartitions sont pesées, pas seulement celles qui tombent
  // juste. Chercher d'abord une division exacte puis se rabattre sur une
  // formule approchée donnait, sur un champ de 30 kWc, cinq chaînes de onze
  // — la seule division exacte de 55 — alors que trois chaînes de dix-huit
  // passent le courant et les tensions sans rien forcer. Deux modules de
  // moins valent mieux qu'une entrée d'onduleur en surintensité.
  //
  // Les chaînes sont toutes de même longueur : mélanger deux longueurs sur un
  // même MPPT déséquilibre le suivi de puissance, et c'est une faute qu'on ne
  // propose pas.
  //
  // Le premier passage n'accepte qu'un quart d'écart sur le nombre de
  // modules : au-delà, ce n'est plus le champ demandé. Si rien ne tient dans
  // cette fenêtre, un second passage la lève — mieux vaut proposer la
  // meilleure configuration possible en disant que l'onduleur est trop petit
  // que ne rien rendre du tout à l'installateur.
  let retenu = null;
  let meilleurScore = -Infinity;
  let contraint = false;
  for (const fenetre of [Math.max(1, modules * 0.25), Infinity]) {
    for (let n = bornes.min; n <= bornes.max; n++) {
      for (let chaines = 1; chaines <= entrees; chaines++) {
        const total = n * chaines;
        if (Math.abs(total - modules) > fenetre) continue;

        const voc = n * bornes.vocFroid;
        const vmpChaud = n * bornes.vmpChaud;
        const vmpStc = n * mod.vmp;
        const parMppt = Math.ceil(chaines / ond.mppt);

        let score = 0;
        // Tomber juste sur le nombre de modules voulu prime sur tout le reste.
        score += total === modules ? 120 : -Math.abs(total - modules) * 14;
        // Une entrée en surintensité est écartée : la proposer serait proposer
        // une faute que le contrôle rejetterait aussitôt.
        if (mod.imp * parMppt > ond.iMpptMax
          || mod.isc * MARGE_COURANT * parMppt > ond.iScMax) score -= 500;
        // Marge de tension à vide : on en veut au moins dix pour cent.
        const margeVoc = 1 - voc / ond.vMax;
        score += margeVoc >= 0.10 ? 30 : margeVoc * 200;
        // Marge au bas de la plage MPPT par forte chaleur.
        const margeChaud = vmpChaud / ond.vMpptMin - 1;
        score += margeChaud >= 0.08 ? 30 : margeChaud * 200;
        // Travailler au cœur de la plage en conditions standard.
        const milieu = (ond.vMpptMin + ond.vMpptMax) / 2;
        score -= (Math.abs(vmpStc - milieu) / milieu) * 20;
        // À marges égales, moins de chaînes : moins de câble, moins de connecteurs.
        score -= chaines * 2;

        if (score > meilleurScore) {
          meilleurScore = score; retenu = { longueur: n, chaines };
        }
      }
    }
    if (retenu) break;
    // Le second passage n'a lieu que si le premier n'a rien trouvé.
    contraint = true;
  }
  if (!retenu) return null;
  const exact = retenu.longueur * retenu.chaines === modules;

  const { longueur, chaines } = retenu;
  const chainesParMppt = Math.ceil(chaines / ond.mppt);
  const puissanceDc = (longueur * chaines * mod.puissance) / 1000;
  const ratio = puissanceDc / ond.puissance;

  const vocChaine = longueur * bornes.vocFroid;
  const vmpChaineChaud = longueur * bornes.vmpChaud;
  const vmpChaineStc = longueur * mod.vmp;
  // Deux courants, et non un seul : celui qui circule en fonctionnement, et
  // celui d'un court-circuit majoré. Ils se comparent à deux limites
  // différentes de l'onduleur.
  const courantFonctionnement = mod.imp * chainesParMppt;
  const courantCourtCircuit = mod.isc * MARGE_COURANT * chainesParMppt;

  return {
    onduleur: ond,
    module: mod,
    modules: longueur * chaines,
    modulesVises: modules,
    repartitionExacte: exact,
    longueur,
    chaines,
    chainesParMppt,
    bornes,
    puissanceDc,
    puissanceAc: ond.puissance,
    ratio,
    vocChaine,
    vmpChaineChaud,
    vmpChaineStc,
    courantFonctionnement,
    courantCourtCircuit,
    incomplet: false,
    manquants: [],
    controles: [
      ...enVerdicts(valider({ module: mod, onduleur: ond, longueur, chaines,
        chainesParMppt })),
      ...controlesDeRepartition({ ond, longueur, chaines, exact, contraint, modules }),
    ],
  };
}

/** Le verdict le plus grave d'une liste de contrôles. */
export function verdictGlobal(controles) {
  if (!controles?.length) return 'inconnu';
  return controles.reduce((pire, c) =>
    (VERDICTS[c.verdict].rang > VERDICTS[pire].rang ? c.verdict : pire), 'conforme');
}

/** Tout ce qui manque pour conclure, sans doublon. */
export function manquePourConclure(dim) {
  return donneesManquantes(dim?.controles ?? []);
}

/** Traduit les états du moteur de validation dans le vocabulaire d'ici. */
function enVerdicts(controles) {
  return controles.map((c) => ({ ...c, verdict: DEPUIS_ETAT[c.etat] ?? 'inconnu' }));
}

/**
 * Les deux contrôles qui ne relèvent pas de l'électricité mais de la
 * répartition : ils appartiennent au dimensionnement, pas à la validation.
 */
function controlesDeRepartition({ ond, longueur, chaines, exact, contraint, modules }) {
  const sortie = [];

  if (contraint) {
    sortie.push({
      cle: 'capacite',
      nom: 'Capacité de l’onduleur',
      mesure: `${chaines} × ${longueur} = ${chaines * longueur} modules`,
      limite: `${modules} modules visés`,
      etat: 'fail',
      verdict: 'hors',
      donneesManquantes: [],
      pourquoi: `Cet onduleur ne peut pas porter le champ demandé : ses `
        + `${ond.mppt} MPPT et ses bornes de tension plafonnent à `
        + `${chaines * longueur} modules. Prenez un onduleur plus grand, ou `
        + 'scindez le champ sur plusieurs onduleurs.',
    });
  }

  if (!exact && !contraint) {
    sortie.push({
      cle: 'repartition',
      nom: 'Répartition en chaînes égales',
      mesure: `${chaines} × ${longueur} = ${chaines * longueur} modules`,
      limite: `${modules} modules visés`,
      etat: 'warning',
      verdict: 'verifier',
      donneesManquantes: [],
      pourquoi: 'Le nombre de modules ne se répartit pas en chaînes de longueur '
        + 'égale dans les bornes de tension. Ajustez le nombre de modules, ou '
        + 'prévoyez un second onduleur — mélanger deux longueurs sur un même '
        + 'MPPT déséquilibre le suivi de puissance.',
    });
  }

  return sortie;
}
