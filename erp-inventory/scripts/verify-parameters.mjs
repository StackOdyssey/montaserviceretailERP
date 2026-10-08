// Vérification des paramètres système. Usage: node --env-file=.env.local scripts/verify-parameters.mjs
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(
  /^["']|["']$/g,
  ""
);
const sql = neon(url);

const c = (
  await sql.query(
    `SELECT
       (SELECT count(*)::int FROM settings) AS settings_rows,
       (SELECT count(*)::int FROM expense_categories) AS expense_categories,
       (SELECT count(*)::int FROM payment_methods) AS payment_methods,
       (SELECT count(*)::int FROM numbering_sequences) AS numbering_sequences`
  )
)[0];
console.log("counts:", c);

console.log("\nexpense_categories:");
for (const r of await sql.query(
  "SELECT name, vat_deductible_default AS ded, receipt_required AS req FROM expense_categories ORDER BY sort_order"
)) {
  console.log(` ${String(r.ded).padEnd(5)} ${String(r.req).padEnd(5)} ${r.name}`);
}

console.log("\npayment_methods:");
for (const r of await sql.query("SELECT code, label FROM payment_methods ORDER BY sort_order")) {
  console.log(` ${r.code.padEnd(10)} ${r.label}`);
}

console.log("\nnumbering_sequences:");
for (const r of await sql.query(
  "SELECT doc_type, year, prefix, width, next_number, scope_business_line_id FROM numbering_sequences ORDER BY doc_type"
)) {
  console.log(` ${r.doc_type.padEnd(6)} ${r.year} ${r.prefix}${String(r.next_number).padStart(r.width, "0")} scope=${r.scope_business_line_id}`);
}

console.log("\nsettings (singleton):");
console.log(
  (
    await sql.query(
      `SELECT raison_sociale, legal_form, vat_regime, currency, timezone, locale_default, locale_secondary,
              negative_stock_allowed, cash_daily_threshold_cents, cash_monthly_threshold_cents, number_width,
              bl_prefix, fac_prefix, av_prefix, br_prefix, bc_prefix, devis_prefix
       FROM settings LIMIT 1`
    )
  )[0]
);
