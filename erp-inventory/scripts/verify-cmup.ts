// Vérifie le cycle CMUP BR -> VENTE -> AVOIR sur la branche dev, puis nettoie.
// Usage: node --experimental-strip-types --env-file=.env.local scripts/verify-cmup.ts
import { neon } from "@neondatabase/serverless";
import { applyMovement, type CmupState } from "../src/lib/stock.ts";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(
  /^["']|["']$/g,
  ""
);
const sql = neon(url);

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ok:", msg);
}

async function movement(
  productId: number,
  businessLineId: number,
  kind: string,
  signedQty: number,
  unitCostCents: number
) {
  await sql.query(
    `INSERT INTO stock_movements (product_id, business_line_id, movement_type, quantity, unit_cost_cents, source_document_type, reason)
     VALUES ($1,$2,$3,$4,$5,'TEST','verify-cmup')`,
    [productId, businessLineId, kind, signedQty, unitCostCents]
  );
}

async function main() {
  const pl = (await sql.query("SELECT id FROM business_lines WHERE code='PIECES'"))[0].id;
  const wh = (await sql.query("SELECT id FROM warehouses ORDER BY id LIMIT 1"))[0].id;
  const vat = (await sql.query("SELECT id FROM vat_rates WHERE rate_percent=20 LIMIT 1"))[0].id;
  const sku = "__CMUP_TEST__";

  await sql.query("DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE sku=$1)", [sku]);
  await sql.query("DELETE FROM product_prices WHERE product_id IN (SELECT id FROM products WHERE sku=$1)", [sku]);
  await sql.query("DELETE FROM products WHERE sku=$1", [sku]);

  const productId = (
    await sql.query(
      `INSERT INTO products (sku,name,business_line_id,warehouse_id,vat_rate_id,tva_rate,cost_price_ht_cents,last_purchase_price_cents,cmup_cents,sale_price_ht_cents,current_stock)
       VALUES ($1,'CMUP TEST',$2,$3,$4,20,0,0,0,0,0) RETURNING id`,
      [sku, pl, wh, vat]
    )
  )[0].id;

  let state: CmupState = { quantity: 0, cmupCents: 0 };

  let r = applyMovement(state, +10, 1000);
  state = r.state;
  await movement(productId, pl, "ACHAT_RECEPTION", 10, 1000);
  assert(state.quantity === 10 && state.cmupCents === 1000, "BR 10@10,00 -> qte 10, CMUP 10,00");

  r = applyMovement(state, +10, 1200);
  state = r.state;
  await movement(productId, pl, "ACHAT_RECEPTION", 10, 1200);
  assert(state.quantity === 20 && state.cmupCents === 1100, "BR 10@12,00 -> qte 20, CMUP 11,00");

  r = applyMovement(state, -5, 0);
  state = r.state;
  await movement(productId, pl, "VENTE", -5, state.cmupCents);
  assert(state.quantity === 15 && r.cogsCents === 5500, "VENTE 5 -> qte 15, COGS 55,00");

  r = applyMovement(state, +2, 1100);
  state = r.state;
  await movement(productId, pl, "AVOIR_RETOUR", 2, 1100);
  assert(state.quantity === 17 && state.cmupCents === 1100, "AVOIR retour 2@11,00 -> qte 17, CMUP 11,00");

  await sql.query("UPDATE products SET current_stock=$2, cmup_cents=$3 WHERE id=$1", [
    productId,
    state.quantity,
    state.cmupCents,
  ]);
  const p = (await sql.query("SELECT current_stock, cmup_cents FROM products WHERE id=$1", [productId]))[0];
  assert(p.current_stock === 17 && p.cmup_cents === 1100, "persisté en base: qte 17, CMUP 11,00");

  const ledger = (
    await sql.query("SELECT coalesce(sum(quantity),0)::int AS qty FROM stock_movements WHERE product_id=$1", [productId])
  )[0];
  assert(ledger.qty === 17, "grand livre: somme quantités = 17");

  await sql.query("DELETE FROM stock_movements WHERE product_id=$1", [productId]);
  await sql.query("DELETE FROM products WHERE id=$1", [productId]);
  console.log("\nOK — cycle BR -> VENTE -> AVOIR : CMUP correct. Données de test nettoyées.");
}

main().catch((e) => {
  console.error("ERREUR:", e.message);
  process.exit(1);
});
