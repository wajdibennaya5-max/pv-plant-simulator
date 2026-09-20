/**
 * LE SERVICE WORKER — ce qui rend l'application utilisable sans réseau.
 *
 * Un simulateur qui exige une connexion pour s'ouvrir ne sert à rien sur un
 * chantier, et c'est précisément là qu'on s'en sert. Tout est donc mis en
 * cache à l'installation : l'application n'a plus jamais besoin du réseau.
 *
 * LA LISTE CI-DESSOUS EST VÉRIFIÉE PAR UN TEST. Une liste tenue à la main
 * finit toujours par oublier un fichier ; l'application marche alors en
 * ligne, et s'ouvre cassée dans le tunnel — le pire des deux mondes, parce
 * qu'on ne s'en aperçoit jamais au moment de la modification.
 * Voir `tests/pwa.test.js`.
 *
 * LA VERSION SE CHANGE À CHAQUE LIVRAISON. Sans elle, un navigateur garde
 * l'ancienne application pour toujours : le cache sert d'abord, et rien ne
 * lui dit qu'il est périmé.
 */
const VERSION = 'centrale-v1';

const COQUILLE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icone.svg',
  './icons/icone-192.png',
  './icons/icone-512.png',
  './icons/icone-maskable-512.png',
  './js/app.js',
  './js/batiment.js',
  './js/calepinage.js',
  './js/centrale/catalogue.js',
  './js/centrale/commandes.js',
  './js/centrale/defauts.js',
  './js/centrale/ecran.js',
  './js/centrale/generation.js',
  './js/centrale/modele.js',
  './js/centrale/propagation.js',
  './js/centrale/simulateur.js',
  './js/centrale/stockage.js',
  './js/centrale/symboles.js',
  './js/centrale/topologie.js',
  './js/centrale/vue-plan.js',
  './js/centrale/vue-scada.js',
  './js/centrale/vue-schema.js',
  './js/co2.js',
  './js/etude.js',
  './js/finances.js',
  './js/gisement.js',
  './js/materiel.js',
  './js/orientation.js',
  './js/technique.js',
  './js/validation.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // `reload` court-circuite le cache HTTP du navigateur : sans lui, une
    // mise à jour peut remettre en cache les fichiers qu'on vient de remplacer.
    await cache.addAll(COQUILLE.map((u) => new Request(u, { cache: 'reload' })));
    // La nouvelle version prend la main sans attendre la fermeture des onglets.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nom of await caches.keys()) {
      if (nom !== VERSION) await caches.delete(nom);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);

    // UNE NAVIGATION REND TOUJOURS LA PAGE, même hors ligne. Sans cela, le
    // navigateur affiche sa page d'erreur et l'application paraît disparue.
    if (requete.mode === 'navigate') {
      try {
        const reseau = await fetch(requete);
        await cache.put('./index.html', reseau.clone());
        return reseau;
      } catch {
        return (await cache.match('./index.html')) ?? Response.error();
      }
    }

    // LE CACHE D'ABORD : l'application est entièrement statique, donc ce qui
    // est en cache est juste. On rafraîchit en arrière-plan pour la fois
    // suivante, sans jamais faire attendre l'écran.
    const enCache = await cache.match(requete);
    if (enCache) {
      e.waitUntil(fetch(requete)
        .then((r) => (r.ok ? cache.put(requete, r.clone()) : null))
        .catch(() => null));
      return enCache;
    }

    try {
      const reseau = await fetch(requete);
      if (reseau.ok) await cache.put(requete, reseau.clone());
      return reseau;
    } catch {
      return Response.error();
    }
  })());
});
