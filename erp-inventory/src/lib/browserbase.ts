import Browserbase from "@browserbasehq/sdk";

let client: Browserbase | null = null;

/**
 * Client Browserbase partagé (singleton).
 * La clé BROWSERBASE_API_KEY identifie à elle seule le projet :
 * aucun BROWSERBASE_PROJECT_ID n'est nécessaire.
 */
export function getBrowserbase(): Browserbase {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) {
    throw new Error("BROWSERBASE_API_KEY est absent de l'environnement.");
  }
  if (!client) {
    client = new Browserbase({ apiKey });
  }
  return client;
}
