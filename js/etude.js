/**
 * L'étude photovoltaïque, calculée depuis une facture STEG.
 *
 * LE PARTI PRIS QUI REND CETTE ÉTUDE HONNÊTE : on ne devine pas le tarif de
 * l'électricité. Les tranches STEG changent, elles diffèrent selon le contrat,
 * et un tarif supposé fausserait toute l'économie du projet. On demande donc
 * au client ce qu'il a réellement payé et ce qu'il a réellement consommé —
 * c'est écrit sur sa facture — et on en déduit son prix du kilowattheure.
 *
 * Une étude bâtie sur ses chiffres à lui, il la reconnaît. Une étude bâtie sur
 * une moyenne nationale, il la conteste.
 */
import { productible, productionMensuelle } from './gisement.js';
import { facteurOrientation } from './orientation.js';
import { autoconsommationDe, TYPE_DEFAUT } from './batiment.js';
import { evite, eviteSurDuree } from './co2.js';

/**
 * HYPOTHÈSES ÉCONOMIQUES — à vérifier avant toute mise en ligne, et à revoir
 * chaque année. Ce sont les seuls nombres du calcul qui ne viennent pas du
 * client, donc les seuls qui puissent vieillir mal.
 */
export const HYPOTHESES = {
  /**
   * PART FIXE DU COÛT, en dinars, indépendante de la puissance.
   *
   * Coffret de protection, câblage principal, mise à la terre, déplacement et
   * main-d'œuvre de base : tout cela se paie une fois, que l'installation
   * fasse un kilowatt ou dix.
   *
   * Le coût était purement proportionnel, et cela faussait les petites
   * installations dans le sens le plus trompeur : le moteur d'optimisation,
   * cherchant le remboursement le plus rapide, proposait 1 kWc — parce qu'un
   * kilowatt y coûtait exactement le dixième de dix kilowatts, ce qu'aucun
   * installateur ne facturera jamais.
   */
  coutFixe: 1200,
  /** Part proportionnelle du coût, en dinars par kWc : modules, onduleur, pose. */
  coutParKwc: 2700,
  /**
   * Part autoconsommée d'une installation dimensionnée sur la consommation
   * annuelle (production ≈ consommation), sans batterie. C'est le point de
   * référence de la courbe ci-dessous, pas une constante : une installation
   * plus grosse autoconsomme une part plus faible.
   */
  autoconsommation: 0.65,
  /** Ce que vaut le surplus injecté, en part du prix d'achat (rachat STEG). */
  valeurSurplus: 0.5,
  /** Hausse annuelle du prix de l'électricité. */
  hausseElectricite: 0.06,
  /** Perte de rendement annuelle des modules. */
  degradation: 0.005,
  /**
   * Entretien annuel, en part de l'investissement.
   *
   * Il était absent, et c'est une omission qui flattait le projet : nettoyage,
   * vérifications et remplacement d'onduleur amorti coûtent quelque chose
   * chaque année. Sur une installation de 4 kWc, l'ignorer avançait le retour
   * de six mois — un chiffre que l'installateur aurait démenti.
   */
  maintenanceAnnuelle: 0.01,
  /** Inflation appliquée aux dépenses d'entretien. */
  inflation: 0.05,
  /** Durée retenue pour l'économie cumulée. */
  duree: 25,
  /** Surface au sol nécessaire par kWc, en m². */
  surfaceParKwc: 6,
};

/** Puissance minimale et maximale proposées, en kWc. */
export const PUISSANCE = { min: 1, max: 30, pas: 0.5 };

/**
 * LE PRODUCTIBLE RÉELLEMENT UTILISÉ PAR LE CALCUL.
 *
 * Quand un service de données solaires a mesuré le rayonnement AU POINT, sa
 * valeur remplace celle de notre référentiel par gouvernorat. Sinon on garde
 * la nôtre.
 *
 * Ce n'est pas une commodité : c'est ce qui distingue une vraie intégration
 * d'un décor. Afficher « productible mesuré : 1753 » tout en calculant la
 * production sur 1650 serait exactement le faux-semblant qu'un installateur
 * découvre en refaisant l'addition — et il ne reviendrait pas.
 */
