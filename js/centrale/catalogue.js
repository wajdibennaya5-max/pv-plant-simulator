/**
 * LA BIBLIOTHÈQUE DE COMPOSANTS — et ce qu'elle refuse de prétendre.
 *
 * AUCUNE FICHE DE CE FICHIER N'EST UNE FICHE CONSTRUCTEUR. Ce sont des
 * classes de matériel, aux ordres de grandeur courants du marché, et chacune
 * porte `verified: false`. Une fiche inventée sous un nom de marque est pire
 * qu'une absence de fiche : elle se recopie dans un dossier d'exécution, elle
 * sert à commander, et l'écart se découvre sur le chantier.
 *
 * Les modules basse puissance viennent de `materiel.js`, déjà utilisé par
 * l'étude résidentielle : un seul catalogue de modules pour tout le dépôt,
 * sans quoi deux écrans finiraient par dimensionner sur deux fiches.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ POUR AJOUTER UN MATÉRIEL RÉEL : copiez la fiche, remplissez            │
 * │ `manufacturer`, `model`, `verified: true` et `source` (d'où vient la   │
 * │ donnée : fiche PDF, référence, date). Sans `source`, `verified: true`  │
 * │ est refusé par `verifierCatalogue()` — et par le test.                 │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * `photo`, `fiche` et `modele3d` sont prévus et laissés vides : la place est
 * faite, rien n'est inventé pour la remplir.
 */
import { MODULES as MODULES_RESIDENTIELS } from '../materiel.js';

/** Emplacements prévus pour les médias d'un composant, tous vides par défaut. */
const MEDIAS = { photo: null, fiche: null, modele3d: null };

/** Une fiche générique : non vérifiée, sans marque, sans source. */
function generique(fiche) {
  return {
    manufacturer: null, model: null, verified: false, source: null,
    ...MEDIAS, ...fiche,
  };
}

/**
 * MODULES PHOTOVOLTAÏQUES.
 *
 * Les trois premiers sont ceux de l'étude résidentielle, repris tels quels.
 * Les suivants couvrent les formats de centrale au sol, absents du catalogue
 * résidentiel parce qu'on ne les pose pas sur une maison.
 */
export const MODULES = [
  ...MODULES_RESIDENTIELS.map((m) => generique({
    id: m.id, nom: m.nom, famille: 'module', symbole: 'module',
    puissance: m.puissance, largeur: m.largeur, hauteur: m.hauteur,
    rendement: m.rendement, vmp: m.vmp, imp: m.imp, voc: m.voc, isc: m.isc,
    coeffVoc: m.coeffVoc, coeffPuissance: m.coeffPuissance,
    // Le module par défaut reste celui de l'étude résidentielle : deux
    // défauts différents feraient dimensionner deux écrans sur deux modules.
    defaut: m.defaut === true,
  })),
  generique({
    id: 'mono-620-n', nom: 'Monocristallin type N 620 Wc', famille: 'module',
    symbole: 'module', resume: 'Grand format, centrale au sol',
    puissance: 620, largeur: 1.134, hauteur: 2.382, rendement: 0.229,
    vmp: 46.4, imp: 13.37, voc: 55.2, isc: 14.1,
    coeffVoc: -0.24, coeffPuissance: -0.29,
  }),
  generique({
    id: 'bifacial-660', nom: 'Bifacial 660 Wc', famille: 'module',
    symbole: 'module', resume: 'Bifacial, gain arrière selon l’albédo du sol',
    puissance: 660, largeur: 1.303, hauteur: 2.384, rendement: 0.213,
    vmp: 38.5, imp: 17.15, voc: 45.9, isc: 18.2,
    coeffVoc: -0.25, coeffPuissance: -0.30,
    // Le gain bifacial dépend du sol, de la hauteur et de l'écartement. On ne
    // l'applique pas d'office : il se règle, et il est annoncé non vérifié.
    gainBifacialDefaut: 0,
  }),
];

