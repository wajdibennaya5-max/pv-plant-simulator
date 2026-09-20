/**
 * FINANCIAL INTELLIGENCE — l'argent, calculé à part et paramètres visibles.
 *
 * POURQUOI SÉPARER. L'économie annuelle était calculée au milieu de l'étude
 * technique, avec ses hypothèses en dur. Or c'est la partie que le client
 * discute le plus, celle que son banquier regarde, et celle où deux
 * hypothèses différentes donnent deux projets différents. Elle mérite son
 * propre moteur, ses propres paramètres, et ses propres tests.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ TOUS LES PARAMÈTRES SONT VISIBLES ET MODIFIABLES. Aucun n'est caché.  │
 * │ Les trois jeux — conservateur, standard, optimiste — ne sont pas des  │
 * │ humeurs : ce sont trois valeurs différentes des mêmes paramètres,     │
 * │ affichées à côté du résultat. Un client qui voit « hausse de          │
 * │ l'électricité : 3 % contre 8 % » comprend d'où vient l'écart ; un     │
 * │ client à qui l'on montre deux courbes sans les paramètres croit à un  │
 * │ tour de passe-passe.                                                  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * CE QUI N'EST PAS CALCULÉ ICI, et qui est dit plutôt que supposé : aucune
 * subvention, aucun crédit, aucune fiscalité. Ces dispositifs existent en
 * Tunisie, ils changent, et les inventer serait pire que les omettre.
 */

/**
 * Les paramètres financiers, avec ce qu'ils veulent dire.
 *
 * `unite` et `libelle` servent à les afficher ; `min` et `max` bornent les
 * réglages pour qu'un curseur ne produise pas un projet absurde.
 */
export const PARAMETRES = [
  { cle: 'coutFixe', libelle: 'Part fixe du coût', unite: 'DT',
    min: 0, max: 6000, pas: 100,
    aide: 'Coffret, câblage principal, mise à la terre, déplacement : payé une '
      + 'fois, que l’installation fasse un kilowatt ou dix.' },
  { cle: 'coutParKwc', libelle: 'Coût par kilowatt-crête', unite: 'DT/kWc',
    min: 1000, max: 6000, pas: 50,
    aide: 'Modules, onduleur et pose, proportionnels à la puissance. Hors '
      + 'travaux de toiture.' },
  { cle: 'maintenanceAnnuelle', libelle: 'Entretien annuel', unite: '% de l’investissement',
    min: 0, max: 3, pas: 0.1, pourcent: true,
    aide: 'Nettoyage, vérifications, remplacement d’onduleur amorti sur la durée.' },
  { cle: 'hausseElectricite', libelle: 'Hausse annuelle de l’électricité', unite: '%/an',
    min: 0, max: 12, pas: 0.5, pourcent: true,
    aide: 'Ce que le kilowattheure STEG renchérit chaque année. C’est le '
      + 'paramètre le plus incertain et le plus influent.' },
  { cle: 'inflation', libelle: 'Inflation des coûts d’entretien', unite: '%/an',
    min: 0, max: 12, pas: 0.5, pourcent: true,
    aide: 'Appliquée aux dépenses d’entretien, pas aux économies.' },
  { cle: 'degradation', libelle: 'Perte de rendement des modules', unite: '%/an',
    min: 0, max: 2, pas: 0.05, pourcent: true,
    aide: 'Vieillissement des modules. Les garanties usuelles portent sur 0,4 à 0,7 %.' },
  { cle: 'valeurSurplus', libelle: 'Valeur du surplus injecté', unite: '% du prix d’achat',
    min: 0, max: 100, pas: 5, pourcent: true,
    aide: 'Ce que la STEG reprend au kilowattheure que vous ne consommez pas.' },
  { cle: 'tauxActualisation', libelle: 'Taux d’actualisation', unite: '%/an',
    min: 0, max: 15, pas: 0.5, pourcent: true,
    aide: 'Ce que votre argent rapporterait ailleurs. Sert à la valeur actuelle '
      + 'nette : mille dinars dans quinze ans ne valent pas mille dinars aujourd’hui.' },
  { cle: 'duree', libelle: 'Durée d’analyse', unite: 'ans',
    min: 5, max: 30, pas: 1,
    aide: 'Les modules durent plus longtemps ; au-delà de vingt-cinq ans, les '
      + 'projections ne veulent plus dire grand-chose.' },
];

