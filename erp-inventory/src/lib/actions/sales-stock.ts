"use server";

import { eq } from "drizzle-orm";
import {
  auditLogs,
  products,
  stockMovements,
  supplierReceiptLines,
  supplierReceipts,
} from "@/db";
import { assertAuthenticated, currentActor } from "@/lib/action-guard";
import { assertPeriodOpen } from "@/lib/accounting-period";
import { lockProducts } from "@/lib/stock-lock";
import { applyMovement, type CmupState } from "@/lib/stock";
import { requireDb } from "@/lib/sales/shared";
import { actionResult, type ActionResult } from "@/lib/action-result";

/**
 * Rebut / mise au rebut (Phase 5) : sortie de stock de marchandise défectueuse.
 * La valeur sort au CMUP courant (perte constatée dans le journal de stock) ;
 * le CMUP reste inchangé (une sortie ne modifie pas le coût moyen).
 */
export async function writeOffStock(data: {
  productId: number;
  quantity: number;
  reason?: string;
}): Promise<ActionResult<{ success: boolean }>> {
  return actionResult(() => writeOffStockImpl(data));
}

export async function createSupplierReturn(data: {
  receiptId: number;
  lines: Array<{ lineId: number; quantity: number }>;
  reason?: string;
}): Promise<ActionResult<{ success: boolean }>> {
  return actionResult(() => createSupplierReturnImpl(data));
}

async function writeOffStockImpl(data: {
  productId: number;
  quantity: number;
  reason?: string;
}): Promise<{ success: boolean }> {
  await assertAuthenticated();
  const d = requireDb();
  if (data.quantity <= 0) throw new Error("Quantité de rebut invalide");
  await assertPeriodOpen();

  await d.transaction(async (tx) => {
    await lockProducts(tx, [data.productId]);
    const p = (await tx.select().from(products).where(eq(products.id, data.productId)).limit(1))[0];
    if (!p) throw new Error("PIECE_INTROUVABLE");
    if (data.quantity > p.currentStock) throw new Error("STOCK_INSUFFISANT_POUR_REBUT");
    const state: CmupState = { quantity: p.currentStock, cmupCents: p.cmupCents };
    const { state: next } = applyMovement(state, -data.quantity, 0);
    await tx.insert(stockMovements).values({
      productId: p.id,
      businessLineId: p.businessLineId,
      movementType: "REBUT",
      quantity: -data.quantity,
      unitCostCents: p.cmupCents,
      sourceDocumentType: "REBUT",
      reason: data.reason ?? `Rebut / marchandise défectueuse (${p.sku})`,
    });
    await tx
      .update(products)
      .set({ currentStock: next.quantity, cmupCents: next.cmupCents, updatedAt: new Date() })
      .where(eq(products.id, p.id));
    await tx.insert(auditLogs).values({
      action: "REBUT_STOCK",
      entityType: "PRODUCT",
      actorName: await currentActor(),
      entityId: p.id,
      details: `Rebut de ${data.quantity} × ${p.sku} — perte ${((data.quantity * p.cmupCents) / 100).toFixed(2)} MAD`,
    });
  });

  return { success: true };
}

/**
 * Retour fournisseur (Phase 5) : sortie de stock valorisée au coût d'origine de
 * la ligne de réception, rattachée au bon de réception.
 */
async function createSupplierReturnImpl(data: {
  receiptId: number;
  lines: Array<{ lineId: number; quantity: number }>;
  reason?: string;
}): Promise<{ success: boolean }> {
  await assertAuthenticated();
  const d = requireDb();
  await assertPeriodOpen();

  const receipt = (await d.select().from(supplierReceipts).where(eq(supplierReceipts.id, data.receiptId)).limit(1))[0];
  if (!receipt) throw new Error("Bon de réception introuvable");
  const lines = await d.select().from(supplierReceiptLines).where(eq(supplierReceiptLines.receiptId, data.receiptId));
  const byId = new Map(lines.map((l) => [l.id, l]));

  let returned = 0;
  await d.transaction(async (tx) => {
    for (const r of data.lines) {
      const line = byId.get(r.lineId);
      if (!line || !line.productId) continue;
      const qty = Math.min(r.quantity, line.quantity);
      if (qty <= 0) continue;
      const p = (await tx.select().from(products).where(eq(products.id, line.productId)).limit(1))[0];
      if (!p) continue;
      const state: CmupState = { quantity: p.currentStock, cmupCents: p.cmupCents };
      const { state: next } = applyMovement(state, -qty, 0);
      await tx.insert(stockMovements).values({
        productId: p.id,
        businessLineId: p.businessLineId,
        movementType: "RETOUR_FOURNISSEUR",
        quantity: -qty,
        unitCostCents: line.unitCostCents, // valeur au coût d'origine de la réception
        sourceDocumentId: receipt.id,
        sourceDocumentType: "RETOUR_FOURNISSEUR",
        reason: data.reason ?? `Retour fournisseur ${receipt.receiptNumber}`,
      });
      await tx
        .update(products)
        .set({ currentStock: next.quantity, cmupCents: next.cmupCents, updatedAt: new Date() })
        .where(eq(products.id, p.id));
      returned += qty;
    }
    if (returned === 0) throw new Error("Aucune quantité valide à retourner");
    await tx.insert(auditLogs).values({
      action: "RETOUR_FOURNISSEUR",
      entityType: "SUPPLIER_RECEIPT",
      actorName: await currentActor(),
      entityId: receipt.id,
      details: `Retour fournisseur (${returned} u.) sur ${receipt.receiptNumber}`,
    });
  });

  return { success: true };
}
