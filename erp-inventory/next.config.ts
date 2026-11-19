import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mode standalone optimisé pour le conteneur Docker et Google Cloud Run
  output: "standalone",
  // Autorise l'origine du proxy de preview navigateur (127.0.0.1) pour le HMR en dev
  allowedDevOrigins: ["127.0.0.1"],
  // Les Server Actions comparent Origin ↔ Host : le proxy preview envoie
  // origin 127.0.0.1:60498 vers host localhost:3000 — on whitelist l'origine proxy.
  experimental: {
    serverActions: {
      allowedOrigins: ["127.0.0.1:60498", "localhost:60498"],
      // Les photos produit/reçus transitent par les Server Actions (proxy vers R2)
      bodySizeLimit: "8mb",
    },
  },
  // Fige la racine du projet sur erp-inventory/ : le dossier parent
  // (C:\Dev\ERP_System) contient un autre lockfile et des fichiers de
  // référence (exemples, captures, vidéos), ce qui fausse l'inférence
  // automatique de la racine du workspace par Next/Turbopack.
  turbopack: {
    root: __dirname,
  },
  // Trace uniquement les fichiers de l'app dans le build standalone
  // (évite d'embarquer le contenu du dossier parent).
  outputFileTracingRoot: __dirname,
  // Autoriser les images locales et distantes si besoin
  images: {
    unoptimized: true,
  },
  // Masque le header `X-Powered-By: Next.js` (empreinte framework).
  poweredByHeader: false,
  // INTERDICTION D'INDEXATION — appliqué à TOUTES les réponses, quel que soit le domaine
  // (URL Cloud Run actuelle et tout futur domaine acheté). Application interne : ne doit
  // jamais être indexée, suivie ni archivée par les moteurs de recherche.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          // CSP en mode rapport uniquement pour l'instant : observe sans casser.
          // Next exige 'unsafe-inline' (hydration, styles) — le durcissement vient après.
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
