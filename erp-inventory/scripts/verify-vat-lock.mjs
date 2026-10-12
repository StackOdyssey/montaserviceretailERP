// Test d'invariant §5.4 : une FACTURE (ou AVOIR) ne peut jamais masquer la TVA.
// Vérifie que la contrainte CHECK sales_documents_fac_av_show_vat est bien active.
// Usage : node --env-file=.env.local scripts/verify-vat-lock.mjs
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL manquant");
const sql = neon(url);

const line = (await sql.query("SELECT id FROM business_lines ORDER BY id LIMIT 1"))[0];
if (!line) throw new Error("Aucune ligne métier — exécuter les migrations/seed d'abord");

const tag = `VATLOCK-${Date.now()}`;
let hiddenRejected = false;
let shownAccepted = false;

// 1) FACTURE + vat_display HIDDEN -> doit être rejeté par la contrainte CHECK (23514)
try {
  await sql.query(
    `INSERT INTO sales_documents (doc_type, doc_number, business_line_id, doc_year, sequence_no, vat_display)
     VALUES ('FACTURE', $1, $2, 2026, 999999, 'HIDDEN')`,
    [`${tag}-H`, line.id]
  );
} catch (e) {
  hiddenRejected = e.code === "23514" || /check constraint/i.test(String(e.message));
}

// 2) FACTURE + vat_display SHOWN -> accepté puis nettoyé
try {
  await sql.query(
    `INSERT INTO sales_documents (doc_type, doc_number, business_line_id, doc_year, sequence_no, vat_display)
     VALUES ('FACTURE', $1, $2, 2026, 999998, 'SHOWN')`,
    [`${tag}-S`, line.id]
  );
  shownAccepted = true;
  await sql.query("DELETE FROM sales_documents WHERE doc_number = $1", [`${tag}-S`]);
} catch {
  shownAccepted = false;
}

console.log(`FACTURE masquant la TVA rejetée : ${hiddenRejected ? "OUI" : "NON"}`);
console.log(`FACTURE affichant la TVA acceptée : ${shownAccepted ? "OUI" : "NON"}`);

if (!hiddenRejected || !shownAccepted) {
  console.error("ÉCHEC du test d'invariant TVA FAC/AV");
  process.exit(1);
}
console.log("OK — invariant TVA FAC/AV respecté");
