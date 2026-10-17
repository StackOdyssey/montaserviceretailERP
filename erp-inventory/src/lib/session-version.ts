// Version courante des sessions (révocation globale « Déconnecter tous les appareils »).
// Mise en cache courte par instance : le proxy la lit à chaque requête sans frapper la base.
// Une révocation se propage aux autres instances Cloud Run en au plus CACHE_TTL_MS.
import { sql } from "drizzle-orm";
import { db, settings } from "@/db";

const CACHE_TTL_MS = 30_000;
let cache: { value: number; at: number } | null = null;

export async function getSessionVersion(): Promise<number> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  if (!db) return 1;
  const row = (await db.select({ v: settings.sessionVersion }).from(settings).limit(1))[0];
  const value = row?.v ?? 1;
  cache = { value, at: Date.now() };
  return value;
}

/** Incrémente la version (toutes les sessions émises deviennent invalides) et renvoie la nouvelle. */
export async function bumpSessionVersion(): Promise<number> {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  const rows = await db
    .update(settings)
    .set({ sessionVersion: sql`${settings.sessionVersion} + 1` })
    .returning({ v: settings.sessionVersion });
  const value = rows[0]?.v;
  if (value == null) throw new Error("PARAMETRES_INTROUVABLES");
  cache = { value, at: Date.now() };
  return value;
}
