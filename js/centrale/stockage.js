/**
 * NE JAMAIS PERDRE UNE CENTRALE EN COURS DE MANŒUVRE.
 *
 * Même patron que `session.js`, et pour la même raison : sur Android, un
 * onglet en arrière-plan est tué sans avertissement. Ce n'est pas un cas
 * rare, c'est le cas ordinaire. Un exploitant qui a consigné trois cellules
 * et ouvert deux blocs ne doit pas retrouver une centrale neuve parce qu'il a
 * répondu au téléphone.
 *
 * ON NE RANGE PAS LE GRAPHE, ON RANGE L'INSTANTANÉ : les paramètres qui ont
 * produit la centrale, plus les écarts. Un parc de 500 MWc tient en un
 * kilo-octet, là où le graphe complet dépasserait le quota du navigateur —
 * et un quota dépassé, c'est une sauvegarde qui échoue en silence.
 *
 * Tout reste dans le navigateur. Rien ne part sur un serveur : la page ne le
 * promet pas, donc elle ne doit pas le faire.
 */

const ESPACE = 'solarys.centrale';

/**
 * Au-delà de ce délai, une centrale reprise n'apprend plus rien : l'exploitant
 * ne se souvient plus de ce qu'il avait manœuvré, et reprendre une
 * consignation oubliée est pire que repartir proprement.
 */
export const PEREMPTION = 30 * 24 * 60 * 60 * 1000;

/** Le stockage disponible, ou `null` en navigation privée. */
function magasin() {
  try {
    const t = globalThis.localStorage;
    if (!t) return null;
    // Certains navigateurs exposent l'objet et refusent l'écriture. Le
    // découvrir ici évite de le découvrir après deux heures de manœuvres.
    t.setItem(`${ESPACE}.essai`, '1');
    t.removeItem(`${ESPACE}.essai`);
    return t;
  } catch {
    return null;
  }
}

/** Le stockage est-il utilisable ? */
export const disponible = () => magasin() !== null;

/**
 * Range l'instantané de la centrale.
 * @returns {boolean} `false` si le navigateur l'a refusé — sans jamais lever.
 */
export function enregistrer(instantane) {
  const t = magasin();
  if (!t) return false;
  try {
    t.setItem(ESPACE, JSON.stringify({ a: Date.now(), instantane }));
    return true;
  } catch {
    // Quota dépassé, mode privé : une centrale non sauvegardée reste
    // manœuvrable. On ne bloque jamais l'exploitant pour cela.
    return false;
  }
}

/**
 * Relit la centrale rangée.
 * @returns {{instantane:object, age:number}|null} `null` si rien, illisible ou périmé
 */
export function relire() {
  const t = magasin();
  if (!t) return null;
  try {
    const brut = t.getItem(ESPACE);
    if (!brut) return null;
    const { a, instantane } = JSON.parse(brut);
    if (!a || !instantane || typeof instantane !== 'object') return null;
    const age = Date.now() - a;
    if (age < 0 || age > PEREMPTION) { effacer(); return null; }
    return { instantane, age };
  } catch {
    // Un stockage abîmé ne doit pas empêcher de recommencer.
    effacer();
    return null;
  }
}

/** Oublie la centrale rangée. */
export function effacer() {
  const t = magasin();
  if (!t) return;
  try { t.removeItem(ESPACE); } catch { /* rien à faire, rien à dire */ }
}

/** Le poids de ce qui est rangé, en octets — affiché quand le quota approche. */
export function poids() {
  const t = magasin();
  if (!t) return 0;
  try { return (t.getItem(ESPACE) ?? '').length; } catch { return 0; }
}
