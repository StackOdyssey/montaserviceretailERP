/**
 * Recadrage client : dessine la zone visible choisie dans le cropper
 * (react-easy-crop) sur un canvas et renvoie un File image/jpeg prêt
 * à passer à compressImageToWebP.
 */

export interface CropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image à recadrer"));
    img.src = src;
  });
}

export async function cropImageToFile(
  imageSrc: string,
  crop: CropAreaPixels,
  originalName: string
): Promise<File> {
  const img = await loadImage(imageSrc);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible d'initialiser le contexte canvas 2D");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Échec du recadrage de l'image"));
          return;
        }
        const base = originalName.replace(/\.[^/.]+$/, "") || "photo";
        resolve(new File([blob], `${base}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.95
    );
  });
}
