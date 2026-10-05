// Module d'authentification légère, rapide et sécurisée pour BM Motors
// Supporte l'empreinte digitale / Face ID (WebAuthn) et le code PIN tactile

const SESSION_COOKIE_NAME = "bm_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "bm-motors-secret-casablanca-2026-sarl-key";
const DEFAULT_PIN = process.env.ADMIN_PIN || "2026"; // Code PIN par défaut pour le gérant

/**
 * Génère une signature HMAC SHA-256 pour le cookie de session
 */
async function signToken(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return `${payload}.${hashHex}`;
}

/**
 * Vérifie l'authenticité d'un token de session
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const [payload, hashHex] = token.split(".");
    if (!payload || !hashHex) return false;

    const data = JSON.parse(atob(payload));
    // Vérifier l'expiration (30 jours)
    if (Date.now() > data.exp) return false;

    const expected = await signToken(payload);
    return token === expected;
  } catch {
    return false;
  }
}

/**
 * Crée un cookie de session valide 30 jours
 */
export async function createSessionToken(): Promise<string> {
  const payloadData = {
    user: "gerant",
    role: "ADMIN",
    exp: Date.now() + 30 * 24 * 3600 * 1000, // 30 jours
  };
  const payloadStr = btoa(JSON.stringify(payloadData));
  return signToken(payloadStr);
}

export { SESSION_COOKIE_NAME, DEFAULT_PIN };
