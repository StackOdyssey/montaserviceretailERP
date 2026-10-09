"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { businessLines, db, products, stockUnits } from "@/db";

export type UnitStatus = "IN_STOCK" | "RESERVED" | "SOLD" | "RETURNED";

export interface SerializedProductDTO {
  id: number;
  sku: string;
  name: string;
  brand: string | null;
  salePriceHtCents: number;
  tvaRate: number;
  currentStock: number;
  cmupCents: number;
}

export interface StockUnitDTO {
  id: number;
  productId: number;
  sku: string;
  productName: string;
  serialNo: string;
  engineNo: string | null;
  colour: string | null;
  modelYear: number | null;
  status: string;
  unitCostCents: number;
  createdAt: Date | null;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

async function lineIdByCode(code: string): Promise<number | null> {
  const d = requireDb();
  const rows = await d
    .select({ id: businessLines.id })
    .from(businessLines)
    .where(eq(businessLines.code, code))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Le stock d'un produit sérialisé = nombre d'unités en stock (le registre d'unités est le grand livre). */
async function recomputeSerializedStock(productId: number) {
  const d = requireDb();
  const agg = (
    await d
      .select({
        qty: sql<number>`count(*) filter (where ${stockUnits.status} = 'IN_STOCK')::int`,
        value: sql<number>`coalesce(sum(${stockUnits.unitCostCents}) filter (where ${stockUnits.status} = 'IN_STOCK'), 0)::int`,
      })
      .from(stockUnits)
      .where(eq(stockUnits.productId, productId))
  )[0];
  await d
    .update(products)
    .set({
      currentStock: agg?.qty ?? 0,
      stockValuePurchaseCents: agg?.value ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));
}

/** Produits sérialisés (véhicules) d'une ligne. */
export async function getSerializedProducts(
  businessLineCode = "VEHICULES"
): Promise<SerializedProductDTO[]> {
  const d = requireDb();
  const lineId = await lineIdByCode(businessLineCode);
  if (!lineId) return [];
  return d
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      brand: products.brand,
      salePriceHtCents: products.salePriceHtCents,
      tvaRate: products.tvaRate,
      currentStock: products.currentStock,
      cmupCents: products.cmupCents,
    })
    .from(products)
    .where(
      and(
        eq(products.businessLineId, lineId),
        eq(products.isSerialized, true),
        eq(products.isActive, true)
      )
    )
    .orderBy(asc(products.sku));
}

/** Registre des unités sérialisées (châssis/VIN), filtrable par ligne ou produit. */
export async function getStockUnits(opts?: {
  businessLineCode?: string;
  productId?: number;
}): Promise<StockUnitDTO[]> {
  const d = requireDb();
  const conds = [];
  if (opts?.businessLineCode) {
    const lineId = await lineIdByCode(opts.businessLineCode);
    if (!lineId) return [];
    conds.push(eq(stockUnits.businessLineId, lineId));
  }
  if (opts?.productId) conds.push(eq(stockUnits.productId, opts.productId));

  return d
    .select({
      id: stockUnits.id,
      productId: stockUnits.productId,
      sku: products.sku,
      productName: products.name,
      serialNo: stockUnits.serialNo,
      engineNo: stockUnits.engineNo,
      colour: stockUnits.colour,
      modelYear: stockUnits.modelYear,
      status: stockUnits.status,
      unitCostCents: stockUnits.unitCostCents,
      createdAt: stockUnits.createdAt,
    })
    .from(stockUnits)
    .innerJoin(products, eq(stockUnits.productId, products.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(products.sku), asc(stockUnits.serialNo));
}

/** Enregistre une unité sérialisée (châssis/VIN) et recalcule le stock du produit. */
export async function createStockUnit(data: {
  productId: number;
  serialNo: string;
  engineNo?: string;
  colour?: string;
  modelYear?: number;
  unitCostCents?: number;
}): Promise<{ id: number }> {
  const d = requireDb();
  const serialNo = data.serialNo.trim();
  if (!serialNo) throw new Error("NUMERO_SERIE_OBLIGATOIRE");

  const p = (
    await d.select().from(products).where(eq(products.id, data.productId)).limit(1)
  )[0];
  if (!p) throw new Error("PIECE_INTROUVABLE");
  if (!p.isSerialized) throw new Error("PRODUIT_NON_SERIALISE");

  const dup = (
    await d.select({ id: stockUnits.id }).from(stockUnits).where(eq(stockUnits.serialNo, serialNo)).limit(1)
  )[0];
  if (dup) throw new Error("NUMERO_SERIE_EXISTANT");

  const inserted = await d
    .insert(stockUnits)
    .values({
      productId: p.id,
      businessLineId: p.businessLineId,
      serialNo,
      engineNo: data.engineNo ?? null,
      colour: data.colour ?? null,
      modelYear: data.modelYear ?? null,
      status: "IN_STOCK",
      unitCostCents: data.unitCostCents ?? p.cmupCents,
    })
    .returning({ id: stockUnits.id });

  await recomputeSerializedStock(p.id);
  return { id: inserted[0].id };
}

/** Met à jour les caractéristiques ou le statut d'une unité. */
export async function updateStockUnit(data: {
  id: number;
  engineNo?: string;
  colour?: string;
  modelYear?: number;
  unitCostCents?: number;
  status?: UnitStatus;
}): Promise<void> {
  const d = requireDb();
  const unit = (await d.select().from(stockUnits).where(eq(stockUnits.id, data.id)).limit(1))[0];
  if (!unit) throw new Error("UNITE_INTROUVABLE");

  const patch: Partial<typeof stockUnits.$inferInsert> = { updatedAt: new Date() };
  if (data.engineNo !== undefined) patch.engineNo = data.engineNo || null;
  if (data.colour !== undefined) patch.colour = data.colour || null;
  if (data.modelYear !== undefined) patch.modelYear = data.modelYear;
  if (data.unitCostCents !== undefined) patch.unitCostCents = data.unitCostCents;
  if (data.status !== undefined) patch.status = data.status;

  await d.update(stockUnits).set(patch).where(eq(stockUnits.id, data.id));
  await recomputeSerializedStock(unit.productId);
}

/** Supprime une unité (registre) et recalcule le stock. */
export async function deleteStockUnit(id: number): Promise<void> {
  const d = requireDb();
  const unit = (await d.select().from(stockUnits).where(eq(stockUnits.id, id)).limit(1))[0];
  if (!unit) return;
  await d.delete(stockUnits).where(eq(stockUnits.id, id));
  await recomputeSerializedStock(unit.productId);
}
