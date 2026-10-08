"use server";

import { getBrowserbase } from "@/lib/browserbase";
import { parseEurMadRate, WISE_EUR_MAD_URL, type FxRateResult } from "@/lib/fx";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cached: { value: FxRateResult; expiresAt: number } | null = null;

/**
 * Récupère le taux de change EUR -> MAD via Browserbase Fetch.
 * Fetch ne lance pas de navigateur complet : rapide et économique.
 * Le résultat est mis en cache 5 minutes afin d'éviter les appels facturés répétés.
 */
export async function getEurMadRate(): Promise<FxRateResult> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const bb = getBrowserbase();

  const response = await bb.fetchAPI.create({
    url: WISE_EUR_MAD_URL,
    format: "markdown",
  });

  if (response.statusCode !== 200) {
    throw new Error(`Browserbase Fetch a échoué (HTTP ${response.statusCode}).`);
  }

  const content = typeof response.content === "string" ? response.content : "";
  const rate = parseEurMadRate(content);

  if (rate === null) {
    throw new Error("Taux EUR/MAD introuvable dans la page récupérée.");
  }

  const value: FxRateResult = {
    base: "EUR",
    quote: "MAD",
    rate,
    sourceUrl: WISE_EUR_MAD_URL,
    fetchedAt: new Date().toISOString(),
  };

  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}
