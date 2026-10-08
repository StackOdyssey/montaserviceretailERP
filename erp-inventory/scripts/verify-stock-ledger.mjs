// Vérification schéma Phase 2. Usage: node --env-file=.env.local scripts/verify-stock-ledger.mjs
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(
  /^["']|["']$/g,
  ""
);
const sql = neon(url);

console.log("price_levels:");
for (const r of await sql.query(
  `SELECT bl.code AS line, pl.code, pl.label, pl.is_default
   FROM price_levels pl JOIN business_lines bl ON bl.id = pl.business_line_id
   ORDER BY bl.sort_order, pl.code`
)) {
  console.log(` ${r.line.padEnd(10)} ${r.code.padEnd(10)} ${r.label} default=${r.is_default}`);
}

console.log("\ncounts:", (
  await sql.query(
    `SELECT
       (SELECT count(*)::int FROM stock_units) AS stock_units,
       (SELECT count(*)::int FROM stock_counts) AS stock_counts,
       (SELECT count(*)::int FROM stock_count_lines) AS stock_count_lines,
       (SELECT count(*)::int FROM products WHERE cmup_cents <> cost_price_ht_cents) AS cmup_mismatch,
       (SELECT count(*)::int FROM products WHERE last_purchase_price_cents <> cost_price_ht_cents) AS lastcost_mismatch`
  )
)[0]);
