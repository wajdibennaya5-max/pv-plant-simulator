/**
 * LES COMMANDES, ET LES INTERVERROUILLAGES QUI LES REFUSENT.
 *
 * UNE COMMANDE REFUSÉE DOIT DIRE POURQUOI, ET DIRE QUOI FAIRE. « Commande
 * impossible » n'apprend rien : l'opérateur réessaie, puis contourne. Chaque
 * refus nomme donc la condition d'interverrouillage non remplie, l'état
 * actuel et l'état qu'il faudrait — ce sont les trois choses qu'on cherche
 * quand un appareil refuse de se fermer.
 *
 * LES RÈGLES SONT DES DONNÉES, PAS DU CODE. Chaque interverrouillage est un
 * objet avec une condition et un message. Ajouter une règle, c'est ajouter
 * une ligne au tableau ; on ne réécrit pas la machine, donc on ne casse pas
 * les règles existantes en ajoutant la suivante.
 *
 * L'ORDRE DE CONSIGNATION EST CELUI DU TERRAIN : on ouvre, on isole, on
 * consigne, et alors seulement on intervient. Autoriser la consignation d'un
 * appareil fermé donnerait un cadenas sur un circuit sous tension — et c'est
 * exactement ce que la consignation est censée empêcher.
 */
import { COMMANDES, TYPES, commandesDuType, conduit } from './modele.js';
import { enAval, portee, decouplesSi } from './topologie.js';

/**
 * LES INTERVERROUILLAGES, en toutes lettres.
 *
 * `bloque(e, ctx)` rend `true` quand la commande doit être refusée.
 */
export const INTERVERROUILLAGES = {
  CLOSE: [
    {
      cle: 'consigne',
      bloque: (e) => e.status === 'LOCKED',
      condition: 'L’appareil doit être déconsigné avant toute fermeture.',
      requis: 'Déconsigner (UNLOCK)',
    },
    {
      cle: 'maintenance',
      bloque: (e) => e.status === 'MAINTENANCE',
      condition: 'Une intervention est déclarée en cours sur cet appareil.',
      requis: 'Lever la maintenance (RESET)',
    },
    {
      cle: 'declenche',
      bloque: (e) => e.status === 'TRIPPED',
      condition: 'Un appareil déclenché se réarme avant de se refermer : le refermer sans réarmer relancerait le défaut sur le même circuit.',
      requis: 'Réarmer (RESET)',
    },
    {
      cle: 'defaut',
      bloque: (e) => e.status === 'FAULT',
      condition: 'L’appareil est en défaut ; la cause doit être traitée puis le défaut acquitté.',
      requis: 'Acquitter le défaut (RESET)',
    },
    {
      cle: 'defaut-aval',
      bloque: (e, ctx) => (ctx?.defautsEnAval?.length ?? 0) > 0,
      condition: (e, ctx) => `Défaut non acquitté en aval : ${ctx.defautsEnAval
        .slice(0, 3).map((x) => x.name).join(', ')}${ctx.defautsEnAval.length > 3
        ? ` et ${ctx.defautsEnAval.length - 3} autre(s)` : ''}.`,
      requis: 'Traiter les défauts en aval',
    },
  ],
  OPEN: [
    {
      cle: 'consigne',
      bloque: (e) => e.status === 'LOCKED',
      condition: 'Un appareil consigné ne se manœuvre pas : le cadenas protège quelqu’un.',
      requis: 'Déconsigner (UNLOCK)',
    },
  ],
  RESET: [
    {
      cle: 'rien-a-rearmer',
      // `GRID_LOST` et `STOPPED` manquaient : un réseau perdu n'était alors
      // jamais rétablissable, et la panne la plus courante d'une centrale
      // n'avait pas de fin. Un état qu'on peut prendre est un état dont il
      // faut pouvoir sortir.
      bloque: (e) => !['TRIPPED', 'FAULT', 'WARNING', 'MAINTENANCE', 'NO_COMM',
        'GRID_LOST', 'STOPPED'].includes(e.status),
      condition: 'Aucun défaut, aucune maintenance à lever sur cet appareil.',
      requis: 'Aucune action nécessaire',
    },
    {
      cle: 'cause-presente',
      bloque: (e) => e.properties?.causePersistante === true,
      condition: (e) => `La cause du défaut est toujours présente : ${
        e.properties?.causeDefaut ?? 'origine non levée'}.`,
      requis: 'Lever la cause avant de réarmer',
    },
    {
      cle: 'consigne',
      bloque: (e) => e.status === 'LOCKED',
      condition: 'Appareil consigné.',
      requis: 'Déconsigner (UNLOCK)',
    },
  ],
  LOCK: [
    {
      cle: 'sous-tension',
      bloque: (e) => conduit(e.status),
      condition: 'On ne consigne pas un appareil fermé : la consignation garantit l’absence de tension, elle ne la crée pas.',
      requis: 'Ouvrir (OPEN) puis isoler (ISOLATE)',
    },
    {
      cle: 'deja',
      bloque: (e) => e.status === 'LOCKED',
      condition: 'Appareil déjà consigné.',
      requis: 'Aucune action nécessaire',
    },
  ],
  UNLOCK: [
    {
      cle: 'pas-consigne',
      bloque: (e) => e.status !== 'LOCKED',
      condition: 'L’appareil n’est pas consigné.',
      requis: 'Aucune action nécessaire',
    },
  ],
  ISOLATE: [
    {
      cle: 'ferme',
      bloque: (e) => conduit(e.status),
      condition: 'L’isolement suppose un appareil déjà ouvert : isoler sous charge ouvre un arc.',
      requis: 'Ouvrir (OPEN)',
    },
  ],
  MAINTENANCE: [
    {
      cle: 'non-consigne',
      bloque: (e) => !['ISOLATED', 'LOCKED'].includes(e.status),
      condition: 'Une intervention se déclare sur un appareil isolé ou consigné, jamais sur un appareil en service.',
      requis: 'Ouvrir, isoler (ISOLATE) puis consigner (LOCK)',
    },
  ],
};

