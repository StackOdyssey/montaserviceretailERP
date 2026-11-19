import { eq, inArray } from "drizzle-orm";
import { customerProductPrices, customers, productPrices, products } from "@/db";
import type { Tx } from "@/lib/stock-lock";

type DbOrTx = { select: Tx["select"] };

export type PriceSource = "CLIENT" | "LEVEL" | "CATALOG";

export interface ResolvedPrice {
  priceHtCents: number;
  /** Désignation client (clientproduits.designation_fixe) — null = nom catalogue. */
  designation: string | null;
  source: PriceSource;
}

/**
 * Résolution du prix HT pour un client donné — priorité legacy `clientproduits` :
 *   1. customer_product_prices.price_ht_cents (tarif fixé par client)
 *   2. product_prices du price_level par défaut du client (gros/demi-gros)
 *   3. products.sale_price_ht_cents (catalogue public)
 * customerId null → catalogue pur.
 */
export async function resolveCustomerPrices(
  conn: DbOrTx,
  customerId: number | null,
  productIds: number[]
): Promise<Map<number, ResolvedPrice>> {
  const map = new Map<number, ResolvedPrice>();
  const ids = [...new Set(productIds)].filter((id) => id > 0);
  if (ids.length === 0) return map;

  const prods = await conn
    .select({ id: products.id, name: products.name, price: products.salePriceHtCents })
    .from(products)
    .where(inArray(products.id, ids));
  for (const p of prods) {
    map.set(p.id, { priceHtCents: p.price, designation: null, source: "CATALOG" });
  }
  if (!customerId) return map;

  const cust = (
    await conn
      .select({ levelId: customers.defaultPriceLevelId })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)
  )[0];

  if (cust?.levelId) {
    const levelRows = await conn
      .select({ productId: productPrices.productId, price: productPrices.priceHtCents })
      .from(productPrices)
      .where(inArray(productPrices.productId, ids));
    for (const r of levelRows) {
      if (r.price <= 0) continue;
      const cur = map.get(r.productId);
      if (cur) map.set(r.productId, { ...cur, priceHtCents: r.price, source: "LEVEL" });
    }
  }

  const overrides = await conn
    .select({
      productId: customerProductPrices.productId,
      price: customerProductPrices.priceHtCents,
      designation: customerProductPrices.customDesignation,
    })
    .from(customerProductPrices)
    .where(inArray(customerProductPrices.productId, ids));
  for (const o of overrides) {
    if (o.productId === null) continue;
    const cur = map.get(o.productId);
    if (!cur) continue;
    const hasPrice = o.price != null && o.price > 0;
    const hasDesignation = !!o.designation?.trim();
    if (!hasPrice && !hasDesignation) continue;
    map.set(o.productId, {
      priceHtCents: hasPrice ? o.price! : cur.priceHtCents,
      designation: hasDesignation ? o.designation!.trim() : null,
      source: "CLIENT",
    });
  }
  return map;
}
