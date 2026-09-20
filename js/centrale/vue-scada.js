/**
 * LA VUE SUPERVISION — et le panneau d'un équipement.
 *
 * CE FICHIER NE FAIT QUE DESSINER. Il reçoit un état déjà calculé et le met
 * en forme. Aucun calcul ne s'y trouve : c'est la règle du dépôt, et c'est
 * elle qui permet de refaire l'apparence sans toucher aux chiffres.
 *
 * LE PANNEAU D'ÉQUIPEMENT EST LE CŒUR DU MODULE. Un appui sur n'importe quel
 * équipement doit répondre à six questions : qu'est-ce que c'est, que
 * vaut-il, dans quel état est-il, que mesure-t-on, que puis-je faire, et
 * qu'a-t-il fait. Une commande grisée affiche TOUJOURS la raison et la
 * condition manquante — « impossible » tout court pousse à contourner.
 */
import { couleurEtat, iconeEtat, animation, nomEtat, echapper, nombre,
  puissance, energie, pourcent, heure, instant, symbole } from './symboles.js';
import { COMMANDES } from './modele.js';

/** Une pastille d'état : couleur, icône et texte ensemble. */
export function pastille(etat, { compact = false } = {}) {
  return `<span class="cen-pastille${animation(etat)}" style="--c:${couleurEtat(etat)}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${iconeEtat(etat)}"/></svg>
    ${compact ? '' : `<span>${echapper(nomEtat(etat))}</span>`}
  </span>`;
}

/** Les indicateurs de tête — ce qu'on lit en trois secondes. */
export function tableauScada(scada) {
  const cellules = [
    { libelle: 'Puissance injectée', valeur: puissance(scada.puissance),
      note: `sur ${puissance(scada.crete)} crête` },
    { libelle: 'Énergie du jour', valeur: energie(scada.energieJour),
      note: `cumul ${energie(scada.energieTotale)}` },
    { libelle: 'Rapport de performance', valeur: pourcent(scada.performance),
      note: 'ce qui sort sur ce que le champ pouvait donner' },
    { libelle: 'Tension réseau',
      valeur: scada.tension ? `${nombre(scada.tension / 1000, 1)} kV` : '—',
      note: scada.reseau ? `${nombre(scada.frequence, 1)} Hz` : 'réseau absent' },
    { libelle: 'Courant', valeur: scada.courant ? `${nombre(scada.courant)} A` : '—',
      note: `cos φ ${nombre(scada.cosPhi, 2)}` },
    { libelle: 'Alarmes actives', valeur: nombre(scada.alarmesActives),
      note: `${nombre(scada.enDefaut)} équipement(s) en défaut` },
  ];
  return `<div class="cen-kpi">${cellules.map((c) => `<div class="cen-kpi-c">
    <p class="cen-kpi-l">${echapper(c.libelle)}</p>
    <p class="cen-kpi-v">${c.valeur}</p>
    <p class="cen-kpi-n">${echapper(c.note)}</p>
  </div>`).join('')}</div>`;
}

/** La météo du moment — elle explique la production mieux qu'un commentaire. */
export function bandeauMeteo(meteo) {
  return `<div class="cen-meteo">
    <span><b>${heure(meteo.heure)}</b></span>
    <span>${nombre(meteo.irradiance)} W/m²</span>
    <span>${nombre(meteo.temperature)} °C</span>
    <span>${nombre(meteo.vent ?? 0, 1)} m/s</span>
  </div>`;
}

/**
 * LE PANNEAU DE VÉRIFICATION.
 *
 * Toute incohérence du dimensionnement remonte ici, avec sa gravité. Un plan
 * qui ne tient pas est produit quand même — mais il ne passe jamais pour bon.
 */
export function panneauVerification(avertissements = []) {
  if (!avertissements.length) {
    return `<div class="cen-verif cen-verif-ok">
      <p>Aucune incohérence relevée sur ce dimensionnement.</p></div>`;
  }
  const rang = { defaut: 0, avertissement: 1, information: 2, inconnu: 3 };
  const tries = [...avertissements].sort((a, b) => (rang[a.gravite] ?? 9) - (rang[b.gravite] ?? 9));
  return `<div class="cen-verif">
    <h4>Vérification du dimensionnement</h4>
    <ul>${tries.map((a) => `<li class="cen-g-${echapper(a.gravite)}">
      <b>${echapper(a.gravite === 'defaut' ? 'Bloquant'
    : a.gravite === 'avertissement' ? 'À vérifier'
      : a.gravite === 'inconnu' ? 'Non vérifiable' : 'Pour information')}</b>
      ${echapper(a.texte)}</li>`).join('')}</ul>
  </div>`;
}

