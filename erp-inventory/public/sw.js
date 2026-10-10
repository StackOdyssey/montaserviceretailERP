// Service Worker BM Motors ERP — cache STATIQUE uniquement.
// Ne met JAMAIS en cache les pages applicatives (HTML) ni les données authentifiées.

const CACHE_NAME = "bm-motors-static-v2";
const STATIC_ASSETS = ["/manifest.json", "/bashan-logo.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : undefined))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Jamais de cache pour les navigations HTML (pages privées) ni les requêtes non-GET.
  if (req.method !== "GET" || req.mode === "navigate") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Uniquement les assets statiques explicitement listés.
  if (!STATIC_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
    )
  );
});
