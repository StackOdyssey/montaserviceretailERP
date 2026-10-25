"use server";

import { and, asc, desc, eq, inArray, ilike, isNull, ne, or, sql } from "drizzle-orm";
import {
  auditLogs,
  businessLineDocumentSettings,
  businessLines,
  customerPayments,
  customers,
  products,
  salesDocuments,
  salesLines,
  settings,
  staff,
  stockMovements,
  vatRates,
} from "@/db";
import { calculateDocumentTotals } from "@/lib/money";
import { effectiveVatRate, VAT_NOT_LIABLE_MENTION } from "@/lib/vat-regime";
import { nextDocumentNumber } from "@/lib/numbering";
import { assertAuthenticated, currentActor } from "@/lib/action-guard";
import { assertPeriodOpen } from "@/lib/accounting-period";
import { lockProducts } from "@/lib/stock-lock";
import { bumpWarehouseStock } from "@/lib/warehouse";
import { applyMovement, type CmupState } from "@/lib/stock";
import { validateInput, createSalesDocumentSchema } from "@/lib/action-validation";
import {
  businessMessage,
  loadDocumentById,
  mapDoc,
  requireDb,
  type SalesDocResult,
  type SalesLineInput,
  type SalesDocumentItem,
} from "@/lib/sales/shared";

export type {
  SalesLineInput,
  SalesDocumentItem,
  SalesDocResult,
  CompanyPrintInfo,
  DocumentPrintContext,
} from "@/lib/sales/shared";

type LineRow = typeof salesLines.$inferSelect;

type SalesDocFilters = {
  docType?: "BL" | "FACTURE" | "AVOIR" | "BC" | "DEVIS";
  search?: string;
  status?: string;
};

function salesDocConds(options?: SalesDocFilters) {
  const conds = [isNull(salesDocuments.deletedAt)];
  if (options?.docType) conds.push(eq(salesDocuments.docType, options.docType));
  if (options?.status && options.status !== "ALL") conds.push(eq(salesDocuments.status, options.status));
  const search = options?.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conds.push(or(ilike(salesDocuments.docNumber, like), ilike(salesDocuments.customerName, like))!);
  }
  return conds;
}

/**
 * Récupère les documents de vente (base de données).
 * Sans `limit` explicite, plafonné à 200 documents récents ; avec `limit` +
 * `offset`, pagination serveur (ordre stable par id décroissant).
 */
export async function getSalesDocuments(
  options?: SalesDocFilters & { limit?: number; offset?: number }
): Promise<SalesDocumentItem[]> {
  await assertAuthenticated();
  const d = requireDb();
  const limit = Math.min(Math.max(1, options?.limit ?? 200), 500);
  const offset = Math.max(0, options?.offset ?? 0);

  const docs = await d
    .select()
    .from(salesDocuments)
    .where(and(...salesDocConds(options)))
    .orderBy(desc(salesDocuments.id))
    .limit(limit)
    .offset(offset);
  if (docs.length === 0) return [];

  const ids = docs.map((x) => x.id);
  const lines = await d.select().from(salesLines).where(inArray(salesLines.documentId, ids));
  const byDoc = new Map<number, LineRow[]>();
  for (const l of lines) {
    const arr = byDoc.get(l.documentId) ?? [];
    arr.push(l);
    byDoc.set(l.documentId, arr);
  }

  return docs.map((doc) => mapDoc(doc, byDoc.get(doc.id) ?? []));
}

/**
 * Nombre total de documents correspondant aux filtres de getSalesDocuments
 * (sans la limite) — sert à la pagination côté UI.
 */
export async function getSalesDocumentsCount(options?: SalesDocFilters): Promise<number> {
  await assertAuthenticated();
  const d = requireDb();
  const row = (
    await d
      .select({ n: sql<number>`count(*)` })
      .from(salesDocuments)
      .where(and(...salesDocConds(options)))
  )[0];
  return Number(row?.n ?? 0);
}

/**
 * T3.3 — Diagnostic : ventes orphelines qui n'auraient plus le droit d'exister
 * depuis le garde T1.4 (FACTURE ou crédit/différé sans `customerId`).
 * Vise zéro ligne. Les BL/BC/DEVIS comptoir en espèces n'apparaissent pas ici.
 */
