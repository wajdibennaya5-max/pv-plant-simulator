/**
 * Le gisement solaire tunisien, gouvernorat par gouvernorat.
 *
 * `productible` : énergie annuelle produite par kilowatt-crête installé, en
 * kWh/kWc/an, pour un champ ORIENTÉ PLEIN SUD ET INCLINÉ À L'OPTIMUM, pertes
 * usuelles comprises — onduleur, câblage, température, salissure.
 *
 * Chaque gouvernorat a sa valeur, et non plus une moyenne de zone : entre
 * Bizerte et Tozeur l'écart dépasse douze pour cent, soit plus que bien des
 * détails que l'étude prend soin de calculer. Les valeurs suivent la latitude
 * et la continentalité — l'intérieur et le sud reçoivent davantage, la côte
 * nord moins.
 *
 * ORDRE DE GRANDEUR ASSUMÉ : ce sont des références régionales, non une mesure
 * du toit du client. L'ombrage, l'état des modules et la ventilation font
 * varier le résultat. L'étude le dit, plutôt que de promettre une exactitude
 * qu'aucun calcul ne peut tenir sans visite.
 */

/** Productible de référence, par gouvernorat, en kWh/kWc/an. */
export const PRODUCTIBLE = {
  // Nord et côte nord : le moins ensoleillé du pays.
  bizerte: 1520, jendouba: 1530, beja: 1540, ariana: 1545, tunis: 1550,
  manouba: 1555, 'ben-arous': 1555, nabeul: 1560, zaghouan: 1575,
  kef: 1585, siliana: 1600,
  // Centre et Sahel.
  sousse: 1620, monastir: 1625, mahdia: 1635, kairouan: 1645,
  'sidi-bouzid': 1670, sfax: 1650, kasserine: 1675,
  // Sud : le gisement le plus fort, et le plus régulier.
  gafsa: 1700, gabes: 1710, medenine: 1730, kebili: 1755,
  tozeur: 1760, tataouine: 1745,
};

/** Familles de gisement, pour nommer une région à l'écran. */
export const ZONES_SOLAIRES = {
  nord: { nom: 'Nord', min: 1500, max: 1600 },
  centre: { nom: 'Centre et Sahel', min: 1600, max: 1690 },
  sud: { nom: 'Sud', min: 1690, max: 1800 },
};

/**
 * Productible d'un gouvernorat, en kWh/kWc/an.
 * @returns {number|null} `null` si le gouvernorat est inconnu — une étude sans
 *   lieu n'a pas de sens, et un chiffre inventé serait pire que rien.
 */
export const productible = (gouvernorat) => PRODUCTIBLE[gouvernorat] ?? null;

/** Le nom de la famille de gisement d'un gouvernorat. */
export function zoneSolaire(gouvernorat) {
  const p = productible(gouvernorat);
  if (!p) return null;
  for (const z of Object.values(ZONES_SOLAIRES)) {
    if (p >= z.min && p < z.max) return z.nom;
  }
  return ZONES_SOLAIRES.sud.nom;
}

/**
 * Part de la production annuelle, mois par mois.
 *
 * Un client qui ne voit qu'un total annuel se demande ce qu'il produira en
 * décembre — et croit souvent que l'hiver ne donne rien. La courbe répond, et
 * elle rassure : en Tunisie, le mois le plus creux produit encore près de la
 * moitié du mois le plus plein.
 *
 * Le sud a un profil plus plat que le nord : la différence entre l'été et
 * l'hiver s'y resserre.
 */
const PROFIL_NORD = [5.2, 6.1, 8.2, 9.4, 10.6, 11.1, 11.5, 10.7, 9.0, 7.4, 5.6, 5.2];
const PROFIL_SUD = [6.1, 6.8, 8.4, 9.2, 10.1, 10.4, 10.7, 10.2, 8.9, 7.7, 6.4, 5.1];

/** Les mois, pour les afficher. */
export const MOIS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin',
  'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

/**
 * Production mensuelle d'une installation, en kWh.
 * @param {number} annuelle production annuelle, en kWh
 * @param {string} gouvernorat
 * @returns {number[]|null} douze valeurs
 */
export function productionMensuelle(annuelle, gouvernorat) {
  const p = productible(gouvernorat);
  if (!p || !(annuelle > 0)) return null;
  // On interpole entre les deux profils selon la force du gisement : le sud
  // ensoleillé tire vers le profil plat, le nord vers le profil contrasté.
  const t = Math.min(1, Math.max(0, (p - 1520) / (1760 - 1520)));
  const parts = PROFIL_NORD.map((nord, i) => nord + (PROFIL_SUD[i] - nord) * t);
  const somme = parts.reduce((a, b) => a + b, 0);
  return parts.map((part) => Math.round((annuelle * part) / somme));
}

/**
 * Les vingt-quatre gouvernorats, tels qu'ils s'affichent dans le tunnel.
 * L'ordre est celui d'une liste déroulante sur téléphone : les plus peuplés
 * d'abord, parce que c'est là que se trouvent la plupart des visiteurs.
 */
export const GOUVERNORATS = [
  { id: 'tunis', nom: 'Tunis', nomAr: 'تونس' },
  { id: 'ariana', nom: 'Ariana', nomAr: 'أريانة' },
  { id: 'ben-arous', nom: 'Ben Arous', nomAr: 'بن عروس' },
  { id: 'manouba', nom: 'Manouba', nomAr: 'منوبة' },
  { id: 'sfax', nom: 'Sfax', nomAr: 'صفاقس' },
  { id: 'sousse', nom: 'Sousse', nomAr: 'سوسة' },
  { id: 'nabeul', nom: 'Nabeul', nomAr: 'نابل' },
  { id: 'monastir', nom: 'Monastir', nomAr: 'المنستير' },
  { id: 'bizerte', nom: 'Bizerte', nomAr: 'بنزرت' },
  { id: 'kairouan', nom: 'Kairouan', nomAr: 'القيروان' },
  { id: 'gabes', nom: 'Gabès', nomAr: 'قابس' },
  { id: 'mahdia', nom: 'Mahdia', nomAr: 'المهدية' },
  { id: 'medenine', nom: 'Médenine', nomAr: 'مدنين' },
  { id: 'zaghouan', nom: 'Zaghouan', nomAr: 'زغوان' },
  { id: 'beja', nom: 'Béja', nomAr: 'باجة' },
  { id: 'jendouba', nom: 'Jendouba', nomAr: 'جندوبة' },
  { id: 'kef', nom: 'Le Kef', nomAr: 'الكاف' },
  { id: 'siliana', nom: 'Siliana', nomAr: 'سليانة' },
  { id: 'kasserine', nom: 'Kasserine', nomAr: 'القصرين' },
  { id: 'sidi-bouzid', nom: 'Sidi Bouzid', nomAr: 'سيدي بوزيد' },
  { id: 'gafsa', nom: 'Gafsa', nomAr: 'قفصة' },
  { id: 'tozeur', nom: 'Tozeur', nomAr: 'توزر' },
  { id: 'kebili', nom: 'Kébili', nomAr: 'قبلي' },
  { id: 'tataouine', nom: 'Tataouine', nomAr: 'تطاوين' },
];

/** Le nom affichable d'un gouvernorat, ou `null`. */
export const nomGouvernorat = (id) =>
  GOUVERNORATS.find((g) => g.id === id)?.nom ?? null;
