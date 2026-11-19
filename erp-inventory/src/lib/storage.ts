// Stockage média — Cloudflare R2 (S3-compatible). Deux chemins de dépôt :
// - uploadObject : le serveur pousse les octets (Server Action proxy) — chemin
//   utilisé par l'app, aucun CORS navigateur requis.
// - createPresignedUpload : URL signée pour PUT direct navigateur → R2 — gardé
//   pour les scripts de vérification et un éventuel usage sur des origines
//   autorisées par le CORS du bucket.
import { AwsClient } from "aws4fetch";
import { BusinessError } from "@/lib/action-result";

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

function r2Client(): AwsClient {
  return new AwsClient({
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
}

function validateImageUpload(contentType: string, sizeBytes: number): void {
  if (!isStorageConfigured()) {
    throw new BusinessError("STORAGE_NOT_CONFIGURED: configuration R2 manquante");
  }
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    throw new BusinessError("TYPE_NON_AUTORISE: format image non supporté (JPEG, PNG, WebP, AVIF)");
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    throw new BusinessError("TAILLE_INVALIDE: image vide ou trop volumineuse (max 20 Mo)");
  }
}

function buildKey(contentType: string, prefix: string): string {
  const ext = contentType.split("/")[1] ?? "bin";
  return `${prefix}/${crypto.randomUUID()}.${ext}`;
}

function objectUrl(key: string): string {
  return `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
}

export interface StoredUpload {
  key: string;
  publicUrl: string;
}

/** Dépose un objet dans R2 depuis le serveur (proxy — pas de CORS navigateur). */
export async function uploadObject(
  contentType: string,
  bytes: ArrayBuffer,
  prefix = "products"
): Promise<StoredUpload> {
  validateImageUpload(contentType, bytes.byteLength);
  const key = buildKey(contentType, prefix);
  const res = await r2Client().fetch(objectUrl(key), {
    method: "PUT",
    headers: { "content-type": contentType },
    body: bytes,
  });
  if (!res.ok) {
    throw new BusinessError(`R2_UPLOAD_${res.status}: dépôt refusé par le stockage`);
  }
  return { key, publicUrl: `${PUBLIC_BASE_URL}/${key}` };
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
  validateImageUpload(contentType, sizeBytes);
  const key = buildKey(contentType, prefix);
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(TTL_SECONDS));
  const signed = await r2Client().sign(
    new Request(url, { method: "PUT", headers: { "content-type": contentType } }),
    { aws: { signQuery: true } }
  );
  return { key, uploadUrl: signed.url, publicUrl: `${PUBLIC_BASE_URL}/${key}` };
}