export async function getOrphanCreditSales(): Promise<
  Array<{
    id: number;
    docNumber: string;
    docType: string;
    paymentMethod: string | null;
    totalTtcCents: number;
    docDate: string;
  }>
> {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d
    .select({
      id: salesDocuments.id,
      docNumber: salesDocuments.docNumber,
      docType: salesDocuments.docType,
      paymentMethod: salesDocuments.paymentMethod,
      totalTtcCents: salesDocuments.totalTtcCents,
      docDate: salesDocuments.docDate,
    })
    .from(salesDocuments)
    .where(
      and(
        isNull(salesDocuments.deletedAt),
        ne(salesDocuments.status, "ANNULE"),
        isNull(salesDocuments.customerId),
        or(
          eq(salesDocuments.docType, "FACTURE"),
          ne(salesDocuments.paymentMethod, "ESPECES")
        )!
      )
    )
    .orderBy(desc(salesDocuments.id))
    .limit(100);
  return rows.map((r) => ({
    ...r,
    docDate: (r.docDate ?? new Date()).toISOString(),
  }));
}

/**
 * Récupère un document par identifiant.
 */
export async function getSalesDocumentById(id: number): Promise<SalesDocumentItem | null> {
  await assertAuthenticated();
  return loadDocumentById(id);
}

/**
 * Crée et valide un document commercial (BL/FACTURE/AVOIR) dans une TRANSACTION :
 * numéro gapless, lignes avec snapshot COGS (CMUP) et sortie de stock, le tout atomique.
 */
