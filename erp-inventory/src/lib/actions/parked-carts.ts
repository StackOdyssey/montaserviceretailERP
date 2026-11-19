"use server";

import { desc, eq } from "drizzle-orm";
import { auditLogs, businessLines, parkedCarts, staff } from "@/db/schema";
import { assertAuthenticated, currentActor } from "@/lib/action-guard";
import { actionResult, type ActionResult } from "@/lib/action-result";
import { requireDb } from "@/lib/sales/shared";

export interface ParkedCartItem {
  id: number;
  docType: string;
  customerId: number | null;
  customerName: string | null;
  commercialId: number | null;
  commercialName: string | null;
  actorName: string | null;
  createdAt: string;
  /** Panier sérialisé — restauré tel quel côté client. */
  payload: {
    cart: unknown[];
    discountPercent: number;
    customer?: Record<string, unknown>;
  };
}

export interface ParkInput {
  docType: string;
  businessLineCode?: string;
  customerId?: number | null;
  customerName?: string | null;
  commercialId?: number | null;
  payload: ParkedCartItem["payload"];
}

/** Met le ticket courant en attente — partagé entre postes (R10). */
export async function parkPosCart(data: ParkInput): Promise<ActionResult<ParkedCartItem>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const line = (
      await d
        .select({ id: businessLines.id })
        .from(businessLines)
        .where(eq(businessLines.code, data.businessLineCode || "PIECES"))
        .limit(1)
    )[0];
    if (!line) throw new Error("LIGNE_METIER_INTROUVABLE");

    const actor = await currentActor();
    const commercialName = data.commercialId
      ? (await d.select({ name: staff.name }).from(staff).where(eq(staff.id, data.commercialId)).limit(1))[0]?.name ?? null
      : null;
    const lineCount = Array.isArray(data.payload?.cart) ? data.payload.cart.length : 0;
    if (lineCount === 0) throw new Error("PANIER_VIDE: rien à mettre en attente");

    const row = (
      await d
        .insert(parkedCarts)
        .values({
          businessLineId: line.id,
          docType: data.docType,
          customerId: data.customerId ?? null,
          customerName: data.customerName ?? null,
          commercialId: data.commercialId ?? null,
          commercialName,
          payload: data.payload,
          actorName: actor,
        })
        .returning()
    )[0];

    await d.insert(auditLogs).values({
      action: "PARK_TICKET",
      entityType: "PARKED_CART",
      entityId: row.id,
      actorName: actor,
      details: `Ticket en attente #${row.id} — ${lineCount} ligne(s), ${data.customerName ?? "Comptoir"}`,
    });

    return toItem(row);
  });
}

/** Liste les tickets en attente de la ligne métier active. */
export async function listParkedCarts(businessLineCode?: string): Promise<ActionResult<ParkedCartItem[]>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const line = (
      await d
        .select({ id: businessLines.id })
        .from(businessLines)
        .where(eq(businessLines.code, businessLineCode || "PIECES"))
        .limit(1)
    )[0];
    if (!line) return [];
    const rows = await d
      .select()
      .from(parkedCarts)
      .where(eq(parkedCarts.businessLineId, line.id))
      .orderBy(desc(parkedCarts.createdAt));
    return rows.map(toItem);
  });
}

/** Rappel : retourne le payload et consomme le ticket garé (atomique). */
export async function recallParkedCart(id: number): Promise<ActionResult<ParkedCartItem>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    return await d.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(parkedCarts)
        .where(eq(parkedCarts.id, id))
        .for("update")
        .limit(1);
      const row = rows[0];
      if (!row) throw new Error("TICKET_INTROUVABLE: déjà rappelé ou supprimé sur un autre poste");
      await tx.delete(parkedCarts).where(eq(parkedCarts.id, id));
      await tx.insert(auditLogs).values({
        action: "RECALL_TICKET",
        entityType: "PARKED_CART",
        entityId: id,
        actorName: await currentActor(),
        details: `Rappel ticket en attente #${id} (${row.customerName ?? "Comptoir"})`,
      });
      return toItem(row);
    });
  });
}

/** Abandon d'un ticket garé sans le rappeler (R11 — tracé en audit). */
export async function dropParkedCart(id: number): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const row = (await d.select().from(parkedCarts).where(eq(parkedCarts.id, id)).limit(1))[0];
    if (!row) throw new Error("TICKET_INTROUVABLE");
    await d.delete(parkedCarts).where(eq(parkedCarts.id, id));
    await d.insert(auditLogs).values({
      action: "DROP_TICKET",
      entityType: "PARKED_CART",
      entityId: id,
      actorName: await currentActor(),
      details: `Ticket en attente abandonné #${id} (garé par ${row.actorName ?? "?"} le ${row.createdAt?.toISOString()})`,
    });
    return { id };
  });
}

function toItem(r: typeof parkedCarts.$inferSelect): ParkedCartItem {
  return {
    id: r.id,
    docType: r.docType,
    customerId: r.customerId,
    customerName: r.customerName,
    commercialId: r.commercialId,
    commercialName: r.commercialName,
    actorName: r.actorName,
    createdAt: r.createdAt?.toISOString() ?? "",
    payload: r.payload as ParkedCartItem["payload"],
  };
}
