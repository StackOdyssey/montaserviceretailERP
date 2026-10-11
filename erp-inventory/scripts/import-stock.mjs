// Import du catalogue + stock BestWay ("BestWay  Etat du Stock.csv") vers Neon.
// Toutes les valeurs du CSV sont insérées telles quelles (pas de recalcul de T.Marge % ni de Val_PA_HT).
// Usage: node --env-file=.env.local scripts/import-stock.mjs "<chemin csv>"
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const CSV_PATH =
  process.argv[2] ||
  "C:\\Dev\\ERP_System\\References_\\Stock\\BestWay  Etat du Stock.csv";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(
  /^["']|["']$/g,
  ""
);
if (!url) {
  console.error("DATABASE_URL manquant (utiliser --env-file=.env.local)");
  process.exit(1);
}
const sql = neon(url);

const BLANKS = /[\s\u00A0\u202F]+/g;
const toInt = (s) => {
  const c = String(s ?? "").replace(BLANKS, "");
  const n = Number(c);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const toCents = (s) => {
  const c = String(s ?? "").replace(BLANKS, "").replace(",", ".");
  const n = Number(c);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const toNumOrNull = (s) => {
  const c = String(s ?? "").replace(BLANKS, "").replace("%", "").replace(",", ".");
  if (c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
};

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines.shift().split(",").map((h) => h.trim());
  const rows = lines.map((l) => l.split(","));
  return { header, rows };
}

async function main() {
  const { header, rows } = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const idx = {};
  header.forEach((h, i) => (idx[h] = i));
  const col = (r, name) => {
    const i = idx[name];
    return i === undefined ? "" : (r[i] ?? "");
  };

  // Ligne métier cible (v3 : products/price_levels/stock_movements exigent business_line_id)
  const lineRow = await sql.query("SELECT id FROM business_lines WHERE code = 'PIECES' LIMIT 1");
  const lineId = lineRow[0]?.id;
  if (!lineId) {
    console.error("Ligne métier PIECES introuvable — appliquez d'abord les migrations.");
    process.exit(1);
  }

  // --- Référentiels ---
  const seedVat = [
    { label: "TVA 20%", rate: 20, active: true, def: true },
    { label: "TVA 10%", rate: 10, active: true, def: false },
    { label: "TVA 0% (Exonéré)", rate: 0, active: true, def: false },
    { label: "TVA 7%", rate: 7, active: false, def: false },
    { label: "TVA 14%", rate: 14, active: false, def: false },
  ];
  for (const v of seedVat) {
    const existing = await sql.query("SELECT id FROM vat_rates WHERE rate_percent = $1 LIMIT 1", [v.rate]);
    if (existing.length === 0) {
      await sql.query(
        "INSERT INTO vat_rates (label, rate_percent, is_active, is_default) VALUES ($1,$2,$3,$4)",
        [v.label, v.rate, v.active, v.def]
      );
    }
  }
  const vatDefault = await sql.query(
    "SELECT id FROM vat_rates WHERE rate_percent = 20 ORDER BY id LIMIT 1"
  );
  const vatRateId = vatDefault[0]?.id ?? null;

  let whId = (await sql.query("SELECT id FROM warehouses WHERE code = 'ENTREPOT_PRINCIPAL' LIMIT 1"))[0]?.id;
  if (!whId) {
    whId = (await sql.query(
      "INSERT INTO warehouses (code, name, is_default) VALUES ('ENTREPOT_PRINCIPAL', 'Entrepôt Principal', true) RETURNING id"
    ))[0].id;
  }

  let grosId = (await sql.query("SELECT id FROM price_levels WHERE business_line_id = $1 AND code = 'GROS' LIMIT 1", [lineId]))[0]?.id;
  if (!grosId) {
    grosId = (await sql.query(
      "INSERT INTO price_levels (business_line_id, code, label, is_default) VALUES ($1, 'GROS', 'Gros', true) RETURNING id",
      [lineId]
    ))[0].id;
  }
  for (const lvl of [
    { code: "SEMI_GROS", label: "Semi-gros", def: false },
  ]) {
    const ex = await sql.query("SELECT id FROM price_levels WHERE business_line_id = $1 AND code = $2 LIMIT 1", [
      lineId,
      lvl.code,
    ]);
    if (ex.length === 0) {
      await sql.query(
        "INSERT INTO price_levels (business_line_id, code, label, is_default) VALUES ($1,$2,$3,$4)",
        [lineId, lvl.code, lvl.label, lvl.def]
      );
    }
  }

  const supplierIdByName = new Map();
  async function supplierId(name) {
    const key = (name || "").trim() || "FOURNISSEUR PAR DEFAUT";
    if (supplierIdByName.has(key)) return supplierIdByName.get(key);
    const ex = await sql.query("SELECT id FROM suppliers WHERE name = $1 LIMIT 1", [key]);
    let id;
    if (ex.length > 0) id = ex[0].id;
    else id = (await sql.query("INSERT INTO suppliers (name) VALUES ($1) RETURNING id", [key]))[0].id;
    supplierIdByName.set(key, id);
    return id;
  }

  // --- Boucle produits ---
  let created = 0;
  let updated = 0;
  let processed = 0;
  for (const r of rows) {
    const sku = col(r, "Ref").trim();
    if (!sku) continue;
    const quantity = toInt(col(r, "Quantité"));
    const costCents = toCents(col(r, "C.R HT"));
    const saleCents = toCents(col(r, "P.V HT"));
    const margin = toNumOrNull(col(r, "T.Marge %"));
    const stockValueCents = toCents(col(r, "Val_PA_HT"));
    const supId = await supplierId(col(r, "Fournisseur"));

    const res = await sql.query(
      `INSERT INTO products
        (sku, barcode, name, brand, nature, business_line_id, supplier_id, warehouse_id, vat_rate_id, tva_rate,
         cost_price_ht_cents, last_purchase_price_cents, cmup_cents, sale_price_ht_cents, margin_percent, stock_value_purchase_cents,
         current_stock, unit, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$14,$6,$7,$8,20,$9,$9,$9,$10,$11,$12,$13,'PIECE',true, now())
       ON CONFLICT (sku) DO UPDATE SET
         barcode = EXCLUDED.barcode,
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         nature = EXCLUDED.nature,
         business_line_id = EXCLUDED.business_line_id,
         supplier_id = EXCLUDED.supplier_id,
         warehouse_id = EXCLUDED.warehouse_id,
         vat_rate_id = EXCLUDED.vat_rate_id,
         cost_price_ht_cents = EXCLUDED.cost_price_ht_cents,
         last_purchase_price_cents = EXCLUDED.last_purchase_price_cents,
         cmup_cents = EXCLUDED.cmup_cents,
         sale_price_ht_cents = EXCLUDED.sale_price_ht_cents,
         margin_percent = EXCLUDED.margin_percent,
         stock_value_purchase_cents = EXCLUDED.stock_value_purchase_cents,
         current_stock = EXCLUDED.current_stock,
         updated_at = now()
       RETURNING id, (xmax = 0) AS inserted`,
      [
        sku,
        col(r, "Code Barre").trim(),
        col(r, "Designation").trim(),
        col(r, "Marque").trim() || null,
        col(r, "Nature").trim() || null,
        supId,
        whId,
        vatRateId,
        costCents,
        saleCents,
        margin,
        stockValueCents,
        quantity,
        lineId,
      ]
    );
    const productId = res[0].id;
    if (res[0].inserted) created++;
    else updated++;

    // Niveau de prix par défaut (GROS) = P.V HT
    await sql.query(
      `INSERT INTO product_prices (product_id, price_level_id, price_ht_cents)
       VALUES ($1,$2,$3)
       ON CONFLICT (product_id, price_level_id) DO UPDATE SET price_ht_cents = EXCLUDED.price_ht_cents`,
      [productId, grosId, saleCents]
    );

    // Mouvement de stock initial (idempotent)
    await sql.query(
      "DELETE FROM stock_movements WHERE product_id = $1 AND movement_type = 'STOCK_INITIAL'",
      [productId]
    );
    await sql.query(
      `INSERT INTO stock_movements
        (product_id, business_line_id, movement_type, quantity, unit_cost_cents, source_document_type, reason)
       VALUES ($1,$5,'STOCK_INITIAL',$2,$3,'IMPORT',$4)`,
      [productId, quantity, costCents, `Import BestWay État du Stock — ${sku}`, lineId]
    );

    processed++;
    if (processed % 50 === 0) console.log(`  ... ${processed}/${rows.length}`);
  }

  console.log(`OK: ${processed} lignes — produits créés: ${created}, mis à jour: ${updated}`);
  console.log(`Référentiels: vat_rates=${(await sql.query("SELECT count(*)::int AS n FROM vat_rates"))[0].n}, warehouses=${(await sql.query("SELECT count(*)::int AS n FROM warehouses"))[0].n}, price_levels=${(await sql.query("SELECT count(*)::int AS n FROM price_levels"))[0].n}, suppliers=${(await sql.query("SELECT count(*)::int AS n FROM suppliers"))[0].n}`);
}

main().catch((e) => {
  console.error("ERREUR:", e.message);
  process.exit(1);
});
