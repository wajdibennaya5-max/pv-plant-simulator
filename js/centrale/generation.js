/**
 * LA GÉNÉRATION AUTOMATIQUE D'UNE ARCHITECTURE COHÉRENTE.
 *
 * On donne une puissance visée, un module, un onduleur, les températures du
 * site et les tensions ; le moteur en déduit une centrale entière — longueur
 * de chaîne, nombre de chaînes, d'onduleurs, de transformateurs, de cellules,
 * de protections et de câbles.
 *
 * LA LONGUEUR DE CHAÎNE EST LE SEUL CALCUL QUI DÉTRUIT DU MATÉRIEL QUAND ON
 * LE RATE. La tension à vide MONTE quand il fait froid : c'est au petit matin
 * d'un jour d'hiver, modules froids et onduleur pas encore en charge, que la
 * chaîne dépasse la tension maximale de l'entrée. On dimensionne donc à la
 * température minimale DU SITE — pas à celle de la fiche technique, pas à une
 * constante nationale. Symétriquement, une chaîne trop courte sort de la
 * plage MPPT en plein été, au moment précis où elle devrait produire le plus.
 *
 * Les formules de tension sont celles de `materiel.js`, réutilisées telles
 * quelles : deux implémentations finiraient par diverger, et c'est l'écran
 * qu'on ne regarde pas qui garderait l'ancienne.
 *
 * RIEN N'EST FORCÉ. Quand une contrainte ne peut pas être tenue, le plan est
 * produit quand même, et l'incohérence remonte en avertissement. Un moteur
 * qui refuse de rendre un résultat n'apprend rien à celui qui l'utilise ; un
 * moteur qui corrige en silence lui ment.
 */
import { vocA, vmpA } from '../materiel.js';
import { equipement, liaison, identifiant, TYPES } from './modele.js';
import { fiche, defaut, famille } from './catalogue.js';

/** Températures de cellule retenues par défaut, en °C — à régler par site. */
export const TEMPERATURES_DEFAUT = { min: 0, max: 70 };

/** Tensions normalisées admises, en volts. */
export const TENSIONS = { bt: [400, 690, 800], mt: [10000, 20000, 30000, 33000] };

/** Plage de rapport puissance crête / puissance onduleur jugée saine. */
export const RATIO_DC_AC = { bas: 1.0, haut: 1.35, plancher: 0.85, plafond: 1.55 };

/** Chaînes groupées dans un coffret, quand l'architecture en comporte. */
export const CHAINES_PAR_COFFRET = 16;

/**
 * AU-DELÀ DE CE NOMBRE DE NŒUDS, ON AGRÈGE.
 *
 * Un parc de 500 MWc compte des centaines de milliers de modules. Les
 * matérialiser un par un remplirait la mémoire d'un téléphone avant d'avoir
 * affiché quoi que ce soit. Le graphe porte donc des nœuds agrégés qui
 * connaissent leur effectif, et `detailler()` descend au module quand on le
 * demande vraiment. C'est le compromis qui rend 500 MWc jouable sur Android.
 */
export const MAX_NOEUDS = 6000;

/**
 * LA DISPOSITION DU PLAN, en mètres.
 *
 * Ces nombres ne sont pas décoratifs : ils décident si le plan est lisible.
 * La première version espaçait les onduleurs de quatorze mètres sur une seule
 * ligne — un bloc de quatorze onduleurs débordait alors sur son voisin, et
 * les étiquettes se chevauchaient toutes. On range donc les onduleurs en
 * grille, et on donne aux blocs un pas plus grand que leur propre largeur.
 */
export const DISPOSITION = {
  colonnesOnduleurs: 4,
  pasOnduleurX: 26,
  pasOnduleurY: 34,
  /** Décalage des protections et des chaînes sous leur onduleur. */
  sousOnduleur: { protection: 11, chaines: 22 },
  /** Marge entre deux blocs. */
  margeBloc: 46,
  /** Écart entre les ouvrages communs, assez large pour leurs étiquettes. */
  pasCommun: 74,
};

const entier = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

/**
 * LES LONGUEURS DE CHAÎNE ÉLECTRIQUEMENT ACCEPTABLES.
 *
 * @returns {{min, max, retenue, vocFroid, vmpChaud, vmpFroid, vocChaine,
 *   vmpChaineChaud, avertissements}}
 */
