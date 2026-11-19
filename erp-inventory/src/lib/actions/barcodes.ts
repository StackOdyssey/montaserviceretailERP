"use server";

import { and, eq, ilike, ne } from "drizzle-orm";
import { auditLogs, db, products } from "@/db";
import { assertAuthenticated, currentActor } from "@/lib/action-guard";
import { actionResult, type ActionResult } from "@/lib/action-result";
import { buildInternalEan13, isValidEan13, INTERNAL_EAN13_PREFIX } from "@/lib/barcode";

/**
 * Prochain code-barres interne disponible (EAN-13 préfixe "20", plage GS1 in-store).
 * Scanne les barcodes existants 20########### valides et retourne le suivant.
 */
export async function generateInternalBarcode(): Promise<ActionResult<{ barcode: string }>> {
  return actionResult(async () => {
    await assertAuthenticated();
    if (!db) throw new Error("BASE_INDISPONIBLE");

    const rows = await db
      .select({ barcode: products.barcode })
      .from(products)
      .where(ilike(products.barcode, `${INTERNAL_EAN13_PREFIX}%`));

    let maxSeq = 0;
    for (const r of rows) {
      const code = r.barcode ?? "";
      if (!isValidEan13(code)) continue;
      const seq = Number.parseInt(code.slice(2, 12), 10);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
    return { barcode: buildInternalEan13(maxSeq + 1) };
  });
}

/**
 * Assigne un code-barres à un produit (manuel scanné ou interne généré).
 * Refuse si le code est déjà porté par une autre pièce.
 */
export async function assignProductBarcode(
  productId: number,
  barcode: string
): Promise<ActionResult<{ id: number; barcode: string }>> {
  return actionResult(async () => {
    await assertAuthenticated();
    if (!db) throw new Error("BASE_INDISPONIBLE");

    const code = barcode.trim();
    if (!code) throw new Error("CODE_BARRE_VIDE");
    if (!/^[0-9A-Za-z._/-]{4,32}$/.test(code)) throw new Error("CODE_BARRE_INVALIDE");

    const conflict = (
      await db
        .select({ id: products.id, sku: products.sku })
        .from(products)
        .where(and(eq(products.barcode, code), ne(products.id, productId)))
        .limit(1)
    )[0];
    if (conflict) throw new Error(`CODE_BARRE_DEJA_UTILISE:${conflict.sku}`);

    const updated = (
      await db
        .update(products)
        .set({ barcode: code, updatedAt: new Date() })
        .where(eq(products.id, productId))
        .returning({ id: products.id, sku: products.sku })
    )[0];
    if (!updated) throw new Error("Pièce introuvable");

    await db.insert(auditLogs).values({
      action: "CODE_BARRE_ASSIGNE",
      entityType: "PRODUCT",
      entityId: productId,
      actorName: await currentActor(),
      details: `${updated.sku} — code-barres ${code}`,
    });
    return { id: productId, barcode: code };
  });
}
