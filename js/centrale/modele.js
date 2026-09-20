/**
 * LES OBJETS DE LA CENTRALE — des données, et rien d'autre.
 *
 * Ce fichier ne calcule pas, ne dessine pas, ne range rien. Il définit ce
 * qu'est un équipement, quels états il peut prendre, quelles liaisons
 * existent et quelles commandes se conçoivent. Tout le reste du simulateur
 * s'appuie dessus.
 *
 * LA RÈGLE QUI TIENT TOUT LE MODULE : couleur, icône et animation DÉRIVENT de
 * l'état. Jamais l'inverse. Un disjoncteur n'est pas rouge parce qu'on l'a
 * dessiné rouge ; il est rouge parce qu'il a déclenché. Le jour où une vue
 * choisit sa propre couleur, deux écrans montrent deux vérités — et c'est
 * celui qui regarde le mauvais écran qui va sur le terrain.
 *
 * `conduit` est la seule propriété que le moteur de topologie lit : elle dit
 * si le courant traverse l'équipement dans cet état. Rien n'est codé en dur
 * ailleurs.
 */

/**
 * LES ÉTATS POSSIBLES D'UN ÉQUIPEMENT.
 *
 * `gravite` ordonne les états quand plusieurs s'appliquent : on retient
 * toujours le plus grave, parce qu'un équipement « en marche ET en défaut »
 * est en défaut.
 */
export const ETATS = {
  NORMAL:    { nom: 'Normal',            couleur: 'ok',      icone: 'point',    animation: 'aucune',    conduit: true,  gravite: 0 },
  RUNNING:   { nom: 'En production',     couleur: 'ok',      icone: 'eclair',   animation: 'pulse',     conduit: true,  gravite: 0 },
  STANDBY:   { nom: 'En attente',        couleur: 'veille',  icone: 'pause',    animation: 'aucune',    conduit: true,  gravite: 1 },
  CLOSED:    { nom: 'Fermé',             couleur: 'ok',      icone: 'ferme',    animation: 'aucune',    conduit: true,  gravite: 0 },
  STOPPED:   { nom: 'Arrêté',            couleur: 'veille',  icone: 'stop',     animation: 'aucune',    conduit: false, gravite: 2 },
  OPEN:      { nom: 'Ouvert',            couleur: 'veille',  icone: 'ouvert',   animation: 'aucune',    conduit: false, gravite: 2 },
  WARNING:   { nom: 'Avertissement',     couleur: 'alerte',  icone: 'triangle', animation: 'aucune',    conduit: true,  gravite: 3 },
  NO_COMM:   { nom: 'Perte de communication', couleur: 'sourd', icone: 'antenne', animation: 'clignote', conduit: true,  gravite: 4 },
  MAINTENANCE: { nom: 'En maintenance',  couleur: 'travaux', icone: 'cle',      animation: 'hachure',   conduit: false, gravite: 5 },
  LOCKED:    { nom: 'Consigné',          couleur: 'travaux', icone: 'cadenas',  animation: 'aucune',    conduit: false, gravite: 6 },
  ISOLATED:  { nom: 'Isolé',             couleur: 'sourd',   icone: 'coupure',  animation: 'aucune',    conduit: false, gravite: 7 },
  GRID_LOST: { nom: 'Réseau absent',     couleur: 'defaut',  icone: 'reseau',   animation: 'clignote',  conduit: false, gravite: 8 },
  TRIPPED:   { nom: 'Déclenché',         couleur: 'defaut',  icone: 'declenche', animation: 'clignote', conduit: false, gravite: 9 },
  FAULT:     { nom: 'En défaut',         couleur: 'defaut',  icone: 'croix',    animation: 'clignote',  conduit: false, gravite: 10 },
};

/** L'état le plus grave l'emporte — un équipement en marche et en défaut est en défaut. */
export function pire(...etats) {
  return etats.filter((e) => ETATS[e]).sort((a, b) => ETATS[b].gravite - ETATS[a].gravite)[0]
    ?? 'NORMAL';
}

/** Le courant traverse-t-il un équipement dans cet état ? */
export const conduit = (etat) => ETATS[etat]?.conduit === true;

/**
 * LES LIAISONS TYPÉES.
 *
 * `pe` est le conducteur de protection : il ne transporte pas d'énergie, il
 * ramène un défaut d'isolement à la terre. Le moteur ne le suit donc jamais
 * pour décider qu'un équipement est alimenté — mais il le suit pour vérifier
 * qu'une mise à la terre existe, ce qui est une autre question.
 */