/** Le texte d'une condition, qu'elle soit fixe ou calculée. */
const texte = (v, e, ctx) => (typeof v === 'function' ? v(e, ctx) : v);

/**
 * LA COMMANDE EST-ELLE ACCEPTÉE ?
 *
 * Aucune modification n'est faite ici : cette fonction répond, elle n'agit
 * pas. C'est ce qui permet à l'interface de griser un bouton et d'afficher
 * la raison AVANT que l'opérateur n'appuie.
 */
export function verifier(g, id, commande) {
  const e = g.noeuds.get(id);
  if (!e) {
    return { accepte: false, cle: 'inconnu', raison: 'Équipement introuvable.' };
  }
  if (!COMMANDES[commande]) {
    return { accepte: false, cle: 'inconnu', raison: `Commande inconnue : ${commande}.` };
  }
  const admises = commandesDuType(e.type);
  if (!admises.includes(commande)) {
    return {
      accepte: false, cle: 'non-manoeuvrable',
      raison: `${TYPES[e.type].nom} n’accepte pas la commande « ${COMMANDES[commande].nom} ».`,
      interverrouillage: { condition: `Commandes admises : ${
        admises.length ? admises.map((c) => COMMANDES[c].nom).join(', ') : 'aucune'}.`,
      etatActuel: e.status, requis: null },
    };
  }

  // POUR UNE FERMETURE, ON REGARDE LA PORTÉE, PAS L'AVAL PERDU. L'appareil
  // qu'on s'apprête à fermer est ouvert : `enAval` rendrait un ensemble vide,
  // et l'interverrouillage laisserait refermer sur un défaut non traité.
  const defautsEnAval = [...(commande === 'CLOSE' ? portee(g, id) : enAval(g, id))]
    .map((x) => g.noeuds.get(x))
    .filter((x) => x && ['FAULT', 'TRIPPED'].includes(x.status));
  const ctx = { defautsEnAval };

  for (const regle of INTERVERROUILLAGES[commande] ?? []) {
    if (!regle.bloque(e, ctx)) continue;
    return {
      accepte: false,
      cle: regle.cle,
      raison: `« ${COMMANDES[commande].nom} » refusée sur ${e.name}.`,
      interverrouillage: {
        condition: texte(regle.condition, e, ctx),
        etatActuel: e.status,
        requis: texte(regle.requis, e, ctx),
      },
    };
  }

  return { accepte: true, resultat: COMMANDES[commande].resultat };
}

