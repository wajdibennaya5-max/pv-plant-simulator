/**
 * L'ÉCRAN DU SIMULATEUR — assemblage des vues et interactions.
 *
 * CE FICHIER NE CHERCHE RIEN DANS LA PAGE. Il reçoit un nœud racine, construit
 * son propre sous-arbre et garde la référence de ce qu'il a créé. C'est la
 * règle du dépôt — seul le contrôleur interroge le document — et elle tient
 * ici sans effort : on ne va pas chercher ce qu'on a soi-même posé.
 *
 * IL NE CONNAÎT NI LE MOTEUR NI LE STOCKAGE. Le simulateur lui est remis
 * construit, la persistance lui est remise sous forme de deux fonctions.
 * L'écran ne peut donc ni calculer une tension, ni écrire dans le navigateur
 * — il ne peut que montrer et transmettre. C'est exactement ce qu'on veut
 * d'une couche de présentation.
 *
 * UNE SEULE ÉCOUTE POUR TOUS LES ÉQUIPEMENTS. À douze cents objets dans le
 * plan, poser douze cents écouteurs coûterait plus cher que de dessiner.
 * Un seul écouteur sur la racine, et `closest()` retrouve la cible : le coût
 * ne dépend plus du nombre d'objets.
 */
import { vuePlan, legendePlan, niveauDeDetail } from './vue-plan.js';
import { vueSchema, legendeLiens } from './vue-schema.js';
import { tableauScada, bandeauMeteo, panneauVerification, panneauAlarmes,
  panneauEvenements, panneauEquipement, panneauIngenierie, panneauChantier,
  ficheCentrale } from './vue-scada.js';
import { echapper, nombre, heure } from './symboles.js';

/** Les trois onglets, et ce qu'ils répondent. */
const ONGLETS = [
  { cle: 'plan', nom: 'Plan' },
  { cle: 'schema', nom: 'Schéma' },
  { cle: 'scada', nom: 'Supervision' },
];

/** Les trois lectures d'une même centrale. */
const LECTURES = [
  { cle: 'exploitation', nom: 'Exploitation' },
  { cle: 'engineering', nom: 'Ingénierie' },
  { cle: 'chantier', nom: 'Chantier' },
];

/** Les réglages de génération proposés à l'écran. */
const REGLAGES = [
  { cle: 'puissanceDc', nom: 'Puissance crête visée (kWc)', type: 'number',
    min: 100, max: 500000, pas: 100, defaut: 5000 },
  { cle: 'tempMin', nom: 'Température minimale du site (°C)', type: 'number',
    min: -20, max: 25, pas: 1, defaut: 0 },
  { cle: 'tempMax', nom: 'Température de cellule maximale (°C)', type: 'number',
    min: 40, max: 90, pas: 1, defaut: 70 },
];

/**
 * MONTE L'ÉCRAN dans le nœud fourni.
 *
 * @param {HTMLElement} racine le conteneur, fourni par le contrôleur
 * @param {object} sim le simulateur, déjà construit
 * @param {object} persistance `{enregistrer, effacer}` — deux fonctions, pas un module
 * @returns {{rafraichir:Function, detruire:Function}}
 */
