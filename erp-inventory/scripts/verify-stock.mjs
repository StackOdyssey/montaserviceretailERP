// Vérification de l'import catalogue/stock. Usage: node --env-file=.env.local scripts/verify-stock.mjs
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(
  /^["']|["']$/g,
  ""
);
const sql = neon(url);

const q = async (text, params) => await sql.query(text, params);

console.log("counts:", {
  products: (await q("SELECT count(*)::int n FROM products"))[0].n,
  with_barcode: (await q("SELECT count(*)::int n FROM products WHERE barcode IS NOT NULL AND barcode <> ''"))[0].n,
  suppliers: (await q("SELECT count(*)::int n FROM suppliers"))[0].n,
  vat_rates: (await q("SELECT count(*)::int n FROM vat_rates"))[0].n,
  price_levels: (await q("SELECT count(*)::int n FROM price_levels"))[0].n,
  product_prices: (await q("SELECT count(*)::int n FROM product_prices"))[0].n,
  stock_movements: (await q("SELECT count(*)::int n FROM stock_movements"))[0].n,
  stock_sum: (await q("SELECT coalesce(sum(current_stock),0)::int n FROM products"))[0].n,
  stock_value_sum_cents: (await q("SELECT coalesce(sum(stock_value_purchase_cents),0)::bigint n FROM products"))[0].n,
});

console.log("\nsample rows:");
const rows = await q(
  `SELECT sku, barcode, name, brand, nature, cost_price_ht_cents, sale_price_ht_cents,
          margin_percent, stock_value_purchase_cents, current_stock, tva_rate
   FROM products ORDER BY sku LIMIT 5`
);
for (const r of rows) console.log(r);

console.log("\ncheck first CSV row (Ref 1001):");
console.log(
  await q("SELECT sku, name, cost_price_ht_cents, sale_price_ht_cents, margin_percent, stock_value_purchase_cents, current_stock FROM products WHERE sku = '1001'")
);

console.log("\ncheck multi-unit row (Ref 1002, CSV qty '2 578'):");
console.log(
  await q("SELECT sku, name, cost_price_ht_cents, sale_price_ht_cents, margin_percent, stock_value_purchase_cents, current_stock FROM products WHERE sku = '1002'")
);