export function longueurChaine({ module: mod, onduleur: ond,
  tempMin = TEMPERATURES_DEFAUT.min, tempMax = TEMPERATURES_DEFAUT.max } = {}) {
  const avertissements = [];
  const manquants = [];
  for (const champ of ['voc', 'vmp', 'coeffVoc', 'puissance']) {
    if (!Number.isFinite(Number(mod?.[champ]))) manquants.push(`module.${champ}`);
  }
  for (const champ of ['vMax', 'vMpptMin', 'vMpptMax']) {
    if (!Number.isFinite(Number(ond?.[champ]))) manquants.push(`onduleur.${champ}`);
  }
  if (manquants.length) {
    return { min: null, max: null, retenue: null, vocFroid: null, vmpChaud: null,
      vmpFroid: null, vocChaine: null, vmpChaineChaud: null, manquants,
      avertissements: [{ gravite: 'inconnu', cle: 'fiche',
        texte: `Longueur de chaîne non calculable : ${manquants.join(', ')} manque${
          manquants.length > 1 ? 'nt' : ''}.` }] };
  }

  if (Number(tempMin) > Number(tempMax)) {
    avertissements.push({ gravite: 'avertissement', cle: 'temperatures',
      texte: `Température minimale (${tempMin} °C) supérieure à la maximale (${tempMax} °C) : le dimensionnement n’a plus de sens.` });
  }

  const vocFroid = vocA(mod, tempMin);
  const vmpChaud = vmpA(mod, tempMax);
  const vmpFroid = vmpA(mod, tempMin);

  // Le plafond absolu : au-delà, l'entrée de l'onduleur est détruite.
  const max = Math.floor(ond.vMax / vocFroid);
  // Le plancher : en dessous, la chaîne sort de la plage MPPT par temps chaud.
  const min = Math.max(1, Math.ceil(ond.vMpptMin / vmpChaud));
  // Le plafond utile : au-delà, la chaîne sort de la plage MPPT par temps
  // froid — l'onduleur ne se détruit pas, mais il ne suit plus le point de
  // puissance, et la production tombe au moment le plus favorable de l'année.
  const plafondMppt = Math.floor(ond.vMpptMax / vmpFroid);

  let retenue = Math.min(max, plafondMppt);
  if (retenue < min) {
    avertissements.push({ gravite: 'defaut', cle: 'chaine-impossible',
      texte: `Aucune longueur de chaîne ne convient : il en faudrait au moins ${min} pour rester dans la plage MPPT à ${tempMax} °C, et au plus ${max} pour ne pas dépasser ${ond.vMax} V à ${tempMin} °C.` });
    retenue = Math.max(1, min);
  }
  if (plafondMppt < max) {
    avertissements.push({ gravite: 'information', cle: 'mppt-froid',
      texte: `Longueur plafonnée à ${plafondMppt} modules par la plage MPPT à froid (${ond.vMpptMax} V), et non par la tension maximale (${max} modules).` });
  }

  const vocChaine = retenue * vocFroid;
  if (vocChaine > ond.vMax) {
    avertissements.push({ gravite: 'defaut', cle: 'surtension-froid',
      texte: `Tension à vide à ${tempMin} °C : ${Math.round(vocChaine)} V pour ${retenue} modules, au-dessus des ${ond.vMax} V admis par l’onduleur.` });
  }

  return { min, max, retenue, vocFroid, vmpChaud, vmpFroid,
    vocChaine, vmpChaineChaud: retenue * vmpChaud, manquants: [], avertissements };
}

/**
 * COMBIEN DE CHAÎNES UNE ENTRÉE D'ONDULEUR ACCEPTE VRAIMENT.
 *
 * Un onduleur central n'a pas 24 entrées de chaîne : il a 24 arrivées de
 * COFFRET, et chaque coffret groupe une quinzaine de chaînes. Compter les
 * deux de la même façon divisait la taille admissible d'un central par
 * seize, et le plan sortait avec dix fois trop d'onduleurs.
 */
export function entreesDeChaine(ond) {
  const brut = (ond?.mppt ?? 1) * (ond?.entreesParMppt ?? 1);
  return ond?.architecture === 'central' ? brut * CHAINES_PAR_COFFRET : brut;
}

/** La répartition des chaînes sur les onduleurs, pour un couple donné. */
export function repartir(mod, ond, modulesParChaine, kwc) {
  const puissanceChaine = modulesParChaine * mod.puissance;
  // Les entrées bornent autant que la puissance : un onduleur qui accepte
  // 480 kWc mais n'a que 24 entrées ne prend pas une chaîne de plus.
  const parPuissance = Math.floor((ond.puissanceDcMax ?? ond.puissance * 1.3) / puissanceChaine);
  const parEntrees = entreesDeChaine(ond);
  const chainesParOnduleur = Math.max(1, Math.min(parPuissance, parEntrees));
  const chaines = Math.max(1, Math.round((kwc * 1000) / puissanceChaine));
  const onduleurs = Math.max(1, Math.ceil(chaines / chainesParOnduleur));
  const puissanceDc = (chaines * modulesParChaine * mod.puissance) / 1000;
  const puissanceAc = (onduleurs * ond.puissance) / 1000;
  return { parPuissance, parEntrees, chainesParOnduleur, chaines, onduleurs,
    puissanceDc, puissanceAc, ratio: puissanceDc / puissanceAc };
}

