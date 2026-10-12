// Sauvegarde quotidienne : export complet des tables publiques vers Cloudflare R2
// + manifeste SHA-256 en base. Usage :
//   node --env-file=.env.local scripts/backup-to-r2.mjs
// Variables : DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
import { neon } from "@neondatabase/serverless";
import { AwsClient } from "aws4fetch";
import { createHash } from "node:crypto";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(/^["']|["']$/g, "");
const account = process.env.R2_ACCOUNT_ID ?? "";
const bucket = process.env.R2_BUCKET ?? "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";

if (!url) throw new Error("DATABASE_URL manquant");
if (!account || !bucket || !accessKeyId || !secretAccessKey) {
  throw new Error("Configuration R2 incomplète (R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)");
}

// Question ouverte « Retention-Q4 » : archivage append-only. Tant que la durée de
// conservation n'est pas tranchée par le comptable, ce script NE PURGE RIEN.
if (process.env.BACKUP_RETENTION_DAYS) {
  console.warn(
    "[backup] BACKUP_RETENTION_DAYS ignoré — durée de conservation non tranchée (Q4). Aucune purge effectuée."
  );
}

const sql = neon(url);
const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });

const tableRows = await sql.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
);

const tables = {};
let docCount = 0;
for (const { table_name } of tableRows) {
  const rows = await sql.query(`SELECT * FROM "${table_name}"`);
  tables[table_name] = rows;
  if (table_name === "sales_documents") docCount = rows.length;
}

const generatedAt = new Date().toISOString();
const periodLabel = generatedAt.slice(0, 7); // YYYY-MM
const payload = JSON.stringify({ generatedAt, tables }, null, 0);

const sha256 = createHash("sha256").update(payload, "utf8").digest("hex");
const sizeBytes = Buffer.byteLength(payload, "utf8");
const key = `backups/${generatedAt.slice(0, 10)}/erp-export.json`;

const putUrl = new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`);
putUrl.searchParams.set("X-Amz-Expires", "3600");
const signed = await client.sign(
  new Request(putUrl, { method: "PUT", headers: { "content-type": "application/json" } }),
  { aws: { signQuery: true } }
);
const put = await fetch(signed.url, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: payload,
});
if (!put.ok) throw new Error(`Échec de l'envoi R2 (${put.status})`);

await sql.query(
  "INSERT INTO archive_manifests (period_label, object_key, sha256, size_bytes, doc_count) VALUES ($1,$2,$3,$4,$5)",
  [periodLabel, key, sha256, sizeBytes, docCount]
);

console.log(`Sauvegarde OK : ${key}`);
console.log(`  tables     : ${tableRows.length}`);
console.log(`  taille     : ${(sizeBytes / 1024).toFixed(1)} Ko`);
console.log(`  documents  : ${docCount}`);
console.log(`  sha256     : ${sha256}`);