export function productibleRetenu(gouvernorat, mesure = null) {
  const m = Number(mesure);
  if (Number.isFinite(m) && m > 0) return m;
  return productible(gouvernorat);
}

/**
 * LA PART AUTOCONSOMMÉE DÉPEND DE LA TAILLE — et l'ignorer fausse tout.
 *
 * Le soleil produit à midi ; le foyer consomme le soir. Une petite
 * installation passe presque entièrement dans les appareils allumés dans la
 * journée. Une grosse déborde : le surplus part sur le réseau, où il ne vaut
 * que le prix de rachat, la moitié du prix d'achat.
 *
 * Tant que ce taux était figé, deux installations de tailles très
 * différentes affichaient le même temps de retour — ce qui est faux, et ce
 * qui rendait toute comparaison entre scénarios trompeuse.
 *
 * La courbe ci-dessous, interpolée linéairement, relie le ratio
 * production / consommation à la part réellement autoconsommée. Elle passe
 * par 0,65 à ratio 1 : le dimensionnement de référence ne change pas.
 * C'est une approximation de foyer tunisien sans batterie, à revoir le jour
 * où des relevés réels la contrediront.
 */
export const COURBE_AUTOCONSOMMATION = [
  [0.00, 1.00],
  [0.25, 0.90],
  [0.50, 0.80],
  [0.75, 0.72],
  [1.00, 0.65],
  [1.25, 0.58],
  [1.50, 0.52],
  [2.00, 0.44],
  [3.00, 0.33],
];

/** Le point d'ancrage de la courbe : sa valeur à ratio 1. */
const ANCRAGE = 0.65;

/**
 * Part de la production consommée sur place, pour un ratio donné.
 *
 * @param {number} ratio production annuelle ÷ consommation annuelle
 * @param {number} reference part autoconsommée à ratio 1 ; toute la courbe
 *   se règle sur elle, pour qu'ajuster `HYPOTHESES.autoconsommation` ait bien
 *   l'effet attendu au lieu d'être ignoré en silence.
 * @returns {number} entre 0 et 1
 */
export function tauxAutoconsommation(ratio, reference = HYPOTHESES.autoconsommation) {
  const points = COURBE_AUTOCONSOMMATION;
  const echelle = (reference > 0 ? reference : ANCRAGE) / ANCRAGE;
  const lu = (v) => Math.max(0, Math.min(1, v * echelle));

  const r = Number(ratio);
  if (!(r > 0)) return lu(points[0][1]);
  if (r >= points.at(-1)[0]) {
    // Au-delà du dernier point, on prolonge la décroissance sans jamais
    // franchir zéro : une installation démesurée autoconsomme peu, pas rien.
    const [dr, dt] = points.at(-1);
    return Math.max(0.05, lu((dt * dr) / r));
  }
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (r <= x2) return lu(y1 + ((y2 - y1) * (r - x1)) / (x2 - x1));
  }
  return lu(points.at(-1)[1]);
}

/**
 * Prix réel du kilowattheure, déduit de la facture.
 * @returns {number|null} dinars par kWh, ou `null` si les chiffres ne
 *   permettent aucune déduction.
 */
export function prixDuKwh({ consommationAnnuelle, montantAnnuel }) {
  const kwh = Number(consommationAnnuelle);
  const dt = Number(montantAnnuel);
  if (!(kwh > 0) || !(dt > 0)) return null;
  return dt / kwh;
}

/**
 * Puissance à installer pour couvrir la consommation.
 *
 * On ne vise pas la couverture totale : au-delà de ce que le foyer consomme
 * réellement dans la journée, chaque kWc supplémentaire ne rapporte plus que
 * le prix du surplus, bien inférieur. Le dimensionnement s'arrête donc là où
 * il cesse d'être rentable, et non là où il serait le plus gros.
 */