/** Le journal des alarmes, les plus récentes d'abord. */
export function panneauAlarmes(alarmes = [], { limite = 40 } = {}) {
  if (!alarmes.length) {
    return '<div class="cen-vide"><p>Aucune alarme. La centrale est saine.</p></div>';
  }
  return `<ul class="cen-alarmes">${alarmes.slice(0, limite).map((a) => `
    <li class="cen-g-${echapper(a.gravite)}" data-alarme="${echapper(a.id)}">
      <span class="cen-h">${instant(a.horodatage)}</span>
      <span class="cen-t">${echapper(a.texte)}</span>
      <button type="button" class="cen-acq" data-acquitter="${echapper(a.id)}"
        ${a.acquittee ? 'disabled' : ''}>${a.acquittee ? 'Acquittée' : 'Acquitter'}</button>
    </li>`).join('')}</ul>`;
}

/** L'historique des manœuvres — y compris celles qui ont été refusées. */
export function panneauEvenements(evenements = [], { limite = 40 } = {}) {
  if (!evenements.length) {
    return '<div class="cen-vide"><p>Aucune manœuvre enregistrée.</p></div>';
  }
  return `<ul class="cen-events">${evenements.slice(0, limite).map((e) => `
    <li class="${e.resultat === 'refusée' ? 'cen-g-avertissement' : ''}">
      <span class="cen-h">${instant(e.horodatage)}</span>
      <span class="cen-t">${echapper(e.equipement ?? e.equipementId)} —
        ${echapper(e.commande ? COMMANDES[e.commande]?.nom ?? e.commande : e.resultat)}
        ${e.avant && e.apres ? `<i>${echapper(nomEtat(e.avant))} → ${echapper(nomEtat(e.apres))}</i>` : ''}
        ${e.resultat === 'refusée' ? `<i>${echapper(e.raison ?? '')}</i>` : ''}</span>
    </li>`).join('')}</ul>`;
}

/**
 * LE PANNEAU D'UN ÉQUIPEMENT — les six questions, dans l'ordre.
 */
