/**
 * LA PROPAGATION — ce qui produit, ce qui transite, ce qui s'arrête où.
 *
 * Ce fichier ne décide d'aucun état : il CONSTATE. Il part des chaînes,
 * suit le graphe jusqu'au réseau, et attribue à chaque équipement la
 * puissance qui le traverse réellement. Un équipement qu'aucun chemin
 * conducteur ne relie à une source ne reçoit rien — sans qu'une seule ligne
 * de code ne nomme cet équipement.
 *
 * L'ANTI-ÎLOTAGE N'EST PAS UNE OPTION D'AFFICHAGE. Un onduleur raccordé à un
 * réseau absent doit se découpler : s'il continue d'injecter, il maintient
 * sous tension une ligne que quelqu'un est en train de réparer. La règle est
 * donc appliquée ici, au cœur du calcul, et pas dans la vue : la production
 * d'un onduleur qui n'atteint plus le réseau par un chemin conducteur est
 * nulle, point.
 *
 * L'ÉTAT COMMANDÉ ET L'ÉTAT CONSTATÉ SONT DEUX CHOSES. `status` porte ce
 * qu'un opérateur ou un défaut a imposé — ouvert, consigné, déclenché. La
 * propagation y ajoute ce qu'elle observe — isolé, en attente, en
 * avertissement — et c'est le plus grave des deux qui s'affiche. Sans cette
 * séparation, un recalcul effacerait une consignation, et la consignation est
 * précisément ce qu'on ne doit jamais perdre.
 */
import { conduit, pire, ETATS, LIENS_ENERGIE } from './modele.js';
import { atteignables, alimentes, voisins } from './topologie.js';
import { fiche } from './catalogue.js';

/** Conditions d'ambiance par défaut : plein soleil, journée chaude. */
export const AMBIANCE_DEFAUT = { irradiance: 1000, temperature: 30, vent: 2 };

/** Élévation de la température de cellule au-dessus de l'air, par W/m². */
const ECHAUFFEMENT = 0.03;

/** Charge au-delà de laquelle un transformateur est signalé. */
export const CHARGE_ALERTE = 1.0;

/**
 * La température de cellule, d'où découle toute la production.
 * Un module à 65 °C rend un huitième de moins qu'à 25 °C : l'ignorer fait
 * annoncer en août une production qu'on n'observera jamais.
 */
export function temperatureCellule({ temperature, irradiance } = AMBIANCE_DEFAUT) {
  return Number(temperature) + Number(irradiance) * ECHAUFFEMENT;
}

/**
 * LA PUISSANCE D'UN NŒUD DE CHAÎNES, dans les conditions du moment.
 *
 * Le nœud est agrégé : il porte l'effectif des chaînes qu'il représente. On
 * multiplie plutôt qu'on ne boucle — c'est ce qui rend un parc de 500 MWc
 * calculable sur un téléphone.
 */
export function puissanceChaines(noeud, ambiance = AMBIANCE_DEFAUT, catalogue = fiche) {
  const p = noeud?.properties ?? {};
  if (!conduit(noeud?.status)) return 0;
  // UNE CHAÎNE BRANCHÉE À L'ENVERS NE PRODUIT PAS. La diode de l'onduleur
  // bloque, et le courant ne s'établit jamais. On le dit ici plutôt que de
  // compter sur l'état : une chaîne peut être inversée sans que personne ne
  // l'ait encore mise en défaut — c'est même le cas ordinaire au montage.
  if (p.polariteInversee === true) return 0;
  const mod = catalogue(p.module);
  const creteUnitaire = (p.modulesParChaine ?? 0) * (mod?.puissance ?? 0);
  const crete = creteUnitaire * (p.effectif ?? 0);
  if (!(crete > 0)) return 0;

  const irr = Math.max(0, Number(p.irradiance ?? ambiance.irradiance) || 0);
  const tCell = temperatureCellule({ temperature: ambiance.temperature, irradiance: irr });
  const derive = 1 + ((mod?.coeffPuissance ?? -0.35) / 100) * (tCell - 25);
  const pertes = (1 - (p.ombrage ?? 0)) * (1 - (p.salissure ?? 0));

  return Math.max(0, crete * (irr / 1000) * derive * pertes);
}

