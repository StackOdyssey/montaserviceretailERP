// Service Worker pour BM Motors ERP PWA
// Mise en cache hors-ligne des composants critiques et du catalogue

const CACHE_NAME = "bm-motors-cache-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/bashan-logo.png",
  "/stock",
  "/ventes",
  "/reglements",
  "/fournisseurs",
  "/depenses",
  "/comptabilite"
];

// Installation du Service Worker et mise en cache initiale
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activation et nettoyage des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Stratégie Réseau d'abord avec repli sur le cache (Network-First with Cache Fallback)
self.addEventListener("fetch", (event) => {
  // Ignorer les requêtes non-GET et les requêtes chrome-extension
  if (event.request.method !== "GET" || !event.request.url.startsWith("http")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Si réponse valide, mise en cache automatique
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // En cas de perte de connexion réseau, servir depuis le cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si ressource non trouvée et navigation HTML, retourner la page d'accueil en cache
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/");
          }
        });
      })
  );
});
