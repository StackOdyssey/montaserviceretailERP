// Garde d'authentification pour les Server Actions.
// Toute action de mutation doit exiger une session valide (défense en profondeur,
// en plus du filtrage proxy/middleware).
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifyToken } from "@/lib/auth";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("NON_AUTORISE: session invalide ou expirée");
    this.name = "NotAuthenticatedError";
  }
}

/** Lève NotAuthenticatedError si la requête n'a pas de session valide. */
export async function assertAuthenticated(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
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
