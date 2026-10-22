// Agent navigateur IA basé sur @browserbasehq/stagehand (v4).
// Pilote l'ERP par instructions en langage naturel (act / observe / extract).
// - Local par défaut (Chrome local via localBrowser.launch)
// - Cloud Browserbase si STAGEHAND_ENV=BROWSERBASE et BROWSERBASE_API_KEY renseignée
//
// Exécution : npm run stagehand -- [url] ["instruction"]
import { Stagehand, browserbase, localBrowser } from "@browserbasehq/stagehand";
import { z } from "zod";

const targetUrl = process.argv[2] || process.env.ERP_BASE_URL || "http://localhost:3100/login";
const instructions = process.argv.slice(3);

async function main() {
  const useBrowserbase =
    process.env.STAGEHAND_ENV === "BROWSERBASE" && Boolean(process.env.BROWSERBASE_API_KEY);

  const browser = useBrowserbase
    ? await browserbase.launch({
        apiKey: process.env.BROWSERBASE_API_KEY!,
        projectId: process.env.BROWSERBASE_PROJECT_ID,
      })
    : await localBrowser.launch({
        headless: process.env.HEADLESS !== "false",
      });

  const modelApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY;

  const modelName = (process.env.STAGEHAND_MODEL || "google/gemini-3.8-flash") as
    | `google/${string}`
    | `openai/${string}`
    | `anthropic/${string}`;

  if (useBrowserbase && browser.sessionId) {
    console.log(`[Stagehand] Session dashboard : https://browserbase.com/sessions/${browser.sessionId}`);
    try {
      const res = await fetch(
        `https://api.browserbase.com/v1/sessions/${browser.sessionId}/debug`,
        { headers: { "x-bb-api-key": process.env.BROWSERBASE_API_KEY! } }
      );
      if (res.ok) {
        const urls = (await res.json()) as { debuggerFullscreenUrl?: string; debuggerUrl?: string };
        console.log(`[Stagehand] LIVE VIEW (ouvre pour regarder en direct) : ${urls.debuggerFullscreenUrl}`);
      }
    } catch {
      // non bloquant : la session fonctionne sans l'URL de debug
    }
  }

  const stagehand = await Stagehand.create({
    browser,
    ...(modelApiKey
      ? {
          model: {
            modelName,
            apiKey: modelApiKey,
          },
        }
      : {}),
  });

  try {
    const pages = await stagehand.browser.context.pages();
    const page = pages[0] ?? (await stagehand.browser.context.newPage());

    console.log(`[Stagehand] Navigation vers ${targetUrl} (${useBrowserbase ? "Browserbase Cloud" : "Local"})...`);
    await page.goto(targetUrl);

    if (instructions.length > 0) {
      for (const raw of instructions) {
        if (raw.startsWith("wait:")) {
          const ms = Number(raw.slice(5)) || 2000;
          console.log(`[Stagehand] Attente ${ms}ms...`);
          await new Promise((resolve) => setTimeout(resolve, ms));
        } else if (raw.startsWith("goto:")) {
          const url = raw.slice(5).trim();
          console.log(`[Stagehand] Navigation : ${url}`);
          await page.goto(url);
        } else if (raw.startsWith("extract:")) {
          const instruction = raw.slice(8).trim();
          console.log(`[Stagehand] Extraction : ${instruction}`);
          const extracted = await stagehand.extract(
            instruction,
            z.object({ result: z.string() })
          );
          console.log("[Stagehand] Données extraites :", extracted.data);
        } else {
          const instruction = raw.replace(/^act:/, "").trim();
          console.log(`[Stagehand] Action : ${instruction}`);
          const res = await stagehand.act(instruction);
          console.log("[Stagehand] Résultat :", res);
        }
      }
    } else {
      const extracted = await stagehand.extract(
        "Extrait le titre principal et le texte d'instruction affiché sur l'écran de connexion.",
        z.object({
          heading: z.string(),
          promptText: z.string(),
        })
      );
      console.log("[Stagehand] Données extraites :", extracted.data);
    }
  } finally {
    // close() peut rester bloqué sur le teardown du navigateur local : on n'attend pas plus de 8s.
    await Promise.race([
      stagehand.close(),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[Stagehand] Erreur :", err);
  process.exit(1);
});
