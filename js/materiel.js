/**
 * Le matériel : modules et onduleurs.
 *
 * CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS. Ce ne sont pas des références
 * commerciales : aucun nom de marque, aucun modèle précis. Ce sont des
 * classes de matériel courantes, avec leurs caractéristiques typiques — et
 * elles sont annoncées comme telles.
 *
 * Inventer une fiche technique de marque, c'est promettre un produit qu'on ne
 * vend pas et des tensions qu'on n'a pas mesurées. Un installateur qui
 * dimensionne un string sur une fiche fausse s'en aperçoit sur le toit.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ À REMPLACER PAR VOTRE CATALOGUE RÉEL. Le jour où le matériel         │
 * │ effectivement proposé est arrêté, ce fichier accueille ses vraies    │
 * │ fiches : c'est le seul endroit à changer, et rien d'autre ne bouge.  │
 * └──────────────────────────────────────────────────────────────────────┘
 */

/** Ces fiches sont-elles celles d'un catalogue réel ? */
export const CATALOGUE_REEL = false;

/**
 * Modules photovoltaïques, par classe de puissance.
 *
 * Dimensions et grandeurs électriques aux conditions standard (STC :
 * 1000 W/m², 25 °C, AM 1.5). Le coefficient de température de la tension à
 * vide est ce qui décide de la longueur maximale d'un string : c'est la
 * grandeur la plus importante du tableau, et la plus souvent oubliée.
 */
export const MODULES = [
  {
    id: 'mono-450',
    nom: 'Monocristallin 450 Wc',
    resume: 'Format compact, pour les petits pans',
    puissance: 450,
    largeur: 1.134,
    hauteur: 1.903,
    rendement: 0.209,
    /** Tensions et courants au point de puissance maximale, en V et A. */
    vmp: 41.5, imp: 10.85,
    /** À vide et en court-circuit. */
    voc: 49.6, isc: 11.5,
    /** Dérive de la tension à vide, en pourcent par degré au-dessus de 25 °C. */
    coeffVoc: -0.27,
    /** Dérive de la puissance, en pourcent par degré. */
    coeffPuissance: -0.35,
  },
  {
    id: 'mono-550',
    nom: 'Monocristallin 550 Wc',
    resume: 'Le format le plus répandu en Tunisie',
    puissance: 550,
    largeur: 1.134,
    hauteur: 2.278,
    rendement: 0.213,
    vmp: 41.9, imp: 13.13,
    voc: 49.9, isc: 13.9,
    coeffVoc: -0.27,
    coeffPuissance: -0.35,
    defaut: true,
  },
  {
    id: 'mono-585',
    nom: 'Monocristallin 585 Wc',
    resume: 'Plus de puissance à surface égale',
    puissance: 585,
    largeur: 1.134,
    hauteur: 2.278,
    rendement: 0.226,
    vmp: 43.3, imp: 13.51,
    voc: 51.6, isc: 14.2,
    coeffVoc: -0.25,
    coeffPuissance: -0.30,
  },
];

export const MODULE_DEFAUT = MODULES.find((m) => m.defaut) ?? MODULES[0];
export const moduleParId = (id) => MODULES.find((m) => m.id === id) ?? MODULE_DEFAUT;

/**
 * Onduleurs de chaîne, par puissance de sortie.
 *
 * `vMpptMin` et `vMpptMax` bornent la plage où l'onduleur sait suivre le
 * point de puissance ; `vMax` est la tension à ne jamais dépasser, sous
 * peine de destruction.
 *
 * DEUX COURANTS, ET NON UN SEUL — la confusion la plus coûteuse du
 * dimensionnement. `iMpptMax` est le courant de FONCTIONNEMENT maximal d'une
 * entrée : il se compare au courant au point de puissance (Imp) des chaînes
 * en parallèle. `iScMax` est le courant de COURT-CIRCUIT admissible, plus
 * élevé : il se compare à l'Isc majoré d'une marge de surirradiance.
 * Comparer l'Isc majoré au seul `iMpptMax` déclare hors limites des
 * installations parfaitement saines — c'est l'erreur que ce commentaire
 * existe pour empêcher.
 */
