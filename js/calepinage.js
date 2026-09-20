/**
 * Le calepinage : où les modules se posent réellement sur le toit.
 *
 * Sunrise promet une « analyse satellite de votre toiture ». Cela demande une
 * imagerie payante, et cela ne dit toujours pas où les panneaux tiennent — une
 * photo aérienne ne connaît ni les marges de rive, ni l'entraxe des rangées.
 *
 * On fait l'inverse, et c'est plus exact : on demande les dimensions du pan de
 * toiture, et on place les modules dessus, aux cotes réelles. Le client voit
 * son propre toit avec ses panneaux, et le nombre annoncé est celui qui tient.
 */

import { MODULE_DEFAUT } from './materiel.js';

/** Un module courant en Tunisie : 550 Wc, 2,28 m sur 1,13 m. */
export const MODULE = { largeur: 1.134, hauteur: 2.278, puissance: 0.55 };

/** Les deux poses possibles, plus le choix de laisser le calcul décider. */
export const POSES = [
  { id: 'auto', nom: 'Automatique', resume: 'La disposition la plus dense' },
  { id: 'portrait', nom: 'Portrait', resume: 'Modules debout' },
  { id: 'paysage', nom: 'Paysage', resume: 'Modules couchés' },
];

/** Les cotes d'un module du catalogue, dans la forme attendue ici. */
const cotes = (mod) => (mod
  ? { largeur: mod.largeur, hauteur: mod.hauteur, puissance: mod.puissance / 1000 }
  : MODULE);

/** Marge de rive laissée libre sur tout le pourtour, en mètres. */
export const RIVE = 0.35;

/** Jeu entre modules, en mètres. */
export const JEU = 0.02;

/**
 * Combien de modules tiennent sur un pan rectangulaire, et où.
 *
 * Les deux orientations sont essayées : la plus dense gagne. Un module
 * couché tient parfois là où un module debout ne tient pas.
 *
 * @param {number} largeur du pan, en mètres
 * @param {number} profondeur du pan, en mètres
 * @param {object} [options]
 * @param {object} [options.module] une fiche de `materiel.js` ; à défaut, le module courant
 * @param {string} [options.pose] 'auto', 'portrait' ou 'paysage' — imposer une
 *   pose peut coûter des modules, et c'est au professionnel de le décider
 * @param {number} [options.rive] marge de rive, en mètres
 * @param {number} [options.jeu] jeu entre modules, en mètres
 * @returns {{modules:Array, nombre:number, puissance:number, orientation:string,
 *   taux:number}|null} `null` si le pan ne peut rien porter
 */
export function calepiner(largeur, profondeur, options = {}) {
  const { module: mod = null, pose = 'auto', rive = RIVE, jeu = JEU } = options;
  const M = cotes(mod);
  const L = Number(largeur), P = Number(profondeur);
  if (!(L > 0) || !(P > 0)) return null;
  if (!(rive >= 0) || !(jeu >= 0)) return null;

  const utileL = L - 2 * rive;
  const utileP = P - 2 * rive;
  if (utileL <= 0 || utileP <= 0) return null;

  const essai = (l, h, nom) => {
    const colonnes = Math.floor((utileL + jeu) / (l + jeu));
    const rangees = Math.floor((utileP + jeu) / (h + jeu));
    return { colonnes, rangees, l, h, nom, nombre: Math.max(0, colonnes * rangees) };
  };

  const portrait = essai(M.largeur, M.hauteur, 'portrait');
  const paysage = essai(M.hauteur, M.largeur, 'paysage');
  // Une pose imposée est respectée telle quelle, même si elle perd des
  // modules : c'est parfois la contrainte du toit, et le professionnel sait
  // pourquoi il l'impose. Le comparatif dit ce que ce choix coûte.
  const retenu = pose === 'portrait' ? portrait
    : pose === 'paysage' ? paysage
      : (paysage.nombre > portrait.nombre ? paysage : portrait);
  if (retenu.nombre === 0) return null;

  // On centre le champ sur le pan : un champ collé dans un coin se voit,
  // et se pose mal.
  const champL = retenu.colonnes * retenu.l + (retenu.colonnes - 1) * jeu;
  const champP = retenu.rangees * retenu.h + (retenu.rangees - 1) * jeu;
  const x0 = (L - champL) / 2;
  const y0 = (P - champP) / 2;

  const modules = [];
  for (let r = 0; r < retenu.rangees; r++) {
    for (let c = 0; c < retenu.colonnes; c++) {
      modules.push({
        x: x0 + c * (retenu.l + jeu),
        y: y0 + r * (retenu.h + jeu),
        l: retenu.l, h: retenu.h,
      });
    }
  }

  return {
    modules,
    nombre: retenu.nombre,
    colonnes: retenu.colonnes,
    rangees: retenu.rangees,
    orientation: retenu.nom,
    puissance: Math.round(retenu.nombre * M.puissance * 100) / 100,
    taux: (retenu.nombre * M.largeur * M.hauteur) / (L * P),
    /** Le module retenu, pour pouvoir l'écrire sous le plan. */
    module: mod ?? null,
    rive,
    jeu,
    /** Ce que l'autre pose aurait donné : imposer une pose a un coût, dis-le. */
    alternative: pose === 'auto' ? null
      : (pose === 'portrait' ? paysage.nombre : portrait.nombre),
  };
}

