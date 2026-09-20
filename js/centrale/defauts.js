/**
 * LES DÉFAUTS SIMULABLES — et leur conséquence réelle dans le moteur.
 *
 * UN DÉFAUT QUI NE CHANGE QU'UNE COULEUR N'APPREND RIEN. Chacun de ceux-ci
 * fait trois choses, et les trois sont vérifiables : il change l'état d'un
 * équipement, il pose une alarme horodatée, et il arrête le flux à l'endroit
 * exact où la physique l'arrêterait. C'est le graphe qui propage la suite —
 * aucun défaut ne nomme les équipements qu'il fait tomber.
 *
 * LA DIFFÉRENCE ENTRE UNE CAUSE ET UN SYMPTÔME EST TENUE ICI. Un ombrage
 * n'ouvre rien : il réduit la production, et c'est tout. Un défaut
 * d'isolement, lui, déclenche. Confondre les deux donne une centrale où tout
 * finit par s'ouvrir, et un exploitant qui n'apprend plus rien de ses alarmes.
 *
 * `causePersistante` marque les défauts qui refusent le réarmement tant que
 * l'origine n'est pas levée. C'est ce qui empêche le réflexe « je réarme et
 * on verra » — celui qui relance un court-circuit sur le même câble.
 */
import { identifiant } from './modele.js';

/** Les gravités, du plus bénin au plus grave. */
export const GRAVITES = ['information', 'avertissement', 'defaut'];

/**
 * LE CATALOGUE DES DÉFAUTS.
 *
 * `cibles` dit sur quels types le défaut se conçoit : on ne fait pas fondre
 * le fusible d'un transformateur. `effet(e)` applique la conséquence, et rend
 * le texte de l'alarme.
 */
