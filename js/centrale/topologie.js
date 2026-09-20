/**
 * LA TOPOLOGIE — un graphe, et les questions qu'on lui pose.
 *
 * TOUT LE SIMULATEUR TIENT SUR CE FICHIER. « Cet équipement est-il alimenté,
 * isolé, en défaut ? » ne se répond jamais par une règle écrite à l'avance
 * (« si le disjoncteur du poste 3 est ouvert, alors les onduleurs 7 à 12
 * s'arrêtent ») mais par un parcours. La différence n'est pas théorique :
 * une règle codée en dur devient fausse à la première modification de
 * l'architecture, et personne ne s'en aperçoit avant de la croire.
 *
 * L'ALIMENTATION SE PROPAGE DANS LES DEUX SENS. Un transformateur est sous
 * tension par le réseau comme par les onduleurs ; ne suivre les liaisons que
 * dans le sens de la production ferait croire qu'un poste consigné côté
 * modules est hors tension, alors que la moyenne tension l'alimente encore.
 * C'est l'erreur qui tue un intervenant.
 *
 * UN ÉQUIPEMENT QUI NE CONDUIT PAS RESTE ALIMENTÉ D'UN CÔTÉ. Un disjoncteur
 * ouvert est sous tension en amont. Il est donc marqué alimenté, mais il ne
 * transmet rien : c'est cette distinction qui fait qu'ouvrir un appareil
 * coupe l'aval sans faire disparaître l'appareil lui-même.
 *
 * Le conducteur de protection (`pe`) ne transporte pas d'énergie : il n'entre
 * jamais dans un calcul d'alimentation. Il sert à une autre question — la
 * mise à la terre existe-t-elle — et elle a sa propre fonction.
 */
import { LIENS, LIENS_ENERGIE, conduit, estSource } from './modele.js';

/**
 * Indexe équipements et liaisons en un graphe interrogeable.
 *
 * Les index d'adjacence sont construits une fois : sans eux, chaque parcours
 * relirait la liste entière des liaisons, et un parc de 500 MWc passerait de
 * quelques millisecondes à plusieurs secondes par question posée.
 */
export function construire(equipements = [], liaisons = []) {
  const noeuds = new Map();
  for (const e of equipements) noeuds.set(e.id, e);

  const adjacence = new Map();
  const ajouter = (a, b, lien) => {
    if (!adjacence.has(a)) adjacence.set(a, []);
    adjacence.get(a).push({ vers: b, lien });
  };
  const retenues = [];
  for (const l of liaisons) {
    // Une liaison vers un équipement absent est une erreur de construction,
    // pas un cas à gérer silencieusement : on l'écarte et on la signale.
    if (!noeuds.has(l.de) || !noeuds.has(l.vers) || !LIENS[l.type]) continue;
    retenues.push(l);
    ajouter(l.de, l.vers, l);
    ajouter(l.vers, l.de, l);
  }
  return { noeuds, liaisons: retenues, adjacence };
}

/** Les liaisons orphelines, écartées à la construction. */
export function liaisonsInvalides(equipements = [], liaisons = []) {
  const ids = new Set(equipements.map((e) => e.id));
  return liaisons.filter((l) => !ids.has(l.de) || !ids.has(l.vers) || !LIENS[l.type]);
}

/** Les voisins d'un équipement, toutes liaisons confondues. */
export function voisins(g, id, types = null) {
  return (g.adjacence.get(id) ?? [])
    .filter((v) => !types || types.includes(v.lien.type))
    .map((v) => ({ id: v.vers, type: v.lien.type, lien: v.lien }));
}

/**
 * Les sources actives : ce qui injecte réellement de l'énergie à cet instant.
 *
 * Un réseau en `GRID_LOST` ne conduit pas, donc n'est pas une source — et
 * c'est ce seul fait, sans aucune règle supplémentaire, qui fait tomber toute
 * la centrale à la perte du réseau.
 */
export function sources(g) {
  const out = [];
  for (const e of g.noeuds.values()) {
    if (estSource(e.type) && conduit(e.status)) out.push(e.id);
  }
  return out;
}

/**
 * L'ensemble des équipements sous tension, par parcours depuis les sources.
 *
 * @param {object} g le graphe
 * @param {Set<string>} [bloques] équipements forcés non conducteurs — c'est
 *   ainsi qu'on répond à « que perdrait-on si celui-ci s'ouvrait ? » sans
 *   modifier l'état réel de la centrale.
 */
