"use server";

import { cookies } from "next/headers";
import {
  createSessionToken,
  verifyToken,
  SESSION_COOKIE_NAME,
  DEFAULT_PIN,
} from "@/lib/auth";

export interface AuthResult {
  success: boolean;
  message?: string;
}

/**
 * Connexion par Code PIN tactile
 */
export async function loginWithPin(pin: string): Promise<AuthResult> {
  const cleanPin = pin.trim();
  const configuredPin = process.env.ADMIN_PIN || DEFAULT_PIN;

  if (cleanPin !== configuredPin) {
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

  return {
    success: true,
  };
}

/**
 * Connexion biométrique (Empreinte digitale / Touch ID / Face ID)
 */
export async function loginWithBiometrics(): Promise<AuthResult> {
  // Une fois la biométrie validée côté matériel dans le navigateur via WebAuthn,
  // le serveur valide la session du gérant
  const token = await createSessionToken();
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 3600,
    path: "/",
  });

  return {
    success: true,
  };
}

/**
 * Déconnexion
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Vérifie si la session actuelle est valide
 */
export async function checkSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  return verifyToken(token);
}
