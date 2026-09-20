/**
 * LE SCHÉMA UNIFILAIRE — la centrale telle qu'un électricien la lit.
 *
 * Le plan dit OÙ sont les choses ; le schéma dit COMMENT elles sont reliées.
 * Ce sont deux questions différentes, et la seconde est celle qu'on se pose
 * avant une manœuvre : qu'est-ce qui se trouve entre ce sectionneur et la
 * terre, et qu'est-ce qui tombe si je l'ouvre.
 *
 * LE SCHÉMA NE MONTRE QU'UN BLOC À LA FOIS. Un unifilaire de cent quatre-
 * vingt-quatorze postes n'est pas un schéma, c'est un mur. On dessine la
 * colonne commune — réseau, comptage, arrivée — puis le bloc sélectionné, et
 * on change de bloc par un sélecteur. C'est ainsi que sont faits les
 * synoptiques d'exploitation, et pour la même raison.
 *
 * LE TRAIT MORT EST AUSSI IMPORTANT QUE LE TRAIT VIF. Une liaison que le
 * courant ne traverse plus est dessinée en pointillé éteint : c'est elle
 * qu'on cherche des yeux quand quelque chose ne produit pas.
 */
import { couleurEtat, couleurLien, animation, echapper, nombre, symbole,
  puissance, nomEtat } from './symboles.js';

/** Espacement vertical entre deux étages du schéma, en unités SVG. */
const ETAGE = 62;

/** Largeur de dessin de référence — le SVG s'adapte ensuite au conteneur. */
const LARGEUR = 340;

/**
 * Les blocs de la centrale, pour le sélecteur.
 * On les nomme par leur repère, pas par leur rang : c'est le repère qui est
 * écrit sur la porte du poste.
 */
export function blocsDisponibles(graphe) {
  return [...graphe.noeuds.values()]
    .filter((e) => e.type === 'Block')
    .map((e) => ({ id: e.id, nom: e.name }));
}

/**
 * LE SCHÉMA D'UN BLOC.
 *
 * @param {object} etat l'instantané du simulateur
 * @param {string} blocId le bloc à détailler — le premier par défaut
 */
export function vueSchema(etat, { blocId = null, selection = null } = {}) {
  const { graphe, etats, mesures } = etat;
  const blocs = blocsDisponibles(graphe);
  if (!blocs.length) return '<div class="cen-vide"><p>Aucun bloc à représenter.</p></div>';
  const bloc = graphe.noeuds.get(blocId) ?? graphe.noeuds.get(blocs[0].id);

  const commun = ['grid', 'mv-comptage', 'mv-arrivee']
    .map((id) => graphe.noeuds.get(id)).filter(Boolean);

  const enfants = (type) => bloc.childrenIds
    .map((id) => graphe.noeuds.get(id)).filter((e) => e?.type === type);

  // L'ordre des étages est celui du courant, du réseau vers les modules :
  // c'est le sens dans lequel on descend quand on cherche une coupure.
  const etages = [
    commun,
    enfants('MVCell'),
    enfants('Transformer'),
    enfants('ACProtection'),
    enfants('Inverter'),
    enfants('DCProtection'),
    enfants('String'),
  ].filter((e) => e.length);

  const hauteur = etages.length * ETAGE + 40;
  const positions = new Map();
  etages.forEach((rang, i) => {
    const y = 34 + i * ETAGE;
    const pas = LARGEUR / (rang.length + 1);
    rang.forEach((e, j) => positions.set(e.id, { x: pas * (j + 1), y }));
  });

  // Les liaisons dessinées sont celles dont les DEUX bouts sont à l'écran :
  // un trait qui sort du cadre ne renseigne personne.
  const traits = graphe.liaisons
    .filter((l) => positions.has(l.de) && positions.has(l.vers) && l.type !== 'pe')
    .map((l) => trait(l, positions, graphe, etats))
    .join('');

  const noeuds = [...positions].map(([id, p]) => {
    const e = graphe.noeuds.get(id);
    const code = etats.get(id) ?? e.status;
    return noeud(e, code, p, mesures.get(id), selection === id);
  }).join('');

  return `<div class="cen-schema-tete">
    <label class="cen-champ"><span>Bloc représenté</span>
      <select data-bloc>${blocs.map((b) => `<option value="${echapper(b.id)}"
        ${b.id === bloc.id ? 'selected' : ''}>${echapper(b.nom)}</option>`).join('')}</select>
    </label>
  </div>
  <svg class="cen-schema" viewBox="0 0 ${LARGEUR} ${hauteur}"
    role="img" aria-label="Schéma unifilaire du ${echapper(bloc.name)}"
    preserveAspectRatio="xMidYMin meet">
    ${traits}${noeuds}
  </svg>
  <p class="cen-lod">Colonne commune puis ${echapper(bloc.name.toLowerCase())} —
    un trait éteint est une liaison que le courant ne traverse plus.</p>`;
}