export function puissanceRecommandee({
  consommationAnnuelle, gouvernorat, surfaceDisponible, orientation, pente,
  productibleMesure = null,
}) {
  const rendement = productibleRetenu(gouvernorat, productibleMesure);
  const kwh = Number(consommationAnnuelle);
  if (!rendement || !(kwh > 0)) return null;

  // Un toit mal orienté produit moins par kilowatt : il en faut davantage
  // pour couvrir le même besoin. L'ignorer sous-dimensionnerait l'installation
  // sans que personne ne s'en aperçoive avant la première facture.
  const f = facteurOrientation(orientation, pente);
  const effectif = rendement * (f ? f.facteur : 1);

  let kwc = kwh / effectif;

  // La toiture disponible peut brider le projet avant l'économie.
  if (surfaceDisponible > 0) {
    kwc = Math.min(kwc, surfaceDisponible / HYPOTHESES.surfaceParKwc);
  }

  kwc = Math.min(PUISSANCE.max, Math.max(PUISSANCE.min, kwc));
  // Au demi-kilowatt — un onduleur ne se vend pas au centième — et vers le
  // BAS quand la toiture contraint : arrondir vers le haut proposerait une
  // installation qui n'y tient pas.
  const arrondi = surfaceDisponible > 0
    ? Math.floor(kwc / PUISSANCE.pas) * PUISSANCE.pas
    : Math.round(kwc / PUISSANCE.pas) * PUISSANCE.pas;
  return Math.max(PUISSANCE.min, arrondi);
}

/**
 * L'étude complète.
 *
 * @returns {object|null} `null` si les données ne permettent pas de conclure.
 *   Une étude incomplète ne s'affiche pas à moitié : elle ne s'affiche pas.
 */
