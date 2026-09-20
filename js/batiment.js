/**
 * À qui appartient le toit — et pourquoi cela change tout le calcul.
 *
 * LE DÉFAUT QUE CE FICHIER CORRIGE : le calcul supposait un foyer, toujours.
 * Or le soleil produit à midi. Une maison est vide à midi : ses habitants
 * travaillent, et l'électricité produite part sur le réseau au prix de
 * rachat, moitié moindre. Un bureau, un atelier, une école sont pleins à
 * midi : ils consomment presque tout ce qu'ils produisent.
 *
 * Deux bâtiments identiques, même toit, même soleil, même facture, n'ont donc
 * PAS la même rentabilité — et l'étude leur annonçait la même. Sur une
 * entreprise, l'erreur se compte en années de retour.
 *
 * C'est la première question de l'assistant parce que c'est celle qui
 * gouverne toutes les suivantes.
 */

/**
 * Le taux d'autoconsommation de référence, à production égale à la
 * consommation annuelle. C'est le point d'ancrage de la courbe de `etude.js`.
 *
 * Ces valeurs sont des ordres de grandeur de terrain, à recaler sur des
 * relevés réels quand il y en aura. Elles ne sont pas interchangeables : le
 * rapport entre elles — un tertiaire autoconsomme nettement plus qu'un
 * logement — est plus solide que leur valeur absolue.
 */
export const TYPES = [
  {
    id: 'maison',
    nom: 'Maison',
    resume: 'Villa, appartement, logement',
    icone: 'maison',
    autoconsommation: 0.65,
    /** Le foyer consomme surtout le soir : le surplus de midi part au réseau. */
    note: 'La maison est souvent vide à midi, quand le soleil donne le plus. '
      + 'Une partie de la production part sur le réseau.',
    profil: 'residentiel',
  },
  {
    id: 'commerce',
    nom: 'Commerce ou bureau',
    resume: 'Boutique, cabinet, agence',
    icone: 'commerce',
    autoconsommation: 0.80,
    note: 'Ouvert en pleine journée : presque toute la production est '
      + 'consommée sur place, au prix d’achat et non au prix de rachat.',
    profil: 'tertiaire',
  },
  {
    id: 'industrie',
    nom: 'Atelier ou industrie',
    resume: 'Production, froid, pompage',
    icone: 'industrie',
    autoconsommation: 0.88,
    note: 'Machines et froid tournent aux heures de soleil : c’est le profil '
      + 'où le photovoltaïque rapporte le plus vite.',
    profil: 'industriel',
  },
  {
    id: 'agricole',
    nom: 'Exploitation agricole',
    resume: 'Pompage, irrigation, élevage',
    icone: 'agricole',
    autoconsommation: 0.85,
    note: 'Le pompage suit le soleil presque heure par heure : l’adéquation '
      + 'entre production et besoin y est naturellement forte.',
    profil: 'agricole',
  },
];

export const typeBatiment = (id) => TYPES.find((t) => t.id === id) ?? null;

/**
 * COMMENT LA CONSOMMATION SE RÉPARTIT DANS L'ANNÉE.
 *
 * Un total annuel ne dit pas si le besoin tombe quand le soleil donne. Sans
 * cette courbe, on ne peut pas montrer au client le mois où il produira plus
 * qu'il ne consomme — ce qui est justement le mois où il faut lui expliquer
 * le surplus.
 *
 * Les douze coefficients totalisent 12 : chacun est un multiple du mois
 * moyen. Ils décrivent des saisonnalités tunisiennes typiques, à recaler sur
 * de vrais relevés. Quand le visiteur donne ses douze mois, ce sont les siens
 * qui servent — ceci n'est que le recours par défaut.
 */
export const PROFILS_MENSUELS = {
  /** Climatisation l'été, chauffage d'appoint l'hiver, creux au printemps. */
  residentiel: [0.95, 0.88, 0.85, 0.82, 0.88, 1.05, 1.30, 1.32, 1.10, 0.90, 0.90, 1.05],
  /** Ouvert toute l'année : la saison pèse peu, la climatisation un peu. */
  tertiaire: [1.00, 0.98, 0.98, 0.97, 1.00, 1.05, 1.10, 1.05, 1.00, 0.96, 0.95, 0.96],
  /** Les machines tournent sans saison ; seul le froid d'été ajoute un peu. */
  industriel: [1.00, 0.99, 0.99, 0.98, 1.00, 1.04, 1.08, 1.05, 1.00, 0.97, 0.95, 0.95],
  /** Le pompage suit l'irrigation : presque rien en novembre, tout en juillet. */
  agricole: [0.70, 0.70, 0.85, 1.00, 1.20, 1.40, 1.60, 1.55, 1.20, 0.95, 0.45, 0.40],
};

/**
 * La consommation mois par mois d'un bâtiment.
 *
 * @param {number} consommationAnnuelle kWh sur l'année
 * @param {string} id type de bâtiment
 * @param {Array<number>} [releves] les douze mois réellement saisis, s'ils existent
 * @returns {Array<number>|null} douze valeurs en kWh
 */
export function consommationMensuelle(consommationAnnuelle, id, releves = null) {
  const total = Number(consommationAnnuelle);
  if (!(total > 0)) return null;

  // Les relevés du client priment toujours sur un profil moyen : ce sont ses
  // chiffres, et il les reconnaît.
  const vrais = Array.isArray(releves)
    ? releves.map(Number).filter((v) => Number.isFinite(v) && v >= 0) : [];
  if (vrais.length === 12) return vrais.map((v) => Math.round(v));

  const profil = PROFILS_MENSUELS[(typeBatiment(id) ?? typeBatiment(TYPE_DEFAUT)).profil]
    ?? PROFILS_MENSUELS.residentiel;
  return profil.map((c) => Math.round((total * c) / 12));
}

/** Le type retenu par défaut, quand la question n'a pas encore été posée. */
export const TYPE_DEFAUT = 'maison';

/**
 * Le taux d'autoconsommation de référence pour un type de bâtiment.
 * Sans réponse, on retient celui du logement : c'est le plus prudent des
 * quatre, donc celui qui ne surpromet à personne.
 */
export function autoconsommationDe(id) {
  return (typeBatiment(id) ?? typeBatiment(TYPE_DEFAUT)).autoconsommation;
}