/**
 * Le premier équipement d'un des types visés, atteint par un chemin conducteur.
 *
 * SEULES LES LIAISONS D'ÉNERGIE SONT SUIVIES. Le conducteur de protection
 * relie tout à tout : l'emprunter faisait passer la production d'un
 * transformateur par le réseau de terre, et le poste d'arrivée affichait
 * zéro mégawatt pendant que la centrale produisait.
 */
function premierEnAval(g, depart, types) {
  const vus = new Set([depart]);
  const file = [depart];
  for (let i = 0; i < file.length; i += 1) {
    const id = file[i];
    if (id !== depart && !conduit(g.noeuds.get(id)?.status)) continue;
    for (const v of voisins(g, id, LIENS_ENERGIE)) {
      if (vus.has(v.id)) continue;
      const e = g.noeuds.get(v.id);
      if (!e) continue;
      if (types.includes(e.type)) return e;
      vus.add(v.id);
      file.push(v.id);
    }
  }
  return null;
}

/**
 * LE CALCUL COMPLET D'UN INSTANT.
 *
 * @returns {{mesures:Map, etats:Map, flux:Map, total:object, alertes:Array}}
 */
export function propager(g, ambiance = AMBIANCE_DEFAUT, { catalogue = fiche } = {}) {
  const mesures = new Map();
  const etats = new Map();
  const alertes = [];

  const vivants = alimentes(g);
  const reseau = [...g.noeuds.values()].find((e) => e.type === 'Grid');
  const reseauPresent = reseau ? conduit(reseau.status) : false;
  // Qui atteint encore le réseau par un chemin conducteur ? La réponse est un
  // seul parcours, et elle sert à tous les onduleurs.
  const relies = reseau ? atteignables(g, [reseau.id]) : new Set();

  // ── 1. Les chaînes produisent ──────────────────────────────────────────
  const productionPar = new Map();
  for (const e of g.noeuds.values()) {
    if (e.type !== 'String') continue;
    const p = puissanceChaines(e, ambiance, catalogue);
    const pr = e.properties ?? {};
    const tension = conduit(e.status) ? (pr.vmp ?? 0) : 0;
    const courant = tension > 0 ? p / tension : 0;
    mesures.set(e.id, { p, v: tension, i: courant, crete:
      (pr.modulesParChaine ?? 0) * (catalogue(pr.module)?.puissance ?? 0) * (pr.effectif ?? 0) });
    if (p <= 0) continue;
    // À qui cette production arrive-t-elle ? On le demande au graphe.
    const ond = premierEnAval(g, e.id, ['Inverter']);
    if (!ond) continue;
    productionPar.set(ond.id, (productionPar.get(ond.id) ?? 0) + p);
  }

  // ── 2. L'ARBRE DES CHEMINS VERS LE RÉSEAU, construit une seule fois ────
  //
  //      Une recherche par onduleur coûtait 372 ms sur un parc de 500 MWc —
  //      chaque commande aurait figé l'écran une demi-seconde. Un seul
  //      parcours depuis le réseau donne, pour chaque équipement, le saut
  //      suivant vers le poste de livraison ; la route de n'importe qui se
  //      lit ensuite en remontant les parents, sans reparcourir le graphe.
  const versReseau = reseau ? arbreVers(g, reseau.id) : new Map();

  // ── 3. Les onduleurs convertissent, ou se découplent ───────────────────
  const transit = new Map();
  const ajouter = (id, p) => transit.set(id, (transit.get(id) ?? 0) + p);

  for (const e of g.noeuds.values()) {
    if (e.type !== 'Inverter') continue;
    const pr = e.properties ?? {};
    const pDc = productionPar.get(e.id) ?? 0;
    // ANTI-ÎLOTAGE : pas de réseau atteint, pas d'injection. Jamais.
    const couple = reseauPresent && relies.has(e.id) && conduit(e.status);
    const plafond = (pr.puissance ?? 0);
    const brut = couple ? pDc * (pr.rendement ?? 0.98) : 0;
    // L'ÉCRÊTAGE EST NORMAL, ET IL SE DIT. Un champ dimensionné à 1,15 fois
    // la puissance de l'onduleur écrête quelques heures par an : c'est voulu.
    // L'afficher évite qu'on cherche la panne là où il n'y en a pas.
    const pAc = Math.min(brut, plafond);
    const ecrete = brut > plafond;
    const vAc = couple ? (pr.vAc ?? 0) : 0;
    mesures.set(e.id, {
      p: pAc, pDc, pAc, v: vAc, vDc: pDc > 0 ? (pr.vmp ?? 0) : 0,
      i: vAc > 0 ? pAc / (Math.sqrt(3) * vAc) : 0,
      cosPhi: pAc > 0 ? (pr.cosPhi ?? 1) : 0,
      charge: plafond > 0 ? pAc / plafond : 0,
      ecrete, couple, plafond,
    });
    if (ecrete) {
      alertes.push({ id: e.id, gravite: 'information', cle: 'ecretage',
        texte: `${e.name} : écrêtage, ${Math.round(brut / 1000)} kW disponibles pour ${Math.round(plafond / 1000)} kVA.` });
    }
    if (!couple && conduit(e.status) && pDc > 0) {
      alertes.push({ id: e.id, gravite: 'avertissement', cle: 'decouple',
        texte: `${e.name} : découplé du réseau, production arrêtée (anti-îlotage).` });
    }

    // LE TRANSIT SE DÉPOSE LE LONG DE LA ROUTE. Un appareil situé sur le
    // chemin d'une puissance la voit passer ; un appareil situé ailleurs ne
    // la voit pas. Additionner les deux côtés d'un nœud comptait deux fois la
    // même énergie et faisait sortir tous les disjoncteurs de leur calibre.
    if (pAc <= 0) continue;
    for (let c = versReseau.get(e.id); c; c = versReseau.get(c)) ajouter(c, pAc);
  }

  // ── 4. Transformateurs, puis tout le reste du transport ────────────────
  for (const e of g.noeuds.values()) {
    if (e.type !== 'Transformer') continue;
    const pr = e.properties ?? {};
    const p = conduit(e.status) ? (transit.get(e.id) ?? 0) : 0;
    const charge = (pr.puissance ?? 0) > 0 ? p / pr.puissance : 0;
    // L'échauffement suit le carré de la charge : c'est la perte cuivre.
    const temperature = (ambiance.temperature ?? 30) + 45 * charge * charge;
    mesures.set(e.id, { p, charge, temperature,
      primaire: p > 0 ? pr.primaire : 0, secondaire: p > 0 ? pr.secondaire : 0,
      i: p > 0 && pr.secondaire ? p / (Math.sqrt(3) * pr.secondaire) : 0 });
    if (charge > CHARGE_ALERTE) {
      alertes.push({ id: e.id, gravite: 'avertissement', cle: 'surcharge-transformateur',
        texte: `${e.name} : charge ${Math.round(charge * 100)} % de la puissance nominale.` });
    }
    if (temperature > (pr.tempMax ?? 105)) {
      alertes.push({ id: e.id, gravite: 'defaut', cle: 'temperature-transformateur',
        texte: `${e.name} : ${Math.round(temperature)} °C, au-dessus de ${pr.tempMax} °C.` });
    }
  }

  for (const e of g.noeuds.values()) {
    if (mesures.has(e.id)) continue;
    if (['MVCell', 'ACProtection', 'DCProtection', 'Combiner', 'Cable', 'Grid'].includes(e.type)) {
      const p = conduit(e.status) ? (transit.get(e.id) ?? 0) : 0;
      const tension = e.properties?.tension ?? 0;
      mesures.set(e.id, { p, v: conduit(e.status) && p > 0 ? tension : 0,
        i: tension > 0 && p > 0 ? p / (Math.sqrt(3) * tension) : 0,
        f: e.type === 'Grid' ? (reseauPresent ? 50 : 0) : undefined });
    } else {
      mesures.set(e.id, { p: 0 });
    }
  }

  // ── 5. Les états constatés, ajoutés aux états commandés ────────────────
  for (const e of g.noeuds.values()) {
    etats.set(e.id, etatEffectif(e, { vivant: vivants.has(e.id), mesure: mesures.get(e.id) }));
  }

  const total = totaliser(g, mesures, reseauPresent);
  return { mesures, etats, total, alertes, reseauPresent, vivants, relies };
}

