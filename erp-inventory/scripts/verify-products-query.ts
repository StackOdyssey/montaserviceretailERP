// Vérifie la requête catalogue (mêmes patterns drizzle que getProducts).
// Usage: node --experimental-strip-types --env-file=.env.local scripts/verify-products-query.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, asc, eq, ilike, or, sql, gte } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { products, categories, businessLines } from "../src/db/schema.ts";

const url = (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "").replace(
  /^["']|["']$/g,
  ""
);
const db = drizzle(neon(url), { schema });

const line = await db
  .select({ id: businessLines.id })
  .from(businessLines)
  .where(eq(businessLines.code, "PIECES"))
  .limit(1);
const lineId = line[0].id;

async function query(search: string, stockFilter: "all" | "low" | "negative") {
  const conds = [eq(products.businessLineId, lineId), eq(products.isActive, true)];
  if (search) {
    const like = `%${search}%`;
    conds.push(
      or(
        ilike(products.sku, like),
        ilike(products.oemCode, like),
        ilike(products.name, like),
        ilike(products.brand, like),
        ilike(products.shelfLocation, like)
      )!
    );
  }
  if (stockFilter === "low")
    conds.push(sql`${products.currentStock} <= ${products.minStockAlert}`, gte(products.currentStock, 0));
  if (stockFilter === "negative") conds.push(sql`${products.currentStock} < 0`);
  return db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      brand: products.brand,
      categoryName: categories.name,
      cmupCents: products.cmupCents,
      salePriceHtCents: products.salePriceHtCents,
      tvaRate: products.tvaRate,
      currentStock: products.currentStock,
      minStockAlert: products.minStockAlert,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conds))
    .orderBy(asc(products.sku))
    .limit(500);
}

const all = await query("", "all");
console.log("all:", all.length);
console.log("sample:", all[0]);
const piston = await query("PISTON", "all");
console.log("search 'PISTON':", piston.length);
const neg = await query("", "negative");
console.log("negative stock:", neg.length);
const low = await query("", "low");
console.log("low stock:", low.length);
