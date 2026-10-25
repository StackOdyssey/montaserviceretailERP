"use server";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  auditLogs,
  businessLines,
  db,
  products,
  settings,
  stockCountLines,
  stockCounts,
  stockMovements,
} from "@/db";
import { applyMovement, type CmupState } from "@/lib/stock";
import { assertAuthenticated, assertOwner } from "@/lib/action-guard";
import { lockProducts } from "@/lib/stock-lock";
import { bumpWarehouseStock } from "@/lib/warehouse";
import { actionResult, type ActionResult } from "@/lib/action-result";

export interface StockCountSummary {
  id: number;
  code: string;
  status: string;
  countedAt: Date | null;
  businessLineCode: string;
  totalLines: number;
  varianceLines: number;
}

export interface StockCountLineDTO {
  lineId: number;
  productId: number;
  sku: string;
  name: string;
  expectedQty: number;
  countedQty: number;
  varianceQty: number;
  unitCostCents: number;
  currentStock: number;
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

/** Crée un inventaire brouillon et fige le stock théorique de chaque article de la ligne. */
export async function createStockCount(businessLineCode: string): Promise<ActionResult<{ id: number; code: string }>> {
  return actionResult(() => createStockCountImpl(businessLineCode));
}

export async function setStockCountLine(lineId: number, countedQty: number): Promise<ActionResult<void>> {
  return actionResult(() => setStockCountLineImpl(lineId, countedQty));
}

export async function validateStockCount(id: number): Promise<ActionResult<{ adjusted: number }>> {
  return actionResult(() => validateStockCountImpl(id));
}

export async function cancelStockCount(id: number): Promise<ActionResult<void>> {
  return actionResult(() => cancelStockCountImpl(id));
}

async function createStockCountImpl(businessLineCode: string): Promise<{ id: number; code: string }> {
  await assertAuthenticated();
  const d = requireDb();
  const lineId = await lineIdByCode(businessLineCode);
  if (!lineId) throw new Error("LIGNE_METIER_INTROUVABLE");

  const year = new Date().getFullYear();
  const existing = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(stockCounts)
    .where(sql`${stockCounts.code} like ${`INV-${year}-%`}`);
  const seq = (existing[0]?.n ?? 0) + 1;
  const code = `INV-${year}-${String(seq).padStart(4, "0")}`;

  const inserted = await d
    .insert(stockCounts)
    .values({ businessLineId: lineId, code, status: "DRAFT" })
    .returning({ id: stockCounts.id });
  const id = inserted[0].id;

  const items = await d
    .select({
      id: products.id,
      currentStock: products.currentStock,
      cmupCents: products.cmupCents,
    })
    .from(products)
    .where(and(eq(products.businessLineId, lineId), eq(products.isActive, true)));

  if (items.length) {
    await d.insert(stockCountLines).values(
      items.map((p) => ({
        stockCountId: id,
        productId: p.id,
        countedQty: p.currentStock,
        expectedQty: p.currentStock,
        varianceQty: 0,
        unitCostCents: p.cmupCents,
      }))
    );
  }

  return { id, code };
}

/** Liste les inventaires (optionnellement filtrés par ligne). */
export async function getStockCounts(businessLineCode?: string): Promise<StockCountSummary[]> {
  await assertAuthenticated();
  const d = requireDb();
  const conds = businessLineCode ? [eq(businessLines.code, businessLineCode)] : [];
  const rows = await d
    .select({
      id: stockCounts.id,
      code: stockCounts.code,
      status: stockCounts.status,
      countedAt: stockCounts.countedAt,
      businessLineCode: businessLines.code,
      totalLines: sql<number>`count(${stockCountLines.id})::int`,
      varianceLines: sql<number>`count(${stockCountLines.id}) filter (where ${stockCountLines.varianceQty} <> 0)::int`,
    })
    .from(stockCounts)
    .innerJoin(businessLines, eq(stockCounts.businessLineId, businessLines.id))
    .leftJoin(stockCountLines, eq(stockCountLines.stockCountId, stockCounts.id))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(stockCounts.id, businessLines.code)
    .orderBy(desc(stockCounts.id))
    .limit(50);
  return rows;
}

/** Détail d'un inventaire (en-tête + lignes). */
export async function getStockCount(
  id: number
): Promise<{ header: StockCountSummary; lines: StockCountLineDTO[] } | null> {
  await assertAuthenticated();
  const d = requireDb();
  const headerRows = await d
    .select({
      id: stockCounts.id,
      code: stockCounts.code,
      status: stockCounts.status,
      countedAt: stockCounts.countedAt,
      businessLineCode: businessLines.code,
    })
    .from(stockCounts)
    .innerJoin(businessLines, eq(stockCounts.businessLineId, businessLines.id))
    .where(eq(stockCounts.id, id))
    .limit(1);
  const header = headerRows[0];
  if (!header) return null;

  const rows = await d
    .select({
      lineId: stockCountLines.id,
      productId: stockCountLines.productId,
      sku: products.sku,
      name: products.name,
      expectedQty: stockCountLines.expectedQty,
      countedQty: stockCountLines.countedQty,
      varianceQty: stockCountLines.varianceQty,
      unitCostCents: stockCountLines.unitCostCents,
      currentStock: products.currentStock,
    })
    .from(stockCountLines)
    .innerJoin(products, eq(stockCountLines.productId, products.id))
    .where(eq(stockCountLines.stockCountId, id))
    .orderBy(asc(products.sku));

  return {
    header: { ...header, totalLines: rows.length, varianceLines: rows.filter((r) => r.varianceQty !== 0).length },
    lines: rows,
  };
}

/** Saisit la quantité comptée d'une ligne (variance recalculée vs stock théorique). */
async function setStockCountLineImpl(lineId: number, countedQty: number): Promise<void> {
  await assertAuthenticated();
  const d = requireDb();
  await d
    .update(stockCountLines)
    .set({ countedQty, varianceQty: sql`${countedQty} - ${stockCountLines.expectedQty}` })
    .where(eq(stockCountLines.id, lineId));
}

/**
 * Valide l'inventaire : poste un ajustement (counter-signé) par écart,
 * via le moteur CMUP, puis passe l'inventaire à VALIDATED.
 */
async function validateStockCountImpl(id: number): Promise<{ adjusted: number }> {
  const session = await assertOwner();
  const d = requireDb();

  // Une seule transaction : en-tête verrouillé (pas de double validation), produits
  // verrouillés puis relus (stock courant, pas la valeur du comptage initial).
  const { code, adjusted } = await d.transaction(async (tx) => {
    const header = (
      await tx
        .select({ id: stockCounts.id, code: stockCounts.code, status: stockCounts.status })
        .from(stockCounts)
        .where(eq(stockCounts.id, id))
        .for("update")
    )[0];
    if (!header) throw new Error("INVENTAIRE_INTROUVABLE");
    if (header.status !== "DRAFT") throw new Error("INVENTAIRE_DEJA_TRAITE");

    const negRow = await tx.select({ neg: settings.negativeStockAllowed }).from(settings).limit(1);
    const negativeAllowed = negRow[0]?.neg ?? false;

    const countLines = await tx
      .select({
        lineId: stockCountLines.id,
        productId: stockCountLines.productId,
        countedQty: stockCountLines.countedQty,
      })
      .from(stockCountLines)
      .where(eq(stockCountLines.stockCountId, id));
    await lockProducts(tx, countLines.map((l) => l.productId));

    const lines = await tx
      .select({
        lineId: stockCountLines.id,
        productId: stockCountLines.productId,
        countedQty: stockCountLines.countedQty,
        productStock: products.currentStock,
        productCmup: products.cmupCents,
        businessLineId: products.businessLineId,
      })
      .from(stockCountLines)
      .innerJoin(products, eq(stockCountLines.productId, products.id))
      .where(eq(stockCountLines.stockCountId, id));

    let adjusted = 0;
    for (const ln of lines) {
      const delta = ln.countedQty - ln.productStock;
      if (delta === 0) continue;

      const state: CmupState = { quantity: ln.productStock, cmupCents: ln.productCmup };
      const { state: next } = applyMovement(state, delta, ln.productCmup);
      if (next.quantity < 0 && !negativeAllowed) throw new Error("STOCK_NEGATIF_INTERDIT");

      await tx.insert(stockMovements).values({
        productId: ln.productId,
        businessLineId: ln.businessLineId,
        movementType: "AJUSTEMENT_INVENTAIRE",
        quantity: delta,
        unitCostCents: ln.productCmup,
        sourceDocumentType: "INVENTAIRE",
        sourceDocumentId: id,
        reason: `Inventaire ${header.code}`,
      });
      await tx
        .update(products)
        .set({ currentStock: next.quantity, cmupCents: next.cmupCents, updatedAt: new Date() })
        .where(eq(products.id, ln.productId));
        await bumpWarehouseStock(tx, ln.productId, delta);
      await tx
        .update(stockCountLines)
        .set({ varianceQty: delta, unitCostCents: ln.productCmup })
        .where(eq(stockCountLines.id, ln.lineId));
      adjusted++;
    }

    await tx
      .update(stockCounts)
      .set({ status: "VALIDATED", countedAt: new Date() })
      .where(eq(stockCounts.id, id));
    return { code: header.code, adjusted };
  });

  try {
    await d.insert(auditLogs).values({
      action: "INVENTAIRE_VALIDE",
      entityType: "STOCK_COUNT",
      actorName: session.user,
      entityId: id,
      details: `Inventaire ${code} validé — ${adjusted} ligne(s) ajustée(s)`,
    });
  } catch {
    // journal non bloquant
  }
  return { adjusted };
}

async function cancelStockCountImpl(id: number): Promise<void> {
  const session = await assertOwner();
  const d = requireDb();
  const header = (await d.select({ code: stockCounts.code }).from(stockCounts).where(eq(stockCounts.id, id)).limit(1))[0];
  await d.update(stockCounts).set({ status: "CANCELLED" }).where(eq(stockCounts.id, id));
  try {
    await d.insert(auditLogs).values({
      action: "INVENTAIRE_ANNULE",
      entityType: "STOCK_COUNT",
      actorName: session.user,
      entityId: id,
      details: `Inventaire ${header?.code ?? `#${id}`} annulé`,
    });
  } catch {
    // journal non bloquant
  }
}