/**
 * L'ARBRE DES SAUTS VERS UNE RACINE, par les seules liaisons d'énergie.
 *
 * Un unique parcours en largeur depuis le poste de livraison. Le résultat
 * associe à chaque équipement atteint le saut SUIVANT vers la racine : la
 * route complète se lit en remontant, et n'importe quel nombre de routes
 * coûte alors le même unique parcours.
 *
 * LA TERRE N'EST PAS UN CHEMIN D'ÉNERGIE. L'avoir suivie faisait passer la
 * production d'un transformateur par le réseau de terre : le poste d'arrivée
 * affichait zéro mégawatt pendant que la centrale produisait à pleine charge.
 */
export function arbreVers(g, racine) {
  const suivant = new Map();
  const vus = new Set([racine]);
  const file = [racine];
  for (let i = 0; i < file.length; i += 1) {
    const id = file[i];
    if (id !== racine && !conduit(g.noeuds.get(id)?.status)) continue;
    for (const v of voisins(g, id, LIENS_ENERGIE)) {
      if (vus.has(v.id)) continue;
      vus.add(v.id);
      suivant.set(v.id, id);
      file.push(v.id);
    }
  }
  return suivant;
}

/**
 * L'ÉTAT AFFICHÉ = le plus grave entre ce qu'on a commandé et ce qu'on constate.
 *
 * Aucune commande n'est perdue par un recalcul : `status` reste la vérité de
 * l'exploitant, et l'observation s'y ajoute.
 */
