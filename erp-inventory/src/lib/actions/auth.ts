"use server";

import { and, count, eq, gte } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { createSessionToken, verifyAdminPin, SESSION_COOKIE_NAME } from "@/lib/auth";
import { assertAuthenticated } from "@/lib/action-guard";
import { isLiveSession } from "@/lib/session";
import { bumpSessionVersion, getSessionVersion } from "@/lib/session-version";
import { auditLogs, db } from "@/db";
import { logEvent, logWarn } from "@/lib/observability";

export interface AuthResult {
  success: boolean;
  message?: string;
}

// Anti force brute : au-delà de MAX_PIN_FAILURES échecs sur la fenêtre, la connexion est
// suspendue (verrou global : un seul compte gérant ; Cloudflare Access filtre en amont).
const MAX_PIN_FAILURES = 5;
const PIN_LOCK_WINDOW_MS = 15 * 60 * 1000;

async function recentPinFailures(): Promise<number> {
  if (!db) return 0;
  const since = new Date(Date.now() - PIN_LOCK_WINDOW_MS);
  const rows = await db
    .select({ n: count() })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "PIN_ECHEC"), gte(auditLogs.createdAt, since)));
  return rows[0]?.n ?? 0;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
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

  if ((await recentPinFailures()) >= MAX_PIN_FAILURES) {
    logWarn("auth.pin_locked");
    return {
      success: false,
      message: "Trop de tentatives incorrectes. Connexion suspendue 15 minutes.",
    };
  }

  if (!verifyAdminPin(String(pin ?? ""))) {
    logWarn("auth.pin_failed");
    await db.insert(auditLogs).values({
      action: "PIN_ECHEC",
      entityType: "SESSION",
      details: `Code PIN incorrect (IP ${await clientIp()}).`,
    });
    return {
      success: false,
      message: "Code PIN incorrect. Veuillez réessayer.",
    };
  }

  const token = await createSessionToken(await getSessionVersion());
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 3600, // 30 jours de session
    path: "/",
  });

  logEvent("auth.pin_success");
  // Marqueur d'ouverture de session dans le journal des opérations.
  try {
    await db.insert(auditLogs).values({
      action: "CONNEXION",
      entityType: "SESSION",
      details: "Ouverture de session (PIN gérant).",
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
  // Marqueur de fermeture de session (non bloquant).
  try {
    if (db) {
      await db.insert(auditLogs).values({
        action: "DECONNEXION",
        entityType: "SESSION",
        details: "Fermeture de session.",
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