/**
 * ONDULEURS.
 *
 * `vMax` est la tension à ne jamais dépasser, `vMpptMin`/`vMpptMax` bornent
 * la plage où l'onduleur suit le point de puissance. `iMpptMax` est le
 * courant de fonctionnement d'une entrée, `iCcMax` le court-circuit admis :
 * les confondre est la faute de dimensionnement la plus coûteuse.
 */
export const ONDULEURS = [
  generique({
    id: 'string-110', nom: 'Onduleur de chaîne 110 kVA', famille: 'onduleur',
    symbole: 'onduleur', architecture: 'chaine',
    puissance: 110000, puissanceDcMax: 165000, rendement: 0.986,
    vMax: 1100, vMpptMin: 200, vMpptMax: 1000, vDemarrage: 250,
    mppt: 9, entreesParMppt: 2, iMpptMax: 30, iCcMax: 45,
    vAc: 800, cosPhiMin: 0.8,
  }),
  generique({
    id: 'string-320', nom: 'Onduleur de chaîne 320 kVA', famille: 'onduleur',
    symbole: 'onduleur', architecture: 'chaine',
    puissance: 320000, puissanceDcMax: 480000, rendement: 0.989,
    vMax: 1500, vMpptMin: 500, vMpptMax: 1500, vDemarrage: 550,
    mppt: 12, entreesParMppt: 2, iMpptMax: 40, iCcMax: 60,
    vAc: 800, cosPhiMin: 0.8, defaut: true,
  }),
  generique({
    id: 'central-3600', nom: 'Onduleur central 3,6 MVA', famille: 'onduleur',
    symbole: 'onduleur', architecture: 'central',
    puissance: 3600000, puissanceDcMax: 5040000, rendement: 0.99,
    vMax: 1500, vMpptMin: 875, vMpptMax: 1310, vDemarrage: 900,
    mppt: 1, entreesParMppt: 24, iMpptMax: 4200, iCcMax: 6300,
    vAc: 800, cosPhiMin: 0.8,
  }),
];

/** Transformateurs élévateurs BT/MT de poste de puissance. */
export const TRANSFORMATEURS = [
  generique({
    id: 'tr-1250', nom: 'Transformateur 1250 kVA', famille: 'transformateur',
    symbole: 'transformateur', puissance: 1250000, couplage: 'Dyn11',
    ucc: 0.06, pertesFer: 1400, pertesCuivre: 13000, tempMax: 105,
  }),
  generique({
    id: 'tr-2500', nom: 'Transformateur 2500 kVA', famille: 'transformateur',
    symbole: 'transformateur', puissance: 2500000, couplage: 'Dyn11',
    ucc: 0.06, pertesFer: 2300, pertesCuivre: 22000, tempMax: 105, defaut: true,
  }),
  generique({
    id: 'tr-5000', nom: 'Transformateur 5000 kVA', famille: 'transformateur',
    symbole: 'transformateur', puissance: 5000000, couplage: 'Dyn11',
    ucc: 0.0675, pertesFer: 3900, pertesCuivre: 38000, tempMax: 105,
  }),
];

/** Cellules moyenne tension : arrivée, départ, protection. */
export const CELLULES_MT = [
  generique({
    id: 'mv-interrupteur', nom: 'Cellule interrupteur-sectionneur', famille: 'cellule',
    symbole: 'interrupteur', fonction: 'arrivee', inMax: 630, icc: 20000,
  }),
  generique({
    id: 'mv-disjoncteur', nom: 'Cellule disjoncteur de protection', famille: 'cellule',
    symbole: 'disjoncteur', fonction: 'protection', inMax: 630, icc: 20000, defaut: true,
  }),
  generique({
    id: 'mv-comptage', nom: 'Cellule de comptage', famille: 'cellule',
    symbole: 'comptage', fonction: 'comptage', inMax: 630, icc: 20000,
  }),
];