/** Le rapport crête/onduleur visé : un peu au-dessus de 1, jamais en dessous. */
export const RATIO_CIBLE = 1.15;

/**
 * L'ONDULEUR DONT LE RAPPORT TOMBE LE PLUS JUSTE.
 *
 * Même logique que `onduleurPour()` dans `materiel.js`, à l'échelle d'une
 * centrale : on ne prend pas le premier assez gros, on prend celui qui donne
 * le meilleur rapport. Un onduleur trop grand travaille à faible charge,
 * là où son rendement est le plus mauvais.
 */
export function meilleurOnduleur(mod, kwc, { tempMin, tempMax } = {}) {
  let meilleur = null;
  let meilleurScore = Infinity;
  for (const ond of famille('onduleur')) {
    const c = longueurChaine({ module: mod, onduleur: ond, tempMin, tempMax });
    if (!c.retenue) continue;
    const r = repartir(mod, ond, c.retenue, kwc);
    // Hors plage admissible, l'onduleur reste candidat mais lourdement
    // pénalisé : mieux vaut un plan imparfait et signalé que pas de plan.
    const hors = r.ratio > RATIO_DC_AC.plafond || r.ratio < RATIO_DC_AC.plancher;
    const score = Math.abs(r.ratio - RATIO_CIBLE) + (hors ? 10 : 0);
    if (score < meilleurScore) { meilleurScore = score; meilleur = ond; }
  }
  return meilleur ?? defaut('onduleur');
}

/**
 * LE PLAN COMPLET, avant toute construction d'objets.
 *
 * Séparer le plan du graphe permet de le vérifier, de le comparer et de
 * l'afficher sans jamais instancier un seul équipement — ce qui compte quand
 * la centrale pèse un demi-gigawatt.
 */
