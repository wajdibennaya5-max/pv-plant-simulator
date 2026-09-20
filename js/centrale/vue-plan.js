/**
 * LA VUE PLAN — et pourquoi elle ne dessine jamais tout.
 *
 * Une centrale de 500 MWc compte près d'un million de modules. Les dessiner
 * tuerait le navigateur avant le premier affichage, et n'apprendrait rien :
 * à ce niveau de dézoom, un million de rectangles de 0,3 pixel font un
 * aplat gris.
 *
 * TROIS MÉCANISMES, ET ILS SE COMPLÈTENT :
 *
 * 1. NIVEAUX DE DÉTAIL. Au dézoom, un bloc est un rectangle. En approchant,
 *    ses équipements apparaissent, puis ses rangées, puis ses modules. Ce
 *    qu'on ne peut pas distinguer n'est pas dessiné.
 * 2. VIRTUALISATION. Seul ce qui tombe dans la fenêtre visible est produit.
 *    Se déplacer ne coûte donc pas plus cher sur 500 MWc que sur 5.
 * 3. PLAFOND DUR. Au-delà de `MAX_RENDUS` formes, on s'arrête et on le dit.
 *    Un écran qui rame sans explication passe pour cassé ; un écran qui
 *    annonce « 2 000 objets affichés sur 9 000 » reste utilisable.
 *
 * Le fichier ne calcule rien : il reçoit l'état et le met en forme.
 */
import { couleurEtat, animation, echapper, nombre, symbole, puissance } from './symboles.js';

/** Jamais plus de formes que cela, quel que soit le zoom. */
export const MAX_RENDUS = 1200;

/** Au-delà de ce nombre d'objets, les étiquettes se chevauchent : on les tait. */
export const SEUIL_ETIQUETTES = 120;

/** En dessous de cette échelle (pixels par mètre), une étiquette est illisible. */
export const ECHELLE_ETIQUETTES = 1.5;

/**
 * LES NIVEAUX DE DÉTAIL, du plus large au plus fin.
 * `seuil` est le zoom à partir duquel le niveau s'applique.
 */
export const NIVEAUX = [
  { cle: 'blocs', seuil: 0, nom: 'Blocs' },
  { cle: 'equipements', seuil: 0.9, nom: 'Équipements' },
  { cle: 'rangees', seuil: 2.5, nom: 'Rangées' },
  { cle: 'modules', seuil: 7, nom: 'Modules' },
];

/** Le niveau de détail correspondant à un zoom. */
export function niveauDeDetail(zoom) {
  let courant = NIVEAUX[0];
  for (const n of NIVEAUX) if (zoom >= n.seuil) courant = n;
  return courant;
}

/** Les bornes du plan, d'après les positions réelles des équipements. */
export function bornes(graphe) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const e of graphe.noeuds.values()) {
    const { x = 0, y = 0 } = e.position ?? {};
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 100, y1: 100 };
  const marge = 40;
  return { x0: x0 - marge, y0: y0 - marge, x1: x1 + marge, y1: y1 + marge };
}

/** Les types affichés à chaque niveau — le reste est tu, pas caché. */
const TYPES_PAR_NIVEAU = {
  blocs: ['Block', 'Grid', 'MVCell', 'Building'],
  equipements: ['Block', 'Grid', 'MVCell', 'Transformer', 'Inverter', 'ACProtection',
    'DCProtection', 'Building', 'SCADA', 'WeatherStation', 'Grounding'],
  rangees: ['Block', 'Grid', 'MVCell', 'Transformer', 'Inverter', 'ACProtection',
    'DCProtection', 'String', 'Row', 'Structure', 'Tracker', 'Building', 'SCADA',
    'WeatherStation', 'Grounding'],
  modules: null, // tout, y compris les modules matérialisés
};

/**
 * LE PLAN, EN SVG.
 *
 * @param {object} etat l'instantané du simulateur
 * @param {object} vue `{zoom, centreX, centreY, largeur, hauteur, selection}`
 */
