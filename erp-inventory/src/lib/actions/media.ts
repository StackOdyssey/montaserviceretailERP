"use server";

import { isStorageConfigured, uploadObject } from "@/lib/storage";
import { assertAuthenticated } from "@/lib/action-guard";
import { actionResult, BusinessError, type ActionResult } from "@/lib/action-result";

/** Dépose une photo dans R2 via le serveur (les octets transitent par l'action). */
export async function uploadPhoto(
  formData: FormData
): Promise<ActionResult<{ publicUrl: string }>> {
  await assertAuthenticated();
  return actionResult(async () => {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new BusinessError("Aucun fichier reçu.");
    }
    const contentType = file.type || "image/webp";
    const bytes = await file.arrayBuffer();
    const { publicUrl } = await uploadObject(contentType, bytes);
    return { publicUrl };
  });
}

/** Indique si le stockage média (R2) est configuré. */
export async function isPhotoStorageReady(): Promise<boolean> {
  await assertAuthenticated();
  return isStorageConfigured();
}
