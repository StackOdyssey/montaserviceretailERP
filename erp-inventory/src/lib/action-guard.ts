// Garde d'authentification pour les Server Actions.
// Toute action de mutation doit exiger une session valide (défense en profondeur,
// en plus du filtrage proxy/middleware).
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, parseSession, verifyToken } from "@/lib/auth";
import { getSessionVersion } from "@/lib/session-version";
import { logWarn } from "@/lib/observability";

// Rôles autorisés aux mutations. En attendant le RBAC complet (Phase 10), seul le
// propriétaire détient ces rôles : tout le reste est refusé (fail-closed).
const OWNER_ROLES = new Set(["ADMIN", "OWNER"]);

export class NotAuthenticatedError extends Error {
  constructor() {
    super("NON_AUTORISE: session invalide ou expirée");
    this.name = "NotAuthenticatedError";
  }
}

/** Lève NotAuthenticatedError si la requête n'a pas de session valide, non révoquée ET owner. */
export async function assertAuthenticated(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    logWarn("auth.denied", { reason: "invalid_token" });
    throw new NotAuthenticatedError();
  }
  const session = parseSession(token);
  if (!session || !OWNER_ROLES.has(session.role)) {
    logWarn("auth.denied", { reason: "insufficient_role", role: session?.role ?? null });
    throw new NotAuthenticatedError();
  }
  if (session.v !== (await getSessionVersion())) {
    logWarn("auth.denied", { reason: "revoked_session" });
    throw new NotAuthenticatedError();
  }
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