export function planifier({
  puissanceDc = 5000, moduleId = null, onduleurId = null, transformateurId = null,
  tempMin = TEMPERATURES_DEFAUT.min, tempMax = TEMPERATURES_DEFAUT.max,
  tensionBt = 800, tensionMt = 30000, structure = 'fixe',
} = {}) {
  const avertissements = [];
  const mod = fiche(moduleId) ?? defaut('module');
  const transfo = fiche(transformateurId) ?? defaut('transformateur');
  const struct = structure === 'tracker'
    ? fiche('tracker-1a') : fiche('fixe-20');

  const kwc = Number(puissanceDc);
  if (!(kwc > 0)) {
    return { valide: false, avertissements: [{ gravite: 'defaut', cle: 'puissance',
      texte: 'Puissance crête visée absente ou nulle.' }] };
  }

  // L'ONDULEUR SE CHOISIT, IL NE SE SUBIT PAS. Imposer une référence unique
  // donnait deux onduleurs de 320 kVA sur un champ de 500 kWc — un rapport de
  // 0,77, aussitôt rejeté par le contrôle. On retient donc, à défaut de choix
  // explicite, celui dont le rapport tombe le plus près de la cible saine.
  const ond = fiche(onduleurId) ?? meilleurOnduleur(mod, kwc, { tempMin, tempMax });
  const chaine = longueurChaine({ module: mod, onduleur: ond, tempMin, tempMax });
  avertissements.push(...chaine.avertissements);
  if (chaine.manquants.length) {
    return { valide: false, module: mod, onduleur: ond, chaine, avertissements };
  }

  const { parPuissance, parEntrees, chainesParOnduleur, chaines, onduleurs,
    puissanceDc: puissanceReelle, puissanceAc, ratio } = repartir(mod, ond, chaine.retenue, kwc);

  if (parEntrees < parPuissance) {
    avertissements.push({ gravite: 'information', cle: 'entrees',
      texte: `Onduleur limité par ses ${parEntrees} entrées de chaîne, et non par sa puissance continue (${parPuissance} chaînes possibles).` });
  }

  const chainesParMppt = Math.ceil(chainesParOnduleur / (ond.mppt ?? 1));
  const modules = chaines * chaine.retenue;
  const ecart = Math.abs(puissanceReelle - kwc) / kwc;
  if (ecart > 0.05) {
    avertissements.push({ gravite: 'avertissement', cle: 'ecart-puissance',
      texte: `Puissance atteinte ${Math.round(puissanceReelle)} kWc pour ${Math.round(kwc)} kWc visés (écart ${Math.round(ecart * 100)} %) : la longueur de chaîne ne permet pas de tomber plus juste.` });
  }

  if (ratio > RATIO_DC_AC.plafond || ratio < RATIO_DC_AC.plancher) {
    avertissements.push({ gravite: 'defaut', cle: 'ratio',
      texte: `Rapport puissance crête / puissance onduleurs de ${ratio.toFixed(2)}, hors de la plage ${RATIO_DC_AC.plancher}–${RATIO_DC_AC.plafond}.` });
  } else if (ratio > RATIO_DC_AC.haut || ratio < RATIO_DC_AC.bas) {
    avertissements.push({ gravite: 'avertissement', cle: 'ratio',
      texte: `Rapport puissance crête / puissance onduleurs de ${ratio.toFixed(2)}, hors de la plage saine ${RATIO_DC_AC.bas}–${RATIO_DC_AC.haut}.` });
  }

  // Le transformateur se choisit sur la puissance apparente des onduleurs
  // qu'il porte, jamais sur la puissance crête du champ.
  const onduleursParTransfo = Math.max(1, Math.floor(transfo.puissance / ond.puissance));
  const transformateurs = Math.ceil(onduleurs / onduleursParTransfo);
  const chargeTransfo = (Math.min(onduleursParTransfo, onduleurs) * ond.puissance) / transfo.puissance;
  if (chargeTransfo > 1) {
    avertissements.push({ gravite: 'defaut', cle: 'transformateur',
      texte: `Transformateur chargé à ${Math.round(chargeTransfo * 100)} % de sa puissance nominale.` });
  }

  if (!TENSIONS.bt.includes(Number(tensionBt))) {
    avertissements.push({ gravite: 'avertissement', cle: 'tension-bt',
      texte: `Tension basse tension ${tensionBt} V non normalisée (${TENSIONS.bt.join(', ')} V).` });
  }
  if (Number(tensionBt) !== Number(ond.vAc)) {
    avertissements.push({ gravite: 'avertissement', cle: 'tension-onduleur',
      texte: `Tension de sortie de l’onduleur (${ond.vAc} V) différente de la tension basse tension déclarée (${tensionBt} V).` });
  }
  if (!TENSIONS.mt.includes(Number(tensionMt))) {
    avertissements.push({ gravite: 'avertissement', cle: 'tension-mt',
      texte: `Tension moyenne tension ${tensionMt} V non normalisée (${TENSIONS.mt.map((v) => v / 1000).join(', ')} kV).` });
  }

  // Une cellule de protection par transformateur, plus l'arrivée et le comptage.
  const cellules = transformateurs + 2;
  const coffrets = ond.architecture === 'central'
    ? Math.ceil(chaines / CHAINES_PAR_COFFRET) : 0;

  const modulesParTable = struct?.modulesParTable ?? 28;
  const rangees = Math.ceil(modules / modulesParTable);
  const surface = modules * (mod.largeur * mod.hauteur);
  // L'emprise au sol tient compte de l'espacement entre rangées : un suiveur
  // demande plus de terrain qu'une structure fixe à puissance égale.
  const emprise = surface * (struct?.mobile ? 4.2 : 2.6);

  const courantChaine = mod.imp ?? 0;
  const cableDc = choisirCable('dc', courantChaine * 1.25);
  const courantAc = (ond.puissance / (Math.sqrt(3) * (Number(tensionBt) || 800)));
  const cableAc = choisirCable('ac', courantAc);
  const courantMt = (transfo.puissance / (Math.sqrt(3) * (Number(tensionMt) || 30000)));
  const cableMt = choisirCable('mv', courantMt);

  return {
    valide: true,
    module: mod, onduleur: ond, transformateur: transfo, structure: struct,
    chaine,
    modulesParChaine: chaine.retenue,
    chaines, chainesParOnduleur, chainesParMppt, modules,
    onduleurs, transformateurs, onduleursParTransfo, cellules, coffrets, rangees,
    modulesParTable,
    puissanceVisee: kwc, puissanceDc: puissanceReelle, puissanceAc, ratio,
    chargeTransfo,
    tensionBt: Number(tensionBt), tensionMt: Number(tensionMt),
    tempMin: Number(tempMin), tempMax: Number(tempMax),
    surface: Math.round(surface), emprise: Math.round(emprise),
    cables: { dc: cableDc, ac: cableAc, mv: cableMt },
    courants: { chaine: courantChaine, ac: courantAc, mt: courantMt },
    avertissements,
  };
}

/** Le plus petit câble dont le courant admissible couvre le besoin. */
export function choisirCable(usage, courant) {
  const liste = famillesCables(usage);
  const choisi = liste.find((c) => c.iz >= courant) ?? liste[liste.length - 1] ?? null;
  return choisi ? { ...choisi, courant: Math.round(courant), suffisant: choisi.iz >= courant } : null;
}