/** Le jeu de paramètres central. Les deux autres s'en écartent. */
export const STANDARD = {
  coutFixe: 1200,
  coutParKwc: 2700,
  maintenanceAnnuelle: 0.01,
  hausseElectricite: 0.06,
  inflation: 0.05,
  degradation: 0.005,
  valeurSurplus: 0.5,
  tauxActualisation: 0.06,
  duree: 25,
};

/**
 * Les trois jeux, et ce qui les distingue — écrit, pas sous-entendu.
 *
 * Ce ne sont pas trois humeurs : ce sont trois valeurs des mêmes paramètres.
 * L'écart entre conservateur et optimiste mesure l'incertitude du projet, et
 * c'est une information en soi.
 */
export const JEUX = [
  {
    id: 'conservateur',
    nom: 'Conservateur',
    resume: 'L’électricité augmente peu, le matériel vieillit vite',
    parametres: {
      ...STANDARD,
      coutFixe: 1400,
      coutParKwc: 2970,
      maintenanceAnnuelle: 0.015,
      hausseElectricite: 0.03,
      degradation: 0.007,
      tauxActualisation: 0.08,
    },
  },
  {
    id: 'standard',
    nom: 'Standard',
    resume: 'Les valeurs retenues par défaut dans l’étude',
    parametres: { ...STANDARD },
    defaut: true,
  },
  {
    id: 'optimiste',
    nom: 'Optimiste',
    resume: 'L’électricité augmente fort, le matériel tient bien',
    parametres: {
      ...STANDARD,
      coutFixe: 1100,
      coutParKwc: 2550,
      maintenanceAnnuelle: 0.007,
      hausseElectricite: 0.08,
      degradation: 0.004,
      tauxActualisation: 0.05,
    },
  },
];

export const jeu = (id) => JEUX.find((j) => j.id === id) ?? JEUX.find((j) => j.defaut);

/** Ce que ce moteur ne calcule pas — dit, plutôt que supposé. */
export const NON_PRIS_EN_COMPTE = [
  'Aucune subvention, prime ou aide publique n’est prise en compte.',
  'Aucun crédit ni frais financier n’est modélisé : l’investissement est '
    + 'supposé payé comptant.',
  'Aucun effet fiscal n’est appliqué.',
  'Le remplacement de l’onduleur est supposé couvert par l’entretien annuel, '
    + 'et non budgété séparément.',
];

/**
 * Le tableau de flux, année par année.
 *
 * @param {object} arg
 * @param {number} arg.puissance kWc
 * @param {number} arg.autoconsomme kWh consommés sur place, année 1
 * @param {number} arg.surplus kWh injectés, année 1
 * @param {number} arg.prixKwh DT/kWh
 * @param {object} [parametres]
 * @returns {{annees:Array, investissement:number, ...}|null}
 */
export function flux({ puissance, autoconsomme, surplus, prixKwh }, parametres = STANDARD) {
  const kwc = Number(puissance);
  const prix = Number(prixKwh);
  if (!(kwc > 0) || !(prix > 0)) return null;

  const p = { ...STANDARD, ...parametres };
  const investissement = (p.coutFixe ?? 0) + kwc * p.coutParKwc;
  const entretienAn1 = investissement * p.maintenanceAnnuelle;

  const annees = [];
  let cumul = -investissement;
  let cumulActualise = -investissement;
  let energieCumulee = 0;
  let retour = null;
  let retourActualise = null;

  for (let an = 1; an <= p.duree; an++) {
    const usure = (1 - p.degradation) ** (an - 1);
    const prixAn = prix * (1 + p.hausseElectricite) ** (an - 1);
    const recette = (autoconsomme * usure * prixAn)
      + (surplus * usure * prixAn * p.valeurSurplus);
    const entretien = entretienAn1 * (1 + p.inflation) ** (an - 1);
    const net = recette - entretien;

    const actualise = net / (1 + p.tauxActualisation) ** an;
    const avant = cumul;
    cumul += net;
    const avantActualise = cumulActualise;
    cumulActualise += actualise;
    energieCumulee += (autoconsomme + surplus) * usure;

    if (retour === null && cumul >= 0) retour = an - 1 + (-avant) / net;
    if (retourActualise === null && cumulActualise >= 0) {
      retourActualise = an - 1 + (-avantActualise) / actualise;
    }

    annees.push({ an, recette, entretien, net, actualise, cumul, cumulActualise });
  }

  // Coût actualisé du kilowattheure : ce que revient réellement un kWh
  // produit par l'installation, entretien compris. C'est le seul chiffre qui
  // se compare directement au tarif STEG.
  let coutsActualises = investissement;
  let energieActualisee = 0;
  for (let an = 1; an <= p.duree; an++) {
    const usure = (1 - p.degradation) ** (an - 1);
    coutsActualises += (entretienAn1 * (1 + p.inflation) ** (an - 1))
      / (1 + p.tauxActualisation) ** an;
    energieActualisee += ((autoconsomme + surplus) * usure)
      / (1 + p.tauxActualisation) ** an;
  }

  return {
    parametres: p,
    investissement,
    annees,
    retour,
    retourActualise,
    economieAn1: annees[0]?.net ?? 0,
    economieTotale: annees.reduce((s, a) => s + a.net, 0),
    gainNet: cumul,
    van: cumulActualise,
    tri: tauxDeRendement(investissement, annees.map((a) => a.net)),
    lcoe: energieActualisee > 0 ? coutsActualises / energieActualisee : null,
    energieCumulee,
  };
}

