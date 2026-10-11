"use server";

import { createPresignedUpload, isStorageConfigured, type PresignedUpload } from "@/lib/storage";
import { assertAuthenticated } from "@/lib/action-guard";

/** URL de dépôt présignée pour une photo produit (le navigateur envoie les octets à R2). */
export async function getPhotoUploadUrl(data: {
  contentType: string;
  sizeBytes: number;
}): Promise<PresignedUpload> {
  await assertAuthenticated();
  return createPresignedUpload(data.contentType, data.sizeBytes);
}

/** Indique si le stockage média (R2) est configuré. */
export async function isPhotoStorageReady(): Promise<boolean> {
  return isStorageConfigured();
}
