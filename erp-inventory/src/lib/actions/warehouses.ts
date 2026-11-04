"use server";

import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { auditLogs, db, productStock, products, stockMovements, stockTransferLines, stockTransfers, warehouses } from "@/db";
import { assertAuthenticated, assertOwner, currentActor } from "@/lib/action-guard";
import { assertPeriodOpen } from "@/lib/accounting-period";
import { lockProducts, type Tx } from "@/lib/stock-lock";
import { bumpWarehouseStock } from "@/lib/warehouse";
import { actionResult, type ActionResult } from "@/lib/action-result";

export interface WarehouseItem {
  id: number;
  code: string;
  name: string;
  isDefault: boolean;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

/** Entrepôts actifs (lisible par tout utilisateur connecté). */
export async function getWarehouses(): Promise<ActionResult<WarehouseItem[]>> {
  return actionResult(async () => {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d.select().from(warehouses).orderBy(asc(warehouses.id));
  return rows.map((w) => ({ id: w.id, code: w.code, name: w.name, isDefault: w.isDefault }));
  });
}



export interface WarehouseStockRow {
  warehouseId: number;
  warehouseName: string;
  quantity: number;
}

/** Répartition d'un produit par entrepôt. */
export async function getProductWarehouseStock(productId: number): Promise<ActionResult<WarehouseStockRow[]>> {
  return actionResult(async () => {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d
    .select({ warehouseId: productStock.warehouseId, warehouseName: warehouses.name, quantity: productStock.quantity })
    .from(productStock)
    .innerJoin(warehouses, eq(productStock.warehouseId, warehouses.id))
    .where(eq(productStock.productId, productId))
    .orderBy(asc(warehouses.id));
  return rows;
  });
}

/** Toutes les quantités d'un entrepôt (pour le filtre /stock). */
export async function getWarehouseStockMap(warehouseId: number): Promise<ActionResult<Record<number, number>>> {
  return actionResult(async () => {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d.select({ productId: productStock.productId, quantity: productStock.quantity })
    .from(productStock)
    .where(eq(productStock.warehouseId, warehouseId));
  return Object.fromEntries(rows.map((r) => [r.productId, r.quantity]));
  });
}

export interface StockTransferItem {
  id: number;
  transferNumber: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  status: string;
  notes: string | null;
  createdAt: string;
  lines: Array<{ productId: number; productName: string; sku: string; quantity: number }>;
}

export async function getStockTransfers(): Promise<ActionResult<StockTransferItem[]>> {
  return actionResult(async () => {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d
    .select()
    .from(stockTransfers)
    .orderBy(sql`${stockTransfers.id} desc`)
    .limit(200);
  const whMap = new Map((await d.select().from(warehouses)).map((w) => [w.id, w.name]));
  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await d
        .select({ l: stockTransferLines, name: products.name, sku: products.sku })
        .from(stockTransferLines)
        .innerJoin(products, eq(stockTransferLines.productId, products.id))
        .where(inArray(stockTransferLines.transferId, ids))
    : [];
  const byTransfer = new Map<number, StockTransferItem["lines"]>();
  for (const l of lines) {
    const arr = byTransfer.get(l.l.transferId) ?? [];
    arr.push({ productId: l.l.productId, productName: l.name, sku: l.sku, quantity: l.l.quantity });
    byTransfer.set(l.l.transferId, arr);
  }
  return rows.map((r) => ({
    id: r.id,
    transferNumber: r.transferNumber,
    fromWarehouseName: whMap.get(r.fromWarehouseId) ?? `#${r.fromWarehouseId}`,
    toWarehouseName: whMap.get(r.toWarehouseId) ?? `#${r.toWarehouseId}`,
    status: r.status,
    notes: r.notes,
    createdAt: (r.createdAt ?? new Date()).toISOString(),
    lines: byTransfer.get(r.id) ?? [],
  }));
  });
}

/** Crée ou renomme un entrepôt (owner). `isDefault` ne peut être retiré que via un autre entrepôt. */
export async function saveWarehouse(data: {
  id?: number;
  name: string;
  code?: string;
}): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    await assertOwner();
    const d = requireDb();
    const name = data.name.trim();
    if (!name) throw new Error("Nom d'entrepôt requis");
    if (data.id) {
      await d.update(warehouses).set({ name }).where(eq(warehouses.id, data.id));
      await d.insert(auditLogs).values({
        action: "EDIT_ENTREPOT", entityType: "WAREHOUSE", actorName: await currentActor(),
        entityId: data.id, details: `Entrepôt renommé → ${name}`,
      });
      return { id: data.id };
    }
    const code = (data.code?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_") || name.toUpperCase().replace(/[^A-Z0-9]/g, "_")).slice(0, 40);
    const dup = (await d.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.code, code)).limit(1))[0];
    if (dup) throw new Error(`Code entrepôt déjà utilisé : ${code}`);
    const row = (await d.insert(warehouses).values({ code, name }).returning({ id: warehouses.id }))[0];
    await d.insert(auditLogs).values({
      action: "CREATION_ENTREPOT", entityType: "WAREHOUSE", actorName: await currentActor(),
      entityId: row.id, details: `Entrepôt "${name}" (${code}) créé`,
    });
    return { id: row.id };
  });
}

export interface StockMovementRow {
  id: number;
  productId: number;
  sku: string;
  productName: string;
  movementType: string;
  quantity: number;
  unitCostCents: number | null;
  warehouseName: string | null;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
  reason: string | null;
  createdAt: string;
}