export function etatEffectif(e, { vivant, mesure } = {}) {
  const constate = [];
  if (!vivant) constate.push('ISOLATED');
  if (e.type === 'Inverter') {
    if (mesure?.p > 0) constate.push('RUNNING');
    else if (conduit(e.status)) constate.push('STANDBY');
  }
  if (e.type === 'Transformer' && mesure?.charge > CHARGE_ALERTE) constate.push('WARNING');
  if (e.type === 'String' && conduit(e.status) && !(mesure?.p > 0)) constate.push('STANDBY');
  return pire(e.status, ...constate);
}

/** Les totaux de la centrale — ce que la supervision affiche en tête. */
export function totaliser(g, mesures, reseauPresent) {
  let pAc = 0;
  let pDc = 0;
  let crete = 0;
  for (const e of g.noeuds.values()) {
    const m = mesures.get(e.id);
    if (!m) continue;
    if (e.type === 'Inverter') { pAc += m.pAc ?? 0; pDc += m.pDc ?? 0; }
    if (e.type === 'String') crete += m.crete ?? 0;
  }
  const enDefaut = [...g.noeuds.values()]
    .filter((e) => ['FAULT', 'TRIPPED', 'GRID_LOST'].includes(e.status)).length;
  return {
    puissanceAc: pAc, puissanceDc: pDc, crete,
    // Le rapport de performance : ce qui sort, sur ce que le champ aurait pu
    // donner à cet instant. C'est le seul chiffre qui dit si la centrale va bien.
    performance: crete > 0 ? pAc / crete : 0,
    rendementConversion: pDc > 0 ? pAc / pDc : 0,
    reseau: reseauPresent, equipementsEnDefaut: enDefaut,
    frequence: reseauPresent ? 50 : 0,
  };
}

