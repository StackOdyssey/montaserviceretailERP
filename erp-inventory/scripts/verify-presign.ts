// Vérifie la présignature R2 hors-ligne (signature locale, aucun réseau).
// Usage: node --experimental-strip-types scripts/verify-presign.ts  (avec les variables R2_* définies)
import { createPresignedUpload, isStorageConfigured } from "../src/lib/storage.ts";

console.log("configured:", isStorageConfigured());

const r = await createPresignedUpload("image/jpeg", 1024 * 1024);
const u = new URL(r.uploadUrl);
console.log("key:", r.key);
console.log("host:", u.host);
console.log("signed:", u.searchParams.has("X-Amz-Signature"));
console.log("expires:", u.searchParams.get("X-Amz-Expires"));
console.log("publicUrl:", r.publicUrl);

for (const [t, s] of [
  ["image/gif", 1000],
  ["image/jpeg", 50 * 1024 * 1024],
] as const) {
  try {
    await createPresignedUpload(t, s);
    console.log("NEGATIVE FAILED (should have thrown):", t, s);
  } catch (e) {
    console.log("rejected:", t, JSON.stringify(s), "->", (e as Error).message);
  }
}
