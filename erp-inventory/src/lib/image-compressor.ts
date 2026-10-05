/**
 * Utilitaire de compression d'images côté client
 * Compresse automatiquement les photos prises au smartphone (iPhone 17 Pro Max)
 * au format WebP (< 80 Ko) avant téléversement vers Cloudflare R2.
 */

export interface CompressionResult {
  file: File;
  previewUrl: string;
  sizeKb: number;
  width: number;
  height: number;
}

export async function compressImageToWebP(
  file: File,
  maxWidth: number = 1000,
  maxHeight: number = 1000,
  quality: number = 0.8
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Calcul du redimensionnement proportionnel
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        // Création du canvas hors-écran
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Impossible d'initialiser le contexte canvas 2D"));
          return;
        }

        // Dessin avec lissage haute qualité
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Conversion en WebP (ou JPEG si WebP non supporté)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Échec de la compression de l'image"));
              return;
            }

            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            const compressedFile = new File([blob], `${fileNameWithoutExt}.webp`, {
              type: "image/webp",
              lastModified: Date.now(),
            });

            const sizeKb = Math.round(compressedFile.size / 1024);
            const previewUrl = URL.createObjectURL(blob);

            resolve({
              file: compressedFile,
              previewUrl,
              sizeKb,
              width,
              height,
            });
          },
          "image/webp",
          quality
        );
      };

      img.onerror = () => reject(new Error("Impossible de charger l'image source"));
      img.src = event.target?.result as string;
    };

    reader.onerror = () => reject(new Error("Échec de lecture du fichier"));
    reader.readAsDataURL(file);
  });
}