export const LIENS = {
  'dc+': { nom: 'Continu — pôle positif', energie: true,  trait: 'plein',     couleur: 'dc' },
  'dc-': { nom: 'Continu — pôle négatif', energie: true,  trait: 'plein',     couleur: 'dc' },
  ac:    { nom: 'Alternatif basse tension', energie: true, trait: 'plein',    couleur: 'ac' },
  mv:    { nom: 'Alternatif moyenne tension', energie: true, trait: 'epais',  couleur: 'mv' },
  pe:    { nom: 'Conducteur de protection', energie: false, trait: 'tirete',  couleur: 'pe' },
};

/** Les liaisons qui transportent de l'énergie — les seules que suit l'alimentation. */
export const LIENS_ENERGIE = Object.keys(LIENS).filter((t) => LIENS[t].energie);

/** Les commandes qu'un opérateur peut demander. */
export const COMMANDES = {
  OPEN:        { nom: 'Ouvrir',            verbe: 'ouverture',    resultat: 'OPEN' },
  CLOSE:       { nom: 'Fermer',            verbe: 'fermeture',    resultat: 'CLOSED' },
  RESET:       { nom: 'Réarmer',           verbe: 'réarmement',   resultat: 'NORMAL' },
  LOCK:        { nom: 'Consigner',         verbe: 'consignation', resultat: 'LOCKED' },
  UNLOCK:      { nom: 'Déconsigner',       verbe: 'déconsignation', resultat: 'OPEN' },
  ISOLATE:     { nom: 'Isoler',            verbe: 'isolement',    resultat: 'ISOLATED' },
  MAINTENANCE: { nom: 'Mettre en maintenance', verbe: 'mise en maintenance', resultat: 'MAINTENANCE' },
};

/**
 * LES TYPES D'ÉQUIPEMENT.
 *
 * `manoeuvrable` distingue ce qui s'ouvre et se ferme de ce qui se subit : on
 * n'ouvre pas une fondation. `source` marque ce qui injecte de l'énergie dans
 * le graphe — les modules en produisent, le réseau en fournit. Tout le reste
 * n'est que transport, et le moteur le découvre par parcours.
 */
