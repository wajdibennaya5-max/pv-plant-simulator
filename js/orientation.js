/**
 * L'orientation et l'inclinaison du toit.
 *
 * C'est le facteur le plus lourd de toute l'étude, et il était ignoré : un
 * pan plein est produit environ 18 % de moins qu'un pan plein sud, et un pan
 * plein nord perd près de la moitié. Annoncer la même production pour les deux
 * n'est pas une approximation, c'est une erreur — et elle se découvre sur la
 * première facture après la pose.
 *
 * Les facteurs valent pour la latitude tunisienne, autour de 33 à 37° nord.
 */

/** Les orientations proposées, du meilleur au moins bon. */
export const ORIENTATIONS = [
  { id: 'sud', nom: 'Plein sud', azimut: 0, facteur: 1.00 },
  { id: 'sud-est', nom: 'Sud-est', azimut: -45, facteur: 0.96 },
  { id: 'sud-ouest', nom: 'Sud-ouest', azimut: 45, facteur: 0.96 },
  { id: 'est', nom: 'Est', azimut: -90, facteur: 0.83 },
  { id: 'ouest', nom: 'Ouest', azimut: 90, facteur: 0.83 },
  { id: 'nord-est', nom: 'Nord-est', azimut: -135, facteur: 0.64 },
  { id: 'nord-ouest', nom: 'Nord-ouest', azimut: 135, facteur: 0.64 },
  { id: 'nord', nom: 'Plein nord', azimut: 180, facteur: 0.53 },
];

/** Les pentes proposées, telles qu'on les reconnaît sur un toit. */
export const PENTES = [
  { id: 'plat', nom: 'Toit plat ou terrasse', degres: 0, facteur: 0.89 },
  { id: 'faible', nom: 'Pente faible', degres: 15, facteur: 0.97 },
  { id: 'moyenne', nom: 'Pente moyenne', degres: 30, facteur: 1.00 },
  { id: 'forte', nom: 'Pente forte', degres: 45, facteur: 0.96 },
];

/** Ce qu'un toit plat permet, et qu'aucun toit en pente ne permet. */
export const TERRASSE = {
  id: 'plat',
  note: 'Sur une terrasse, les modules se posent sur des supports inclinés '
    + 'plein sud : l’orientation du bâtiment ne compte plus.',
};

export const orientation = (id) => ORIENTATIONS.find((o) => o.id === id) ?? null;
export const pente = (id) => PENTES.find((p) => p.id === id) ?? null;

/**
 * Facteur de production dû à l'orientation et à la pente.
 *
 * Un toit plat est le cas particulier qui sauve tout : les modules s'y posent
 * sur châssis inclinés plein sud, quelle que soit l'orientation du bâtiment.
 * On ignore donc l'orientation dans ce cas, au lieu de pénaliser à tort une
 * maison qui n'a aucun problème.
 *
 * @returns {{facteur:number, terrasse:boolean, perte:number}|null}
 */
export function facteurOrientation(idOrientation, idPente) {
  const p = pente(idPente);
  if (!p) return null;

  if (p.id === TERRASSE.id) {
    return { facteur: p.facteur, terrasse: true, perte: 1 - p.facteur };
  }

  const o = orientation(idOrientation);
  if (!o) return null;
  const facteur = o.facteur * p.facteur;
  return { facteur, terrasse: false, perte: 1 - facteur };
}

/**
 * Ce que l'orientation coûte, dit en clair.
 * Un client à qui l'on montre la perte comprend pourquoi son voisin produit
 * davantage — et n'accuse pas l'installateur.
 */
export function expliquerOrientation(idOrientation, idPente) {
  const f = facteurOrientation(idOrientation, idPente);
  if (!f) return null;
  if (f.terrasse) return TERRASSE.note;

  const perte = Math.round(f.perte * 100);
  if (perte <= 2) return 'Orientation optimale : votre toit reçoit le maximum.';
  if (perte <= 10) {
    return `Bonne orientation : environ ${perte} % de moins qu’un plein sud, `
      + 'ce qui reste très favorable.';
  }
  if (perte <= 25) {
    return `Orientation moyenne : environ ${perte} % de moins qu’un plein sud. `
      + 'Le projet reste rentable, mais il faut un peu plus de modules.';
  }
  return `Orientation défavorable : environ ${perte} % de moins qu’un plein sud. `
    + 'Une pose sur châssis inclinés, ou sur un autre pan, mérite d’être étudiée.';
}
