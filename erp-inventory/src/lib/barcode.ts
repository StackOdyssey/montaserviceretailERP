/**
 * Génération / validation EAN-13 pour les étiquettes produits.
 * Préfixe interne "20" : plage 200–299 réservée par GS1 aux usages en magasin
 * (in-store), donc jamais en collision avec un code-barres fabricant.
 */

export const INTERNAL_EAN13_PREFIX = "20";

export function ean13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = digits12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** Vrai pour les codes internes générés par nous ("20" + 10 chiffres + clé). */
export function isInternalEan13(code: string): boolean {
  return isValidEan13(code) && code.startsWith(INTERNAL_EAN13_PREFIX);
}

/** Construit un EAN-13 interne à partir d'un compteur (clé de contrôle calculée). */
export function buildInternalEan13(seq: number): string {
  const base = INTERNAL_EAN13_PREFIX + String(seq).padStart(10, "0").slice(-10);
  return base + String(ean13CheckDigit(base));
}

/** Format JsBarcode le plus sûr pour un code donné (EAN-13 exige une clé valide). */
export function barcodeFormat(code: string): "EAN13" | "CODE128" {
  return isValidEan13(code) ? "EAN13" : "CODE128";
}
