/**
 * Upload des photos produits legacy vers R2 + backfill photo_url.
 *
 *   node scripts/migration/upload-legacy-photos.mjs          # dry-run (compte seulement)
 *   node scripts/migration/upload-legacy-photos.mjs --apply  # upload + update DB
 *
 * Requiert : R2_* dans .env.local, MIGRATION_DATABASE_URL (sinon .env.local),
 * LEGACY_MYSQL_PASSWORD, LEGACY_PHOTOS_DIR dans .env.local.
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { AwsClient } from 'aws4fetch';
import { neon } from '@neondatabase/serverless';

const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const PHOTOS_DIR = env.LEGACY_PHOTOS_DIR;
const PUBLIC_BASE = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
const S3_BASE = env.R2_S3_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const sql = neon(process.env.MIGRATION_DATABASE_URL || env.DATABASE_URL);

const my = await mysql.createConnection({
  host: '127.0.0.1', port: 3307, user: 'root',
  password: process.env.LEGACY_MYSQL_PASSWORD ?? '', database: 'Bestway_BMM',
});
const [produits] = await my.query(`SELECT id, reference, photo FROM produit WHERE photo IS NOT NULL AND photo != ''`);
await my.end();

const findFile = (name) => {
  for (const sub of ['produits0', 'produits']) {
    const p = path.join(PHOTOS_DIR, sub, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

// NE PAS RÉUTILISER TEL QUEL — les dossiers produits0/produits contiennent le
// catalogue photo du site grossiste montaservice.net, pas celui du retail.
// produit.photo n'est qu'un motif « <id>.jpg » : pour les références du
// catalogue montaservice (1001–1427) le fichier montre un produit DIFFÉRENT
// du produit retail portant le même id (vérifié visuellement : retail 1001
// SOUPAPE BASHAN → photo CDI LIFA MOTO ; 1007 CYLNDER BASHAN → piston LIFA).
// Ces 427 images étrangères ont été supprimées de R2 et photo_url mis à NULL
// (2026-11-27). Seules les images hors de cette plage (1428+) correspondent
// réellement aux produits retail — elles sont déjà uploadées.
const MONTA_CATALOG_RANGE = [1001, 1427]; // refs montaservice.net — photos étrangères
const isContaminated = (reference) => {
  const n = Number(reference);
  return n >= MONTA_CATALOG_RANGE[0] && n <= MONTA_CATALOG_RANGE[1];
};

const client = new AwsClient({
  accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  service: 's3', region: 'auto',
});

let uploaded = 0, missing = 0, updated = 0, errors = 0;
const CONCURRENCY = 10;
const queue = produits.filter((p) => !isContaminated(p.reference) && findFile(p.photo));
const skipped = produits.filter((p) => isContaminated(p.reference));
missing = produits.length - queue.length - skipped.length;
if (skipped.length) console.log(`${skipped.length} refs exclues (plage montaservice ${MONTA_CATALOG_RANGE.join('–')})`);

for (let i = 0; i < queue.length; i += CONCURRENCY) {
  await Promise.all(queue.slice(i, i + CONCURRENCY).map(async (p) => {
    const file = findFile(p.photo);
    const key = `products/${p.photo}`;
    try {
      if (APPLY) {
        const body = fs.readFileSync(file);
        const res = await client.fetch(`${S3_BASE}/${env.R2_BUCKET}/${key}`, {
          method: 'PUT',
          headers: { 'content-type': 'image/jpeg', 'content-length': String(body.length) },
          body,
        });
        if (!res.ok) { errors++; console.error(`PUT ${key}: ${res.status}`); return; }
        uploaded++;
      }
      const r = await sql`UPDATE products SET photo_url=${`${PUBLIC_BASE}/${key}`}
        WHERE sku=${String(p.reference)} AND photo_url IS NULL`;
      if (r.length === 0 || r.count > 0) updated++;
    } catch (e) { errors++; console.error(`${p.reference}: ${e.message}`); }
  }));
  if (APPLY && i % 100 === 0) console.log(`${i}/${queue.length}…`);
}

console.log(JSON.stringify({
  legacyFlagged: produits.length,
  fileFound: queue.length,
  fileMissing: missing,
  uploaded: APPLY ? uploaded : '(dry)',
  photoUrlBackfilled: updated,
  errors,
}, null, 2));
