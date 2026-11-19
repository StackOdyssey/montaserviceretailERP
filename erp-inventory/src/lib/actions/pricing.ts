"use server";

import { and, asc, eq } from "drizzle-orm";
import { customerProductPrices, products } from "@/db";
import { assertAuthenticated, currentActor } from "@/lib/action-guard";
import { auditLogs } from "@/db";
import { requireDb } from "@/lib/sales/shared";
import { actionResult, type ActionResult } from "@/lib/action-result";
import { validateInput } from "@/lib/action-validation";
import { resolveCustomerPrices, type ResolvedPrice } from "@/lib/pricing";
import { z } from "zod";

const saveOverrideSchema = z.object({
  customerId: z.number().int().positive(),
  productId: z.number().int().positive(),
  priceHtCents: z.number().int().min(0).max(9_999_999_99).nullish(),
  customDesignation: z.string().max(200).nullish(),
});

export interface CustomerPriceOverrideItem {
  id: number;
  productId: number;
  sku: string;
  productName: string;
  catalogPriceHtCents: number;
  priceHtCents: number | null;
  customDesignation: string | null;
}

/**
 * Prix résolus pour un client (CLIENT → LEVEL → CATALOG).
 * Retour : { [productId]: { priceHtCents, designation, source } } — les entrées
 * absentes = prix catalogue pur (pas d'override à appliquer côté client).
 */
export async function getCustomerPricing(
  customerId: number,
  productIds: number[]
): Promise<ActionResult<Record<number, ResolvedPrice>>> {
  await assertAuthenticated();
  return actionResult(async () => {
    const map = await resolveCustomerPrices(requireDb(), customerId, productIds);
    const out: Record<number, ResolvedPrice> = {};
    for (const [id, r] of map) {
      if (r.source !== "CATALOG") out[id] = r;
    }
    return out;
  });
}

export async function getCustomerPriceOverrides(
  customerId: number
): Promise<ActionResult<CustomerPriceOverrideItem[]>> {
  await assertAuthenticated();
  return actionResult(async () => {
    const d = requireDb();
    const rows = await d
      .select({
        id: customerProductPrices.id,
        productId: customerProductPrices.productId,
        sku: products.sku,
        productName: products.name,
        catalogPriceHtCents: products.salePriceHtCents,
        priceHtCents: customerProductPrices.priceHtCents,
        customDesignation: customerProductPrices.customDesignation,
      })
      .from(customerProductPrices)
      .innerJoin(products, eq(products.id, customerProductPrices.productId))
      .where(eq(customerProductPrices.customerId, customerId))
      .orderBy(asc(products.sku));
    return rows;
  });
}

/** Upsert du tarif/désignation client. Prix ET désignation vides → suppression. */
export async function saveCustomerPriceOverride(data: {
  customerId: number;
  productId: number;
  priceHtCents?: number | null;
  customDesignation?: string | null;
}): Promise<ActionResult<{ deleted: boolean }>> {
  await assertAuthenticated();
  return actionResult(async () => {
    const d = requireDb();
    const input = validateInput(saveOverrideSchema, data);
    const price = input.priceHtCents ?? null;
    const designation = input.customDesignation?.trim() || null;

    if (price == null && designation == null) {
      await d
        .delete(customerProductPrices)
        .where(
          and(
            eq(customerProductPrices.customerId, input.customerId),
            eq(customerProductPrices.productId, input.productId)
          )
        );
      return { deleted: true };
    }

    await d
      .insert(customerProductPrices)
      .values({
        customerId: input.customerId,
        productId: input.productId,
        priceHtCents: price,
        customDesignation: designation,
      })
      .onConflictDoUpdate({
        target: [customerProductPrices.customerId, customerProductPrices.productId],
        set: { priceHtCents: price, customDesignation: designation, updatedAt: new Date() },
      });

    await d.insert(auditLogs).values({
      action: "TARIF_CLIENT",
      entityType: "CUSTOMER",
      actorName: await currentActor(),
      entityId: input.customerId,
      details: `client#${input.customerId} produit#${input.productId} → prix ${price != null ? `${price / 100} DH` : "—"}, désignation ${designation ?? "—"}`,
    });
    return { deleted: false };
  });
}

export async function deleteCustomerPriceOverride(id: number): Promise<ActionResult<null>> {
  await assertAuthenticated();
  return actionResult(async () => {
    const d = requireDb();
    await d.delete(customerProductPrices).where(eq(customerProductPrices.id, id));
    return null;
  });
}
