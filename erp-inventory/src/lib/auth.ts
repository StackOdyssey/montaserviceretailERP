// Authentification légère et sécurisée pour BM Motors.
// Aucun secret codé en dur : SESSION_SECRET et ADMIN_PIN proviennent de l'environnement.
// (Le déverrouillage biométrique réel (WebAuthn/FIDO2) reste à implémenter.)

const SESSION_COOKIE_NAME = "bm_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 jours

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET manquant ou trop faible (minimum 32 caractères).");
  }
  return secret;
}

/** Comparaison en temps constant (évite les attaques temporelles). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Génère une signature HMAC SHA-256 pour le cookie de session.
 */
async function signToken(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hashHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${payload}.${hashHex}`;
}

/**
 * Vérifie l'authenticité d'un token de session (signature + expiration).
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const [payload, hashHex] = token.split(".");
    if (!payload || !hashHex) return false;

    const data = JSON.parse(atob(payload));
    if (typeof data.exp !== "number" || Date.now() > data.exp) return false;

    const expected = await signToken(payload);
    return timingSafeEqual(token, expected);
  } catch {
    return false;
  }
}

/**
 * Crée un cookie de session valide 30 jours.
 */
export async function createSessionToken(): Promise<string> {
  const payloadData = {
    user: "gerant",
    role: "ADMIN",
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadStr = btoa(JSON.stringify(payloadData));
  return signToken(payloadStr);
}

/**
 * Compare en temps constant le PIN saisi au PIN configuré (env.ADMIN_PIN).
 * Échoue (retourne false) si ADMIN_PIN n'est pas configuré — aucun PIN par défaut.
 */
export function verifyAdminPin(pin: string): boolean {
  const configured = process.env.ADMIN_PIN;
  if (!configured) return false;
  return timingSafeEqual(pin.trim(), configured);
}

export { SESSION_COOKIE_NAME };
