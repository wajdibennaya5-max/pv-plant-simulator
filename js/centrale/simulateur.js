/**
 * LE SIMULATEUR — ce qui tient la centrale entre deux commandes.
 *
 * Il orchestre, il ne calcule pas : la génération construit, la topologie
 * répond, la propagation mesure, les commandes vérifient. Ce fichier assemble
 * et garde la mémoire — l'énergie accumulée, l'historique, la sélection
 * courante, la météo du moment.
 *
 * IL NE TOUCHE NI AU DOCUMENT, NI AU STOCKAGE. C'est ce qui permet de jouer
 * une séquence d'exploitation entière dans un test, sans navigateur : ouvrir
 * un disjoncteur, vérifier que l'aval tombe, injecter un défaut, vérifier
 * l'alarme. Une interface ne se teste pas ; une séquence, si.
 *
 * L'ÉTAT EST RECALCULÉ, JAMAIS RAPIÉCÉ. Après chaque commande, toute la
 * propagation repart de zéro. Mettre à jour « juste ce qui a changé » demande
 * de savoir ce qui a changé — et c'est précisément la question à laquelle
 * seul le graphe sait répondre.
 */
import { genererCentrale, detailler, modulesDeRangee } from './generation.js';
import { construire } from './topologie.js';
import { propager, ingenierie, flux, AMBIANCE_DEFAUT } from './propagation.js';
import { appliquer, commandesDisponibles, consequences } from './commandes.js';
import { injecter, lever, acquitter, alarmes, evenements, defautsPour } from './defauts.js';
import { apparence, TYPES, ETATS } from './modele.js';
import { fiche, origine } from './catalogue.js';

/** Les trois lectures d'une même centrale. */
export const MODES = {
  exploitation: { nom: 'Exploitation', resume: 'Ce qui produit, ce qui est en défaut, ce qu’on peut manœuvrer.' },
  engineering: { nom: 'Ingénierie', resume: 'Sections, chutes de tension, pertes, protections, mise à la terre.' },
  chantier: { nom: 'Chantier', resume: 'Installé, manquant, contrôlé, en défaut — l’avancement du montage.' },
};

/** Les états d'avancement d'un équipement sur le chantier. */
export const CHANTIER = {
  installe: { nom: 'Installé', couleur: 'ok' },
  manquant: { nom: 'Manquant', couleur: 'sourd' },
  controle: { nom: 'Contrôlé', couleur: 'ok' },
  defaut: { nom: 'En défaut', couleur: 'defaut' },
};

/** Une journée d'ensoleillement, heure par heure — fraction de l'irradiance de midi. */
const COURBE_JOUR = [0, 0, 0, 0, 0, 0.02, 0.12, 0.30, 0.52, 0.72, 0.88, 0.97,
  1, 0.97, 0.88, 0.72, 0.52, 0.30, 0.12, 0.02, 0, 0, 0, 0];

/** L'irradiance attendue à une heure donnée, ciel clair. */
export function irradianceA(heure, maximum = 1000) {
  const h = ((Math.floor(heure) % 24) + 24) % 24;
  return Math.round(maximum * COURBE_JOUR[h]);
}

/**
 * CRÉE UN SIMULATEUR.
 *
 * Tout l'état vit dans la fermeture : deux simulateurs ne se marchent pas
 * dessus, et un test peut en créer autant qu'il veut.
 */