export const DEFAUTS = {
  'chaine-coupee': {
    nom: 'Défaut de chaîne', cibles: ['String'], gravite: 'defaut',
    persistante: true,
    description: 'Une chaîne est ouverte : connecteur débranché, câble sectionné, module hors service.',
    effet: (e) => {
      const n = e.properties.effectif ?? 1;
      // Une seule chaîne tombe, pas le groupe entier : c'est la réalité, et
      // c'est ce qui rend le défaut difficile à voir sans supervision.
      const perdues = Math.max(1, Math.round(n * 0.1));
      e.properties.chainesHorsService = perdues;
      e.properties.ombrage = Math.min(1, (e.properties.ombrage ?? 0) + perdues / n);
      return `${perdues} chaîne(s) hors service sur ${n}.`;
    },
  },
  ombrage: {
    nom: 'Ombrage', cibles: ['String', 'Row'], gravite: 'avertissement',
    persistante: false, etat: 'WARNING',
    description: 'Ombre portée : bâtiment voisin, végétation, rangée trop proche au solstice d’hiver.',
    effet: (e, { taux = 0.35 } = {}) => {
      e.properties.ombrage = Math.min(1, Math.max(0, taux));
      return `Ombrage de ${Math.round(taux * 100)} % sur le champ.`;
    },
  },
  salissure: {
    nom: 'Salissure', cibles: ['String', 'Row'], gravite: 'avertissement',
    persistante: false, etat: 'WARNING',
    description: 'Poussière, sable, fientes : la perte s’accumule lentement et ne se voit que sur la courbe.',
    effet: (e, { taux = 0.12 } = {}) => {
      e.properties.salissure = Math.min(1, Math.max(0, taux));
      return `Salissure estimée à ${Math.round(taux * 100)} % de perte.`;
    },
  },
  'polarite-inversee': {
    nom: 'Polarité inversée', cibles: ['String'], gravite: 'defaut',
    persistante: true, etat: 'FAULT',
    description: 'Chaîne raccordée à l’envers : le pôle positif sur la borne négative. La diode de l’onduleur bloque, et la chaîne ne produit rien.',
    effet: (e) => {
      e.properties.polariteInversee = true;
      return 'Polarité inversée : aucune production sur cette chaîne, tension mesurée négative.';
    },
  },
  'fusible-fondu': {
    nom: 'Fusible fondu', cibles: ['Combiner', 'DCProtection'], gravite: 'defaut',
    persistante: true, etat: 'TRIPPED',
    description: 'Un fusible de chaîne a fondu : la chaîne est déconnectée du groupage.',
    effet: () => 'Fusible fondu : circuit continu ouvert, remplacement nécessaire.',
  },
  'declenchement-disjoncteur': {
    nom: 'Déclenchement de disjoncteur',
    cibles: ['ACProtection', 'DCProtection', 'MVCell'], gravite: 'defaut',
    persistante: false, etat: 'TRIPPED',
    description: 'Le disjoncteur a déclenché sur défaut : il ne se referme qu’après réarmement.',
    effet: () => 'Disjoncteur déclenché : circuit ouvert en aval.',
  },
  'surtension-dc': {
    nom: 'Surtension continue', cibles: ['String', 'Inverter', 'DCProtection'],
    gravite: 'defaut', persistante: true, etat: 'FAULT',
    description: 'La tension continue dépasse la tension maximale admise par l’entrée de l’onduleur.',
    effet: (e, { tension = null } = {}) => {
      const v = tension ?? Math.round((e.properties.voc ?? 1000) * 1.12);
      e.properties.tensionMesuree = v;
      return `Tension continue mesurée à ${v} V, au-dessus de la limite d’entrée.`;
    },
  },
  'sous-tension-reseau': {
    nom: 'Sous-tension réseau', cibles: ['Grid', 'MVCell'], gravite: 'avertissement',
    persistante: false, etat: 'WARNING',
    description: 'La tension du réseau descend sous le seuil de découplage.',
    effet: (e, { tension = null } = {}) => {
      const nominale = e.properties.tension ?? 30000;
      const v = tension ?? Math.round(nominale * 0.85);
      e.properties.tensionMesuree = v;
      return `Tension réseau à ${Math.round(v / 1000)} kV pour ${Math.round(nominale / 1000)} kV nominaux.`;
    },
  },
  'surtension-reseau': {
    nom: 'Surtension réseau', cibles: ['Grid', 'MVCell'], gravite: 'avertissement',
    persistante: false, etat: 'WARNING',
    description: 'La tension du réseau dépasse le seuil de découplage ; les onduleurs se limitent puis se découplent.',
    effet: (e, { tension = null } = {}) => {
      const nominale = e.properties.tension ?? 30000;
      const v = tension ?? Math.round(nominale * 1.12);
      e.properties.tensionMesuree = v;
      return `Tension réseau à ${Math.round(v / 1000)} kV pour ${Math.round(nominale / 1000)} kV nominaux.`;
    },
  },
  surintensite: {
    nom: 'Surintensité', cibles: ['ACProtection', 'DCProtection', 'MVCell', 'Cable'],
    gravite: 'defaut', persistante: false, etat: 'TRIPPED',
    description: 'Le courant dépasse le calibre de la protection, qui déclenche.',
    effet: (e, { courant = null } = {}) => {
      const calibre = e.properties.calibre ?? e.properties.inMax ?? 100;
      const i = courant ?? Math.round(calibre * 1.35);
      e.properties.courantMesure = i;
      return `Courant de ${i} A pour un calibre de ${calibre} A : déclenchement.`;
    },
  },
  'defaut-isolement': {
    nom: 'Défaut d’isolement', cibles: ['String', 'Inverter', 'Transformer', 'Cable'],
    gravite: 'defaut', persistante: true, etat: 'FAULT',
    description: 'La résistance d’isolement est tombée sous le seuil : humidité, gaine blessée, connecteur noyé.',
    effet: (e, { resistance = 12 } = {}) => {
      e.properties.isolement = resistance;
      return `Isolement mesuré à ${resistance} kΩ, sous le seuil de 1 MΩ : découplage immédiat.`;
    },
  },
  'perte-reseau': {
    nom: 'Perte du réseau', cibles: ['Grid'], gravite: 'defaut',
    persistante: false, etat: 'GRID_LOST',
    description: 'Le réseau est absent. Les onduleurs doivent se découpler — c’est l’anti-îlotage, et il protège celui qui répare la ligne.',
    effet: () => 'Réseau absent : découplage général, production arrêtée.',
  },
  'temperature-excessive': {
    nom: 'Température excessive',
    cibles: ['Inverter', 'Transformer', 'Building'], gravite: 'avertissement',
    persistante: false, etat: 'WARNING',
    description: 'La température interne dépasse le seuil : ventilation obstruée, filtre colmaté, ambiante trop élevée.',
    effet: (e, { temperature = null } = {}) => {
      const max = e.properties.tempMax ?? 105;
      const t = temperature ?? Math.round(max * 1.08);
      e.properties.temperature = t;
      return `Température de ${t} °C pour un maximum de ${max} °C : réduction de puissance.`;
    },
  },
  'surcharge-transformateur': {
    nom: 'Surcharge de transformateur', cibles: ['Transformer'], gravite: 'avertissement',
    persistante: false, etat: 'WARNING',
    description: 'La puissance transitée dépasse la puissance nominale : échauffement, vieillissement accéléré.',
    effet: (e, { charge = 1.15 } = {}) => {
      e.properties.chargeForcee = charge;
      return `Transformateur chargé à ${Math.round(charge * 100)} % de sa puissance nominale.`;
    },
  },
  'perte-communication': {
    nom: 'Perte de communication',
    cibles: ['Inverter', 'SCADA', 'WeatherStation', 'MVCell', 'Tracker'],
    gravite: 'avertissement', persistante: false, etat: 'NO_COMM',
    description: 'L’équipement ne répond plus à la supervision. Il peut très bien continuer de produire : l’absence de mesure n’est pas l’absence de production.',
    effet: () => 'Plus de remontée vers la supervision : les mesures affichées sont les dernières connues.',
  },
  'defaut-onduleur': {
    nom: 'Défaut onduleur', cibles: ['Inverter'], gravite: 'defaut',
    persistante: true, etat: 'FAULT',
    description: 'Défaut interne : étage de puissance, ventilateur, carte de commande.',
    effet: (e, { code = 'E-042' } = {}) => {
      e.properties.codeDefaut = code;
      return `Défaut interne ${code} : onduleur arrêté.`;
    },
  },
};

