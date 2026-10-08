export const WISE_EUR_MAD_URL =
  "https://wise.com/gb/currency-converter/eur-to-mad-rate";

export interface FxRateResult {
  base: "EUR";
  quote: "MAD";
  rate: number;
  sourceUrl: string;
  fetchedAt: string;
}

/**
 * Extrait le taux EUR -> MAD depuis le markdown de Wise, ex. "€1 EUR = 11.22 MAD".
 * Retourne null si le taux est introuvable.
 */
export function parseEurMadRate(content: string): number | null {
  const match = content.match(/1\s*EUR\s*=\s*([\d]+(?:[.,]\d+)?)\s*MAD/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