/**
 * LE FLUX SUR CHAQUE LIAISON, pour la vue schéma.
 *
 * Une liaison porte le flux du plus « producteur » de ses deux bouts : c'est
 * une approximation assumée, et elle suffit à montrer où le courant s'arrête.
 */
export function flux(g, mesures) {
  const out = new Map();
  const rang = { String: 0, Combiner: 1, DCProtection: 2, Inverter: 3,
    ACProtection: 4, Transformer: 5, MVCell: 6, Grid: 7 };
  for (const l of g.liaisons) {
    const a = g.noeuds.get(l.de);
    const b = g.noeuds.get(l.vers);
    const amont = (rang[a?.type] ?? 9) <= (rang[b?.type] ?? 9) ? a : b;
    const passe = conduit(a?.status) && conduit(b?.status);
    out.set(`${l.de}|${l.vers}|${l.type}`, {
      p: passe ? (mesures.get(amont?.id)?.p ?? 0) : 0, actif: passe,
    });
  }
  return out;
}

/** Les états, tels qu'ils s'affichent — la vue ne choisit jamais sa couleur. */
export const apparenceDe = (etat) => ETATS[etat] ?? ETATS.NORMAL;

/**
 * ─────────────────────────────────────────────────────────────────────────
 * LE MODE INGÉNIERIE : sections, chutes de tension, pertes, protections,
 * mise à la terre.
 *
 * Ce que l'exploitant ne regarde jamais, et que le concepteur ne regarde que
 * là. Les longueurs de câble viennent des POSITIONS du graphe, pas d'une
 * constante : déplacer un poste dans le plan change la chute de tension, et
 * c'est bien ce qu'on veut voir.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** La distance entre deux équipements, en mètres, d'après le plan. */