export function monterEcran(racine, sim, persistance = {}) {
  if (!racine || !sim) return { rafraichir() {}, detruire() {} };

  const vue = { zoom: 1, centreX: null, centreY: null, largeur: 360, hauteur: 400 };
  let onglet = 'plan';
  let lecture = 'exploitation';
  let blocCourant = null;
  let selection = null;
  let detail = [];

  racine.innerHTML = gabarit();

  /**
   * ON GARDE LES NŒUDS QU'ON VIENT DE CRÉER.
   *
   * Les retrouver plus tard reviendrait à interroger le document, et cela
   * revient au contrôleur. On descend donc une fois dans le sous-arbre qu'on
   * a soi-même écrit, et on retient ce qui porte un `data-zone`.
   */
  const zones = {};
  (function indexer(n) {
    if (n.dataset?.zone) zones[n.dataset.zone] = n;
    for (const enfant of n.children ?? []) indexer(enfant);
  }(racine));

  /** Redessine tout ce qui dépend de l'état. */
  function rafraichir() {
    const etat = sim.etat();
    const scada = sim.scada();

    if (zones.entete) {
      zones.entete.innerHTML = `<p class="cen-titre-plan">${
        echapper(etat.plan?.valide ? `${nombre(etat.plan.puissanceDc)} kWc — ${
          nombre(etat.plan.onduleurs)} onduleur(s), ${nombre(etat.plan.transformateurs)
        } transformateur(s)` : 'Dimensionnement impossible')}</p>`
        + bandeauMeteo(etat.ambiance);
    }

    if (zones.onglets) {
      zones.onglets.innerHTML = ONGLETS.map((o) => `<button type="button"
        class="cen-onglet${o.cle === onglet ? ' cen-actif' : ''}" data-onglet="${o.cle}"
        aria-pressed="${o.cle === onglet}">${echapper(o.nom)}</button>`).join('');
    }
    if (zones.lectures) {
      zones.lectures.innerHTML = LECTURES.map((l) => `<button type="button"
        class="cen-lecture${l.cle === lecture ? ' cen-actif' : ''}" data-mode="${l.cle}"
        aria-pressed="${l.cle === lecture}">${echapper(l.nom)}</button>`).join('');
    }

    if (zones.vue) {
      if (onglet === 'plan') {
        zones.vue.innerHTML = vuePlan(etat, { ...vue, selection })
          + commandesPlan() + legendePlan(etat);
      } else if (onglet === 'schema') {
        zones.vue.innerHTML = vueSchema(etat, { blocId: blocCourant, selection })
          + legendeLiens();
      } else {
        zones.vue.innerHTML = tableauScada(scada)
          + (lecture === 'engineering' ? panneauIngenierie(sim.ingenierie())
            : lecture === 'chantier' ? panneauChantier(sim.chantier())
              : `<h4 class="cen-h4">Alarmes</h4>${panneauAlarmes(etat.alarmes)}
                 <h4 class="cen-h4">Historique des manœuvres</h4>
                 ${panneauEvenements(etat.evenements)}`);
      }
    }

    if (zones.panneau) {
      zones.panneau.innerHTML = selection
        ? panneauEquipement(sim.fiche(selection),
          { consequences: sim.consequences(selection, 'OPEN') })
          + (detail.length ? listeDetail() : '')
        : panneauEquipement(null);
    }

    if (zones.verification) {
      zones.verification.innerHTML = panneauVerification(etat.avertissements)
        + (etat.plan?.valide ? ficheCentrale(etat.plan) : '');
    }

    if (zones.horloge) {
      zones.horloge.innerHTML = `<label class="cen-champ"><span>Heure — ${
        heure(etat.ambiance.heure)}</span>
        <input type="range" min="0" max="23" step="1" value="${Math.floor(etat.ambiance.heure)}"
          data-heure aria-label="Heure de la journée"></label>
        <button type="button" class="cen-btn" data-avancer="60">Avancer d’une heure</button>`;
    }

    enregistrer();
  }

  function commandesPlan() {
    return `<div class="cen-zoom">
      <button type="button" class="cen-btn" data-zoom="-" aria-label="Dézoomer">−</button>
      <span>${niveauDeDetail(vue.zoom).nom} — ×${nombre(vue.zoom, 1)}</span>
      <button type="button" class="cen-btn" data-zoom="+" aria-label="Zoomer">+</button>
      <button type="button" class="cen-btn" data-zoom="0">Tout voir</button>
    </div>`;
  }

  function listeDetail() {
    return `<section class="cen-bloc"><h4>Détail (${nombre(detail.length)})</h4>
      <div class="cen-cmds">${detail.slice(0, 60).map((d) => `<button type="button"
        class="cen-btn cen-petit" data-equip-detail="${echapper(d.id)}"
        >${echapper(d.name)}</button>`).join('')}</div></section>`;
  }

  /** Range l'instantané — sans jamais faire échouer l'écran si le quota est plein. */
  function enregistrer() {
    try { persistance.enregistrer?.(sim.instantane()); } catch { /* le quota, rien d'autre */ }
  }

  // ── UNE SEULE ÉCOUTE, ET `closest` fait le reste ────────────────────────
  function auClic(ev) {
    const c = (sel) => ev.target.closest?.(sel);

    const onglet$ = c('[data-onglet]');
    if (onglet$) { onglet = onglet$.dataset.onglet; rafraichir(); return; }

    const mode$ = c('[data-mode]');
    if (mode$) {
      lecture = mode$.dataset.mode;
      sim.changerMode(lecture);
      if (onglet !== 'scada' && lecture !== 'exploitation') onglet = 'scada';
      rafraichir();
      return;
    }

    const zoom$ = c('[data-zoom]');
    if (zoom$) {
      const d = zoom$.dataset.zoom;
      if (d === '+') vue.zoom = Math.min(20, vue.zoom * 1.6);
      else if (d === '-') vue.zoom = Math.max(0.25, vue.zoom / 1.6);
      else { vue.zoom = 1; vue.centreX = null; vue.centreY = null; }
      rafraichir();
      return;
    }

    const cmd$ = c('[data-commande]');
    if (cmd$) {
      const r = sim.commander(cmd$.dataset.cible, cmd$.dataset.commande);
      annoncer(r.accepte
        ? `${cmd$.textContent.trim()} — acceptée.`
        : `Refusée : ${r.interverrouillage?.condition ?? r.raison}`);
      rafraichir();
      return;
    }

    const def$ = c('[data-defaut]');
    if (def$) {
      const r = sim.injecter(def$.dataset.cible, def$.dataset.defaut);
      annoncer(r.applique ? `Défaut simulé : ${r.detail}` : `Impossible : ${r.raison}`);
      rafraichir();
      return;
    }

    const lever$ = c('[data-lever]');
    if (lever$) { sim.lever(lever$.dataset.lever); rafraichir(); return; }

    const acq$ = c('[data-acquitter]');
    if (acq$) { sim.acquitter(acq$.dataset.acquitter); rafraichir(); return; }

    const det$ = c('[data-detailler]');
    if (det$) { detail = sim.detailler(det$.dataset.detailler); rafraichir(); return; }

    const avance$ = c('[data-avancer]');
    if (avance$) { sim.avancer(Number(avance$.dataset.avancer) || 60); rafraichir(); return; }

    // L'équipement en dernier : un bouton posé sur un équipement doit gagner.
    const eq$ = c('[data-equip-detail]') ?? c('[data-equip]');
    if (eq$) {
      const id = eq$.dataset.equipDetail ?? eq$.dataset.equip;
      selection = selection === id ? null : id;
      detail = [];
      sim.selectionner(selection);
      rafraichir();
    }
  }

  function auChangement(ev) {
    const bloc$ = ev.target.closest?.('[data-bloc]');
    if (bloc$) { blocCourant = bloc$.value; rafraichir(); return; }

    const h$ = ev.target.closest?.('[data-heure]');
    if (h$) {
      const cible = Number(h$.value);
      // On avance jusqu'à l'heure demandée plutôt que de la poser : l'énergie
      // du jour est une intégrale, et poser l'heure la ferait mentir.
      const actuelle = sim.ambiance().heure;
      const delta = ((cible - actuelle) + 24) % 24;
      sim.avancer(delta * 60);
      rafraichir();
      return;
    }

    const p$ = ev.target.closest?.('[data-param]');
    if (p$) {
      const valeurs = {};
      for (const r of REGLAGES) {
        const n = zones[`param-${r.cle}`];
        if (n) valeurs[r.cle] = Number(n.value);
      }
      sim.regenerer(valeurs);
      selection = null;
      detail = [];
      blocCourant = null;
      rafraichir();
    }
  }

  /** Dit à voix haute ce qui vient de se passer — y compris les refus. */
  function annoncer(texte) {
    if (zones.annonce) zones.annonce.textContent = texte;
  }

  racine.addEventListener('click', auClic);
  racine.addEventListener('change', auChangement);

  // Le glissement du plan : un doigt déplace la vue. `setPointerCapture`
  // évite de perdre le geste quand le doigt sort du cadre.
  let glisse = null;
  racine.addEventListener('pointerdown', (ev) => {
    if (onglet !== 'plan' || !ev.target.closest?.('.cen-plan')) return;
    glisse = { x: ev.clientX, y: ev.clientY, cx: vue.centreX, cy: vue.centreY, bouge: false };
  });
  racine.addEventListener('pointermove', (ev) => {
    if (!glisse) return;
    const dx = ev.clientX - glisse.x;
    const dy = ev.clientY - glisse.y;
    if (Math.abs(dx) + Math.abs(dy) < 6) return;
    glisse.bouge = true;
    const etat = sim.etat();
    const ampleur = 260 / vue.zoom;
    const base = centreParDefaut(etat, vue);
    vue.centreX = (glisse.cx ?? base.x) - (dx / 360) * ampleur;
    vue.centreY = (glisse.cy ?? base.y) - (dy / 400) * ampleur;
    if (zones.vue) {
      zones.vue.innerHTML = vuePlan(etat, { ...vue, selection })
        + commandesPlan() + legendePlan(etat);
    }
  });
  const relacher = () => { glisse = null; };
  racine.addEventListener('pointerup', relacher);
  racine.addEventListener('pointercancel', relacher);

  rafraichir();

  return {
    rafraichir,
    /** Rend les réglages, pour que le contrôleur les pose où il veut. */
    reglages: () => REGLAGES,
    detruire() {
      racine.removeEventListener('click', auClic);
      racine.removeEventListener('change', auChangement);
      racine.innerHTML = '';
    },
  };

  /** Le centre du plan quand personne ne l'a déplacé. */
  function centreParDefaut(etat, v) {
    if (Number.isFinite(v.centreX) && Number.isFinite(v.centreY)) {
      return { x: v.centreX, y: v.centreY };
    }
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const e of etat.graphe.noeuds.values()) {
      const { x = 0, y = 0 } = e.position ?? {};
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }

  /** La structure de l'écran — créée une fois, jamais recherchée ensuite. */
  function gabarit() {
    return `<div class="cen">
      <div class="cen-entete" data-zone="entete"></div>
      <form class="cen-reglages" data-param>
        ${REGLAGES.map((r) => `<label class="cen-champ">
          <span>${echapper(r.nom)}</span>
          <input type="${r.type}" min="${r.min}" max="${r.max}" step="${r.pas}"
            value="${r.defaut}" data-zone="param-${r.cle}" data-param>
        </label>`).join('')}
      </form>
      <div class="cen-horloge" data-zone="horloge"></div>
      <div class="cen-onglets" role="tablist" data-zone="onglets"></div>
      <div class="cen-lectures" data-zone="lectures"></div>
      <p class="cen-annonce" role="status" aria-live="polite" data-zone="annonce"></p>
      <div class="cen-vue" data-zone="vue"></div>
      <div class="cen-detail" data-zone="panneau"></div>
      <details class="cen-verif-boite"><summary>Vérification du dimensionnement</summary>
        <div data-zone="verification"></div></details>
    </div>`;
  }
}