export function panneauEquipement(f, { consequences = null } = {}) {
  if (!f) return '<div class="cen-vide"><p>Appuyez sur un équipement du plan ou du schéma.</p></div>';

  const car = Object.entries(f.caracteristiques ?? {})
    .filter(([k, v]) => v !== null && v !== undefined && typeof v !== 'object'
      && !['agrege', 'chantier', 'causePersistante'].includes(k))
    .slice(0, 14);

  const mes = Object.entries(f.mesures ?? {})
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v));

  return `<div class="cen-panneau">
    <header class="cen-pan-tete">
      <div>
        <p class="cen-pan-sur">${echapper(f.identification.typeNom)}</p>
        <h3>${echapper(f.identification.nom)}</h3>
      </div>
      ${pastille(f.etat.code)}
    </header>

    ${f.identification.verifie ? '' : `<p class="cen-generique">
      ${echapper(f.identification.provenance.texte)}</p>`}

    ${f.agrege ? `<p class="cen-agrege">Objet agrégé : ${nombre(f.effectif)} éléments
      identiques. <button type="button" class="cen-btn cen-detail"
      data-detailler="${echapper(f.identification.id)}">Descendre au détail</button></p>` : ''}

    <section class="cen-bloc">
      <h4>Identification</h4>
      <dl class="cen-dl">
        <dt>Repère</dt><dd>${echapper(f.identification.id)}</dd>
        <dt>Fabricant</dt><dd>${echapper(f.identification.fabricant ?? 'générique')}</dd>
        <dt>Modèle</dt><dd>${echapper(f.identification.modele ?? '—')}</dd>
        ${f.identification.parent ? `<dt>Rattaché à</dt><dd>${echapper(f.identification.parent)}</dd>` : ''}
      </dl>
    </section>

    ${car.length ? `<section class="cen-bloc">
      <h4>Caractéristiques</h4>
      <dl class="cen-dl">${car.map(([k, v]) => `<dt>${echapper(etiquette(k))}</dt>
        <dd>${echapper(valeurLisible(k, v))}</dd>`).join('')}</dl>
    </section>` : ''}

    ${mes.length ? `<section class="cen-bloc">
      <h4>Mesures</h4>
      <dl class="cen-dl">${mes.map(([k, v]) => `<dt>${echapper(etiquette(k))}</dt>
        <dd>${echapper(valeurLisible(k, v))}</dd>`).join('')}</dl>
    </section>` : ''}

    <section class="cen-bloc">
      <h4>Commandes</h4>
      ${f.commandes.length ? `<div class="cen-cmds">${f.commandes.map((c) => `
        <button type="button" class="cen-cmd${c.accepte ? '' : ' cen-cmd-non'}"
          data-commande="${echapper(c.commande)}" data-cible="${echapper(f.identification.id)}"
          ${c.accepte ? '' : 'aria-disabled="true"'}>
          ${echapper(c.nom)}
        </button>`).join('')}</div>
        ${f.commandes.filter((c) => !c.accepte).length ? `<ul class="cen-refus">
          ${f.commandes.filter((c) => !c.accepte).map((c) => `<li>
            <b>${echapper(c.nom)}</b> — ${echapper(c.raison ?? '')}
            ${c.requis ? `<i>À faire : ${echapper(c.requis)}</i>` : ''}</li>`).join('')}
        </ul>` : ''}`
    : '<p class="cen-vide-p">Cet équipement ne se manœuvre pas.</p>'}
      ${consequences?.nombre ? `<p class="cen-consequence">Cette manœuvre isolerait
        ${nombre(consequences.nombre)} équipement(s) en aval.</p>` : ''}
    </section>

    ${f.defauts.length ? `<section class="cen-bloc">
      <h4>Simuler un défaut</h4>
      <div class="cen-cmds">${f.defauts.map((d) => `
        <button type="button" class="cen-def" data-defaut="${echapper(d.id)}"
          data-cible="${echapper(f.identification.id)}"
          title="${echapper(d.description)}">${echapper(d.nom)}</button>`).join('')}
      </div>
      ${f.caracteristiques?.defautActif ? `<button type="button" class="cen-btn cen-lever"
        data-lever="${echapper(f.identification.id)}">Lever la cause du défaut</button>` : ''}
    </section>` : ''}

    ${f.alarmes.length ? `<section class="cen-bloc">
      <h4>Alarmes</h4>${panneauAlarmes(f.alarmes, { limite: 8 })}</section>` : ''}

    ${f.historique.length ? `<section class="cen-bloc">
      <h4>Historique</h4>${panneauEvenements(f.historique, { limite: 10 })}</section>` : ''}
  </div>`;
}

