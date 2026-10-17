"use server";

import { and, asc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { businessLines, categories, db, products, settings, stockMovements } from "@/db";

export interface CategoryItem {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
}
import { applyMovement, type CmupState } from "@/lib/stock";
import { assertAuthenticated } from "@/lib/action-guard";
import { lockProducts } from "@/lib/stock-lock";

export interface ProductItem {
  id: number;
  sku: string;
  oemCode: string | null;
  name: string;
  brand: string | null;
  categoryId: number | null;
  categoryName?: string;
  purchasePriceCents: number;
  salePriceRetailCents: number;
  salePriceWholesaleCents: number | null;
  tvaRate: number;
  minStockAlert: number;
  currentStock: number;
  shelfLocation: string | null;
  barcode: string | null;
  photoUrl: string | null;
  isActive: boolean;
  businessLineId?: number;
  businessLineCode?: string;
  cmupCents?: number;
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

async function ensureCategory(name: string): Promise<number | null> {
  const d = requireDb();
  const existing = await d
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await d
    .insert(categories)
    .values({ name })
    .returning({ id: categories.id });
  return inserted[0]?.id ?? null;
}

type ProductLike = {
  id: number;
  sku: string;
  oemCode: string | null;
  name: string;
  brand: string | null;
  categoryId: number | null;
  cmupCents: number;
  salePriceHtCents: number;
  tvaRate: number;
  minStockAlert: number;
  currentStock: number;
  shelfLocation: string | null;
  barcode: string | null;
  photoUrl: string | null;
  isActive: boolean;
  businessLineId: number;
};

function rawToItem(r: ProductLike, lineCode: string, categoryName?: string | null): ProductItem {
  return {
    id: r.id,
    sku: r.sku,
    oemCode: r.oemCode,
    name: r.name,
    brand: r.brand,
    categoryId: r.categoryId,
    categoryName: categoryName ?? undefined,
    purchasePriceCents: r.cmupCents,
    salePriceRetailCents: r.salePriceHtCents,
    salePriceWholesaleCents: null,
    tvaRate: r.tvaRate,
    minStockAlert: r.minStockAlert,
    currentStock: r.currentStock,
    shelfLocation: r.shelfLocation,
    barcode: r.barcode,
    photoUrl: r.photoUrl,
    isActive: r.isActive,
    businessLineId: r.businessLineId,
    businessLineCode: lineCode,
    cmupCents: r.cmupCents,
  };
}

/**
 * Récupère les pièces du catalogue filtrées par ligne métier (défaut PIECES).
 */
export async function getProducts(options?: {
  search?: string;
  category?: string;
  categoryId?: number;
  stockFilter?: "all" | "low" | "negative";
  businessLineCode?: string;
}): Promise<ProductItem[]> {
  await assertAuthenticated();
  const d = requireDb();
  const lineCode = options?.businessLineCode || "PIECES";
  const lineId = await lineIdByCode(lineCode);
  if (!lineId) return [];

  const search = options?.search?.trim() || "";
  const stockFilter = options?.stockFilter || "all";
  const categoryName = options?.category || "";
  const categoryId = options?.categoryId;

  const conds = [eq(products.businessLineId, lineId), eq(products.isActive, true)];
  if (search) {
    const like = `%${search}%`;
    conds.push(
      or(
        ilike(products.sku, like),
        ilike(products.oemCode, like),
        ilike(products.name, like),
        ilike(products.brand, like),
        ilike(products.shelfLocation, like),
        ilike(products.barcode, like)
      )!
    );
  }
  if (stockFilter === "low")
    conds.push(sql`${products.currentStock} <= ${products.minStockAlert}`, gte(products.currentStock, 0));
  if (stockFilter === "negative") conds.push(sql`${products.currentStock} < 0`);
  if (categoryName) conds.push(eq(categories.name, categoryName));
  if (categoryId) conds.push(eq(products.categoryId, categoryId));

  const rows = await d
    .select({
      id: products.id,
      sku: products.sku,
      oemCode: products.oemCode,
      name: products.name,
      brand: products.brand,
      categoryId: products.categoryId,
      categoryName: categories.name,
      costPriceHtCents: products.costPriceHtCents,
      lastPurchasePriceCents: products.lastPurchasePriceCents,
      cmupCents: products.cmupCents,
      salePriceHtCents: products.salePriceHtCents,
      tvaRate: products.tvaRate,
      minStockAlert: products.minStockAlert,
      currentStock: products.currentStock,
      shelfLocation: products.shelfLocation,
      barcode: products.barcode,
      photoUrl: products.photoUrl,
      isActive: products.isActive,
      businessLineId: products.businessLineId,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conds))
    .orderBy(asc(products.sku))
    .limit(500);

  return rows.map((r) => rawToItem(r, lineCode, r.categoryName));
}

/**
 * Récupère toutes les catégories de pièces.
 */
export async function getCategories(): Promise<CategoryItem[]> {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    sortOrder: r.sortOrder ?? 0,
  }));
}

