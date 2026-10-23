// Garde d'authentification pour les Server Actions.
// Toute action de mutation doit exiger une session valide (défense en profondeur,
// en plus du filtrage proxy/middleware).
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE_NAME, parseSession, verifyToken, type SessionInfo } from "@/lib/auth";
import { getSessionVersion } from "@/lib/session-version";
import { logWarn } from "@/lib/observability";
import { db, users } from "@/db";

// Rôles gérant (mutations sensibles : paramètres, clôtures, annulations, utilisateurs).
// CAISSIER : opérations quotidiennes (ventes, encaissements, réceptions, stock).
const OWNER_ROLES = new Set(["ADMIN", "OWNER", "GERANT"]);
const KNOWN_ROLES = new Set([...OWNER_ROLES, "CAISSIER"]);

export class NotAuthenticatedError extends Error {
  constructor() {
    super("NON_AUTORISE: session invalide ou expirée");
    this.name = "NotAuthenticatedError";
  }
}

async function resolveSession(): Promise<SessionInfo> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    logWarn("auth.denied", { reason: "invalid_token" });
    throw new NotAuthenticatedError();
  }
  const session = parseSession(token);
  if (!session || !KNOWN_ROLES.has(session.role)) {
    logWarn("auth.denied", { reason: "insufficient_role", role: session?.role ?? null });
    throw new NotAuthenticatedError();
  }
  if (session.v !== (await getSessionVersion())) {
    logWarn("auth.denied", { reason: "revoked_session" });
    throw new NotAuthenticatedError();
  }
  // Session nominative : l'utilisateur doit toujours être actif (désactivation
  // immédiate, sans attendre la révocation globale ou l'expiration du jeton).
  if (session.uid !== null) {
    if (!db) {
      logWarn("auth.denied", { reason: "db_unavailable" });
      throw new NotAuthenticatedError();
    }
    const u = (
      await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, session.uid)).limit(1)
    )[0];
    if (!u?.isActive) {
      logWarn("auth.denied", { reason: "user_deactivated", uid: session.uid });
      throw new NotAuthenticatedError();
    }
  }
  return session;
}

/**
 * Exige une session valide et non révoquée (tout rôle connu).
 * Retourne l'identité de session (utile pour l'attribution dans les journaux).
 */
export async function assertAuthenticated(): Promise<SessionInfo> {
  return resolveSession();
}

/**
 * Exige une session gérant (ADMIN_PIN maître ou utilisateur GERANT actif).
 * À utiliser sur les mutations sensibles : paramètres, clôtures, annulations,
 * gestion des utilisateurs.
 */
export async function assertOwner(): Promise<SessionInfo> {
  const session = await resolveSession();
  if (!OWNER_ROLES.has(session.role)) {
    logWarn("auth.denied", { reason: "owner_required", role: session.role, user: session.user });
    throw new NotAuthenticatedError();
  }
  return session;
}

/**
 * Nom d'affichage de l'utilisateur courant pour l'attribution dans les journaux
 * (lecture du jeton déjà signé — pas de re-vérification DB).
 */
export async function currentActor(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) return null;
  return parseSession(token)?.user ?? null;
}

/** Enveloppe une Server Action pour exiger une session authentifiée. */
export function authenticatedAction<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    await assertAuthenticated();
    return fn(...args);
  };
}
