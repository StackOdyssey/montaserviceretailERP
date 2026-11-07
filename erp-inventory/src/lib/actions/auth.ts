"use server";

import { and, count, eq, gte } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { createSessionToken, verifyAdminPin, pinHmac, SESSION_COOKIE_NAME } from "@/lib/auth";
import { assertAuthenticated } from "@/lib/action-guard";
import { isLiveSession } from "@/lib/session";
import { bumpSessionVersion, getSessionVersion } from "@/lib/session-version";
import { auditLogs, db, users } from "@/db";
import { logEvent, logWarn } from "@/lib/observability";

export interface AuthResult {
  success: boolean;
  message?: string;
}

// Anti force brute : verrou PAR IP au-delà de MAX_PIN_FAILURES échecs sur la fenêtre,
// + plafond global (spray distribué) au-delà de MAX_GLOBAL_FAILURES. Un seul compte
// gérant : un verrou global pur permettrait à n'importe qui de bannir le gérant.
const MAX_PIN_FAILURES = 5;
const MAX_GLOBAL_FAILURES = 40;
const PIN_LOCK_WINDOW_MS = 15 * 60 * 1000;

async function recentPinFailures(ip: string): Promise<{ perIp: number; global: number }> {
  if (!db) return { perIp: 0, global: 0 };
  const since = new Date(Date.now() - PIN_LOCK_WINDOW_MS);
  const rows = await db
    .select({ n: count(), ip: auditLogs.ipAddress })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "PIN_ECHEC"), gte(auditLogs.createdAt, since)))
    .groupBy(auditLogs.ipAddress);
  return {
    perIp: rows.find((r) => r.ip === ip)?.n ?? 0,
    global: rows.reduce((s, r) => s + r.n, 0),
  };
}

// Cloud Run (Google Front End) AJOUTE l'IP réelle du client en fin de X-Forwarded-For :
// les entrées de gauche sont fournies par le client et falsifiables. Prendre la dernière
// entrée empêche de contourner le verrou par IP avec un en-tête forgé.
async function clientIp(): Promise<string> {
  const h = await headers();
  const hops = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] || h.get("x-real-ip") || "inconnue";
}

// Délai progressif après échecs (par IP) : 0, 1, 2, 4, 8 s… plafonné à 8 s.
// Ralentit le devinage en série sans gêner une faute de frappe isolée.
function failureDelayMs(failures: number): number {
  return failures <= 0 ? 0 : Math.min(1000 * 2 ** (failures - 1), 8000);
}

/**
 * Connexion par code PIN (comparaison en temps constant, ADMIN_PIN requis, verrou anti force brute).
 */
export async function loginWithPin(pin: string): Promise<AuthResult> {
  if (!process.env.ADMIN_PIN) {
    return {
      success: false,
      message: "Accès non configuré. Contactez l'administrateur.",
    };
  }
  if (!db) {
    return { success: false, message: "Base de données indisponible. Réessayez plus tard." };
  }

  const ip = await clientIp();
  const failures = await recentPinFailures(ip);
  if (failures.perIp >= MAX_PIN_FAILURES || failures.global >= MAX_GLOBAL_FAILURES) {
    logWarn("auth.pin_locked", { ip });
    return {
      success: false,
      message: "Trop de tentatives incorrectes. Connexion suspendue 15 minutes.",
    };
  }
  const delay = failureDelayMs(failures.perIp);
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));

  // Identification : PIN utilisateur nominatif (users.pin_hmac) ou clé maîtresse
  // ADMIN_PIN. Les deux comparaisons passent par le même HMAC (temps constant).
  const pinStr = String(pin ?? "");
  let identity: { user: string; role: string; uid: number | null } | null = null;
  if (verifyAdminPin(pinStr)) {
    identity = { user: "gerant", role: "ADMIN", uid: null };
  } else {
    const u = (
      await db
        .select({ id: users.id, displayName: users.displayName, role: users.role })
        .from(users)
        .where(and(eq(users.pinHmac, pinHmac(pinStr)), eq(users.isActive, true)))
        .limit(1)
    )[0];
    if (u) identity = { user: u.displayName, role: u.role === "GERANT" ? "GERANT" : "CAISSIER", uid: u.id };
  }

  if (!identity) {
    logWarn("auth.pin_failed", { ip });
    await db.insert(auditLogs).values({
      action: "PIN_ECHEC",
      entityType: "SESSION",
      ipAddress: ip,
      details: `Code PIN incorrect (IP ${ip}).`,
    });
    return {
      success: false,
      message: "Code PIN incorrect. Veuillez réessayer.",
    };
  }

  const token = await createSessionToken(await getSessionVersion(), identity);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 3600, // 30 jours de session
    path: "/",
  });

  logEvent("auth.pin_success", { user: identity.user, role: identity.role });
  // Marqueur d'ouverture de session dans le journal des opérations.
  try {
    await db.insert(auditLogs).values({
      action: "CONNEXION",
      entityType: "SESSION",
      ipAddress: ip,
      actorName: identity.user,
      details: `Ouverture de session — ${identity.user} (${identity.role}).`,
    });
  } catch {
    // journal non bloquant : la connexion reste valide même si le log échoue
  }
  return { success: true };
}

/**
 * Déconnexion.
 */
export async function logout(): Promise<void> {
  // Marqueur de fermeture de session (non bloquant), avec attribution.
  let actor = "";
  try {
    const session = await assertAuthenticated();
    actor = session.user;
  } catch {
    // session déjà invalide : on journalise sans acteur
  }
  try {
    if (db) {
      await db.insert(auditLogs).values({
        action: "DECONNEXION",
        entityType: "SESSION",
        actorName: actor || null,
        details: actor ? `Fermeture de session — ${actor}.` : "Fermeture de session.",
      });
    }
  } catch {
    // la déconnexion (suppression cookie) doit aboutir dans tous les cas
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Révoque toutes les sessions (tous appareils), y compris la session courante.
 */
export async function revokeAllSessions(): Promise<void> {
  await assertAuthenticated();
  const version = await bumpSessionVersion();
  try {
    await db?.insert(auditLogs).values({
      action: "REVOCATION_SESSIONS",
      entityType: "SESSION",
      details: `Toutes les sessions révoquées (nouvelle version ${version}).`,
    });
  } catch {
    // journal non bloquant
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Vérifie si la session actuelle est valide (signature, expiration, non révoquée).
 */
export async function checkSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isLiveSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * Identité de l'utilisateur connecté (nom + rôle) pour affichage dans l'UI.
 */
export async function currentUser(): Promise<{ user: string; role: string } | null> {
  try {
    const session = await assertAuthenticated();
    return { user: session.user, role: session.role };
  } catch {
    return null;
  }
}
