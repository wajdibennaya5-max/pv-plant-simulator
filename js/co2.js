/**
 * Ce que l'installation évite de brûler.
 *
 * Le client n'achète pas du CO₂ évité, il achète une facture divisée. Mais
 * l'ordre de grandeur l'intéresse, et une entreprise en a besoin pour son
 * rapport. Autant le donner juste, et dire d'où il sort.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ FACTEUR À CONFIRMER. Le réseau tunisien est alimenté à plus de 90 %  │
 * │ au gaz naturel, ce qui place son contenu carbone bien au-dessus des  │
 * │ réseaux européens et en dessous des réseaux au charbon. La valeur    │
 * │ retenue est un ordre de grandeur ; elle n'a pas été relue sur une    │
 * │ publication officielle en vigueur. Le jour où elle l'est, c'est la   │
 * │ seule ligne à changer.                                               │
 * └──────────────────────────────────────────────────────────────────────┘
 */

/** Kilogrammes de CO₂ évités par kilowattheure solaire produit. */
export const FACTEUR = 0.47;

/** La source du facteur, pour l'écrire sous le chiffre plutôt que de la taire. */
export const SOURCE = 'réseau tunisien, majoritairement au gaz naturel';

/** Ce facteur a-t-il été relu sur une publication officielle ? */
export const VERIFIE = false;

/**
 * CO₂ évité, en kilogrammes par an.
 * @param {number} productionAnnuelle kWh produits par an
 */
export function evite(productionAnnuelle) {
  const kwh = Number(productionAnnuelle);
  if (!(kwh > 0)) return 0;
  return kwh * FACTEUR;
}

/** Le même, sur toute la durée retenue pour l'étude. */
export function eviteSurDuree(productionAnnuelle, annees = 25, degradation = 0.005) {
  const kwh = Number(productionAnnuelle);
  if (!(kwh > 0) || !(annees > 0)) return 0;
  let total = 0;
  for (let an = 0; an < annees; an++) total += kwh * (1 - degradation) ** an;
  return total * FACTEUR;
}

/**
 * L'équivalent parlant : des arbres, des kilomètres en voiture.
 *
 * Un chiffre en tonnes ne dit rien à personne. « Autant que 40 000 km en
 * voiture » se comprend sans effort — à condition de ne pas maquiller
 * l'approximation en précision.
 */
export const EQUIVALENTS = {
  /** kg de CO₂ absorbés par un arbre mûr et par an. */
  arbreParAn: 22,
  /** kg de CO₂ par kilomètre pour une voiture thermique moyenne. */
  kilometreVoiture: 0.15,
};

export function enArbres(kgParAn) {
  const kg = Number(kgParAn);
  if (!(kg > 0)) return 0;
  return Math.round(kg / EQUIVALENTS.arbreParAn);
}

export function enKilometres(kgParAn) {
  const kg = Number(kgParAn);
  if (!(kg > 0)) return 0;
  return Math.round(kg / EQUIVALENTS.kilometreVoiture);
}

/** « 2,4 tonnes » plutôt que « 2400 kg » dès que le chiffre devient gros. */
export function formater(kgParAn) {
  const kg = Number(kgParAn) || 0;
  if (kg < 1000) return `${Math.round(kg)} kg`;
  return `${(kg / 1000).toFixed(1).replace('.', ',')} t`;
}