/**
 * Crée ou met à jour une pièce (upsert par id ou par sku).
 */
export async function saveProduct(data: {
  id?: number;
  sku: string;
  oemCode?: string;
  name: string;
  brand?: string;
  categoryName?: string;
  purchasePriceCents: number;
  salePriceRetailCents: number;
  salePriceWholesaleCents?: number;
  tvaRate?: number;
  minStockAlert: number;
  currentStock: number;
  shelfLocation?: string;
  barcode?: string;
  photoUrl?: string;
  businessLineCode?: string;
}): Promise<ProductItem> {
  await assertAuthenticated();
  const d = requireDb();
  const lineCode = data.businessLineCode || "PIECES";
  const lineId = await lineIdByCode(lineCode);
  if (!lineId) throw new Error("LIGNE_METIER_INTROUVABLE");

  const categoryId = data.categoryName ? await ensureCategory(data.categoryName) : null;

  const values = {
    sku: data.sku.trim(),
    oemCode: data.oemCode ?? null,
    name: data.name.trim(),
    brand: data.brand ?? null,
    businessLineId: lineId,
    categoryId,
    tvaRate: data.tvaRate ?? 20,
    costPriceHtCents: data.purchasePriceCents,
    lastPurchasePriceCents: data.purchasePriceCents,
    cmupCents: data.purchasePriceCents,
    salePriceHtCents: data.salePriceRetailCents,
    minStockAlert: data.minStockAlert,
    currentStock: data.currentStock,
    shelfLocation: data.shelfLocation ?? null,
    barcode: data.barcode ?? null,
    photoUrl: data.photoUrl ?? null,
    updatedAt: new Date(),
  };

  let savedId: number;
  if (data.id) {
    const r = await d
      .update(products)
      .set(values)
      .where(eq(products.id, data.id))
      .returning({ id: products.id });
    savedId = r[0]?.id ?? data.id;
  } else {
    const r = await d
      .insert(products)
      .values(values)
      .onConflictDoUpdate({ target: products.sku, set: values })
      .returning({ id: products.id });
    savedId = r[0].id;
  }

  return {
    id: savedId,
    sku: values.sku,
    oemCode: values.oemCode,
    name: values.name,
    brand: values.brand,
    categoryId,
    categoryName: data.categoryName,
    purchasePriceCents: values.cmupCents,
    salePriceRetailCents: values.salePriceHtCents,
    salePriceWholesaleCents: null,
    tvaRate: values.tvaRate,
    minStockAlert: values.minStockAlert,
    currentStock: values.currentStock,
    shelfLocation: values.shelfLocation,
    barcode: values.barcode,
    photoUrl: values.photoUrl,
    isActive: true,
    businessLineId: lineId,
    businessLineCode: lineCode,
    cmupCents: values.cmupCents,
  };
}

/**
 * Enregistre un mouvement de stock (append-only) et met à jour stock + CMUP.
 * Bloque le stock négatif sauf si `settings.negative_stock_allowed`.
 */
