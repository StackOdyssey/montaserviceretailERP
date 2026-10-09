"use server";

import { createPresignedUpload, isStorageConfigured, type PresignedUpload } from "@/lib/storage";

/** URL de dépôt présignée pour une photo produit (le navigateur envoie les octets à R2). */
export async function getPhotoUploadUrl(data: {
  contentType: string;
  sizeBytes: number;
}): Promise<PresignedUpload> {
  return createPresignedUpload(data.contentType, data.sizeBytes);
}

/** Indique si le stockage média (R2) est configuré. */
export async function isPhotoStorageReady(): Promise<boolean> {
  return isStorageConfigured();
}
