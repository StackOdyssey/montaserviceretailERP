import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mode standalone optimisé pour le conteneur Docker et Google Cloud Run
  output: "standalone",
  // Autoriser les images locales et distantes si besoin
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