export function distance(a, b) {
  const dx = (a?.position?.x ?? 0) - (b?.position?.x ?? 0);
  const dy = (a?.position?.y ?? 0) - (b?.position?.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * La chute de tension sur une liaison.
 *
 * En continu, le courant fait l'aller ET le retour : le facteur 2 n'est pas
 * une marge de prudence, c'est la longueur réelle du conducteur. L'oublier
 * divise la chute annoncée par deux.
 */
export function chuteDeTension({ longueur, courant, section, tension,
  resistivite = 0.0225, triphase = false }) {
  if (!(longueur > 0) || !(section > 0) || !(tension > 0)) return null;
  const facteur = triphase ? Math.sqrt(3) : 2;
  const volts = facteur * resistivite * (longueur / section) * courant;
  return { volts, pourcent: volts / tension, longueur, section, courant };
}

/** Les pertes Joule d'une liaison, en watts. */
export function pertesJoule({ longueur, courant, section, resistivite = 0.0225,
  triphase = false }) {
  if (!(longueur > 0) || !(section > 0)) return 0;
  const resistance = (triphase ? 1 : 2) * resistivite * (longueur / section);
  return (triphase ? 3 : 1) * resistance * courant * courant;
}

/** Chute de tension admissible avant signalement. */
export const CHUTE_MAX = { dc: 0.02, ac: 0.02, mv: 0.03 };

/**
 * L'ANALYSE D'INGÉNIERIE COMPLÈTE.
 *
 * Chaque ligne nomme la valeur ET la limite qui l'a produite : « hors
 * limites » sans le nombre n'aide personne à corriger.
 */
export function ingenierie(g, plan, mesures) {
  const lignes = [];
  const sansTerre = [];
  const protections = [];

  const arrivee = [...g.noeuds.values()].find((e) => e.properties?.fonction === 'arrivee');

  for (const e of g.noeuds.values()) {
    // ── Liaisons continues : chaînes vers onduleur ──────────────────────
    if (e.type === 'String') {
      const m = mesures.get(e.id);
      const cable = plan?.cables?.dc;
      const l = chuteDeTension({
        longueur: 120, courant: (e.properties?.imp ?? 0), section: cable?.section ?? 6,
        tension: e.properties?.vmp ?? 1, resistivite: cable?.resistivite,
      });
      if (l) {
        lignes.push({ id: e.id, nom: e.name, usage: 'dc', section: l.section,
          longueur: l.longueur, courant: Math.round(l.courant * 10) / 10,
          chute: l.pourcent, limite: CHUTE_MAX.dc,
          pertes: pertesJoule({ longueur: 120, courant: e.properties?.imp ?? 0,
            section: cable?.section ?? 6, resistivite: cable?.resistivite })
            * (e.properties?.effectif ?? 1),
          verdict: l.pourcent > CHUTE_MAX.dc ? 'hors' : 'conforme',
          mesure: m });
      }
    }

    // ── Liaisons moyenne tension : bloc vers arrivée ────────────────────
    if (e.type === 'Transformer' && arrivee) {
      const m = mesures.get(e.id);
      const cable = plan?.cables?.mv;
      const longueur = Math.max(30, Math.round(distance(e, arrivee)));
      const courant = m?.i ?? 0;
      const l = chuteDeTension({ longueur, courant, section: cable?.section ?? 95,
        tension: e.properties?.secondaire ?? plan?.tensionMt ?? 30000,
        resistivite: cable?.resistivite, triphase: true });
      if (l) {
        lignes.push({ id: e.id, nom: e.name, usage: 'mv', section: l.section,
          longueur, courant: Math.round(courant * 10) / 10,
          chute: l.pourcent, limite: CHUTE_MAX.mv,
          pertes: pertesJoule({ longueur, courant, section: cable?.section ?? 95,
            resistivite: cable?.resistivite, triphase: true }),
          verdict: l.pourcent > CHUTE_MAX.mv ? 'hors' : 'conforme', mesure: m });
      }
    }

    // ── Protections : le calibre couvre-t-il le courant réel ? ──────────
    if (['ACProtection', 'DCProtection', 'MVCell'].includes(e.type)) {
      const m = mesures.get(e.id);
      const calibre = e.properties?.calibre ?? e.properties?.inMax ?? null;
      const courant = m?.i ?? 0;
      protections.push({
        id: e.id, nom: e.name, calibre, courant: Math.round(courant * 10) / 10,
        taux: calibre > 0 ? courant / calibre : null,
        verdict: calibre === null ? 'inconnu'
          : courant > calibre ? 'hors' : courant > calibre * 0.8 ? 'verifier' : 'conforme',
        limite: calibre,
      });
    }

    // ── Mise à la terre : elle existe, ou elle n'existe pas ─────────────
    if (['Inverter', 'Transformer', 'MVCell', 'Structure', 'Tracker', 'String']
      .includes(e.type) && !relieALaTerreLocal(g, e.id)) {
      sansTerre.push({ id: e.id, nom: e.name, type: e.type });
    }
  }

  const pertesTotales = lignes.reduce((s, l) => s + (l.pertes ?? 0), 0);
  let produit = 0;
  for (const e of g.noeuds.values()) {
    if (e.type === 'Inverter') produit += mesures.get(e.id)?.pDc ?? 0;
  }
  return {
    lignes, protections, sansTerre,
    pertesTotales,
    // Les pertes rapportées à ce qui sort : un pourcentage se compare, un
    // nombre de watts ne se compare à rien.
    pertesRelatives: produit > 0 ? pertesTotales / produit : null,
    verdict: lignes.some((l) => l.verdict === 'hors')
      || protections.some((p) => p.verdict === 'hors') || sansTerre.length
      ? 'hors' : 'conforme',
  };
}

/** Import tardif évité : la mise à la terre se demande au même graphe. */
function relieALaTerreLocal(g, id) {
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
