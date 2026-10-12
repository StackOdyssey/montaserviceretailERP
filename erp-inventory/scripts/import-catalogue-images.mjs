// Import des photos catalogue (CatalogueImages/<sku>.jpg) vers Cloudflare R2 et
// renseigne products.photo_url. Usage :
//   node --env-file=.env.local scripts/import-catalogue-images.mjs [dir]
import { neon } from "@neondatabase/serverless";
import { AwsClient } from "aws4fetch";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename, extname } from "node:path";

const dir = process.argv[2] || "C:\\Dev\\ERP_System\\CatalogueImages";
const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(/^["']|["']$/g, "");
const sql = neon(url);

const account = process.env.R2_ACCOUNT_ID ?? "";
const bucket = process.env.R2_BUCKET ?? "";
const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
const client = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  service: "s3",
  region: "auto",
});

const CT = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif" };

let ok = 0;
let miss = 0;
let fail = 0;

for (const f of readdirSync(dir)) {
  const ext = extname(f).toLowerCase();
  const ct = CT[ext];
  if (!ct) continue;
  const sku = basename(f, ext);

  const prod = await sql.query("SELECT id FROM products WHERE sku = $1 LIMIT 1", [sku]);
  if (prod.length === 0) {
    miss++;
    console.log("  no product for SKU", sku);
    continue;
  }

  const bytes = readFileSync(join(dir, f));
  const key = `products/${crypto.randomUUID()}${ext}`;
  const u = new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`);
  u.searchParams.set("X-Amz-Expires", "600");
  const signed = await client.sign(
    new Request(u, { method: "PUT", headers: { "content-type": ct } }),
    { aws: { signQuery: true } }
  );
  const put = await fetch(signed.url, { method: "PUT", headers: { "content-type": ct }, body: bytes });
  if (!put.ok) {
    fail++;
    console.log("  upload failed", sku, put.status);
    continue;
  }
  await sql.query("UPDATE products SET photo_url = $1, updated_at = now() WHERE sku = $2", [
    `${publicBase}/${key}`,
    sku,
  ]);
  ok++;
}

console.log(`done — linked: ${ok}, no-product: ${miss}, failed: ${fail}`);
