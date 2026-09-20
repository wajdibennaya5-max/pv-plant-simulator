/**
 * LES SYMBOLES, LES COULEURS, LES ICÔNES — et d'où ils viennent.
 *
 * AUCUNE VUE NE CHOISIT SA COULEUR. Elle demande l'apparence d'un état, et
 * l'obtient. C'est la règle qui garantit qu'un disjoncteur déclenché est
 * rouge sur le plan, rouge sur le schéma et rouge dans la supervision — et
 * qu'on n'a pas à le vérifier trois fois à chaque modification.
 *
 * Les couleurs sont des VARIABLES CSS, pas des valeurs : le thème sombre du
 * site s'applique donc au simulateur sans une ligne de plus, et une couleur
 * changée dans la page l'est partout.
 */
import { apparence, ETATS, LIENS } from './modele.js';

/** Les couleurs d'état, en variables CSS du thème. */
export const COULEURS = {
  ok: 'var(--cen-ok)',
  veille: 'var(--cen-veille)',
  alerte: 'var(--cen-alerte)',
  defaut: 'var(--cen-defaut)',
  travaux: 'var(--cen-travaux)',
  sourd: 'var(--cen-sourd)',
};

/** Les couleurs de liaison, par type. */
export const COULEURS_LIEN = {
  dc: 'var(--cen-dc)', ac: 'var(--cen-ac)',
  mv: 'var(--cen-mv)', pe: 'var(--cen-pe)',
};

/** La couleur d'un état — jamais choisie par la vue. */
export const couleurEtat = (etat) => COULEURS[apparence(etat).couleur] ?? COULEURS.sourd;

/** La couleur d'une liaison typée. */
export const couleurLien = (type) => COULEURS_LIEN[LIENS[type]?.couleur] ?? COULEURS_LIEN.pe;

/**
 * LES ICÔNES D'ÉTAT, en tracés SVG dans une boîte de 24.
 *
 * Elles doublent la couleur plutôt que de la remplacer : un daltonien lit la
 * forme, et une capture d'écran en noir et blanc reste utilisable.
 */
export const ICONES = {
  point: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  eclair: 'M13 2 4 14h7l-1 8 10-12h-8l1-8z',
  pause: 'M9 6v12M15 6v12',
  stop: 'M7 7h10v10H7z',
  ouvert: 'M6 18 12 9M12 6v2M6 18h2M16 6v12',
  ferme: 'M6 18 6 6M6 6h12M18 6v12',
  triangle: 'M12 4 2 20h20L12 4zM12 10v5M12 17.5v.5',
  antenne: 'M12 20v-6M8 10a4 4 0 0 1 8 0M5 8a7 7 0 0 1 14 0',
  cle: 'M14 7a4 4 0 1 0-3.5 4L4 17.5V20h2.5L13 13.5A4 4 0 0 0 14 7z',
  cadenas: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
  coupure: 'M5 12h5M14 12h5M11 8l2 8',
  reseau: 'M4 20 20 4M6 4h4M4 6v4M20 14v4M14 20h4',
  declenche: 'M6 18 13 9M12 6v2M16 6v12M4 4l16 16',
  croix: 'M6 6l12 12M18 6 6 18',
};

/** Le tracé d'une icône d'état. */
export const iconeEtat = (etat) => ICONES[apparence(etat).icone] ?? ICONES.point;

/**
 * LES SYMBOLES D'ÉQUIPEMENT du schéma unifilaire.
 *
 * Ce sont des symboles de schéma, pas des dessins : un onduleur est un carré
 * barré d'une sinusoïde et d'une droite, un transformateur deux cercles
 * sécants. C'est ce qu'un électricien lit sans légende.
 */