export function etudier({
  consommationAnnuelle, montantAnnuel, gouvernorat, surfaceDisponible = 0,
  puissance = null, orientation = null, pente = null, hypotheses = HYPOTHESES,
  batiment = TYPE_DEFAUT, moduleWc = 550, productibleMesure = null,
}) {
  const prixKwh = prixDuKwh({ consommationAnnuelle, montantAnnuel });
  const rendement = productibleRetenu(gouvernorat, productibleMesure);
  const kwc = puissance ?? puissanceRecommandee({
    consommationAnnuelle, gouvernorat, surfaceDisponible, orientation, pente,
    productibleMesure });
  if (!prixKwh || !rendement || !kwc) return null;

  // Sans orientation renseignée, on ne pénalise pas : le visiteur n'a pas
  // encore répondu, et supposer le pire l'écarterait à tort.
  const f = facteurOrientation(orientation, pente);
  const facteur = f ? f.facteur : 1;
  const production = kwc * rendement * facteur;
  const consommation = Number(consommationAnnuelle);

  // Ce qui est consommé directement vaut le prix d'achat ; le reste est
  // injecté et ne vaut que le prix de rachat. La part autoconsommée dépend
  // de la taille de l'installation, pas d'une constante : voir la courbe.
  // À midi, une maison est vide et un atelier tourne : le même toit ne
  // consomme pas la même part de ce qu'il produit. Ignorer cela annonçait
  // à une entreprise la rentabilité d'un logement — plusieurs années
  // d'écart sur le retour.
  const reference = hypotheses.autoconsommation === HYPOTHESES.autoconsommation
    ? autoconsommationDe(batiment)
    : hypotheses.autoconsommation;
  const ratio = production / consommation;
  const taux = tauxAutoconsommation(ratio, reference);
  const autoconsomme = Math.min(consommation, production * taux);
  const surplus = Math.max(0, production - autoconsomme);
  const economieAn1 = autoconsomme * prixKwh
    + surplus * prixKwh * hypotheses.valeurSurplus;

  const cout = (hypotheses.coutFixe ?? 0) + kwc * hypotheses.coutParKwc;

  // Économie cumulée : l'électricité renchérit, les modules s'usent, et
  // l'entretien se paie chaque année. Ce dernier terme manquait : c'est le
  // même modèle que `finances.js`, pour que les deux moteurs ne donnent
  // jamais deux temps de retour différents sur la même page.
  const entretienAn1 = cout * (hypotheses.maintenanceAnnuelle ?? 0);
  let cumul = 0;
  let retour = null;
  const annees = [];
  for (let an = 1; an <= hypotheses.duree; an++) {
    const recette = economieAn1
      * (1 + hypotheses.hausseElectricite) ** (an - 1)
      * (1 - hypotheses.degradation) ** (an - 1);
    const entretien = entretienAn1 * (1 + (hypotheses.inflation ?? 0)) ** (an - 1);
    const economie = recette - entretien;
    cumul += economie;
    annees.push({ an, economie, cumul, recette, entretien });
    if (retour === null && cumul >= cout) {
      // Interpolation dans l'année : « 6,4 ans » se comprend mieux que « 7 ».
      const manquant = cout - (cumul - economie);
      retour = an - 1 + manquant / economie;
    }
  }

  return {
    puissance: kwc,
    production: Math.round(production),
    productible: rendement,
    /** Le productible vient-il d'une mesure au point, ou de notre référentiel ? */
    productibleMesure: Number.isFinite(Number(productibleMesure))
      && Number(productibleMesure) > 0,
    /** Ce que l'orientation retranche, ou 1 quand elle n'est pas connue. */
    facteurOrientation: facteur,
    /** Production mois par mois : un client veut savoir ce que donne décembre. */
    mensuel: productionMensuelle(Math.round(production), gouvernorat),
    prixKwh,
    consommation,
    couverture: Math.min(1, ratio),
    /** Le même rapport, sans plafond : « 130 % de vos besoins » se dit. */
    ratio,
    /** Part de la production réellement consommée sur place. */
    tauxAutoconsommation: taux,
    /** Le type de bâtiment retenu, et le taux de référence qui en découle. */
    batiment,
    autoconsommationReference: reference,
    /** CO₂ évité, en kilogrammes. */
    co2Annuel: evite(production),
    co2SurDuree: eviteSurDuree(production, hypotheses.duree, hypotheses.degradation),
    autoconsomme: Math.round(autoconsomme),
    surplus: Math.round(surplus),
    /** Recette brute de la première année, avant entretien. */
    recetteAnnuelle: economieAn1,
    /** Économie nette de la première année, entretien déduit. */
    economieAnnuelle: economieAn1 - entretienAn1,
    economieMensuelle: (economieAn1 - entretienAn1) / 12,
    entretienAnnuel: entretienAn1,
    cout,
    retour,
    economieTotale: cumul,
    gainNet: cumul - cout,
    surface: Math.ceil(kwc * hypotheses.surfaceParKwc),
    /**
     * Le nombre de modules, arrondi vers le HAUT.
     *
     * Deux raisons, et la seconde est la plus importante.
     *
     * D'abord la cohérence : le dimensionnement électrique arrondissait au
     * plus proche pendant que l'étude arrondissait au plus haut, et le même
     * rapport annonçait « 8 modules » en page 3 et « 1 chaîne de 7 modules »
     * en page 8. Un document qui se contredit d'une page à l'autre ne se
     * défend devant aucun installateur.
     *
     * Ensuite l'honnêteté du chiffre : toute la production, toute l'économie
     * et tout le temps de retour de cette étude sont calculés sur la
     * puissance visée. Arrondir vers le bas installerait moins que ce qui a
     * été promis — le client s'en apercevrait sur sa première facture. Vers
     * le haut, il en a au moins autant.
     */
    modules: Math.max(1, Math.ceil((kwc * 1000) / moduleWc)),
    /** La puissance réellement posée avec ce nombre entier de modules. */
    puissanceInstallee: Math.round(Math.max(1,
      Math.ceil((kwc * 1000) / moduleWc)) * moduleWc) / 1000,
    moduleWc,
    annees,
  };
}