export function vuePlan(etat, vue = {}) {
  const { graphe, etats } = etat;
  const zoom = Math.max(0.2, Number(vue.zoom) || 1);
  const largeur = Number(vue.largeur) || 360;
  const hauteur = Number(vue.hauteur) || 420;
  const niveau = niveauDeDetail(zoom);
  const b = bornes(graphe);

  // La fenêtre visible, en coordonnées du plan. C'est elle qui permet de ne
  // produire que ce qu'on voit.
  const largeurVue = (b.x1 - b.x0) / zoom;
  const hauteurVue = largeurVue * (hauteur / largeur);
  const cx = Number.isFinite(vue.centreX) ? vue.centreX : (b.x0 + b.x1) / 2;
  const cy = Number.isFinite(vue.centreY) ? vue.centreY : (b.y0 + b.y1) / 2;
  const fenetre = {
    x0: cx - largeurVue / 2, y0: cy - hauteurVue / 2,
    x1: cx + largeurVue / 2, y1: cy + hauteurVue / 2,
  };

  const admis = TYPES_PAR_NIVEAU[niveau.cle];
  const candidats = [];
  let horsChamp = 0;
  for (const e of graphe.noeuds.values()) {
    if (e.type === 'Plant' || e.type === 'Zone') continue;
    if (admis && !admis.includes(e.type)) continue;
    const { x = 0, y = 0 } = e.position ?? {};
    // VIRTUALISATION : hors de la fenêtre, on ne produit rien du tout.
    if (x < fenetre.x0 - 30 || x > fenetre.x1 + 30
      || y < fenetre.y0 - 30 || y > fenetre.y1 + 30) { horsChamp += 1; continue; }
    candidats.push(e);
  }

  const tronque = candidats.length > MAX_RENDUS;
  const rendus = tronque ? candidats.slice(0, MAX_RENDUS) : candidats;

  const echelle = largeur / largeurVue;
  const px = (x) => (x - fenetre.x0) * echelle;
  const py = (y) => (y - fenetre.y0) * echelle;

  // LES ÉTIQUETTES NE SURVIVENT PAS À LA DENSITÉ. Au-delà de quelques
  // dizaines d'objets elles se chevauchent, ne se lisent plus, et pèsent à
  // elles seules la moitié du document — 911 ko sur un parc de 500 MWc, à
  // parcourir et à peindre sur un téléphone. On ne les écrit que là où
  // quelqu'un peut les lire.
  // DEUX CONDITIONS, ET IL FAUT LES DEUX. Le nombre d'objets ne suffit pas :
  // quatorze onduleurs espacés de vingt-six mètres se chevauchent tout autant
  // que deux mille, si l'échelle est assez petite. On exige donc aussi une
  // échelle où une étiquette a la place de s'écrire.
  const etiquettes = rendus.length <= SEUIL_ETIQUETTES && echelle >= ECHELLE_ETIQUETTES;
  const formes = rendus.map((e) => forme(e, etats.get(e.id) ?? e.status, px, py,
    echelle, niveau.cle, vue.selection === e.id, etiquettes)).join('');

  return `<svg class="cen-plan" viewBox="0 0 ${largeur} ${hauteur}"
    role="img" aria-label="Plan de la centrale, niveau ${echapper(niveau.nom.toLowerCase())}"
    preserveAspectRatio="xMidYMid meet">
    <rect width="${largeur}" height="${hauteur}" fill="var(--cen-fond)"/>
    ${grille(largeur, hauteur, echelle)}
    ${formes}
  </svg>
  <p class="cen-lod">Niveau : <b>${echapper(niveau.nom)}</b> —
    ${nombre(rendus.length)} objet(s) affiché(s)${
  horsChamp ? `, ${nombre(horsChamp)} hors champ` : ''}${
  tronque ? `, <b>affichage plafonné</b> à ${nombre(MAX_RENDUS)}` : ''}.</p>`;
}

/** Une grille de fond, assez discrète pour ne pas concurrencer les objets. */
function grille(largeur, hauteur, echelle) {
  const pas = Math.max(20, 50 * echelle);
  const lignes = [];
  for (let x = 0; x < largeur; x += pas) {
    lignes.push(`<path d="M${x.toFixed(1)} 0V${hauteur}" stroke="var(--cen-grille)" stroke-width=".5"/>`);
  }
  for (let y = 0; y < hauteur; y += pas) {
    lignes.push(`<path d="M0 ${y.toFixed(1)}H${largeur}" stroke="var(--cen-grille)" stroke-width=".5"/>`);
  }
  return lignes.join('');
}

/** La taille d'un objet à l'écran, selon son type. */
const TAILLES = { Block: 46, Grid: 16, MVCell: 12, Transformer: 14, Inverter: 12,
  ACProtection: 10, DCProtection: 10, String: 14, Row: 20, Structure: 16,
  Tracker: 16, Building: 14, SCADA: 12, WeatherStation: 12, Grounding: 12,
  Module: 6, Combiner: 10 };