/** Une liaison, vive ou morte. */
function trait(l, positions, graphe, etats) {
  const a = positions.get(l.de);
  const b = positions.get(l.vers);
  const ea = graphe.noeuds.get(l.de);
  const eb = graphe.noeuds.get(l.vers);
  const ca = etats.get(l.de) ?? ea.status;
  const cb = etats.get(l.vers) ?? eb.status;
  // Le trait est vif si ses deux extrémités conduisent. La question se pose
  // au modèle, jamais à la vue : c'est `conduit` qui décide, via l'apparence.
  const vif = ['NORMAL', 'RUNNING', 'CLOSED', 'STANDBY', 'WARNING', 'NO_COMM']
    .includes(ca) && ['NORMAL', 'RUNNING', 'CLOSED', 'STANDBY', 'WARNING', 'NO_COMM']
    .includes(cb);
  const d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}`
    + `L${a.x.toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)}`
    + `L${b.x.toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)}`
    + `L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  return `<path d="${d}" fill="none" stroke="${vif ? couleurLien(l.type) : 'var(--cen-sourd)'}"
    stroke-width="${l.type === 'mv' ? 2.4 : 1.6}"
    ${vif ? '' : 'stroke-dasharray="4 3" opacity=".55"'}
    ${vif && l.type === 'mv' ? 'class="cen-flux"' : ''}/>`;
}

/** Un appareil du schéma, avec son symbole, son état et sa cible tactile. */
function noeud(e, code, p, mesure, selectionne) {
  const c = couleurEtat(code);
  const x = p.x.toFixed(1);
  const y = p.y.toFixed(1);
  const effectif = e.properties?.effectif;
  return `<g class="cen-objet${animation(code)}" data-equip="${echapper(e.id)}"
    transform="translate(${x} ${y})" stroke="${c}" fill="none"
    stroke-width="${selectionne ? 2.6 : 1.6}">
    ${selectionne ? '<circle r="17" stroke-dasharray="3 2"/>' : ''}
    ${symbole(e.type)}
  </g>
  <text x="${x}" y="${(p.y + 24).toFixed(1)}" class="cen-etiq" text-anchor="middle"
    >${echapper(abrege(e.name))}${effectif > 1 ? ` ×${nombre(effectif)}` : ''}</text>
  <text x="${x}" y="${(p.y + 33).toFixed(1)}" class="cen-etiq cen-etiq-mes"
    text-anchor="middle">${mesure?.p ? echapper(puissance(mesure.p)) : echapper(nomEtat(code))}</text>
  <rect x="${(p.x - 22).toFixed(1)}" y="${(p.y - 22).toFixed(1)}" width="44" height="44"
    fill="transparent" class="cen-cible" data-equip="${echapper(e.id)}"/>`;
}

/** Un nom assez court pour tenir sous un symbole de schéma. */
function abrege(nom) {
  return String(nom ?? '')
    .replace('Cellule de protection — bloc', 'Cell.')
    .replace('Disjoncteur général BT — bloc', 'Disj. BT')
    .replace('Cellule d’arrivée réseau', 'Arrivée')
    .replace('Cellule de comptage', 'Comptage')
    .replace('Transformateur', 'TR')
    .replace('Onduleur', 'OND')
    .replace('Sectionneur DC', 'SD')
    .replace('Chaînes', 'CH')
    .split('(')[0].trim()
    .slice(0, 12);
}

/** La légende des types de liaison — elle ne s'invente pas au premier regard. */
export function legendeLiens() {
  return `<ul class="cen-legende">
    <li><i style="--c:${couleurLien('dc+')}"></i>Continu</li>
    <li><i style="--c:${couleurLien('ac')}"></i>Alternatif BT</li>
    <li><i style="--c:${couleurLien('mv')}"></i>Moyenne tension</li>
    <li><i style="--c:var(--cen-sourd)"></i>Liaison hors tension</li>
  </ul>`;
}