/** Le mode ingénierie : sections, chutes, pertes, protections, terre. */
export function panneauIngenierie(ing) {
  if (!ing) return '';
  const verdictMot = { conforme: 'Conforme', hors: 'Hors limites',
    verifier: 'À vérifier', inconnu: 'Non vérifiable' };
  return `<div class="cen-ing">
    <p class="cen-ing-tete cen-g-${ing.verdict === 'conforme' ? 'ok' : 'defaut'}">
      ${echapper(verdictMot[ing.verdict] ?? ing.verdict)} —
      pertes de transport ${puissance(ing.pertesTotales)}
      ${ing.pertesRelatives !== null ? `(${pourcent(ing.pertesRelatives, 2)} du produit)` : ''}
    </p>

    <h4>Chutes de tension</h4>
    <table class="cen-table"><thead><tr>
      <th>Liaison</th><th>Section</th><th>Long.</th><th>I</th><th>ΔU</th><th>Limite</th>
    </tr></thead><tbody>
      ${ing.lignes.slice(0, 30).map((l) => `<tr class="cen-v-${echapper(l.verdict)}">
        <td>${echapper(l.nom)}</td><td>${nombre(l.section)} mm²</td>
        <td>${nombre(l.longueur)} m</td><td>${nombre(l.courant, 1)} A</td>
        <td>${pourcent(l.chute, 2)}</td><td>${pourcent(l.limite, 0)}</td></tr>`).join('')}
    </tbody></table>

    <h4>Protections</h4>
    <table class="cen-table"><thead><tr>
      <th>Appareil</th><th>Calibre</th><th>Courant</th><th>Taux</th><th>Verdict</th>
    </tr></thead><tbody>
      ${ing.protections.slice(0, 30).map((p) => `<tr class="cen-v-${echapper(p.verdict)}">
        <td>${echapper(p.nom)}</td><td>${p.calibre ? `${nombre(p.calibre)} A` : '—'}</td>
        <td>${nombre(p.courant, 1)} A</td>
        <td>${p.taux === null ? '—' : pourcent(p.taux)}</td>
        <td>${echapper(verdictMot[p.verdict] ?? p.verdict)}</td></tr>`).join('')}
    </tbody></table>

    <h4>Mise à la terre</h4>
    ${ing.sansTerre.length ? `<ul class="cen-refus">${ing.sansTerre.map((e) => `<li>
      <b>${echapper(e.nom)}</b> — aucune liaison au réseau de terre.</li>`).join('')}</ul>`
    : '<p class="cen-vide-p">Toutes les masses sont reliées au réseau de terre.</p>'}
  </div>`;
}

/** Le mode chantier : installé, manquant, contrôlé, en défaut. */
export function panneauChantier(ch) {
  if (!ch) return '';
  const cases = [
    { cle: 'installe', nom: 'Installé' }, { cle: 'controle', nom: 'Contrôlé' },
    { cle: 'manquant', nom: 'Manquant' }, { cle: 'defaut', nom: 'En défaut' },
  ];
  return `<div class="cen-chantier">
    <div class="cen-kpi">${cases.map((c) => `<div class="cen-kpi-c">
      <p class="cen-kpi-l">${echapper(c.nom)}</p>
      <p class="cen-kpi-v">${nombre(ch.compte[c.cle] ?? 0)}</p>
    </div>`).join('')}</div>
    <p class="cen-avancement">Avancement : <b>${pourcent(ch.avancement)}</b>
      sur ${nombre(ch.total)} équipements suivis.</p>
    <table class="cen-table"><thead><tr>
      <th>Type</th><th>Installé</th><th>Contrôlé</th><th>Manquant</th><th>Défaut</th>
    </tr></thead><tbody>
      ${ch.parType.map((t) => `<tr><td>${echapper(t.nom)}</td>
        <td>${nombre(t.installe)}</td><td>${nombre(t.controle)}</td>
        <td>${nombre(t.manquant)}</td><td>${nombre(t.defaut)}</td></tr>`).join('')}
    </tbody></table>
  </div>`;
}

/** Le résumé du plan produit par la génération. */
export function ficheCentrale(plan) {
  if (!plan?.valide) return '';
  const lignes = [
    ['Puissance crête', `${nombre(plan.puissanceDc)} kWc`],
    ['Puissance onduleurs', `${nombre(plan.puissanceAc)} kVA`],
    ['Rapport crête / onduleurs', nombre(plan.ratio, 2)],
    ['Modules', `${nombre(plan.modules)} × ${plan.module.nom}`],
    ['Modules par chaîne', `${nombre(plan.modulesParChaine)} (plage ${plan.chaine.min}–${plan.chaine.max})`],
    ['Tension à vide à froid', `${nombre(plan.chaine.vocChaine)} V à ${nombre(plan.tempMin)} °C`],
    ['Chaînes', nombre(plan.chaines)],
    ['Onduleurs', `${nombre(plan.onduleurs)} × ${plan.onduleur.nom}`],
    ['Transformateurs', `${nombre(plan.transformateurs)} × ${plan.transformateur.nom}`],
    ['Cellules MT', nombre(plan.cellules)],
    ['Rangées', nombre(plan.rangees)],
    ['Emprise au sol', `${nombre(plan.emprise)} m²`],
    ['Tensions', `${nombre(plan.tensionBt)} V / ${nombre(plan.tensionMt / 1000, 0)} kV`],
    ['Câble continu', plan.cables.dc ? `${nombre(plan.cables.dc.section)} mm²` : '—'],
    ['Câble MT', plan.cables.mv ? `${nombre(plan.cables.mv.section)} mm²` : '—'],
  ];
  return `<dl class="cen-dl cen-fiche">${lignes.map(([k, v]) =>
    `<dt>${echapper(k)}</dt><dd>${echapper(v)}</dd>`).join('')}</dl>`;
}