/** Les câbles d'un usage, du plus petit au plus grand. */
function famillesCables(usage) {
  const ids = { dc: ['dc-4', 'dc-6', 'dc-240'], ac: ['ac-300'], mv: ['mv-95'] };
  return (ids[usage] ?? []).map(fiche).filter(Boolean).sort((a, b) => a.iz - b.iz);
}

/**
 * CONSTRUIT LE GRAPHE À PARTIR DU PLAN.
 *
 * Les chaînes et les modules ne sont PAS matérialisés un par un : un nœud
 * agrégé porte leur effectif. C'est le seul moyen de tenir 500 MWc, et la
 * descente au module reste possible par `detailler()`.
 */
export function construireEquipements(plan) {
  if (!plan?.valide) return { equipements: [], liaisons: [], agrege: false };

  const equipements = [];
  const liaisons = [];
  const ajouter = (e) => { equipements.push(e); return e; };
  const relier = (a, b, type) => { liaisons.push(liaison(a, b, type)); };

  const centrale = ajouter(equipement({
    id: 'plant', type: 'Plant', name: `Centrale ${Math.round(plan.puissanceDc)} kWc`,
    position: { x: 0, y: 0 }, status: 'RUNNING',
    properties: {
      puissanceDc: plan.puissanceDc, puissanceAc: plan.puissanceAc,
      modules: plan.modules, chaines: plan.chaines, emprise: plan.emprise,
      tensionBt: plan.tensionBt, tensionMt: plan.tensionMt,
    },
  }));

  const C = DISPOSITION.pasCommun;
  const reseau = ajouter(equipement({
    id: 'grid', type: 'Grid', name: `Réseau ${plan.tensionMt / 1000} kV`,
    parentId: centrale.id, position: { x: 0, y: -150 }, status: 'NORMAL',
    properties: { tension: plan.tensionMt, frequence: 50 },
  }));
  centrale.childrenIds.push(reseau.id);

  const terre = ajouter(equipement({
    id: 'terre', type: 'Grounding', name: 'Réseau de terre général',
    parentId: centrale.id, position: { x: -C, y: -150 },
    properties: { resistance: 8, unite: 'Ω' },
  }));
  centrale.childrenIds.push(terre.id);

  for (const [id, nom, type, pos] of [
    ['scada', 'Supervision', 'SCADA', { x: C, y: -150 }],
    ['meteo', 'Station météo', 'WeatherStation', { x: C * 2, y: -150 }],
    ['local-exploit', 'Local d’exploitation', 'Building', { x: -C * 2, y: -150 }],
  ]) {
    const e = ajouter(equipement({ id, type, name: nom, parentId: centrale.id, position: pos }));
    centrale.childrenIds.push(e.id);
    relier(e.id, terre.id, 'pe');
  }

  // L'arrivée et le comptage, communs à toute la centrale.
  const arrivee = ajouter(equipement({
    id: 'mv-arrivee', type: 'MVCell', name: 'Cellule d’arrivée réseau',
    parentId: centrale.id, position: { x: 0, y: -74 }, status: 'CLOSED',
    model: fiche('mv-interrupteur')?.nom ?? null,
    properties: { fonction: 'arrivee', tension: plan.tensionMt, inMax: 630 },
  }));
  const comptage = ajouter(equipement({
    id: 'mv-comptage', type: 'MVCell', name: 'Cellule de comptage',
    parentId: centrale.id, position: { x: 0, y: -112 }, status: 'CLOSED',
    model: fiche('mv-comptage')?.nom ?? null,
    properties: { fonction: 'comptage', tension: plan.tensionMt, inMax: 630 },
  }));
  centrale.childrenIds.push(arrivee.id, comptage.id);
  relier(reseau.id, comptage.id, 'mv');
  relier(comptage.id, arrivee.id, 'mv');
  relier(arrivee.id, terre.id, 'pe');
  // Le contrôle d'ingénierie a trouvé cette cellule sans terre : toute masse
  // métallique d'un poste MT est reliée au réseau de terre, sans exception.
  relier(comptage.id, terre.id, 'pe');

  // AGRÉGATION : au-delà du budget de nœuds, les onduleurs d'un bloc se
  // regroupent en un seul nœud qui connaît son effectif. La centrale reste
  // manœuvrable au bloc, et `detailler()` rouvre le bloc demandé.
  const noeudsParBloc = 6 + plan.onduleursParTransfo * 3;
  const agrege = plan.transformateurs * noeudsParBloc > MAX_NOEUDS;
  const onduleursMateriels = agrege ? 1 : Math.min(plan.onduleursParTransfo, plan.onduleurs);

  const D = DISPOSITION;
  const rangsOnduleurs = Math.max(1, Math.ceil(onduleursMateriels / D.colonnesOnduleurs));
  // Le pas suit le contenu : un bloc ne doit jamais déborder sur son voisin.
  const largeurBloc = D.colonnesOnduleurs * D.pasOnduleurX;
  const hauteurBloc = 30 + rangsOnduleurs * D.pasOnduleurY + 34;
  const PAS_X = largeurBloc + D.margeBloc;
  const PAS_Y = hauteurBloc + D.margeBloc;
  const parLigne = Math.max(1, Math.ceil(Math.sqrt(plan.transformateurs)));
  let restantOnduleurs = plan.onduleurs;
  let restantChaines = plan.chaines;

  for (let b = 0; b < plan.transformateurs; b += 1) {
    const x = (b % parLigne) * PAS_X;
    const y = Math.floor(b / parLigne) * PAS_Y;
    const onduleursDuBloc = Math.min(plan.onduleursParTransfo, restantOnduleurs);
    restantOnduleurs -= onduleursDuBloc;
    const chainesDuBloc = Math.min(
      onduleursDuBloc * plan.chainesParOnduleur, restantChaines);
    restantChaines -= chainesDuBloc;

    const bloc = ajouter(equipement({
      id: `bloc-${b + 1}`, type: 'Block', name: `Bloc de puissance ${b + 1}`,
      parentId: centrale.id, position: { x, y }, status: 'RUNNING',
      properties: { onduleurs: onduleursDuBloc, chaines: chainesDuBloc,
        puissanceDc: (chainesDuBloc * plan.modulesParChaine * plan.module.puissance) / 1000,
        // L'emprise réelle du bloc : la vue dessine ce rectangle-là, et non
        // une taille fixe qui laisserait les équipements en déborder.
        largeurPlan: largeurBloc, hauteurPlan: hauteurBloc },
    }));
    centrale.childrenIds.push(bloc.id);

    const cellule = ajouter(equipement({
      id: `mv-${b + 1}`, type: 'MVCell', name: `Cellule de protection — bloc ${b + 1}`,
      parentId: bloc.id, position: { x, y: y - hauteurBloc / 2 + 4 }, status: 'CLOSED',
      model: fiche('mv-disjoncteur')?.nom ?? null,
      properties: { fonction: 'protection', tension: plan.tensionMt, inMax: 630,
        icc: 20000 },
    }));
    const transfo = ajouter(equipement({
      id: `tr-${b + 1}`, type: 'Transformer', name: `Transformateur ${b + 1}`,
      parentId: bloc.id, position: { x, y: y - hauteurBloc / 2 + 16 }, status: 'NORMAL',
      model: plan.transformateur.nom,
      properties: { puissance: plan.transformateur.puissance,
        couplage: plan.transformateur.couplage, ucc: plan.transformateur.ucc,
        primaire: plan.tensionBt, secondaire: plan.tensionMt,
        tempMax: plan.transformateur.tempMax, temperature: 45 },
    }));
    const protAc = ajouter(equipement({
      id: `ac-${b + 1}`, type: 'ACProtection', name: `Disjoncteur général BT — bloc ${b + 1}`,
      parentId: bloc.id, position: { x, y: y - hauteurBloc / 2 + 28 }, status: 'CLOSED',
      properties: { tension: plan.tensionBt,
        calibre: Math.ceil((onduleursDuBloc * plan.onduleur.puissance)
          / (Math.sqrt(3) * plan.tensionBt) * 1.25) },
    }));
    bloc.childrenIds.push(cellule.id, transfo.id, protAc.id);
    relier(arrivee.id, cellule.id, 'mv');
    relier(cellule.id, transfo.id, 'mv');
    relier(transfo.id, protAc.id, 'ac');
    relier(transfo.id, terre.id, 'pe');
    relier(cellule.id, terre.id, 'pe');

    // LA RÉPARTITION SE FAIT SANS ARRONDI. Diviser puis arrondir faisait
    // perdre ou inventer des chaînes bloc après bloc : sur un parc de
    // 100 MWc, la somme des effectifs ne retombait plus sur le nombre de
    // chaînes du plan, et la puissance affichée s'écartait silencieusement.
    let resteBloc = chainesDuBloc;
    for (let o = 0; o < onduleursMateriels; o += 1) {
      const effectif = agrege ? onduleursDuBloc : 1;
      const chainesOnd = Math.max(0, Math.ceil(resteBloc / (onduleursMateriels - o)));
      resteBloc -= chainesOnd;
      const ond = ajouter(equipement({
        id: `inv-${b + 1}-${o + 1}`, type: 'Inverter',
        name: agrege ? `Onduleurs du bloc ${b + 1} (${effectif})`
          : `Onduleur ${b + 1}.${o + 1}`,
        parentId: bloc.id, position: positionOnduleur(x, y, o, hauteurBloc, D),
        status: 'RUNNING', model: plan.onduleur.nom,
        properties: { effectif, puissance: plan.onduleur.puissance * effectif,
          rendement: plan.onduleur.rendement, vMax: plan.onduleur.vMax,
          vMpptMin: plan.onduleur.vMpptMin, vMpptMax: plan.onduleur.vMpptMax,
          mppt: plan.onduleur.mppt, vAc: plan.onduleur.vAc,
          chaines: chainesOnd, cosPhi: 1 },
      }));
      const protDc = ajouter(equipement({
        id: `dc-${b + 1}-${o + 1}`, type: 'DCProtection',
        name: agrege ? `Protections continues du bloc ${b + 1}` : `Sectionneur DC ${b + 1}.${o + 1}`,
        parentId: bloc.id,
        position: { x: ond.position.x, y: ond.position.y + D.sousOnduleur.protection },
        status: 'CLOSED',
        // LE CALIBRE PORTE TOUTES LES CHAÎNES DE L'ONDULEUR, pas celles d'une
        // seule entrée MPPT : le sectionneur est en amont de l'onduleur, donc
        // en aval du groupage. Le calibrer sur une entrée le donnait six fois
        // trop petit, et le contrôle d'ingénierie le rejetait à chaque plan.
        properties: { effectif, tension: plan.onduleur.vMax,
          calibre: Math.ceil(plan.module.isc * plan.chainesParOnduleur * 1.25) },
      }));
      // LE NŒUD AGRÉGÉ DE CHAÎNES : il porte son effectif, et il produit pour
      // tout le monde. `detailler()` le remplace par ses chaînes réelles.
      const chaines = ajouter(equipement({
        id: `str-${b + 1}-${o + 1}`, type: 'String',
        name: `Chaînes ${b + 1}.${o + 1} (${chainesOnd})`,
        parentId: bloc.id,
        position: { x: ond.position.x, y: ond.position.y + D.sousOnduleur.chaines },
        status: 'RUNNING',
        properties: { effectif: chainesOnd, agrege: true,
          modulesParChaine: plan.modulesParChaine,
          modules: chainesOnd * plan.modulesParChaine,
          module: plan.module.id,
          puissance: chainesOnd * plan.modulesParChaine * plan.module.puissance,
          vmp: plan.chaine.vmpChaineChaud, voc: plan.chaine.vocChaine,
          imp: plan.module.imp, isc: plan.module.isc,
          // PAS D'IRRADIANCE ICI : elle vient de l'ambiance, et elle change
          // d'heure en heure. La figer sur la fiche faisait produire la
          // centrale à midi vingt-quatre heures sur vingt-quatre, et
          // l'énergie du jour sortait au triple du réel. Le champ reste
          // acceptable en surcharge locale — un ombrage mesuré sur une zone.
          ombrage: 0, salissure: 0.02 },
      }));
      bloc.childrenIds.push(ond.id, protDc.id, chaines.id);
      relier(chaines.id, protDc.id, 'dc+');
      relier(chaines.id, protDc.id, 'dc-');
      relier(protDc.id, ond.id, 'dc+');
      relier(protDc.id, ond.id, 'dc-');
      relier(ond.id, protAc.id, 'ac');
      relier(ond.id, terre.id, 'pe');
      relier(chaines.id, terre.id, 'pe');
    }

    // La rangée agrégée porte le champ : c'est l'objet que la vue plan
    // dessine au dézoom, et celui qu'elle éclate au zoom.
    const rangeesDuBloc = Math.max(1, Math.round(plan.rangees / plan.transformateurs));
    const rangee = ajouter(equipement({
      id: `row-${b + 1}`, type: 'Row', name: `Rangées du bloc ${b + 1} (${rangeesDuBloc})`,
      parentId: bloc.id,
      position: { x: x - 20, y: y + hauteurBloc / 2 - 14 },
      properties: { effectif: rangeesDuBloc, agrege: true,
        modulesParRangee: plan.modulesParTable,
        modules: chainesDuBloc * plan.modulesParChaine,
        module: plan.module.id },
    }));
    const porteur = ajouter(equipement({
      id: plan.structure?.mobile ? `trk-${b + 1}` : `str-fixe-${b + 1}`,
      type: plan.structure?.mobile ? 'Tracker' : 'Structure',
      name: plan.structure?.mobile
        ? `Suiveurs du bloc ${b + 1} (${rangeesDuBloc})` : `Structures fixes du bloc ${b + 1}`,
      parentId: bloc.id,
      position: { x: x + 20, y: y + hauteurBloc / 2 - 14 },
      status: plan.structure?.mobile ? 'RUNNING' : 'NORMAL',
      model: plan.structure?.nom ?? null,
      properties: { effectif: rangeesDuBloc, agrege: true,
        inclinaison: plan.structure?.inclinaison ?? null,
        mobile: plan.structure?.mobile === true, angle: 0 },
    }));
    bloc.childrenIds.push(rangee.id, porteur.id);
    relier(porteur.id, terre.id, 'pe');
  }

  return { equipements, liaisons, agrege, noeuds: equipements.length };
}