/**
 * UNE FORME, ET SA CIBLE TACTILE.
 *
 * Le symbole peut être petit ; la zone d'appui ne l'est jamais. Un carré
 * transparent de 44 px couvre chaque objet — c'est la taille en dessous de
 * laquelle un doigt rate sa cible, et un simulateur qu'on rate n'est pas un
 * simulateur.
 */
function forme(e, etat, px, py, echelle, niveau, selectionne, etiquettes = true) {
  const x = +(px(e.position?.x ?? 0)).toFixed(1);
  const y = +(py(e.position?.y ?? 0)).toFixed(1);
  const taille = (TAILLES[e.type] ?? 12) * Math.min(2.2, Math.max(0.5, echelle * 1.1));
  const c = couleurEtat(etat);
  const anim = animation(etat);
  const effectif = e.properties?.effectif;
  const id = echapper(e.id);

  if (e.type === 'Block') {
    // Le bloc connaît son emprise : on la dessine plutôt qu'une taille fixe,
    // sans quoi le rectangle ne contient pas les équipements qu'il abrite.
    const l = (e.properties?.largeurPlan ? e.properties.largeurPlan * echelle / 2 : taille);
    const h = (e.properties?.hauteurPlan ? e.properties.hauteurPlan * echelle / 2 : taille * 0.7);
    const cl = Math.max(l, 22); const ch = Math.max(h, 22);
    return `<g class="cen-objet${anim}" data-equip="${id}" transform="translate(${x} ${y})">`
      + `<rect x="${-l}" y="${-h}" width="${l * 2}" height="${h * 2}" rx="4" fill="${c}"`
      + ` fill-opacity=".14" stroke="${c}" stroke-width="${selectionne ? 2.5 : 1.2}"/>`
      + (etiquettes && taille > 22
        ? `<text y="4" class="cen-etiq" text-anchor="middle">${
          echapper(e.name.replace('Bloc de puissance ', 'B'))}</text>` : '')
      + `<rect x="${-cl}" y="${-ch}" width="${cl * 2}" height="${ch * 2}" fill="transparent"`
      + ` class="cen-cible"/></g>`;
  }

  // LE MARQUAGE EST ÉCRIT SERRÉ, ET C'EST VOULU. À douze cents objets, chaque
  // retour à la ligne et chaque espace d'indentation est multiplié par douze
  // cents : la version lisible pesait 873 ko, que le téléphone doit recevoir,
  // analyser puis peindre. La lisibilité est ici dans le commentaire.
  const etiq = !etiquettes || niveau === 'blocs' || taille < 14 ? ''
    : `<text x="${x}" y="${(y + taille + 9).toFixed(1)}" class="cen-etiq"`
      + ` text-anchor="middle">${echapper(court(e.name))}${
        effectif > 1 ? ` ×${nombre(effectif)}` : ''}</text>`;

  return `<g class="cen-objet${anim}" data-equip="${id}" transform="translate(${x} ${y}) scale(${
    (taille / 12).toFixed(2)})" stroke="${c}" stroke-width="${
    selectionne ? 2.4 : 1.5}" fill="none">`
    + (selectionne ? '<circle r="15" fill="none" stroke-dasharray="3 2"/>' : '')
    + symbole(e.type) + '</g>' + etiq
    + `<rect x="${x - 22}" y="${y - 22}" width="44" height="44" fill="transparent"`
    + ` class="cen-cible" data-equip="${id}"/>`;
}

/** Un nom court, pour tenir sous un symbole. */
function court(nom) {
  return String(nom ?? '').replace(/^(Onduleur|Transformateur|Cellule de |Chaînes |Rangées du bloc |Sectionneur DC |Disjoncteur général BT — )/, '')
    .split('(')[0].trim().slice(0, 14);
}

/** La légende des états présents sur le plan — et d'eux seuls. */
export function legendePlan(etat) {
  const presents = new Map();
  for (const [id, code] of etat.etats) {
    if (!presents.has(code)) presents.set(code, 0);
    presents.set(code, presents.get(code) + 1);
    void id;
  }
  return `<ul class="cen-legende">${[...presents].map(([code, n]) => `<li>
    <i style="--c:${couleurEtat(code)}"></i>${echapper(code)} <b>${nombre(n)}</b></li>`).join('')}</ul>`;
}

/** Le résumé d'un bloc, affiché au survol ou sous le plan. */
export function resumeBloc(e, mesure) {
  if (!e) return '';
  return `<p class="cen-resume"><b>${echapper(e.name)}</b> —
    ${nombre(e.properties?.onduleurs ?? 0)} onduleur(s),
    ${nombre(e.properties?.chaines ?? 0)} chaîne(s),
    ${puissance(mesure?.p ?? 0)}</p>`;
}