export const SYMBOLES = {
  Grid: '<circle cx="0" cy="0" r="9" fill="none"/><path d="M-5 0a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 0 5 0" fill="none"/>',
  MVCell: '<rect x="-8" y="-9" width="16" height="18" fill="none"/><path d="M0 -9v4M0 9V5M-4 5 4 -5" fill="none"/>',
  Transformer: '<circle cx="0" cy="-4" r="6" fill="none"/><circle cx="0" cy="4" r="6" fill="none"/>',
  ACProtection: '<rect x="-7" y="-9" width="14" height="18" fill="none"/><path d="M0 -9v3M0 9V6M-4 6 4 -6" fill="none"/>',
  Inverter: '<rect x="-10" y="-10" width="20" height="20" fill="none"/><path d="M-10 10 10 -10M-7 -3a3 3 0 0 1 6 0 3 3 0 0 0 6 0" fill="none"/>',
  DCProtection: '<rect x="-6" y="-8" width="12" height="16" fill="none"/><path d="M0 -8v3M0 8V5M-4 5 4 -5" fill="none"/>',
  Combiner: '<rect x="-9" y="-7" width="18" height="14" fill="none"/><path d="M-4 -7v14M0 -7v14M4 -7v14" fill="none"/>',
  String: '<rect x="-10" y="-6" width="20" height="12" fill="none"/><path d="M-10 0h20M-4 -6v12M4 -6v12" fill="none"/>',
  Row: '<rect x="-12" y="-5" width="24" height="10" fill="none"/><path d="M-6 -5v10M0 -5v10M6 -5v10" fill="none"/>',
  Module: '<rect x="-7" y="-10" width="14" height="20" fill="none"/><path d="M-7 0h14M0 -10v20" fill="none"/>',
  Tracker: '<path d="M-10 4 10 -4M0 0v9M-4 9h8" fill="none"/>',
  Structure: '<path d="M-10 5 10 -5M-6 5v4M6 -1v10" fill="none"/>',
  Grounding: '<path d="M0 -9v6M-8 -3h16M-5 1h10M-2 5h4" fill="none"/>',
  SCADA: '<rect x="-9" y="-7" width="18" height="12" fill="none"/><path d="M-4 9h8M0 5v4" fill="none"/>',
  WeatherStation: '<circle cx="0" cy="-3" r="4" fill="none"/><path d="M0 1v8M-6 -3h-3M9 -3H6" fill="none"/>',
  Building: '<rect x="-9" y="-7" width="18" height="14" fill="none"/><path d="M-4 7V0h8v7" fill="none"/>',
  Block: '<rect x="-11" y="-9" width="22" height="18" fill="none" rx="2"/>',
  Plant: '<rect x="-11" y="-9" width="22" height="18" fill="none" rx="2"/>',
  Zone: '<rect x="-11" y="-9" width="22" height="18" fill="none" rx="2"/>',
  Cable: '<path d="M-10 0h20" fill="none"/>',
  Foundation: '<path d="M-8 4h16M-5 4v-6M5 4v-6" fill="none"/>',
};

/** Le symbole d'un type, ou un carré neutre si le type est inconnu. */
export const symbole = (type) => SYMBOLES[type]
  ?? '<rect x="-8" y="-8" width="16" height="16" fill="none"/>';

/**
 * L'animation d'un état, en classe CSS.
 * Elle est nommée par l'état, pas par la vue : `clignote` veut dire « défaut
 * non acquitté », partout et toujours.
 */
export const animation = (etat) => {
  const a = apparence(etat).animation;
  return a === 'aucune' ? '' : ` cen-${a}`;
};

/** Le libellé lisible d'un état. */
export const nomEtat = (etat) => ETATS[etat]?.nom ?? etat;

/**
 * Échappe un texte destiné au HTML.
 *
 * Les noms d'équipement viennent du catalogue et de la génération, donc de
 * nous — mais un catalogue fournisseur, lui, viendra d'ailleurs. On échappe
 * dès maintenant : le jour où la donnée devient extérieure, il n'y a rien à
 * reprendre, et rien à oublier.
 */
export function echapper(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Un nombre en français, sans unité. */
export function nombre(valeur, decimales = 0) {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/**
 * UNE PUISSANCE À L'ÉCHELLE DE CE QU'ELLE VAUT.
 *
 * 425 225 kW ne se lit pas ; 425 MW se lit. L'unité suit la grandeur, parce
 * qu'une centrale va de quelques centaines de kilowatts à un demi-gigawatt.
 */
export function puissance(watts, { unite = 'W' } = {}) {
  const w = Number(watts);
  if (!Number.isFinite(w)) return '—';
  const abs = Math.abs(w);
  if (abs >= 1e9) return `${nombre(w / 1e9, 2)} G${unite}`;
  if (abs >= 1e6) return `${nombre(w / 1e6, abs >= 1e7 ? 0 : 1)} M${unite}`;
  if (abs >= 1e3) return `${nombre(w / 1e3, abs >= 1e4 ? 0 : 1)} k${unite}`;
  return `${nombre(w, 0)} ${unite}`;
}

/** Une énergie en kWh, MWh ou GWh selon ce qu'elle vaut. */
export const energie = (kwh) => puissance(Number(kwh) * 1000, { unite: 'Wh' });

/** Un pourcentage. */
export const pourcent = (fraction, decimales = 0) =>
  (Number.isFinite(Number(fraction)) ? `${nombre(Number(fraction) * 100, decimales)} %` : '—');

/** Une heure décimale en horloge : 13,5 → « 13:30 ». */
export function heure(h) {
  const t = Number(h) || 0;
  const hh = Math.floor(t) % 24;
  const mm = Math.round((t - Math.floor(t)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

/** Un horodatage court : « 14:32:07 ». */
export const instant = (ms) => new Date(Number(ms) || 0)
  .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