export function alimentes(g, bloques = new Set()) {
  return atteignables(g, sources(g), bloques);
}

/**
 * L'ensemble atteint depuis un départ donné, par les liaisons d'énergie.
 *
 * Même parcours que `alimentes`, mais le départ est choisi : c'est ainsi
 * qu'on demande « qui est encore relié au réseau ? », question dont dépend
 * l'anti-îlotage — un onduleur qui produit alors que le réseau est absent
 * électrocute celui qui répare la ligne.
 */
export function atteignables(g, depart = [], bloques = new Set()) {
  const vus = new Set();
  const file = [];
  for (const id of depart) {
    if (bloques.has(id) || !g.noeuds.has(id)) continue;
    vus.add(id);
    file.push(id);
  }
  // Parcours en largeur : la file suffit, on ne cherche pas le plus court
  // chemin mais l'ensemble atteint.
  for (let i = 0; i < file.length; i += 1) {
    const id = file[i];
    // Un équipement qui ne conduit pas est atteint, mais ne transmet pas.
    if (bloques.has(id) || !conduit(g.noeuds.get(id)?.status)) continue;
    for (const v of voisins(g, id, LIENS_ENERGIE)) {
      if (vus.has(v.id)) continue;
      vus.add(v.id);
      file.push(v.id);
    }
  }
  return vus;
}

/** Cet équipement est-il sous tension ? */
export const estAlimente = (g, id, bloques) => alimentes(g, bloques).has(id);

/**
 * CE QUE L'ON PERD EN COUPANT ICI.
 *
 * La différence entre les deux parcours, et rien d'autre. Aucune liste
 * d'équipements « à couper avec » n'est tenue quelque part : elle serait
 * fausse dès qu'on ajoute un câble.
 */
export function enAval(g, id) {
  const avant = alimentes(g);
  const apres = alimentes(g, new Set([id]));
  const perdus = new Set();
  for (const x of avant) if (!apres.has(x)) perdus.add(x);
  perdus.delete(id);
  return perdus;
}

/**
 * Les équipements déjà hors tension — ceux qu'aucune source n'atteint.
 * C'est de là que vient l'état `ISOLATED` : il se constate, il ne se décide pas.
 */
export function isoles(g) {
  const vivants = alimentes(g);
  const out = new Set();
  for (const id of g.noeuds.keys()) if (!vivants.has(id)) out.add(id);
  return out;
}

/**
 * Un chemin de l'un à l'autre, en ne traversant que ce qui conduit.
 * @returns {string[]} la suite d'identifiants, vide s'il n'y en a pas
 */
export function chemin(g, de, vers, { seulementConducteurs = true } = {}) {
  if (!g.noeuds.has(de) || !g.noeuds.has(vers)) return [];
  if (de === vers) return [de];
  const precedent = new Map([[de, null]]);
  const file = [de];
  for (let i = 0; i < file.length; i += 1) {
    const id = file[i];
    if (id !== de && seulementConducteurs && !conduit(g.noeuds.get(id).status)) continue;
    for (const v of voisins(g, id, LIENS_ENERGIE)) {
      if (precedent.has(v.id)) continue;
      precedent.set(v.id, id);
      if (v.id === vers) {
        const route = [];
        for (let c = vers; c !== null; c = precedent.get(c)) route.unshift(c);
        return route;
      }
      file.push(v.id);
    }
  }
  return [];
}

/**
 * LA MISE À LA TERRE EXISTE-T-ELLE ?
 *
 * Question distincte de l'alimentation, et posée sur le seul conducteur de
 * protection. Un défaut d'isolement sur un équipement sans terre ne
 * déclenche rien : il attend quelqu'un.
 */
export function relieALaTerre(g, id) {
  const vus = new Set([id]);
  const file = [id];
  for (let i = 0; i < file.length; i += 1) {
    for (const v of voisins(g, file[i], ['pe'])) {
      if (vus.has(v.id)) continue;
      if (g.noeuds.get(v.id)?.type === 'Grounding') return true;
      vus.add(v.id);
      file.push(v.id);
    }
  }
  return false;
}