/** Les libellés lisibles des propriétés techniques. */
const ETIQUETTES = {
  p: 'Puissance', pDc: 'Puissance continue', pAc: 'Puissance alternative',
  v: 'Tension', vDc: 'Tension continue', i: 'Courant', f: 'Fréquence',
  cosPhi: 'cos φ', charge: 'Taux de charge', crete: 'Puissance crête',
  puissance: 'Puissance nominale', rendement: 'Rendement', effectif: 'Effectif',
  modulesParChaine: 'Modules par chaîne', modules: 'Modules', chaines: 'Chaînes',
  vmp: 'Tension au point de puissance', voc: 'Tension à vide',
  imp: 'Courant au point de puissance', isc: 'Courant de court-circuit',
  vMax: 'Tension maximale', vMpptMin: 'MPPT minimum', vMpptMax: 'MPPT maximum',
  mppt: 'Entrées MPPT', vAc: 'Tension de sortie', calibre: 'Calibre',
  inMax: 'Courant nominal', icc: 'Pouvoir de coupure', tension: 'Tension',
  primaire: 'Primaire', secondaire: 'Secondaire', couplage: 'Couplage',
  ucc: 'Tension de court-circuit', temperature: 'Température',
  tempMax: 'Température maximale', ombrage: 'Ombrage', salissure: 'Salissure',
  irradiance: 'Irradiance', inclinaison: 'Inclinaison', angle: 'Angle',
  emprise: 'Emprise au sol', resistance: 'Résistance', isolement: 'Isolement',
  plafond: 'Plafond de puissance', ecrete: 'Écrêtage', couple: 'Couplé au réseau',
  codeDefaut: 'Code défaut', causeDefaut: 'Cause', defautActif: 'Défaut actif',
  fonction: 'Fonction', modulesParRangee: 'Modules par rangée',
  puissanceDc: 'Puissance continue', puissanceAc: 'Puissance alternative',
  tensionMesuree: 'Tension mesurée', courantMesure: 'Courant mesuré',
  frequence: 'Fréquence', mobile: 'Mobile', module: 'Module',
};
const etiquette = (cle) => ETIQUETTES[cle] ?? cle;

/** Met une valeur technique dans son unité, d'après le nom du champ. */
function valeurLisible(cle, v) {
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v !== 'number') return String(v);
  if (['ombrage', 'salissure', 'charge', 'rendement', 'ucc'].includes(cle)) return pourcent(v, 1);
  if (['p', 'pDc', 'pAc', 'puissance', 'crete', 'plafond', 'puissanceDc', 'puissanceAc']
    .includes(cle)) return puissance(v);
  if (['v', 'vDc', 'vmp', 'voc', 'vMax', 'vMpptMin', 'vMpptMax', 'vAc', 'tension',
    'primaire', 'secondaire', 'tensionMesuree'].includes(cle)) return `${nombre(v)} V`;
  if (['i', 'imp', 'isc', 'calibre', 'inMax', 'icc', 'courantMesure'].includes(cle)) return `${nombre(v, 1)} A`;
  if (['temperature', 'tempMax'].includes(cle)) return `${nombre(v)} °C`;
  if (cle === 'irradiance') return `${nombre(v)} W/m²`;
  if (cle === 'frequence' || cle === 'f') return `${nombre(v, 1)} Hz`;
  if (cle === 'inclinaison' || cle === 'angle') return `${nombre(v)}°`;
  if (cle === 'emprise') return `${nombre(v)} m²`;
  if (cle === 'isolement') return `${nombre(v)} kΩ`;
  if (cle === 'resistance') return `${nombre(v)} Ω`;
  return nombre(v, Number.isInteger(v) ? 0 : 2);
}

/** Le symbole d'un type, pour les listes et les légendes. */
export const symboleDe = symbole;