/** Structures porteuses. */
export const STRUCTURES = [
  generique({
    id: 'fixe-20', nom: 'Structure fixe inclinée 20°', famille: 'structure',
    symbole: 'structure', mobile: false, inclinaison: 20, modulesParTable: 28,
    orientation: 180,
  }),
  generique({
    id: 'tracker-1a', nom: 'Suiveur un axe horizontal', famille: 'structure',
    symbole: 'tracker', mobile: true, inclinaison: null, modulesParTable: 90,
    course: 60, gainAttendu: null,
  }),
];

/** Câbles : sections courantes et courants admissibles indicatifs. */
export const CABLES = [
  generique({ id: 'dc-4', nom: 'Câble solaire 4 mm²', famille: 'cable', symbole: 'cable', usage: 'dc', section: 4, iz: 55, resistivite: 0.0225 }),
  generique({ id: 'dc-6', nom: 'Câble solaire 6 mm²', famille: 'cable', symbole: 'cable', usage: 'dc', section: 6, iz: 70, resistivite: 0.0225 }),
  generique({ id: 'dc-240', nom: 'Câble continu 240 mm²', famille: 'cable', symbole: 'cable', usage: 'dc', section: 240, iz: 520, resistivite: 0.0225 }),
  generique({ id: 'ac-300', nom: 'Câble alternatif 300 mm²', famille: 'cable', symbole: 'cable', usage: 'ac', section: 300, iz: 600, resistivite: 0.0225 }),
  generique({ id: 'mv-95', nom: 'Câble moyenne tension 95 mm²', famille: 'cable', symbole: 'cable', usage: 'mv', section: 95, iz: 250, resistivite: 0.0225 }),
];

/** Toutes les familles, pour la recherche et l'affichage. */
export const CATALOGUE = {
  module: MODULES, onduleur: ONDULEURS, transformateur: TRANSFORMATEURS,
  cellule: CELLULES_MT, structure: STRUCTURES, cable: CABLES,
};

/** Toutes les fiches, à plat. */
export const TOUTES = Object.values(CATALOGUE).flat();

/** Une fiche par identifiant, toutes familles confondues. */
export const fiche = (id) => TOUTES.find((f) => f.id === id) ?? null;

/** La fiche par défaut d'une famille. */
export function defaut(famille) {
  const liste = CATALOGUE[famille] ?? [];
  return liste.find((f) => f.defaut) ?? liste[0] ?? null;
}

/** Les fiches d'une famille, éventuellement filtrées. */
export function famille(nom, filtre = () => true) {
  return (CATALOGUE[nom] ?? []).filter(filtre);
}

/**
 * CE QUE LE CATALOGUE PROMET, ET CE QU'IL NE PROMET PAS.
 *
 * Une fiche déclarée vérifiée sans source est une fiche inventée qui a pris
 * l'apparence d'une fiche sûre. C'est exactement ce qu'on cherche à empêcher,
 * donc c'est contrôlé plutôt qu'écrit.
 */
export function verifierCatalogue(fiches = TOUTES) {
  return fiches
    .filter((f) => f.verified === true && !f.source)
    .map((f) => ({ id: f.id, probleme: 'déclarée vérifiée sans source' }));
}

/** Combien de fiches sont réellement vérifiées ? Affiché tel quel à l'écran. */
export function couverture(fiches = TOUTES) {
  const verifiees = fiches.filter((f) => f.verified === true).length;
  return { total: fiches.length, verifiees, generiques: fiches.length - verifiees };
}

/** L'étiquette d'origine d'une fiche, telle qu'elle s'affiche. */
export function origine(f) {
  if (!f) return { verifie: false, texte: 'Composant inconnu' };
  if (f.verified && f.source) {
    return { verifie: true, texte: `${f.manufacturer ?? ''} ${f.model ?? ''} — ${f.source}`.trim() };
  }
  return { verifie: false, texte: 'Composant générique — caractéristiques typiques, non vérifiées' };
}