/** Les descendants hiérarchiques — l'arbre, pas le circuit. */
export function descendants(g, id) {
  const out = [];
  const file = [...(g.noeuds.get(id)?.childrenIds ?? [])];
  for (let i = 0; i < file.length; i += 1) {
    const e = g.noeuds.get(file[i]);
    if (!e) continue;
    out.push(e);
    file.push(...e.childrenIds);
  }
  return out;
}

/** La chaîne des parents, du plus proche à la centrale. */
export function ascendance(g, id) {
  const out = [];
  let e = g.noeuds.get(id);
  while (e?.parentId) {
    e = g.noeuds.get(e.parentId);
    if (!e) break;
    out.push(e);
  }
  return out;
}

/** Tous les équipements d'un type. */
export const parType = (g, type) => [...g.noeuds.values()].filter((e) => e.type === type);

/**
 * LA POLARITÉ EST-ELLE COHÉRENTE ?
 *
 * DEUX FAUTES DIFFÉRENTES, ET LE MÊME SYMPTÔME : une chaîne qui ne produit
 * rien. La première est un CÂBLAGE faux — le pôle positif d'une chaîne rentré
 * sur la borne négative du coffret ; elle se voit dans le graphe, parce qu'il
 * manque alors une liaison `dc+` ou une liaison `dc-`. La seconde est une
 * INVERSION SUR LE TERRAIN, constatée à la pince : le graphe est juste, c'est
 * la chaîne qui est branchée à l'envers, et elle porte alors la marque.
 *
 * On vérifie les deux, parce qu'on ne sait pas d'avance laquelle on a.
 */
export function polariteIncoherente(g) {
  const out = [];
  for (const e of g.noeuds.values()) {
    if (e.type !== 'String') continue;
    if (e.properties?.polariteInversee) {
      out.push({ id: e.id, nom: e.name, raison: 'polarité inversée constatée sur la chaîne' });
      continue;
    }
    const plus = voisins(g, e.id, ['dc+']).length;
    const moins = voisins(g, e.id, ['dc-']).length;
    if (plus === 0 || moins === 0 || plus !== moins) {
      out.push({ id: e.id, nom: e.name,
        raison: `${plus} liaison(s) dc+ pour ${moins} liaison(s) dc- : câblage incohérent` });
    }
  }
  return out;
}

/**
 * CE QU'UN APPAREIL ALIMENTERAIT S'IL CONDUISAIT.
 *
 * Question différente de `enAval`, et c'est la bonne avant une FERMETURE :
 * `enAval` demande ce qu'on perdrait en coupant, ce qui ne dit rien quand
 * l'appareil est déjà ouvert. Ici on part de l'appareil comme s'il était
 * fermé, et on regarde jusqu'où le courant irait. C'est ainsi qu'on sait
 * qu'on s'apprête à remettre sous tension un circuit encore en défaut.
 */
export function portee(g, id) {
  if (!g.noeuds.has(id)) return new Set();
  const vus = new Set([id]);
  const file = [id];
  for (let i = 0; i < file.length; i += 1) {
    const courant = file[i];
    // Le point de départ est traversé d'office : c'est l'hypothèse même.
    if (courant !== id && !conduit(g.noeuds.get(courant)?.status)) continue;
    for (const v of voisins(g, courant, LIENS_ENERGIE)) {
      if (vus.has(v.id)) continue;
      vus.add(v.id);
      file.push(v.id);
    }
  }
  vus.delete(id);
  return vus;
}

/**
 * CE QUI PERDRAIT LE RÉSEAU si cet appareil cessait de conduire.
 *
 * Un bloc dont on ouvre la cellule MT n'est pas « isolé » : ses propres
 * chaînes continuent de l'alimenter, et `enAval` rend donc l'ensemble vide.
 * Ce qui change pour l'exploitant, c'est que le bloc n'atteint plus le
 * réseau — donc qu'il cesse d'injecter. C'est cela qu'il faut annoncer.
 */
export function decouplesSi(g, id, racine = 'grid') {
  if (!g.noeuds.has(racine)) return new Set();
  const avant = atteignables(g, [racine]);
  const apres = atteignables(g, [racine], new Set([id]));
  const out = new Set();
  for (const x of avant) if (!apres.has(x)) out.add(x);
  out.delete(id);
  return out;
}