export async function recordStockMovement(data: {
  productId: number;
  movementType: "ACHAT_RECEPTION" | "VENTE_BL" | "AVOIR_RETOUR" | "AJUSTEMENT_INVENTAIRE";
  quantity: number; // positif = entrée, négatif = sortie
  reason: string;
  unitCostCents?: number;
}): Promise<ProductItem> {
  await assertAuthenticated();
  const d = requireDb();
  // Lecture verrouillée + écriture dans la même transaction (pas de mise à jour perdue).
  const { p, next } = await d.transaction(async (tx) => {
    await lockProducts(tx, [data.productId]);
    const p = (await tx.select().from(products).where(eq(products.id, data.productId)).limit(1))[0];
    if (!p) throw new Error("PIECE_INTROUVABLE");

    const state: CmupState = { quantity: p.currentStock, cmupCents: p.cmupCents };
    const inboundCost = data.quantity > 0 ? data.unitCostCents ?? p.cmupCents : 0;
    const { state: next } = applyMovement(state, data.quantity, inboundCost);

    if (next.quantity < 0) {
      const s = await tx.select({ neg: settings.negativeStockAllowed }).from(settings).limit(1);
      if (!s[0]?.neg) throw new Error("STOCK_NEGATIF_INTERDIT");
    }

    await tx.insert(stockMovements).values({
      productId: p.id,
      businessLineId: p.businessLineId,
      movementType: data.movementType,
      quantity: data.quantity,
      unitCostCents: data.quantity > 0 ? inboundCost : p.cmupCents,
      reason: data.reason,
    });

    const updates: Partial<typeof products.$inferInsert> = {
      currentStock: next.quantity,
      cmupCents: next.cmupCents,
      updatedAt: new Date(),
    };
    if (data.quantity > 0 && data.unitCostCents != null) {
      updates.lastPurchasePriceCents = data.unitCostCents;
    }
    await tx.update(products).set(updates).where(eq(products.id, p.id));
    return { p, next };
  });

  const line = await d
    .select({ code: businessLines.code })
    .from(businessLines)
    .where(eq(businessLines.id, p.businessLineId))
    .limit(1);

  return rawToItem({ ...p, currentStock: next.quantity, cmupCents: next.cmupCents }, line[0]?.code ?? "PIECES");
}

/**
 * Import de masse CSV : upsert par sku + mouvement de stock initial.
 */
export async function importProductsBatch(
  items: Array<{
    sku: string;
    oemCode?: string;
    name: string;
    brand?: string;
    purchasePriceDH: number;
    salePriceRetailDH: number;
    stock: number;
    minStock?: number;
    shelfLocation?: string;
  }>
): Promise<{ count: number }> {
  await assertAuthenticated();
  const d = requireDb();
  const lineId = await lineIdByCode("PIECES");
  if (!lineId) throw new Error("LIGNE_METIER_INTROUVABLE");

  let count = 0;
  for (const item of items) {
    const costCents = Math.round(item.purchasePriceDH * 100);
    const values = {
      sku: item.sku.trim(),
      oemCode: item.oemCode ?? null,
      name: item.name.trim(),
      brand: item.brand ?? "Générique",
      businessLineId: lineId,
      tvaRate: 20,
      costPriceHtCents: costCents,
      lastPurchasePriceCents: costCents,
      cmupCents: costCents,
      salePriceHtCents: Math.round(item.salePriceRetailDH * 100),
      minStockAlert: item.minStock || 2,
      currentStock: item.stock,
      shelfLocation: item.shelfLocation ?? null,
      updatedAt: new Date(),
    };
    const saved = await d
      .insert(products)
      .values(values)
      .onConflictDoUpdate({ target: products.sku, set: values })
      .returning({ id: products.id });
    const productId = saved[0].id;

    await d
      .delete(stockMovements)
      .where(and(eq(stockMovements.productId, productId), eq(stockMovements.movementType, "STOCK_INITIAL")));
    await d.insert(stockMovements).values({
      productId,
      businessLineId: lineId,
      movementType: "STOCK_INITIAL",
      quantity: item.stock,
      unitCostCents: costCents,
      sourceDocumentType: "IMPORT",
      reason: `Import CSV — ${values.sku}`,
    });
    count++;
  }
  return { count };
}
