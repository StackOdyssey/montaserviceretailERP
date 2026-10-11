// Vérifie le compteur gapless (mêmes requêtes que src/lib/numbering.ts) puis nettoie.
// Usage: node --env-file=.env.local scripts/verify-numbering.mjs
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(/^["']|["']$/g, "");
const sql = neon(url);

const docType = "BL";
const year = 2099; // année de test isolée
const scope = 1; // PIECES

async function next() {
  const r = await sql.query(
    `INSERT INTO numbering_sequences (doc_type, year, scope_business_line_id, prefix, width, next_number)
     VALUES ($1,$2,$3,'BL-',5,2)
     ON CONFLICT (doc_type, year, scope_business_line_id)
     DO UPDATE SET next_number = numbering_sequences.next_number + 1, updated_at = now()
     RETURNING next_number - 1 AS assigned, prefix, width`,
    [docType, year, scope]
  );
  const row = r[0];
  const seq = Number(row.assigned);
  return `${row.prefix}${year}-${String(seq).padStart(Number(row.width), "0")}`;
}

await sql.query("DELETE FROM numbering_sequences WHERE doc_type=$1 AND year=$2 AND scope_business_line_id=$3", [docType, year, scope]);
console.log("call 1:", await next());
console.log("call 2:", await next());
console.log("call 3:", await next());
// concurrence : 10 appels en parallèle doivent donner 10 numéros distincts
const conc = await Promise.all(Array.from({ length: 10 }, () => next()));
console.log("parallel distinct:", new Set(conc).size, "of 10");
await sql.query("DELETE FROM numbering_sequences WHERE doc_type=$1 AND year=$2 AND scope_business_line_id=$3", [docType, year, scope]);
console.log("cleaned up");
