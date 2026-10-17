// Authentification légère et sécurisée pour BM Motors.
// Aucun secret codé en dur : SESSION_SECRET et ADMIN_PIN proviennent de l'environnement.
// Comparaisons en temps constant via node:crypto (le proxy Next 16 s'exécute sur Node.js).
import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

const SESSION_COOKIE_NAME = "bm_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 jours
const HMAC_BYTES = 32; // SHA-256

function hmac(data: string): Buffer {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(data).digest();
}

/**
 * Vérifie l'authenticité d'un token de session (signature + expiration).
 * Signature comparée octet à octet en temps constant (longueur fixe de 32 octets).
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const [payload, hashHex, extra] = token.split(".");
    if (!payload || !hashHex || extra !== undefined) return false;

    const received = Buffer.from(hashHex, "hex");
    if (received.length !== HMAC_BYTES) return false;
    if (!timingSafeEqual(received, hmac(payload))) return false;

    const data = JSON.parse(atob(payload));
    return typeof data.exp === "number" && Date.now() <= data.exp;
  } catch {
    return false;
  }
}

/**
 * Crée un cookie de session valide 30 jours, lié à la version de session courante
 * (incrémenter `settings.session_version` révoque toutes les sessions émises).
 */
export async function createSessionToken(version: number): Promise<string> {
  const payloadStr = btoa(
    JSON.stringify({ user: "gerant", role: "ADMIN", v: version, exp: Date.now() + SESSION_TTL_MS })
  );
  return `${payloadStr}.${hmac(payloadStr).toString("hex")}`;
}

/**
 * Compare en temps constant le PIN saisi au PIN configuré (env.ADMIN_PIN).
 * Les deux valeurs sont d'abord réduites à un HMAC de longueur fixe : ni le contenu
 * ni la longueur du PIN ne fuient. Échoue si ADMIN_PIN n'est pas configuré.
 */
export function verifyAdminPin(pin: string): boolean {
  let configured: string;
  try {
    configured = getEnv().ADMIN_PIN;
  } catch {
    return false;
  }
  return timingSafeEqual(hmac(`pin:${pin.trim()}`), hmac(`pin:${configured}`));
}

export interface SessionInfo {
  user: string;
  role: string;
  /** Version de session (révocation globale). */
  v: number;
  exp: number;
}

/**
 * Décode le payload d'une session **sans vérifier la signature**.
 * À n'utiliser qu'après `verifyToken()` (défense en profondeur : signature puis rôle).
 */
export function parseSession(token: string): SessionInfo | null {
  try {
    const [payload] = token.split(".");
    if (!payload) return null;
    const data = JSON.parse(atob(payload));
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    return {
      user: String(data.user ?? ""),
      role: String(data.role ?? ""),
      // Jetons émis avant l'introduction de la version : version initiale (1).
      v: typeof data.v === "number" ? data.v : 1,
      exp: data.exp,
    };
  } catch {
    return null;
  }
}

export { SESSION_COOKIE_NAME };