/** La place d'un onduleur dans la grille de son bloc. */
function positionOnduleur(x, y, indice, hauteurBloc, D) {
  const colonne = indice % D.colonnesOnduleurs;
  const rang = Math.floor(indice / D.colonnesOnduleurs);
  return {
    x: x + (colonne - (D.colonnesOnduleurs - 1) / 2) * D.pasOnduleurX,
    y: y - hauteurBloc / 2 + 46 + rang * D.pasOnduleurY,
  };
}

/** Le plan et son graphe, d'un seul appel. */
export function genererCentrale(parametres = {}) {
  const plan = planifier(parametres);
  const { equipements, liaisons, agrege, noeuds } = construireEquipements(plan);
  return { plan, equipements, liaisons, agrege, noeuds,
    avertissements: plan.avertissements ?? [] };
}

/**
 * DESCEND AU DÉTAIL D'UN NŒUD AGRÉGÉ.
 *
 * On ne matérialise QUE ce qui est demandé, et on rend des objets complets —
 * un module sélectionné doit être un équipement comme un autre, sans quoi le
 * panneau de détail devrait connaître deux formes d'objet.
 */
export function detailler(noeud, plan, { limite = 400 } = {}) {
  if (!noeud?.properties?.agrege) return [];
  const mod = fiche(noeud.properties.module) ?? plan?.module ?? null;

  if (noeud.type === 'String') {
    const n = Math.min(entier(noeud.properties.effectif) ?? 0, limite);
    return Array.from({ length: n }, (_, i) => equipement({
      id: `${noeud.id}-c${i + 1}`, type: 'String', name: `${noeud.name.split(' (')[0]} — chaîne ${i + 1}`,
      parentId: noeud.parentId, position: { x: noeud.position.x + i * 2, y: noeud.position.y },
      status: noeud.status,
      properties: { effectif: 1, agrege: false,
        modulesParChaine: noeud.properties.modulesParChaine,
        module: noeud.properties.module,
        puissance: noeud.properties.modulesParChaine * (mod?.puissance ?? 0),
        vmp: noeud.properties.vmp, voc: noeud.properties.voc,
        imp: noeud.properties.imp, isc: noeud.properties.isc,
        ombrage: noeud.properties.ombrage, salissure: noeud.properties.salissure },
    }));
  }

  if (noeud.type === 'Row') {
    const n = Math.min(entier(noeud.properties.effectif) ?? 0, limite);
    return Array.from({ length: n }, (_, i) => equipement({
      id: `${noeud.id}-r${i + 1}`, type: 'Row', name: `Rangée ${i + 1}`,
      parentId: noeud.parentId, position: { x: noeud.position.x, y: noeud.position.y + i * 6 },
      properties: { effectif: 1, agrege: false,
        modulesParRangee: noeud.properties.modulesParRangee,
        module: noeud.properties.module },
    }));
  }

  if (noeud.type === 'Inverter' && (entier(noeud.properties.effectif) ?? 1) > 1) {
    const n = Math.min(entier(noeud.properties.effectif) ?? 0, limite);
    const unitaire = (noeud.properties.puissance ?? 0) / (noeud.properties.effectif || 1);
    return Array.from({ length: n }, (_, i) => equipement({
      id: `${noeud.id}-o${i + 1}`, type: 'Inverter', name: `Onduleur ${i + 1}`,
      parentId: noeud.parentId, position: { x: noeud.position.x + i * 8, y: noeud.position.y },
      status: noeud.status, model: noeud.model,
      properties: { ...noeud.properties, effectif: 1, agrege: false, puissance: unitaire },
    }));
  }

  return [];
}

/** Les modules d'une rangée, matérialisés à la demande. */
export function modulesDeRangee(rangee, plan) {
  const n = entier(rangee?.properties?.modulesParRangee) ?? 0;
  const mod = fiche(rangee?.properties?.module) ?? plan?.module ?? null;
  return Array.from({ length: n }, (_, i) => equipement({
    id: `${rangee.id}-m${i + 1}`, type: 'Module', name: `Module ${i + 1}`,
    parentId: rangee.id, position: { x: i * 1.2, y: 0 },
    status: rangee.status === 'FAULT' ? 'FAULT' : 'RUNNING',
    model: mod?.nom ?? null,
    properties: { puissance: mod?.puissance ?? null, voc: mod?.voc ?? null,
      vmp: mod?.vmp ?? null, imp: mod?.imp ?? null, isc: mod?.isc ?? null },
  }));
}