export function creerSimulateur(parametres = {}) {
  let generation = genererCentrale(parametres);
  let graphe = construire(generation.equipements, generation.liaisons);
  let ambiance = { ...AMBIANCE_DEFAUT };
  let horloge = 12;
  let energieJour = 0;
  let energieTotale = 0;
  let selection = null;
  let mode = 'exploitation';
  let calcul = propager(graphe, ambiance);
  const journal = [];

  /** Rejoue toute la propagation. */
  function recalculer() {
    calcul = propager(graphe, ambiance);
    return calcul;
  }

  function noter(evenement) {
    if (!evenement) return;
    journal.unshift(evenement);
    // L'historique de l'écran n'est pas un journal d'exploitation : au-delà
    // de quelques centaines de lignes, personne ne remonte, et la mémoire
    // d'un téléphone n'est pas infinie.
    if (journal.length > 500) journal.length = 500;
  }

  return {
    /** Le graphe, pour les vues et les tests. */
    graphe: () => graphe,
    plan: () => generation.plan,
    mode: () => mode,
    ambiance: () => ({ ...ambiance, heure: horloge }),
    avertissements: () => generation.avertissements,

    /** Régénère entièrement la centrale — nouveaux paramètres, nouvel ouvrage. */
    regenerer(nouveaux = {}) {
      generation = genererCentrale({ ...parametres, ...nouveaux });
      graphe = construire(generation.equipements, generation.liaisons);
      energieJour = 0;
      selection = null;
      journal.length = 0;
      recalculer();
      return generation;
    },

    changerMode(m) { if (MODES[m]) mode = m; return mode; },

    /** Règle l'ambiance — irradiance, température, vent. */
    regler(valeurs = {}) {
      ambiance = { ...ambiance, ...valeurs };
      return recalculer();
    },

    /**
     * AVANCE LE TEMPS.
     *
     * L'énergie s'accumule en intégrant la puissance sur le pas : c'est la
     * seule façon d'obtenir une énergie du jour qui corresponde à la courbe
     * affichée. Un compteur incrémenté d'un forfait divergerait de la courbe
     * en quelques heures, et on ne saurait plus lequel croire.
     */
    avancer(minutes = 60) {
      const pas = Math.max(0, Number(minutes) || 0) / 60;
      const avant = horloge;
      horloge = (horloge + pas) % 24;
      if (horloge < avant) energieJour = 0;
      ambiance = { ...ambiance, irradiance: irradianceA(horloge, ambiance.maximum ?? 1000) };
      recalculer();
      const kwh = (calcul.total.puissanceAc / 1000) * pas;
      energieJour += kwh;
      energieTotale += kwh;
      return { heure: horloge, energieJour, energieTotale, ajoute: kwh };
    },

    /** L'instantané complet, tel que les vues le consomment. */
    etat() {
      return {
        graphe, plan: generation.plan, mode,
        mesures: calcul.mesures, etats: calcul.etats, total: calcul.total,
        alertes: calcul.alertes, reseau: calcul.reseauPresent,
        ambiance: { ...ambiance, heure: horloge },
        energieJour, energieTotale,
        alarmes: alarmes(graphe), evenements: journal.length ? journal : evenements(graphe),
        selection, agrege: generation.agrege,
        avertissements: generation.avertissements,
      };
    },

    /** Les indicateurs de supervision, dans l'ordre où ils se lisent. */
    scada() {
      const t = calcul.total;
      const grid = calcul.mesures.get('grid') ?? {};
      const ond = [...graphe.noeuds.values()].filter((e) => e.type === 'Inverter');
      const cosPhi = ond.length
        ? ond.reduce((s, e) => s + (calcul.mesures.get(e.id)?.cosPhi ?? 0), 0) / ond.length : 0;
      return {
        puissance: t.puissanceAc, puissanceDc: t.puissanceDc, crete: t.crete,
        energieJour, energieTotale,
        tension: grid.v ?? 0, courant: grid.i ?? 0,
        frequence: t.frequence, cosPhi,
        performance: t.performance, rendement: t.rendementConversion,
        reseau: t.reseau, enDefaut: t.equipementsEnDefaut,
        alarmesActives: alarmes(graphe, { seulementActives: true }).length,
        meteo: { ...ambiance, heure: horloge },
      };
    },

    /** L'analyse d'ingénierie — le mode qui intéresse le concepteur. */
    ingenierie: () => ingenierie(graphe, generation.plan, calcul.mesures),

    /** L'avancement de chantier, compté sur le graphe. */
    chantier() {
      const compte = { installe: 0, manquant: 0, controle: 0, defaut: 0 };
      const parType = new Map();
      for (const e of graphe.noeuds.values()) {
        if (['Plant', 'Zone', 'Block'].includes(e.type)) continue;
        const etat = e.properties.chantier
          ?? (['FAULT', 'TRIPPED'].includes(e.status) ? 'defaut' : 'installe');
        compte[etat] = (compte[etat] ?? 0) + 1;
        if (!parType.has(e.type)) parType.set(e.type, { ...{ installe: 0, manquant: 0, controle: 0, defaut: 0 } });
        parType.get(e.type)[etat] += 1;
      }
      const total = Object.values(compte).reduce((a, b) => a + b, 0);
      return { compte, parType: [...parType].map(([type, c]) => ({ type, nom: TYPES[type].nom, ...c })),
        total, avancement: total ? (compte.installe + compte.controle) / total : 0 };
    },

    /** Marque l'avancement d'un équipement sur le chantier. */
    marquerChantier(id, etat) {
      const e = graphe.noeuds.get(id);
      if (!e || !CHANTIER[etat]) return false;
      e.properties.chantier = etat;
      return true;
    },

    /** Le flux par liaison, pour le schéma unifilaire. */
    flux: () => flux(graphe, calcul.mesures),

    selectionner(id) { selection = graphe.noeuds.has(id) ? id : null; return selection; },

    /**
     * LE PANNEAU D'UN ÉQUIPEMENT : tout ce qu'on veut savoir en appuyant dessus.
     *
     * Identification, caractéristiques, état courant, mesures, commandes
     * disponibles — avec la raison de celles qui ne le sont pas — et
     * historique. C'est l'écran qui remplace l'appel au chef de poste.
     */
    fiche(id) {
      const e = graphe.noeuds.get(id);
      if (!e) return null;
      const etat = calcul.etats.get(id) ?? e.status;
      const f = fiche(e.properties?.module) ?? null;
      return {
        equipement: e,
        identification: {
          id: e.id, nom: e.name, type: e.type, typeNom: TYPES[e.type].nom,
          fabricant: e.manufacturer, modele: e.model,
          // La provenance est affichée avec la fiche, pas dans une note de bas
          // de page : c'est au moment de lire la caractéristique qu'on doit
          // savoir si elle est vérifiée.
          provenance: origine(f ?? { verified: e.verified }),
          verifie: e.verified === true,
          parent: e.parentId ? graphe.noeuds.get(e.parentId)?.name ?? null : null,
        },
        caracteristiques: e.properties,
        etat: { code: etat, commande: e.status, ...apparence(etat),
          description: ETATS[etat]?.nom ?? etat },
        mesures: calcul.mesures.get(id) ?? {},
        commandes: commandesDisponibles(graphe, id),
        defauts: defautsPour(e.type),
        alarmes: [...e.alarms].sort((a, b) => b.horodatage - a.horodatage),
        historique: [...e.events].sort((a, b) => b.horodatage - a.horodatage),
        agrege: e.properties?.agrege === true,
        effectif: e.properties?.effectif ?? 1,
      };
    },

    /** Ce qu'une commande coûterait, avant de la passer. */
    consequences: (id, commande) => consequences(graphe, id, commande),

    /**
     * PASSE UNE COMMANDE, puis recalcule tout.
     * Le refus est un résultat comme un autre : il est journalisé, et il dit
     * pourquoi.
     */
    commander(id, commande, options = {}) {
      const r = appliquer(graphe, id, commande, options);
      noter(r.evenement);
      recalculer();
      return { ...r, etat: calcul.etats.get(id) ?? null };
    },

    /** Injecte un défaut, puis recalcule tout. */
    injecter(id, defautId, options = {}) {
      const r = injecter(graphe, id, defautId, options);
      noter(r.evenement);
      recalculer();
      return { ...r, etat: calcul.etats.get(id) ?? null };
    },

    /** Lève la cause d'un défaut — sans réarmer : ce sont deux gestes. */
    lever(id) {
      const r = lever(graphe, id);
      noter(r.evenement);
      recalculer();
      return r;
    },

    acquitter: (alarmeId) => acquitter(graphe, alarmeId),

    /** Descend au détail d'un nœud agrégé — chaînes, rangées, onduleurs. */
    detailler: (id) => detailler(graphe.noeuds.get(id), generation.plan),

    /** Les modules d'une rangée, matérialisés à la demande. */
    modules: (id) => modulesDeRangee(graphe.noeuds.get(id), generation.plan),

    /**
     * L'INSTANTANÉ PERSISTABLE.
     *
     * On ne range pas le graphe : on range les PARAMÈTRES qui l'ont produit,
     * plus les écarts — les états manœuvrés, les alarmes, l'énergie. Une
     * centrale de 500 MWc tient alors en quelques kilo-octets, là où le
     * graphe complet dépasserait le quota du navigateur.
     */
    instantane() {
      const ecarts = [];
      for (const e of graphe.noeuds.values()) {
        const neuf = e.alarms.length === 0 && e.events.length === 0
          && !e.properties.defautActif && e.properties.chantier === undefined;
        if (neuf && !aEtatManoeuvre(e)) continue;
        ecarts.push({ id: e.id, status: e.status,
          defautActif: e.properties.defautActif ?? null,
          ombrage: e.properties.ombrage, salissure: e.properties.salissure,
          chantier: e.properties.chantier ?? null,
          alarms: e.alarms, events: e.events });
      }
      return { version: 1, parametres, ambiance, horloge, energieJour,
        energieTotale, mode, ecarts };
    },

    /** Repart d'un instantané. */
    restaurer(instantane) {
      if (!instantane || instantane.version !== 1) return false;
      generation = genererCentrale(instantane.parametres ?? parametres);
      graphe = construire(generation.equipements, generation.liaisons);
      ambiance = { ...AMBIANCE_DEFAUT, ...(instantane.ambiance ?? {}) };
      horloge = Number(instantane.horloge) || 12;
      energieJour = Number(instantane.energieJour) || 0;
      energieTotale = Number(instantane.energieTotale) || 0;
      mode = MODES[instantane.mode] ? instantane.mode : 'exploitation';
      for (const ec of instantane.ecarts ?? []) {
        const e = graphe.noeuds.get(ec.id);
        if (!e) continue;
        if (ec.status && ETATS[ec.status]) e.status = ec.status;
        if (ec.defautActif) e.properties.defautActif = ec.defautActif;
        if (ec.ombrage !== undefined) e.properties.ombrage = ec.ombrage;
        if (ec.salissure !== undefined) e.properties.salissure = ec.salissure;
        if (ec.chantier) e.properties.chantier = ec.chantier;
        e.alarms = Array.isArray(ec.alarms) ? ec.alarms : [];
        e.events = Array.isArray(ec.events) ? ec.events : [];
      }
      recalculer();
      return true;
    },
  };
}

/** L'équipement porte-t-il un état qui vient d'une manœuvre ? */
function aEtatManoeuvre(e) {
  return ['OPEN', 'LOCKED', 'ISOLATED', 'MAINTENANCE', 'TRIPPED', 'FAULT', 'GRID_LOST',
    'STOPPED', 'NO_COMM'].includes(e.status);
}
