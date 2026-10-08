import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mode standalone optimisé pour le conteneur Docker et Google Cloud Run
  output: "standalone",
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
};

export default nextConfig;
