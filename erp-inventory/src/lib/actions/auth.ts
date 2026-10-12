"use server";

import { cookies } from "next/headers";
import {
  createSessionToken,
  verifyToken,
  verifyAdminPin,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { logEvent, logWarn } from "@/lib/observability";

export interface AuthResult {
  success: boolean;
  message?: string;
}

/**
 * Connexion par code PIN (comparaison en temps constant, exp. ADMIN_PIN requis).
 */
export async function loginWithPin(pin: string): Promise<AuthResult> {
  if (!process.env.ADMIN_PIN) {
    return {
      success: false,
      message: "Accès non configuré. Contactez l'administrateur.",
    };
  }

  if (!verifyAdminPin(pin)) {
    logWarn("auth.pin_failed");
    return {
      success: false,
      message: "Code PIN incorrect. Veuillez réessayer.",
    };
  }

  const token = await createSessionToken();
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 3600, // 30 jours de session
    path: "/",
  });

  logEvent("auth.pin_success");
  return { success: true };
}

/**
 * Connexion biométrique — DÉSACTIVÉE (fail-closed).
 * Aucune session n'est émise sans vérification WebAuthn/FIDO2 côté serveur.
 */
export async function loginWithBiometrics(): Promise<AuthResult> {
  return {
    success: false,
    message: "Déverrouillage biométrique indisponible.",
  };
}

/**
 * Déconnexion.
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Vérifie si la session actuelle est valide.
 */
export async function checkSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  return verifyToken(token);
}