export const ONDULEURS = [
  { id: 'ond-2', nom: '2 kW monophasé', puissance: 2, phases: 1, mppt: 1,
    chainesParMppt: 1, vMax: 600, vMpptMin: 90, vMpptMax: 500, iMpptMax: 15, iScMax: 20 },
  { id: 'ond-3', nom: '3 kW monophasé', puissance: 3, phases: 1, mppt: 2,
    chainesParMppt: 1, vMax: 600, vMpptMin: 90, vMpptMax: 520, iMpptMax: 15, iScMax: 20 },
  { id: 'ond-4', nom: '4 kW monophasé', puissance: 4, phases: 1, mppt: 2,
    chainesParMppt: 1, vMax: 600, vMpptMin: 90, vMpptMax: 520, iMpptMax: 15, iScMax: 20 },
  { id: 'ond-5', nom: '5 kW monophasé', puissance: 5, phases: 1, mppt: 2,
    chainesParMppt: 1, vMax: 600, vMpptMin: 90, vMpptMax: 520, iMpptMax: 15, iScMax: 20 },
  { id: 'ond-6', nom: '6 kW triphasé', puissance: 6, phases: 3, mppt: 2,
    chainesParMppt: 1, vMax: 1000, vMpptMin: 200, vMpptMax: 850, iMpptMax: 16, iScMax: 22 },
  { id: 'ond-10', nom: '10 kW triphasé', puissance: 10, phases: 3, mppt: 2,
    chainesParMppt: 2, vMax: 1000, vMpptMin: 200, vMpptMax: 850, iMpptMax: 16, iScMax: 22 },
  { id: 'ond-15', nom: '15 kW triphasé', puissance: 15, phases: 3, mppt: 2,
    chainesParMppt: 2, vMax: 1000, vMpptMin: 200, vMpptMax: 850, iMpptMax: 16, iScMax: 22 },
  { id: 'ond-20', nom: '20 kW triphasé', puissance: 20, phases: 3, mppt: 3,
    chainesParMppt: 2, vMax: 1100, vMpptMin: 200, vMpptMax: 950, iMpptMax: 20, iScMax: 30 },
  { id: 'ond-30', nom: '30 kW triphasé', puissance: 30, phases: 3, mppt: 3,
    chainesParMppt: 2, vMax: 1100, vMpptMin: 200, vMpptMax: 950, iMpptMax: 20, iScMax: 30 },
];

export const onduleurParId = (id) => ONDULEURS.find((o) => o.id === id) ?? null;

/**
 * TEMPÉRATURES DE DIMENSIONNEMENT, pour la Tunisie.
 *
 * La tension à vide monte quand il fait froid : c'est au petit matin d'un
 * jour d'hiver, panneaux froids et non encore chargés, que le string risque
 * de dépasser la tension maximale de l'onduleur. Inversement, c'est en
 * plein été que la tension s'effondre et peut passer sous la plage MPPT.
 *
 * Ces bornes sont des valeurs de dimensionnement prudentes pour le climat
 * tunisien, à ajuster pour un site de montagne ou de plein désert.
 */
export const TEMPERATURES = {
  /** Température de cellule minimale retenue, en °C. */
  min: 0,
  /** Température de cellule maximale retenue, en °C. */
  max: 70,
  /** Référence des fiches techniques. */
  reference: 25,
};

/** La tension à vide d'un module à une température donnée. */
export function vocA(mod, temperature) {
  const m = mod ?? MODULE_DEFAUT;
  const ecart = Number(temperature) - TEMPERATURES.reference;
  return m.voc * (1 + (m.coeffVoc / 100) * ecart);
}

/** La tension au point de puissance maximale à une température donnée. */
export function vmpA(mod, temperature) {
  const m = mod ?? MODULE_DEFAUT;
  const ecart = Number(temperature) - TEMPERATURES.reference;
  // La tension MPP suit sensiblement la même dérive que la tension à vide.
  return m.vmp * (1 + (m.coeffVoc / 100) * ecart);
}

/**
 * L'onduleur le plus juste pour une puissance crête donnée.
 *
 * On vise un champ légèrement plus gros que l'onduleur : les conditions
 * standard ne sont presque jamais atteintes, et un onduleur trop grand
 * travaille à faible charge, là où son rendement est le plus mauvais.
 *
 * On choisit donc le RATIO le plus proche de la cible, et non le premier
 * onduleur assez gros — prendre le premier donnait un 5 kW sur un champ de
 * 4 kWc, soit un rapport de 0,77 que le contrôle rejetait aussitôt.
 */
export function onduleurPour(puissanceKwc, { ratioVise = 1.15 } = {}) {
  const kwc = Number(puissanceKwc);
  if (!(kwc > 0)) return null;
  // Un rapport DANS la plage saine l'emporte toujours sur un rapport hors
  // plage, même plus proche de la cible en valeur absolue.
  const BAS = 0.95; const HAUT = 1.35;
  let meilleur = null;
  let scoreMin = Infinity;
  for (const o of ONDULEURS) {
    const r = kwc / o.puissance;
    const dehors = r < BAS ? BAS - r : r > HAUT ? r - HAUT : 0;
    const score = dehors * 100 + Math.abs(r - ratioVise);
    if (score < scoreMin) { scoreMin = score; meilleur = o; }
  }
  return meilleur;
}
