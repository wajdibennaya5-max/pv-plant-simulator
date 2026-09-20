/**
 * LE POINT D'ENTRÉE — et le seul fichier qui a le droit de voir la page.
 *
 * Il fait trois choses, et rien d'autre : il va chercher les nœuds dans le
 * document, il construit le simulateur, et il remet à l'écran la persistance
 * sous forme de fonctions. L'écran ne peut donc ni calculer une tension, ni
 * écrire dans le navigateur — il ne peut que montrer et transmettre.
 *
 * Il n'exporte rien : personne ne doit pouvoir l'importer, sous peine de
 * cycle et d'ordre de chargement imprévisible.
 */
import { creerSimulateur } from './centrale/simulateur.js';
import { monterEcran } from './centrale/ecran.js';
import { enregistrer, relire, effacer, disponible } from './centrale/stockage.js';

const $ = (id) => document.getElementById(id);

/** L'âge d'une reprise, en français : « il y a 3 heures ». */
function ageEnClair(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 2) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} minutes`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} heure${heures > 1 ? 's' : ''}`;
  const jours = Math.round(heures / 24);
  return `il y a ${jours} jour${jours > 1 ? 's' : ''}`;
}

/**
 * UNE PANNE AU DÉMARRAGE EST CELLE QU'ON A LE PLUS BESOIN DE VOIR.
 *
 * Sans cela, une erreur d'import laisse une page vide et muette, et on
 * cherche du côté du réseau pendant une heure.
 */
function surveiller() {
  const dire = (message) => {
    const zone = $('erreur');
    if (!zone) return;
    zone.hidden = false;
    zone.textContent = message;
  };
  globalThis.addEventListener('error', (e) => dire(`Erreur : ${e.message}`));
  globalThis.addEventListener('unhandledrejection',
    (e) => dire(`Erreur : ${e.reason?.message ?? e.reason}`));
}

function demarrer() {
  const hote = $('ecran');
  if (!hote) return;

  const sim = creerSimulateur({ puissanceDc: 5000 });

  // Une centrale laissée en plan se retrouve telle quelle, consignations
  // comprises. C'est précisément ce qu'on ne doit pas perdre.
  const repris = relire();
  const etatReprise = $('reprise');
  if (repris && sim.restaurer(repris.instantane)) {
    if (etatReprise) {
      etatReprise.hidden = false;
      etatReprise.textContent = `Centrale reprise — dernière manœuvre ${ageEnClair(repris.age)}.`;
    }
  } else if (etatReprise && !disponible()) {
    etatReprise.hidden = false;
    etatReprise.textContent = 'Navigation privée : les manœuvres ne seront pas conservées.';
  }

  monterEcran(hote, sim, { enregistrer });

  $('effacer')?.addEventListener('click', () => {
    effacer();
    globalThis.location.reload();
  });
}

/**
 * LE SERVICE WORKER REND L'APPLICATION UTILISABLE SANS RÉSEAU.
 *
 * Un simulateur qui exige une connexion pour s'ouvrir ne sert à rien sur un
 * chantier, et c'est précisément là qu'on s'en sert. Son échec n'est pas une
 * panne : l'application marche, elle ne survivra simplement pas au tunnel.
 */
function installerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Le protocole `file:` n'admet pas de service worker. L'APK sert donc ses
  // fichiers en `https://` par `WebViewAssetLoader`, et non en `file://`.
  if (globalThis.location.protocol === 'file:') return;
  globalThis.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* hors ligne indisponible : l'application reste entière */
    });
  });
}

surveiller();
demarrer();
installerServiceWorker();

const annee = $('annee');
if (annee) annee.textContent = String(new Date().getFullYear());