export async function createSalesDocument(data: {
  docType?: "BL" | "FACTURE" | "AVOIR" | "BC" | "DEVIS";
  customerId?: number | null;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerCity?: string;
  customerIce?: string;
  lines: SalesLineInput[];
  discountPercent: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "A_CREDIT";
  paidAmountCents?: number;
  notes?: string;
  businessLineCode?: string;
  /** Motif d'un prix négocié hors catalogue (question ouverte Prix-negocie). */
  overrideReason?: string;
  /** Clé de déduplication caisse : un retry/double-clic renvoie le doc existant. */
  idempotencyKey?: string;
  commercialId?: number | null;
  livreurId?: number | null;
}): Promise<SalesDocResult> {
  await assertAuthenticated();
  try {
  data = validateInput(createSalesDocumentSchema, data);
  const d = requireDb();

  // Idempotence : si la clé a déjà produit un document, on le renvoie tel quel
  // (retry réseau / double-clic / F5 en cours de validation).
  const findByIdemKey = async (key: string) => {
    const row = (
      await d
        .select({ id: salesDocuments.id })
        .from(salesDocuments)
        .where(eq(salesDocuments.idempotencyKey, key))
        .limit(1)
    )[0];
    return row ? loadDocumentById(row.id) : null;
  };
  if (data.idempotencyKey) {
    const existing = await findByIdemKey(data.idempotencyKey);
    if (existing) return { ok: true, document: existing };
  }

  await assertPeriodOpen();

  const docType = data.docType ?? "BL";
  const year = new Date().getFullYear();

  // Taux de TVA par défaut, paramétrable (settings.defaultVatRateId → vat_rates), repli 20%.
  // Régime global : non-assujetti ⇒ taux effectif 0 (TVA ni calculée ni affichée).
  const vatRow = (
    await d
      .select({ rate: vatRates.ratePercent, liable: settings.vatLiable })
      .from(settings)
      .leftJoin(vatRates, eq(settings.defaultVatRateId, vatRates.id))
      .limit(1)
  )[0];
  const vatLiable = vatRow?.liable ?? true;
  const tvaRate = effectiveVatRate(vatRow?.rate ?? 20, vatLiable);

  // Exit gate Phase 3 : une facture à un client professionnel exige son ICE.
  // Matrice POS T1.4 (fail-closed) : Client Comptoir (customerId=null) uniquement
  // pour BL/BC/DEVIS en ESPECES. FACTURE et tout crédit/différé exigent une fiche.
  const requiresCustomerFile =
    docType === "FACTURE" ||
    data.paymentMethod === "A_CREDIT" ||
    data.paymentMethod === "CHEQUE" ||
    data.paymentMethod === "EFFET_LCN" ||
    data.paymentMethod === "VIREMENT";
  if (requiresCustomerFile && !data.customerId) {
    throw new Error(
      "CLIENT_REQUIS: créez ou sélectionnez la fiche client avant de valider (FACTURE et ventes à crédit / chèque / effet / virement exigent un client enregistré, pas de client comptoir)."
    );
  }
  if (data.customerId) {
    const existing = (
      await d.select({ id: customers.id }).from(customers).where(eq(customers.id, data.customerId)).limit(1)
    )[0];
    if (!existing) throw new Error("CLIENT_INTROUVABLE: la fiche client sélectionnée n'existe plus.");
  }
  if (docType === "FACTURE") {
    let ice = data.customerIce?.trim() || null;
    let isProfessional = false;
    if (data.customerId) {
      const c = (await d.select().from(customers).where(eq(customers.id, data.customerId)).limit(1))[0];
      isProfessional = c?.isProfessional ?? false;
      ice = ice ?? c?.ice ?? null;
    }
    if (isProfessional && !ice) {
      throw new Error("ICE_CLIENT_REQUIS: la facturation d'un client professionnel est bloquée sans ICE.");
    }
  }

  let docId = 0;

  // Mention légale auto-ajoutée aux FACTURE/AVOIR en régime non-assujetti.
  const resolvedNotes =
    !vatLiable && (docType === "FACTURE" || docType === "AVOIR")
      ? [data.notes?.trim(), VAT_NOT_LIABLE_MENTION].filter(Boolean).join(" — ")
      : data.notes;

  try {
    await d.transaction(async (tx) => {
    await lockProducts(tx, data.lines.map((l) => l.productId));
    // Ligne métier (défaut PIECES)
    const line = (
      await tx
        .select({ id: businessLines.id })
        .from(businessLines)
        .where(eq(businessLines.code, data.businessLineCode || "PIECES"))
        .limit(1)
    )[0];
    if (!line) throw new Error("LIGNE_METIER_INTROUVABLE");

    // Snapshot §6A de la visibilité TVA au moment de la validation.
    const settingsKey = docType === "FACTURE" ? "FAC" : docType === "AVOIR" ? "AV" : docType;
    const vatCfg = (
      await tx
        .select()
        .from(businessLineDocumentSettings)
        .where(
          and(
            eq(businessLineDocumentSettings.businessLineId, line.id),
            eq(businessLineDocumentSettings.docType, settingsKey)
          )
        )
        .limit(1)
    )[0];
    const vatDisplay = !vatLiable ? "HIDDEN" : vatCfg ? (vatCfg.showVat ? "SHOWN" : "HIDDEN") : "SHOWN";
    const priceBasis = vatCfg?.priceBasis ?? "TTC";
    // Régime assujetti : FAC/AV affichent toujours la TVA. Régime non-assujetti :
    // FAC/AV masquées avec mention légale auto-ajoutée aux notes (contrainte DB
    // FAC/AV-SHOWN retirée, enforcement régime-aware ici).
    if ((docType === "FACTURE" || docType === "AVOIR") && vatDisplay === "HIDDEN" && vatLiable) {
      throw new Error("TVA_OBLIGATOIRE_FAC_AV: FAC et AV doivent afficher la TVA");
    }

    const totals = calculateDocumentTotals(
      data.lines.map((l) => ({ unitPriceHT: l.unitPriceHTCents, quantity: l.quantity })),
      data.discountPercent,
      tvaRate
    );

    const affectsStock = docType === "BL" || docType === "FACTURE";
    const negRow = (await tx.select({ neg: settings.negativeStockAllowed }).from(settings).limit(1))[0];
    const negativeAllowed = negRow?.neg ?? false;

    // Effets de stock (COGS = CMUP courant). BL/FACTURE décrémentent ; BC/DEVIS non.
    const effects: Array<{
      productId: number;
      businessLineId: number;
      quantity: number;
      unitCostCents: number;
      nextStock: number;
      nextCmup: number;
    }> = [];
    for (const l of data.lines) {
      const p = (await tx.select().from(products).where(eq(products.id, l.productId)).limit(1))[0];
      if (!p) throw new Error(`PIECE_INTROUVABLE: ${l.sku}`);

      // Question ouverte « Prix-negocie » : le prix est résolu côté serveur depuis
      // la base. Un prix hors catalogue est refusé (fail-closed) sauf motif tracé.
      // Produit SANS prix catalogue : tout prix saisi est « hors catalogue » et exige
      // aussi un motif (sinon un prix arbitraire passerait inaperçu).
      const catalogPrices = [p.salePriceHtCents].filter((v) => v > 0);
      const isOffCatalog = catalogPrices.length === 0 || !catalogPrices.includes(l.unitPriceHTCents);
      if (isOffCatalog) {
        if (!data.overrideReason?.trim()) {
          throw new Error(
            `PRIX_HORS_CATALOGUE: ${p.sku}. Un prix négocié doit être justifié (prix fixé audité).`
          );
        }
        await tx.insert(auditLogs).values({
          action: "PRIX_FIXE",
          entityType: "PRODUCT",
          actorName: await currentActor(),
          entityId: p.id,
          details: `${p.sku}: prix catalogue ${catalogPrices.join("/")} → ${l.unitPriceHTCents} — motif: ${data.overrideReason.trim()}`,
        });
      }

      const state: CmupState = { quantity: p.currentStock, cmupCents: p.cmupCents };
      const { state: next } = applyMovement(state, -l.quantity, 0);
      if (affectsStock && next.quantity < 0 && !negativeAllowed) throw new Error(`STOCK_NEGATIF_INTERDIT: ${p.sku}`);
      effects.push({
        productId: p.id,
        businessLineId: p.businessLineId,
        quantity: -l.quantity,
        unitCostCents: p.cmupCents,
        nextStock: next.quantity,
        nextCmup: next.cmupCents,
      });
    }

    // Numéro gapless (clé de numérotation canonique : FAC/AV, pas FACTURE/AVOIR)
    const sequenceKey = docType === "FACTURE" ? "FAC" : docType === "AVOIR" ? "AV" : docType;
    const { docNumber, sequenceNo } = await nextDocumentNumber(tx, {
      docType: sequenceKey,
      year,
      businessLineId: line.id,
    });

    const isFullyPaid =
      data.paymentMethod !== "A_CREDIT" && (data.paidAmountCents ?? totals.totalTTC) >= totals.totalTTC;

    // Attribution : snapshot des noms (le doc garde le nom même si le staff change).
    const [commercial, livreur] = await Promise.all([
      data.commercialId
        ? tx.select({ name: staff.name }).from(staff).where(eq(staff.id, data.commercialId)).limit(1)
        : Promise.resolve([]),
      data.livreurId
        ? tx.select({ name: staff.name }).from(staff).where(eq(staff.id, data.livreurId)).limit(1)
        : Promise.resolve([]),
    ]);

    docId = (
      await tx
        .insert(salesDocuments)
        .values({
          docType,
          docNumber,
          idempotencyKey: data.idempotencyKey ?? null,
          businessLineId: line.id,
          docYear: year,
          sequenceNo,
          customerId: data.customerId ?? null,
          customerName: data.customerName || "Client Comptoir Particulier",
          customerPhone: data.customerPhone ?? null,
          customerEmail: data.customerEmail ?? null,
          customerCity: data.customerCity ?? "Casablanca",
          customerIce: data.customerIce ?? null,
          docDate: new Date(),
          status: isFullyPaid ? "PAYE" : "VALIDE",
          totalBrutHtCents: totals.totalBrutHT,
          discountPercent: totals.discountPercent,
          discountAmountCents: totals.discountAmount,
          totalNetHtCents: totals.totalNetHT,
          tvaRate: totals.tvaRate,
          tvaAmountCents: totals.tvaAmount,
          totalTtcCents: totals.totalTTC,
          paidAmountCents: isFullyPaid ? totals.totalTTC : data.paidAmountCents ?? 0,
          paymentMethod: data.paymentMethod,
          notes: resolvedNotes ?? null,
          vatDisplay,
          priceBasis,
          validatedAt: new Date(),
          commercialId: commercial.length ? data.commercialId! : null,
          commercialName: commercial[0]?.name ?? null,
          livreurId: livreur.length ? data.livreurId! : null,
          livreurName: livreur[0]?.name ?? null,
        })
        .returning({ id: salesDocuments.id })
    )[0].id;

    await tx.insert(salesLines).values(
      data.lines.map((l) => ({
        documentId: docId,
        productId: l.productId,
        productNameSnapshot: l.productName,
        skuSnapshot: l.sku,
        oemCodeSnapshot: l.oemCode ?? null,
        unitPriceHtCents: l.unitPriceHTCents,
        quantity: l.quantity,
        totalHtCents: l.unitPriceHTCents * l.quantity,
        unitCostCents: effects.find((e) => e.productId === l.productId)?.unitCostCents ?? 0,
        tvaRate,
        totalTtcCents: Math.round(l.unitPriceHTCents * l.quantity * (1 + tvaRate / 100)),
      }))
    );

    // Journal des opérations : toute validation BL/FACTURE/BC/DEVIS/AVOIR y figure.
    await tx.insert(auditLogs).values({
      action: "VALIDATION_DOCUMENT",
      entityType: docType,
      actorName: await currentActor(),
      entityId: docId,
      details: `${docType} ${docNumber} — ${data.customerName || "Client Comptoir Particulier"} — ${(totals.totalTTC / 100).toFixed(2)} DH TTC (${data.paymentMethod}${isFullyPaid ? ", soldé" : ", à crédit"})`,
    });

    if (affectsStock) {
      for (const e of effects) {
        await tx.insert(stockMovements).values({
          productId: e.productId,
          businessLineId: e.businessLineId,
          movementType: "VENTE_BL",
          quantity: e.quantity,
          unitCostCents: e.unitCostCents,
          sourceDocumentId: docId,
          sourceDocumentType: docType,
          reason: `Vente au comptoir — ${docNumber}`,
        });
        await tx
          .update(products)
          .set({ currentStock: e.nextStock, cmupCents: e.nextCmup, updatedAt: new Date() })
          .where(eq(products.id, e.productId));
        await bumpWarehouseStock(tx, e.productId, e.quantity);
      }
    }

    // Acomptes clients (question ouverte Acomptes-Q19, réponse : oui) : impute les
    // règlements non affectés du client sur le nouveau document (FIFO par date).
    if (data.customerId && affectsStock) {
      const credits = await tx
        .select()
        .from(customerPayments)
        .where(
          and(
            eq(customerPayments.customerId, data.customerId),
            isNull(customerPayments.documentId),
            ne(customerPayments.status, "REJETE")
          )
        )
        .orderBy(asc(customerPayments.paymentDate));
      const docPaid = isFullyPaid ? totals.totalTTC : data.paidAmountCents ?? 0;
      let remainingDue = Math.max(0, totals.totalTTC - docPaid);
      let applied = 0;
      for (const p of credits) {
        if (remainingDue <= 0) break;
        await tx.update(customerPayments).set({ documentId: docId }).where(eq(customerPayments.id, p.id));
        applied += p.amountCents;
        remainingDue -= p.amountCents;
      }
      if (applied > 0) {
        const newPaid = Math.min(totals.totalTTC, docPaid + applied);
        await tx
          .update(salesDocuments)
          .set({ paidAmountCents: newPaid, status: newPaid >= totals.totalTTC ? "PAYE" : "VALIDE" })
          .where(eq(salesDocuments.id, docId));
      }
    }
  });
  } catch (err) {
    // Contrainte unique sur idempotency_key : la transaction concurrente a gagné
    // entre la pré-vérif et l'insert — on renvoie le document qu'elle a créé.
    if (data.idempotencyKey) {
      const existing = await findByIdemKey(data.idempotencyKey);
      if (existing) return { ok: true, document: existing };
    }
    throw err;
  }

  const created = await loadDocumentById(docId);
  if (!created) throw new Error("ECHEC_CREATION_DOCUMENT");
  return { ok: true, document: created };
  } catch (err) {
    // En production, les erreurs jetées sont masquées ("React error #441") :
    // les règles de gestion sont renvoyées, les erreurs internes restent masquées.
    const msg = businessMessage(err);
    if (msg) return { ok: false, error: msg };
    throw err;
  }
}
