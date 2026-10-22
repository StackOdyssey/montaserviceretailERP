import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mode standalone optimisé pour le conteneur Docker et Google Cloud Run
  output: "standalone",
  // Dev only : autorise l'origine du tunnel Cloudflare (tests navigateur cloud
  // type Browserbase/Stagehand) à joindre les ressources dev et Server Actions.
  allowedDevOrigins: ["*.trycloudflare.com"],
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
        ],
      },
    ];
  },
};

export default nextConfig;