/**
 * Taux de rendement interne, par bissection.
 *
 * Pas de formule fermée : on cherche le taux qui annule la valeur actuelle
 * nette. La bissection converge toujours quand une racine existe dans
 * l'intervalle, là où la méthode de Newton peut diverger sur des flux
 * irréguliers.
 *
 * @returns {number|null} en part (0,12 = 12 %), ou `null` si le projet ne
 *   rembourse jamais — auquel cas afficher un TRI serait un mensonge.
 */
export function tauxDeRendement(investissement, netParAnnee, { tours = 80 } = {}) {
  if (!(investissement > 0) || !netParAnnee?.length) return null;
  const van = (taux) => netParAnnee.reduce(
    (s, net, i) => s + net / (1 + taux) ** (i + 1), -investissement);

  if (van(0) <= 0) return null; // jamais remboursé, même sans actualisation
  let bas = 0;
  let haut = 1;
  // On élargit tant que la borne haute reste rentable, jusqu'à 1000 %.
  while (van(haut) > 0 && haut < 10) haut *= 2;
  if (van(haut) > 0) return null;
  for (let i = 0; i < tours; i++) {
    const milieu = (bas + haut) / 2;
    if (van(milieu) > 0) bas = milieu; else haut = milieu;
  }
  return (bas + haut) / 2;
}

/**
 * Les trois scénarios financiers, sur la même installation.
 *
 * @returns {Array<{id, nom, resume, parametres, flux, ecarts}>}
 */
export function comparerJeux(entrees) {
  const central = flux(entrees, jeu('standard').parametres);
  return JEUX.map((j) => {
    const f = flux(entrees, j.parametres);
    if (!f) return null;
    return {
      id: j.id,
      nom: j.nom,
      resume: j.resume,
      defaut: Boolean(j.defaut),
      parametres: j.parametres,
      flux: f,
      // Ce qui distingue ce jeu du standard, en clair : c'est ce que le
      // client doit lire pour comprendre l'écart entre deux courbes.
      ecarts: j.defaut ? [] : differences(jeu('standard').parametres, j.parametres),
      ecartGain: central ? f.gainNet - central.gainNet : null,
    };
  }).filter(Boolean);
}

/** Ce qui change entre deux jeux de paramètres, dit en clair. */
export function differences(reference, autre) {
  const out = [];
  for (const p of PARAMETRES) {
    const a = reference[p.cle];
    const b = autre[p.cle];
    if (a === b || a === undefined || b === undefined) continue;
    const ecrire = (v) => (p.pourcent
      ? `${(v * 100).toFixed(p.pas < 0.5 ? 1 : 0).replace('.', ',')} %`
      : v.toLocaleString('fr-FR'));
    out.push({ cle: p.cle, libelle: p.libelle, de: ecrire(a), a: ecrire(b),
      unite: p.unite, hausse: b > a });
  }
  return out;
}

/** Les paramètres d'un jeu, prêts à afficher. */
export function listerParametres(parametres) {
  return PARAMETRES.map((p) => {
    const v = parametres[p.cle];
    return {
      ...p,
      valeur: v,
      ecrit: v === undefined ? '—'
        : p.pourcent ? `${(v * 100).toFixed(p.pas < 0.5 ? 1 : 0).replace('.', ',')} %`
          : v.toLocaleString('fr-FR'),
    };
  });
}