/** Les défauts applicables à un type d'équipement. */
export function defautsPour(type) {
  return Object.entries(DEFAUTS)
    .filter(([, d]) => d.cibles.includes(type))
    .map(([id, d]) => ({ id, ...d }));
}

/** Une alarme horodatée. */
export function alarme({ equipementId, equipement, gravite, cle, texte,
  horodatage = Date.now() }) {
  return {
    id: identifiant('alarme'), horodatage, equipementId, equipement,
    gravite, cle, texte, acquittee: false,
  };
}

/**
 * INJECTE UN DÉFAUT.
 *
 * L'état est imposé, la cause est enregistrée, l'alarme est posée. La
 * propagation fera le reste : ce n'est pas à ce fichier de savoir qui tombe
 * en aval, et c'est précisément pour cela qu'il reste juste quand
 * l'architecture change.
 */
export function injecter(g, cibleId, defautId, options = {}, horodatage = Date.now()) {
  const e = g.noeuds.get(cibleId);
  const d = DEFAUTS[defautId];
  if (!e) return { applique: false, raison: 'Équipement introuvable.' };
  if (!d) return { applique: false, raison: `Défaut inconnu : ${defautId}.` };
  if (!d.cibles.includes(e.type)) {
    return { applique: false,
      raison: `« ${d.nom} » ne se conçoit pas sur ${e.type} — cibles admises : ${d.cibles.join(', ')}.` };
  }

  const avant = e.status;
  const detail = d.effet(e, options) ?? d.description;
  if (d.etat) e.status = d.etat;
  e.properties.defautActif = defautId;
  e.properties.causeDefaut = d.nom;
  e.properties.causePersistante = d.persistante === true;

  const a = alarme({ equipementId: e.id, equipement: e.name, gravite: d.gravite,
    cle: defautId, texte: `${d.nom} — ${detail}`, horodatage });
  e.alarms.push(a);
  const evenement = { horodatage, auteur: 'simulation', commande: null,
    equipementId: e.id, equipement: e.name, resultat: 'défaut injecté',
    avant, apres: e.status, defaut: defautId };
  e.events.push(evenement);

  return { applique: true, equipement: e, avant, apres: e.status, alarme: a, evenement, detail };
}

/**
 * LÈVE LA CAUSE d'un défaut, sans réarmer.
 *
 * Les deux gestes sont distincts, et les confondre est une faute
 * d'exploitation : nettoyer les modules ne referme pas le disjoncteur, et
 * réarmer ne nettoie pas les modules.
 */
export function lever(g, cibleId, horodatage = Date.now()) {
  const e = g.noeuds.get(cibleId);
  if (!e) return { leve: false, raison: 'Équipement introuvable.' };
  const defautId = e.properties.defautActif;
  if (!defautId) return { leve: false, raison: 'Aucun défaut actif sur cet équipement.' };

  // On rend au champ ses pertes d'origine : un ombrage levé n'est pas un
  // champ neuf, il reste la salissure ordinaire.
  if (['ombrage', 'chaine-coupee'].includes(defautId)) e.properties.ombrage = 0;
  if (defautId === 'salissure') e.properties.salissure = 0.02;
  if (defautId === 'polarite-inversee') e.properties.polariteInversee = false;
  delete e.properties.chargeForcee;
  delete e.properties.chainesHorsService;
  e.properties.causePersistante = false;
  e.properties.defautActif = null;

  const evenement = { horodatage, auteur: 'exploitant', commande: null,
    equipementId: e.id, equipement: e.name, resultat: 'cause levée', defaut: defautId };
  e.events.push(evenement);
  return { leve: true, equipement: e, defaut: defautId, evenement };
}

/** Toutes les alarmes de la centrale, les plus récentes d'abord. */
export function alarmes(g, { seulementActives = false } = {}) {
  const out = [];
  for (const e of g.noeuds.values()) {
    for (const a of e.alarms) {
      if (seulementActives && a.acquittee) continue;
      out.push(a);
    }
  }
  return out.sort((x, y) => y.horodatage - x.horodatage);
}

/** Tout l'historique, le plus récent d'abord. */
export function evenements(g) {
  const out = [];
  for (const e of g.noeuds.values()) out.push(...e.events);
  return out.sort((x, y) => y.horodatage - x.horodatage);
}

/** Acquitte une alarme — sans rien réarmer : ce sont deux gestes. */
export function acquitter(g, alarmeId) {
  for (const e of g.noeuds.values()) {
    const a = e.alarms.find((x) => x.id === alarmeId);
    if (a) { a.acquittee = true; return { acquittee: true, alarme: a }; }
  }
  return { acquittee: false };
}