/** Journal global des mouvements de stock (G18) — filtres type/entrepôt/recherche. */
export async function getStockMovements(options?: {
  movementType?: string;
  warehouseId?: number;
  search?: string;
  limit?: number;
}): Promise<ActionResult<StockMovementRow[]>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const conds = [];
    if (options?.movementType) conds.push(eq(stockMovements.movementType, options.movementType));
    if (options?.warehouseId) conds.push(eq(stockMovements.warehouseId, options.warehouseId));
    if (options?.search) {
      const like = `%${options.search.trim()}%`;
      conds.push(or(ilike(products.sku, like), ilike(products.name, like))!);
    }
    const rows = await d
      .select({
        m: stockMovements,
        sku: products.sku,
        productName: products.name,
        warehouseName: warehouses.name,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(sql`${stockMovements.id} desc`)
      .limit(Math.min(Math.max(1, options?.limit ?? 200), 500));
    return rows.map((r) => ({
      id: r.m.id,
      productId: r.m.productId,
      sku: r.sku,
      productName: r.productName,
      movementType: r.m.movementType,
      quantity: r.m.quantity,
      unitCostCents: r.m.unitCostCents,
      warehouseName: r.warehouseName,
      sourceDocumentType: r.m.sourceDocumentType,
      sourceDocumentId: r.m.sourceDocumentId,
      reason: r.m.reason,
      createdAt: (r.m.createdAt ?? new Date()).toISOString(),
    }));
  });
}

/**
 * Transfert de stock entre entrepôts : sortie source + entrée destination dans
 * une seule transaction (products.current_stock = total global, inchangé).
 */
export async function createStockTransfer(data: {
  fromWarehouseId: number;
  toWarehouseId: number;
  lines: Array<{ productId: number; quantity: number }>;
  notes?: string;
}): Promise<ActionResult<{ transferId: number; transferNumber: string }>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    await assertPeriodOpen();
    if (data.fromWarehouseId === data.toWarehouseId) {
      throw new Error("Entrepôts source et destination identiques");
    }
    const lines = data.lines.filter((l) => l.quantity > 0);
    if (!lines.length) throw new Error("Ajoutez au moins une pièce avec une quantité > 0");

    const whRows = await d.select().from(warehouses).where(inArray(warehouses.id, [data.fromWarehouseId, data.toWarehouseId]));
    if (whRows.length !== 2) throw new Error("Entrepôt introuvable");
    const [srcWh, dstWh] = [
      whRows.find((w) => w.id === data.fromWarehouseId)!,
      whRows.find((w) => w.id === data.toWarehouseId)!,
    ];

    let result!: { transferId: number; transferNumber: string };
    await d.transaction(async (tx) => {
      const productIds = lines.map((l) => l.productId);
      await lockProducts(tx, productIds);

      // Vérif quantités + source
      const srcRows = await tx
        .select({ productId: productStock.productId, quantity: productStock.quantity })
        .from(productStock)
        .where(and(eq(productStock.warehouseId, data.fromWarehouseId), inArray(productStock.productId, productIds)));
      const srcMap = new Map(srcRows.map((r) => [r.productId, r.quantity]));
      const prodRows = await tx
        .select({ id: products.id, name: products.name, businessLineId: products.businessLineId })
        .from(products)
        .where(inArray(products.id, productIds));
      const prodNames = new Map(prodRows.map((p) => [p.id, p.name]));
      const prodLine = new Map(prodRows.map((p) => [p.id, p.businessLineId]));

      for (const l of lines) {
        const avail = srcMap.get(l.productId) ?? 0;
        if (l.quantity > avail) {
          throw new Error(
            `STOCK_INSUFFISANT: «${prodNames.get(l.productId) ?? l.productId}» — ${avail} dispo dans ${srcWh.name}, ${l.quantity} demandé`
          );
        }
      }

      const year = new Date().getFullYear();
      const count = (await tx.select({ n: sql<number>`count(*)::int` }).from(stockTransfers))[0].n + 1;
      const transferNumber = `TR-${year}-${String(count).padStart(4, "0")}`;
      const transferId = (
        await tx.insert(stockTransfers).values({
          transferNumber,
          fromWarehouseId: data.fromWarehouseId,
          toWarehouseId: data.toWarehouseId,
          status: "VALIDE",
          notes: data.notes?.trim() || null,
        }).returning({ id: stockTransfers.id })
      )[0].id;

      for (const l of lines) {
        await bumpWarehouseStock(tx, l.productId, -l.quantity, data.fromWarehouseId);
        await bumpWarehouseStock(tx, l.productId, l.quantity, data.toWarehouseId);
        await tx.insert(stockTransferLines).values({ transferId, productId: l.productId, quantity: l.quantity });
        await tx.insert(stockMovements).values({
          productId: l.productId,
          businessLineId: prodLine.get(l.productId)!,
          warehouseId: data.fromWarehouseId,
          movementType: "TRANSFERT_SORTIE",
          quantity: -l.quantity,
          sourceDocumentType: "TRANSFERT",
          sourceDocumentId: transferId,
          reason: `Transfert ${srcWh.name} → ${dstWh.name}`,
        });
        await tx.insert(stockMovements).values({
          productId: l.productId,
          businessLineId: prodLine.get(l.productId)!,
          warehouseId: data.toWarehouseId,
          movementType: "TRANSFERT_ENTREE",
          quantity: l.quantity,
          sourceDocumentType: "TRANSFERT",
          sourceDocumentId: transferId,
          reason: `Transfert ${srcWh.name} → ${dstWh.name}`,
        });
      }

      await tx.insert(auditLogs).values({
        action: "TRANSFERT_STOCK",
        entityType: "STOCK_TRANSFER",
        actorName: await currentActor(),
        entityId: transferId,
        details: `${transferNumber} : ${lines.length} ligne(s) ${srcWh.name} → ${dstWh.name}`,
      });
      result = { transferId, transferNumber };
    });
    return result;
  });
}
