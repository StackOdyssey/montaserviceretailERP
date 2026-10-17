// Validation complète d'un cookie de session : signature, expiration, version non révoquée.
// Partagée par le proxy, le layout racine et l'action checkSession.
import { parseSession, verifyToken } from "@/lib/auth";
import { getSessionVersion } from "@/lib/session-version";

/** Fail-closed : base injoignable = session refusée. */
export async function isLiveSession(token: string | undefined): Promise<boolean> {
  if (!token || !(await verifyToken(token))) return false;
  try {
    return parseSession(token)?.v === (await getSessionVersion());
  } catch {
    return false;
  }
}
