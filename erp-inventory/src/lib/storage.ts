// Stockage média — Cloudflare R2 (S3-compatible). La signature se fait côté serveur ;
// le navigateur dépose directement dans R2. Les octets ne passent jamais par Cloud Run.
import { AwsClient } from "aws4fetch";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const BUCKET = process.env.R2_BUCKET ?? "";
const PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
const MAX_BYTES = Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024); // 20 MB
const TTL_SECONDS = Number(process.env.MEDIA_URL_TTL_SECONDS ?? 600);

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export function isStorageConfigured(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET && PUBLIC_BASE_URL);
}

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  publicUrl: string;
}

/** Crée une URL de dépôt présignée (PUT direct navigateur → R2). */
export async function createPresignedUpload(
  contentType: string,
  sizeBytes: number,
  prefix = "products"
): Promise<PresignedUpload> {
  if (!isStorageConfigured()) throw new Error("STORAGE_NOT_CONFIGURED");
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    throw new Error("TYPE_NON_AUTORISE");
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    throw new Error("TAILLE_INVALIDE");
  }

  const ext = contentType.split("/")[1] ?? "bin";
  const key = `${prefix}/${crypto.randomUUID()}.${ext}`;

  const client = new AwsClient({
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  const url = new URL(`https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`);
  url.searchParams.set("X-Amz-Expires", String(TTL_SECONDS));

  const signed = await client.sign(
    new Request(url, { method: "PUT", headers: { "content-type": contentType } }),
    { aws: { signQuery: true } }
  );

  return { key, uploadUrl: signed.url, publicUrl: `${PUBLIC_BASE_URL}/${key}` };
}