/**
 * La meilleure configuration possible sur ce pan — le bouton « optimiser ».
 *
 * Elle essaie chaque module du catalogue dans les deux poses et retient la
 * puissance la plus élevée, pas le nombre de modules le plus élevé : trente
 * petits modules peuvent valoir moins que vingt grands.
 *
 * @returns {{plan:object, module:object, pose:string}|null}
 */
export function optimiser(largeur, profondeur, { modules = [], rive = RIVE, jeu = JEU } = {}) {
  const catalogue = modules.length ? modules : [MODULE_DEFAUT];
  let meilleur = null;
  for (const mod of catalogue) {
    for (const pose of ['portrait', 'paysage']) {
      const plan = calepiner(largeur, profondeur, { module: mod, pose, rive, jeu });
      if (!plan) continue;
      if (!meilleur || plan.puissance > meilleur.plan.puissance) {
        meilleur = { plan, module: mod, pose };
      }
    }
  }
  return meilleur;
}

/**
 * Le plan du pan et de ses modules, en SVG.
 * Les cotes sont écrites : un plan sans cote n'est pas un plan.
 */
export function planCalepinage(largeur, profondeur, { largeurPx = 560, ...options } = {}) {
  const plan = calepiner(largeur, profondeur, options);
  if (!plan) return null;
  const rive = plan.rive;

  const marge = 34;
  const echelle = (largeurPx - 2 * marge) / largeur;
  const hauteurPx = profondeur * echelle + 2 * marge;
  const px = (m) => m * echelle;

  const modules = plan.modules.map((m) => `<rect
    x="${(marge + px(m.x)).toFixed(1)}" y="${(marge + px(m.y)).toFixed(1)}"
    width="${px(m.l).toFixed(1)}" height="${px(m.h).toFixed(1)}"
    rx="1.5" fill="#164e5a" stroke="#2b7d8c" stroke-width="1"/>`).join('');

  return {
    plan,
    svg: `<svg viewBox="0 0 ${largeurPx} ${hauteurPx.toFixed(0)}" role="img"
      aria-label="Plan du pan de toiture : ${plan.nombre} modules en ${plan.rangees} rangées de ${plan.colonnes}"
      preserveAspectRatio="xMidYMid meet">
      <rect x="${marge}" y="${marge}" width="${px(largeur).toFixed(1)}"
        height="${px(profondeur).toFixed(1)}" rx="3"
        fill="var(--douce)" stroke="var(--repere)" stroke-width="1.5"/>
      <rect x="${(marge + px(rive)).toFixed(1)}" y="${(marge + px(rive)).toFixed(1)}"
        width="${px(largeur - 2 * rive).toFixed(1)}" height="${px(profondeur - 2 * rive).toFixed(1)}"
        fill="none" stroke="var(--repere)" stroke-width="1" stroke-dasharray="4 3"/>
      ${modules}
      <text x="${(marge + px(largeur) / 2).toFixed(1)}" y="${(marge - 12).toFixed(1)}"
        text-anchor="middle" class="g-etiq">${String(largeur).replace('.', ',')} m</text>
      <text x="${(marge - 12).toFixed(1)}" y="${(marge + px(profondeur) / 2).toFixed(1)}"
        text-anchor="middle" class="g-etiq"
        transform="rotate(-90 ${(marge - 12).toFixed(1)} ${(marge + px(profondeur) / 2).toFixed(1)})"
        >${String(profondeur).replace('.', ',')} m</text>
    </svg>`,
  };
}
