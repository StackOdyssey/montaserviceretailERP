// Purge côté navigateur de tout CacheStorage de l'application (déconnexion / révocation).
// Couvre aussi les appareils dont le Service Worker n'a pas encore été mis à jour et qui
// conserveraient un ancien cache de pages authentifiées.
export async function clearAppCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // purge best-effort : ne bloque jamais la déconnexion
  }
}