/**
 * CE QUE LA COMMANDE VA COÛTER, avant de la passer.
 *
 * Demandé au graphe, jamais tenu dans une liste : une liste serait fausse dès
 * la première modification de l'architecture.
 */
export function consequences(g, id, commande) {
  const vide = { perdus: [], decouples: [], nombre: 0, nombreDecouples: 0 };
  const e = g.noeuds.get(id);
  if (!e) return vide;
  const coupe = ['OPEN', 'ISOLATE', 'LOCK', 'MAINTENANCE'].includes(commande);
  if (!coupe || !conduit(e.status)) return vide;

  // DEUX CONSÉQUENCES, ET LA SECONDE EST CELLE QU'ON CROIT CHERCHER.
  //
  // `perdus` : ce qui se retrouve hors tension. Souvent vide sur une cellule
  // MT — le bloc reste alimenté par ses propres chaînes, et c'est justement
  // ce qui rend un poste dangereux après une ouverture côté réseau.
  //
  // `decouples` : ce qui n'atteint plus le réseau, donc cesse d'injecter.
  // C'est la perte de production, et c'est ce que l'exploitant décide.
  const perdus = [...enAval(g, id)].map((x) => g.noeuds.get(x)).filter(Boolean);
  const decouples = [...decouplesSi(g, id)].map((x) => g.noeuds.get(x)).filter(Boolean);
  return { perdus, decouples, nombre: perdus.length, nombreDecouples: decouples.length };
}

/**
 * APPLIQUE LA COMMANDE. Ne recalcule rien : la propagation s'en charge après.
 *
 * `RESET` rend l'appareil à l'état neutre de son type — un disjoncteur
 * réarmé est OUVERT, pas fermé. Réarmer en refermant remettrait la tension
 * sur un circuit qu'on vient de dépanner, sans que personne ne l'ait demandé.
 */
export function appliquer(g, id, commande, { horodatage = Date.now(), auteur = 'exploitant' } = {}) {
  const controle = verifier(g, id, commande);
  const e = g.noeuds.get(id);
  if (!controle.accepte) {
    return { ...controle, equipement: e ?? null, evenement: {
      horodatage, auteur, commande, equipementId: id,
      resultat: 'refusée', raison: controle.interverrouillage?.condition ?? controle.raison,
    } };
  }

  const avant = e.status;
  const apres = commande === 'RESET' ? etatNeutre(e) : COMMANDES[commande].resultat;
  e.status = apres;
  if (commande === 'RESET') {
    // Un réarmement efface le défaut et sa cause : c'est ce qu'il signifie.
    delete e.properties.causeDefaut;
    delete e.properties.causePersistante;
    e.properties.defautActif = null;
  }

  const evenement = {
    horodatage, auteur, commande, equipementId: id, equipement: e.name,
    resultat: 'acceptée', avant, apres,
  };
  e.events.push(evenement);
  return { accepte: true, equipement: e, avant, apres, evenement };
}

/**
 * L'état neutre d'un type après réarmement.
 * Tout ce qui se manœuvre revient OUVERT ; le reste revient NORMAL.
 */
export function etatNeutre(e) {
  return TYPES[e.type]?.manoeuvrable ? 'OPEN' : 'NORMAL';
}

/** Les commandes proposables sur un équipement, avec leur recevabilité. */
export function commandesDisponibles(g, id) {
  const e = g.noeuds.get(id);
  if (!e) return [];
  return commandesDuType(e.type).map((c) => {
    const v = verifier(g, id, c);
    return {
      commande: c, nom: COMMANDES[c].nom, accepte: v.accepte,
      raison: v.accepte ? null : v.interverrouillage?.condition ?? v.raison,
      requis: v.accepte ? null : v.interverrouillage?.requis ?? null,
    };
  });
}
