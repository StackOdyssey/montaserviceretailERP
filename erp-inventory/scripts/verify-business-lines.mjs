// Vérification lignes métier + verrou TVA FAC/AV. Usage: node --env-file=.env.local scripts/verify-business-lines.mjs
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(
  /^["']|["']$/g,
  ""
);
const sql = neon(url);

const lines = await sql.query("SELECT id, code, display_name, sort_order FROM business_lines ORDER BY sort_order");
console.log("business_lines:", lines);

const matrix = await sql.query(
  `SELECT bl.code, s.doc_type, s.show_vat, s.price_basis, s.show_discount
   FROM business_line_document_settings s
   JOIN business_lines bl ON bl.id = s.business_line_id
   ORDER BY bl.sort_order, s.doc_type`
);
console.log("\nsettings matrix:");
for (const m of matrix) console.log(` ${m.code.padEnd(10)} ${m.doc_type.padEnd(6)} show_vat=${m.show_vat} basis=${m.price_basis}`);

const counts = await sql.query(
  `SELECT
     (SELECT count(*)::int FROM business_line_document_settings) AS settings_rows,
     (SELECT count(*)::int FROM products WHERE business_line_id IS NULL) AS products_null_line,
     (SELECT count(*)::int FROM products) AS products_total,
     (SELECT count(DISTINCT business_line_id)::int FROM products) AS products_lines,
     (SELECT count(*)::int FROM stock_movements WHERE business_line_id IS NULL) AS movements_null_line,
     (SELECT count(*)::int FROM stock_movements) AS movements_total`
);
console.log("\ncounts:", counts[0]);

// Doit échouer : FAC/AV ne peuvent pas masquer la TVA (CHECK constraint).
try {
  await sql.query("UPDATE business_line_document_settings SET show_vat = false WHERE doc_type = 'FAC'");
  console.log("\nCHECK FAC/AV: FAILED — update was accepted (constraint not enforced)");
} catch (e) {
  console.log("\nCHECK FAC/AV: OK — update rejected:", String(e.message).split("\n")[0]);
}