export const TYPES = {
  Plant:          { nom: 'Centrale',                  categorie: 'ensemble',  manoeuvrable: false },
  Zone:           { nom: 'Zone',                      categorie: 'ensemble',  manoeuvrable: false },
  Block:          { nom: 'Bloc de puissance',         categorie: 'ensemble',  manoeuvrable: false },
  // UNE CHAÎNE ET UNE RANGÉE NE SE MANŒUVRENT PAS, MAIS ELLES SE RÉARMENT.
  // Sans `RESET`, une chaîne tombée en défaut n'avait aucun chemin de retour
  // en service : on pouvait lever la cause — nettoyer, rebrancher — et elle
  // restait éteinte pour toujours. `manoeuvrable: false` garde `etatNeutre`
  // sur NORMAL : une chaîne réparée reproduit, elle ne s'ouvre pas.
  Row:            { nom: 'Rangée',                    categorie: 'champ',     manoeuvrable: false, commandes: ['RESET', 'MAINTENANCE'] },
  Structure:      { nom: 'Structure porteuse',        categorie: 'champ',     manoeuvrable: false },
  Foundation:     { nom: 'Fondation',                 categorie: 'champ',     manoeuvrable: false },
  Module:         { nom: 'Module photovoltaïque',     categorie: 'champ',     manoeuvrable: false, source: true },
  String:         { nom: 'Chaîne',                    categorie: 'dc',        manoeuvrable: false, source: true, commandes: ['RESET', 'MAINTENANCE'] },
  Combiner:       { nom: 'Coffret de groupage',       categorie: 'dc',        manoeuvrable: true,  commandes: ['OPEN', 'CLOSE', 'LOCK', 'UNLOCK', 'ISOLATE', 'MAINTENANCE', 'RESET'] },
  DCProtection:   { nom: 'Protection continue',       categorie: 'dc',        manoeuvrable: true,  commandes: ['OPEN', 'CLOSE', 'RESET', 'LOCK', 'UNLOCK', 'ISOLATE'] },
  Inverter:       { nom: 'Onduleur',                  categorie: 'conversion', manoeuvrable: true, commandes: ['OPEN', 'CLOSE', 'RESET', 'ISOLATE', 'MAINTENANCE'] },
  ACProtection:   { nom: 'Protection alternative',    categorie: 'ac',        manoeuvrable: true,  commandes: ['OPEN', 'CLOSE', 'RESET', 'LOCK', 'UNLOCK', 'ISOLATE'] },
  Transformer:    { nom: 'Transformateur',            categorie: 'mt',        manoeuvrable: false, commandes: ['ISOLATE', 'MAINTENANCE', 'RESET'] },
  MVCell:         { nom: 'Cellule moyenne tension',   categorie: 'mt',        manoeuvrable: true,  commandes: ['OPEN', 'CLOSE', 'RESET', 'LOCK', 'UNLOCK', 'ISOLATE', 'MAINTENANCE'] },
  Cable:          { nom: 'Liaison câblée',            categorie: 'liaison',   manoeuvrable: false },
  Grounding:      { nom: 'Mise à la terre',           categorie: 'liaison',   manoeuvrable: false },
  SCADA:          { nom: 'Supervision',               categorie: 'controle',  manoeuvrable: false, commandes: ['RESET'] },
  WeatherStation: { nom: 'Station météo',             categorie: 'controle',  manoeuvrable: false, commandes: ['RESET'] },
  Tracker:        { nom: 'Suiveur',                   categorie: 'champ',     manoeuvrable: true,  commandes: ['LOCK', 'UNLOCK', 'MAINTENANCE', 'RESET'] },
  Building:       { nom: 'Bâtiment',                  categorie: 'genie',     manoeuvrable: false },
  // LE RÉSEAU SE RÉTABLIT. Sans `RESET`, une perte de réseau était
  // définitive : on pouvait simuler la panne, jamais le retour du courant —
  // et c'est pourtant le retour qui s'exerce, parce que c'est lui qui remet
  // en service dans le bon ordre.
  Grid:           { nom: 'Réseau',                    categorie: 'mt',        manoeuvrable: false, source: true, commandes: ['RESET'] },
};

/** Les types qui injectent de l'énergie dans le graphe. */
export const estSource = (type) => TYPES[type]?.source === true;

/** Les commandes admises pour un type — vide si l'équipement ne se manœuvre pas. */
export const commandesDuType = (type) => TYPES[type]?.commandes ?? [];

let compteur = 0;
/** Un identifiant stable et lisible : `inv-12`, `mvcell-3`. */
export function identifiant(prefixe) {
  compteur += 1;
  return `${prefixe}-${compteur}`;
}

/** Repart de zéro — utile aux tests, qui veulent des identifiants prévisibles. */
export function reinitialiserCompteur() { compteur = 0; }

/**
 * FABRIQUE UN ÉQUIPEMENT COMPLET.
 *
 * Tous les champs existent toujours, même vides. Un objet dont la forme
 * change selon le chemin qui l'a créé oblige chaque lecteur à se défendre, et
 * un lecteur finit toujours par oublier.
 */
export function equipement({
  id, type, name, manufacturer = null, model = null, verified = false,
  position = { x: 0, y: 0 }, status = 'NORMAL', parentId = null,
  childrenIds = [], connections = [], properties = {},
} = {}) {
  if (!TYPES[type]) throw new Error(`Type d’équipement inconnu : ${type}`);
  return {
    id: id ?? identifiant(type.toLowerCase()),
    name: name ?? TYPES[type].nom,
    type,
    manufacturer,
    model,
    // Une caractéristique non vérifiée est annoncée comme telle, partout où
    // elle s'affiche. C'est la seule protection contre une fiche inventée.
    verified: verified === true,
    position,
    status,
    parentId,
    childrenIds: [...childrenIds],
    connections: [...connections],
    properties: { ...properties },
    alarms: [],
    events: [],
  };
}

/** Une liaison typée entre deux équipements. */
export function liaison(de, vers, type, proprietes = {}) {
  if (!LIENS[type]) throw new Error(`Type de liaison inconnu : ${type}`);
  return { de, vers, type, ...proprietes };
}

/** L'apparence d'un état — lue par les vues, jamais décidée par elles. */
export function apparence(status) {
  const e = ETATS[status] ?? ETATS.NORMAL;
  return { nom: e.nom, couleur: e.couleur, icone: e.icone, animation: e.animation };
}
