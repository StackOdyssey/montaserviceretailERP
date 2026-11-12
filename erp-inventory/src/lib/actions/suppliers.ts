"use server";

import { and, asc, desc, eq, gte, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  auditLogs,
  db,
  products,
  settings,
  stockMovements,
  supplierPayments,
  supplierReceiptLines,
  supplierReceipts,
  suppliers,
  vatRates,
} from "@/db";
import { assertAuthenticated, currentActor } from "@/lib/action-guard";
import { assertPeriodOpen } from "@/lib/accounting-period";
import type { AgingBuckets, PartyAgingRow } from "./customers";
import { nextDocumentNumber } from "@/lib/numbering";
import { lockProducts } from "@/lib/stock-lock";
import { bumpWarehouseStock } from "@/lib/warehouse";
import { applyMovement, type CmupState } from "@/lib/stock";
import { matchTokens } from "@/lib/search";
import { effectiveVatRate } from "@/lib/vat-regime";
import { validateInput, createSupplierReceiptSchema, recordSupplierPaymentSchema } from "@/lib/action-validation";
import { actionResult, type ActionResult } from "@/lib/action-result";

export interface SupplierItem {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  ice: string | null;
  isActive: boolean;
  externalRef: string | null;
  notes: string | null;
  createdAt: string;
  totalPurchasesTtcCents?: number;
  totalPaidCents?: number;
  balanceDueCents?: number;
}

export interface SupplierReceiptItem {
  id: number;
  supplierId: number;
  supplierName: string;
  receiptNumber: string;
  supplierInvoiceNumber: string | null;
  receiptDate: string;
  status: "RECU" | "EN_ATTENTE" | "ANNULE";
  totalHtCents: number;
  tvaRate: number;
  tvaAmountCents: number;
  totalTtcCents: number;
  paidAmountCents: number;
  notes: string | null;
  lines: Array<{
    id: number;
    productId: number | null;
    productName: string;
    sku: string;
    quantity: number;
    returnedQuantity: number;
    unitCostCents: number;
    totalCostCents: number;
  }>;
}

export interface SupplierPaymentItem {
  id: number;
  supplierId: number;
  supplierName: string;
  receiptId: number | null;
  receiptNumber?: string | null;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "CARTE_BANCAIRE" | "VERSEMENT";
  paymentDate: string;
  referenceNumber: string | null;
  dueDate: string | null;
  bankName: string | null;
  status: "EN_ATTENTE" | "DEBITE" | "REJETE";
  notes: string | null;
  createdAt: string;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

type SupplierRow = typeof suppliers.$inferSelect;
type ReceiptRow = typeof supplierReceipts.$inferSelect;
type ReceiptLineRow = typeof supplierReceiptLines.$inferSelect;
type PaymentRow = typeof supplierPayments.$inferSelect;

function mapSupplier(r: SupplierRow): SupplierItem {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contactName,
    phone: r.phone,
    email: r.email,
    city: r.city,
    ice: r.ice,
    isActive: r.isActive ?? true,
    externalRef: r.externalRef,
    notes: r.notes,
    createdAt: (r.createdAt ?? new Date()).toISOString(),
  };
}

function mapReceipt(r: ReceiptRow, supplierName: string, lines: ReceiptLineRow[]): SupplierReceiptItem {
  return {
    id: r.id,
    supplierId: r.supplierId,
    supplierName,
    receiptNumber: r.receiptNumber,
    supplierInvoiceNumber: r.supplierInvoiceNumber,
    receiptDate: (r.receiptDate ?? r.createdAt ?? new Date()).toISOString(),
    status: r.status as SupplierReceiptItem["status"],
    totalHtCents: r.totalHtCents,
    tvaRate: r.tvaRate,
    tvaAmountCents: r.tvaAmountCents,
    totalTtcCents: r.totalTtcCents,
    paidAmountCents: r.paidAmountCents,
    notes: r.notes,
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.productName,
      sku: l.sku,
      quantity: l.quantity,
      returnedQuantity: l.returnedQuantity,
      unitCostCents: l.unitCostCents,
      totalCostCents: l.totalCostCents,
    })),
  };
}

function mapPayment(p: PaymentRow, supplierName: string, receiptNumber: string | null = null): SupplierPaymentItem {
  return {
    id: p.id,
    supplierId: p.supplierId,
    supplierName,
    receiptId: p.receiptId,
    receiptNumber,
    amountCents: p.amountCents,
    paymentMethod: p.paymentMethod as SupplierPaymentItem["paymentMethod"],
    paymentDate: (p.paymentDate ?? p.createdAt ?? new Date()).toISOString(),
    referenceNumber: p.referenceNumber,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    bankName: p.bankName,
    status: p.status as SupplierPaymentItem["status"],
    notes: p.notes,
    createdAt: (p.createdAt ?? new Date()).toISOString(),
  };
}

/**
 * Fournisseurs avec dettes calculées (réceptions - règlements).
 */
export async function getSuppliers(searchQuery?: string): Promise<SupplierItem[]> {
  await assertAuthenticated();
  const d = requireDb();

  const conds = [isNull(suppliers.deletedAt)];
  // Recherche tolérante caisse : voir getCustomers (mots en ET + squelette consonantique).
  const match = matchTokens(searchQuery, [suppliers.name], [suppliers.contactName, suppliers.phone, suppliers.city]);
  if (match) conds.push(match);

  const rows = await d
    .select()
    .from(suppliers)
    .where(and(...conds))
    .orderBy(asc(suppliers.name))
    .limit(500);

  const purchases = await d
    .select({
      supplierId: supplierReceipts.supplierId,
      total: sql<string>`coalesce(sum(${supplierReceipts.totalTtcCents}),0)::bigint`,
    })
    .from(supplierReceipts)
    .where(ne(supplierReceipts.status, "ANNULE"))
    .groupBy(supplierReceipts.supplierId);

  const paid = await d
    .select({
      supplierId: supplierPayments.supplierId,
      total: sql<string>`coalesce(sum(${supplierPayments.amountCents}),0)::bigint`,
    })
    .from(supplierPayments)
    .where(ne(supplierPayments.status, "REJETE"))
    .groupBy(supplierPayments.supplierId);

  const purchasesMap = new Map(purchases.map((r) => [r.supplierId, Number(r.total)]));
  const paidMap = new Map(paid.map((r) => [r.supplierId, Number(r.total)]));

  return rows.map((r) => {
    const totalPurchasesTtcCents = purchasesMap.get(r.id) ?? 0;
    const totalPaidCents = paidMap.get(r.id) ?? 0;
    return {
      ...mapSupplier(r),
      totalPurchasesTtcCents,
      totalPaidCents,
      balanceDueCents: totalPurchasesTtcCents - totalPaidCents,
    };
  });
}

/**
 * Historique complet d'un fournisseur (réceptions + règlements).
 */
export async function getSupplierDetail(supplierId: number) {
  await assertAuthenticated();
  const d = requireDb();

  const supplier = (await d.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1))[0];
  if (!supplier) return null;

  const receiptRows = await d
    .select()
    .from(supplierReceipts)
    .where(eq(supplierReceipts.supplierId, supplierId))
    .orderBy(desc(supplierReceipts.id));
  const ids = receiptRows.map((r) => r.id);
  const lineRows = ids.length
    ? await d.select().from(supplierReceiptLines).where(inArray(supplierReceiptLines.receiptId, ids))
    : [];
  const linesByReceipt = new Map<number, ReceiptLineRow[]>();
  for (const l of lineRows) {
    const arr = linesByReceipt.get(l.receiptId) ?? [];
    arr.push(l);
    linesByReceipt.set(l.receiptId, arr);
  }
  const receipts = receiptRows.map((r) => mapReceipt(r, supplier.name, linesByReceipt.get(r.id) ?? []));

  const paymentRows = await d
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.supplierId, supplierId))
    .orderBy(desc(supplierPayments.paymentDate));
  const receiptNumbers = new Map(receiptRows.map((r) => [r.id, r.receiptNumber]));
  const payments = paymentRows.map((p) => mapPayment(p, supplier.name, p.receiptId ? receiptNumbers.get(p.receiptId) ?? null : null));

  const totalPurchasesTtcCents = receipts.filter((r) => r.status !== "ANNULE").reduce((s, r) => s + r.totalTtcCents, 0);
  const totalPaidCents = payments.filter((p) => p.status !== "REJETE").reduce((s, p) => s + p.amountCents, 0);

  return {
    supplier: mapSupplier(supplier),
    totalPurchasesTtcCents,
    totalPaidCents,
    balanceDueCents: totalPurchasesTtcCents - totalPaidCents,
    receipts,
    payments,
  };
}

/**
 * Enregistre un Bon de Réception (BR) : numéro gapless, lignes, entrée de stock (CMUP), transaction.
 */
export async function createSupplierReceipt(data: {
  supplierId: number;
  supplierInvoiceNumber?: string;
  lines: Array<{ productId: number; productName: string; sku: string; quantity: number; unitCostCents: number }>;
  notes?: string;
}): Promise<ActionResult<SupplierReceiptItem>> {
  return actionResult(() => createSupplierReceiptImpl(data));
}

export async function recordSupplierPayment(data: {
  supplierId: number;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "CARTE_BANCAIRE" | "VERSEMENT";
  receiptId?: number | null;
  referenceNumber?: string;
  dueDate?: string;
  bankName?: string;
  notes?: string;
}): Promise<ActionResult<SupplierPaymentItem & { warning?: string }>> {
  return actionResult(() => recordSupplierPaymentImpl(data));
}

export async function mergeSuppliers(sourceId: number, targetId: number): Promise<ActionResult<SupplierItem>> {
  return actionResult(() => mergeSuppliersImpl(sourceId, targetId));
}

export async function saveSupplier(data: {
  id?: number;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  city?: string;
  ice?: string;
  isActive?: boolean;
  externalRef?: string;
  notes?: string;
}): Promise<ActionResult<SupplierItem>> {
  return actionResult(() => saveSupplierImpl(data));
}

export async function deleteSupplier(id: number): Promise<ActionResult<{ success: boolean }>> {
  return actionResult(() => deleteSupplierImpl(id));
}

export async function createSupplierPriceCreditNote(data: {
  receiptId: number;
  lines: Array<{ lineId: number; amountHtCents: number }>;
  reason?: string;
}): Promise<ActionResult<{ success: boolean; totalCreditHtCents: number }>> {
  return actionResult(() => createSupplierPriceCreditNoteImpl(data));
}

async function createSupplierReceiptImpl(data: {
  supplierId: number;
  supplierInvoiceNumber?: string;
  lines: Array<{ productId: number; productName: string; sku: string; quantity: number; unitCostCents: number }>;
  notes?: string;
}): Promise<SupplierReceiptItem> {
  await assertAuthenticated();
  data = validateInput(createSupplierReceiptSchema, data);
  const d = requireDb();
  await assertPeriodOpen();

  if (!data.lines || data.lines.length === 0) throw new Error("Le Bon de Réception doit contenir au moins un article");

  const supplier = (await d.select().from(suppliers).where(eq(suppliers.id, data.supplierId)).limit(1))[0];
  if (!supplier) throw new Error("Fournisseur introuvable");

  // Régime global Q1 : non-assujetti ⇒ réception en TTC sans TVA (TVA d'amont
  // non déductible = coût). Assujetti ⇒ taux par défaut paramétré (settings → vat_rates), repli 20 %.
  const vatRow = (
    await d
      .select({ rate: vatRates.ratePercent, liable: settings.vatLiable })
      .from(settings)
      .leftJoin(vatRates, eq(settings.defaultVatRateId, vatRates.id))
      .limit(1)
  )[0];
  const tvaRate = effectiveVatRate(vatRow?.rate ?? 20, vatRow?.liable ?? true);
  let receiptId = 0;

  await d.transaction(async (tx) => {
    await lockProducts(tx, data.lines.map((l) => l.productId));
    const totalHtCents = data.lines.reduce((s, l) => s + l.unitCostCents * l.quantity, 0);
    const tvaAmountCents = Math.round((totalHtCents * tvaRate) / 100);
    const totalTtcCents = totalHtCents + tvaAmountCents;

    const { docNumber } = await nextDocumentNumber(tx, {
      docType: "BR",
      year: new Date().getFullYear(),
      businessLineId: null,
    });

    receiptId = (
      await tx
        .insert(supplierReceipts)
        .values({
          supplierId: data.supplierId,
          receiptNumber: docNumber,
          supplierInvoiceNumber: data.supplierInvoiceNumber ?? null,
          receiptDate: new Date(),
          status: "RECU",
          totalHtCents,
          tvaRate,
          tvaAmountCents,
          totalTtcCents,
          paidAmountCents: 0,
          notes: data.notes ?? null,
        })
        .returning({ id: supplierReceipts.id })
    )[0].id;

    await tx.insert(auditLogs).values({
      action: "RECEPTION_BR",
      entityType: "SUPPLIER_RECEIPT",
      actorName: await currentActor(),
      entityId: receiptId,
      details: `BR ${docNumber} — ${supplier.name} — ${(totalTtcCents / 100).toFixed(2)} DH TTC`,
    });

    await tx.insert(supplierReceiptLines).values(
      data.lines.map((l) => ({
        receiptId,
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        quantity: l.quantity,
        unitCostCents: l.unitCostCents,
        totalCostCents: l.unitCostCents * l.quantity,
      }))
    );

    for (const l of data.lines) {
      const p = (await tx.select().from(products).where(eq(products.id, l.productId)).limit(1))[0];
      if (!p) throw new Error(`PIECE_INTROUVABLE: ${l.sku}`);
      const state: CmupState = { quantity: p.currentStock, cmupCents: p.cmupCents };
      const { state: next } = applyMovement(state, l.quantity, l.unitCostCents);
      await tx.insert(stockMovements).values({
        productId: p.id,
        businessLineId: p.businessLineId,
        movementType: "ACHAT_RECEPTION",
        quantity: l.quantity,
        unitCostCents: l.unitCostCents,
        sourceDocumentId: receiptId,
        sourceDocumentType: "BR",
        reason: `Réception ${docNumber} (${supplier.name})`,
      });
      await tx
        .update(products)
        .set({
          currentStock: next.quantity,
          cmupCents: next.cmupCents,
          lastPurchasePriceCents: l.unitCostCents,
          updatedAt: new Date(),
        })
        .where(eq(products.id, p.id));
      await bumpWarehouseStock(tx, p.id, l.quantity);
    }
  });

  const row = (await d.select().from(supplierReceipts).where(eq(supplierReceipts.id, receiptId)).limit(1))[0];
  const lines = await d.select().from(supplierReceiptLines).where(eq(supplierReceiptLines.receiptId, receiptId));
  return mapReceipt(row, supplier.name, lines);
}

/**
 * Enregistre un règlement émis à un fournisseur (et met à jour la réception ciblée).
 */
async function recordSupplierPaymentImpl(data: {
  supplierId: number;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "CARTE_BANCAIRE" | "VERSEMENT";
  receiptId?: number | null;
  referenceNumber?: string;
  dueDate?: string;
  bankName?: string;
  notes?: string;
}): Promise<SupplierPaymentItem & { warning?: string }> {
  await assertAuthenticated();
  data = validateInput(recordSupplierPaymentSchema, data);
  const d = requireDb();
  await assertPeriodOpen();

  const supplier = (await d.select().from(suppliers).where(eq(suppliers.id, data.supplierId)).limit(1))[0];
  if (!supplier) throw new Error("Fournisseur introuvable");

  let receiptNumber: string | null = null;
  const paymentId = await d.transaction(async (tx) => {
      if (data.receiptId) {
        const rc = (await tx.select().from(supplierReceipts).where(eq(supplierReceipts.id, data.receiptId)).limit(1))[0];
        if (rc) {
          receiptNumber = rc.receiptNumber;
          await tx
            .update(supplierReceipts)
            .set({ paidAmountCents: rc.paidAmountCents + data.amountCents })
            .where(eq(supplierReceipts.id, rc.id));
        }
      }
      return (
        await tx
          .insert(supplierPayments)
          .values({
            supplierId: data.supplierId,
            receiptId: data.receiptId ?? null,
            amountCents: data.amountCents,
            paymentMethod: data.paymentMethod,
            paymentDate: new Date(),
            referenceNumber: data.referenceNumber ?? null,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            bankName: data.bankName ?? null,
            status: data.paymentMethod === "CHEQUE" || data.paymentMethod === "EFFET_LCN" ? "EN_ATTENTE" : "DEBITE",
            notes: data.notes ?? null,
          })
          .returning({ id: supplierPayments.id })
      )[0].id;
    });

  const row = (await d.select().from(supplierPayments).where(eq(supplierPayments.id, paymentId)).limit(1))[0];

  // Seuils de déduction des paiements en espèces (CGI) — avertissement non bloquant
  let warning: string | undefined;
  if (data.paymentMethod === "ESPECES") {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const s = (await d.select().from(settings).limit(1))[0];
    const dailyLimit = s?.cashDailyThresholdCents ?? 500000;
    const monthlyLimit = s?.cashMonthlyThresholdCents ?? 5000000;
    const sumCash = async (from: Date): Promise<number> =>
      Number(
        (
          await d
            .select({ n: sql<string>`coalesce(sum(${supplierPayments.amountCents}),0)::bigint` })
            .from(supplierPayments)
            .where(
              and(
                eq(supplierPayments.supplierId, data.supplierId),
                eq(supplierPayments.paymentMethod, "ESPECES"),
                ne(supplierPayments.status, "REJETE"),
                gte(supplierPayments.paymentDate, from)
              )
            )
        )[0]?.n ?? 0
      );
    const dayTotal = await sumCash(startOfToday);
    const monthTotal = await sumCash(startOfMonth);
    if (dayTotal > dailyLimit) {
      warning = `Paiement espèces du jour (${(dayTotal / 100).toFixed(2)} DH) au-delà du seuil déductible de ${(dailyLimit / 100).toFixed(2)} DH/jour pour ce fournisseur.`;
    } else if (monthTotal > monthlyLimit) {
      warning = `Paiement espèces du mois (${(monthTotal / 100).toFixed(2)} DH) au-delà du seuil déductible de ${(monthlyLimit / 100).toFixed(2)} DH/mois pour ce fournisseur.`;
    }
  }

  try {
    await d.insert(auditLogs).values({
      action: "REGLEMENT_FOURNISSEUR",
      entityType: "SUPPLIER_PAYMENT",
      actorName: await currentActor(),
      entityId: paymentId,
      details: `Décaissement ${(data.amountCents / 100).toFixed(2)} DH (${data.paymentMethod}) — ${supplier.name}${receiptNumber ? ` sur ${receiptNumber}` : ""}`,
    });
  } catch {
    // journal non bloquant
  }

  return { ...mapPayment(row, supplier.name, receiptNumber), warning };
}

/**
 * Détecte les doublons fournisseurs (nom, téléphone, ICE). Exclut `excludeId` (édition).
 * Miroir de `findCustomerDuplicates` (T2.4) pour symétrie importés/saisis.
 */
export async function findSupplierDuplicates(
  data: { name?: string; phone?: string; ice?: string },
  excludeId?: number
): Promise<Array<{ id: number; name: string; phone: string | null; ice: string | null; city: string | null }>> {
  await assertAuthenticated();
  const d = requireDb();
  const ors = [];
  if (data.name?.trim()) ors.push(ilike(suppliers.name, data.name.trim()));
  if (data.phone?.trim()) ors.push(eq(suppliers.phone, data.phone.trim()));
  if (data.ice?.trim()) ors.push(eq(suppliers.ice, data.ice.trim()));
  if (ors.length === 0) return [];
  const conds = [isNull(suppliers.deletedAt), or(...ors)!];
  if (excludeId) conds.push(ne(suppliers.id, excludeId));
  const rows = await d
    .select({ id: suppliers.id, name: suppliers.name, phone: suppliers.phone, ice: suppliers.ice, city: suppliers.city })
    .from(suppliers)
    .where(and(...conds))
    .limit(10);
  return rows;
}

/**
 * Fusionne deux fournisseurs : ré-affecte réceptions + règlements à la cible puis
 * archive (soft-delete) la source. Miroir de `mergeCustomers` (T3.2).
 */
async function mergeSuppliersImpl(sourceId: number, targetId: number): Promise<SupplierItem> {
  await assertAuthenticated();
  const d = requireDb();
  if (sourceId === targetId) throw new Error("La source et la cible sont identiques");

  const rows = await d.select().from(suppliers).where(inArray(suppliers.id, [sourceId, targetId]));
  const source = rows.find((r) => r.id === sourceId);
  const target = rows.find((r) => r.id === targetId);
  if (!source || !target) throw new Error("Fournisseur source ou cible introuvable");

  await d.transaction(async (tx) => {
    await tx.update(supplierReceipts).set({ supplierId: targetId }).where(eq(supplierReceipts.supplierId, sourceId));
    await tx.update(supplierPayments).set({ supplierId: targetId }).where(eq(supplierPayments.supplierId, sourceId));
    await tx.update(suppliers).set({ deletedAt: new Date() }).where(eq(suppliers.id, sourceId));
    await tx.insert(auditLogs).values({
      action: "FUSION_FOURNISSEUR",
      entityType: "SUPPLIER",
      actorName: await currentActor(),
      entityId: targetId,
      details: `Fusion #${sourceId} « ${source.name} » → #${targetId} « ${target.name} »`,
    });
  });

  return mapSupplier(target);
}

/**
 * Crée ou met à jour un fournisseur.
 */
async function saveSupplierImpl(data: {
  id?: number;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  city?: string;
  ice?: string;
  isActive?: boolean;
  externalRef?: string;
  notes?: string;
}): Promise<SupplierItem> {
  await assertAuthenticated();
  const d = requireDb();

  // T2.3 — normalisation, même règle que clients. L'ICE est accepté tel quel
  // (compatibilité fiches legacy) : le contrôle strict 15 chiffres se fait
  // côté quick-create / facturation Pro, pas au save générique.
  const cleanName = data.name.trim().replace(/\s+/g, " ");
  if (!cleanName) throw new Error("Le nom du fournisseur est obligatoire");
  const cleanIce = data.ice?.trim().replace(/\s+/g, "") || null;

  const values = {
    name: cleanName,
    contactName: data.contactName?.trim() || null,
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    city: data.city?.trim() || null,
    ice: cleanIce,
    isActive: data.isActive ?? true,
    externalRef: data.externalRef?.trim() || null,
    notes: data.notes?.trim() || null,
  };

  const saved = data.id
    ? (await d.update(suppliers).set(values).where(eq(suppliers.id, data.id)).returning())[0]
    : (await d.insert(suppliers).values(values).returning())[0];

  if (!saved) throw new Error("Fournisseur introuvable");
  // T3.1 — traçabilité des créations (dont BR à la volée).
  if (!data.id) {
    try {
      await d.insert(auditLogs).values({
        action: "CREATION_FOURNISSEUR",
        entityType: "SUPPLIER",
        actorName: await currentActor(),
        entityId: saved.id,
        details: `Création fiche « ${saved.name} »${saved.phone ? ` (${saved.phone})` : ""}`,
      });
    } catch {
      // audit non bloquant
    }
  }
  return mapSupplier(saved);
}

/**
 * Archive (soft-delete) un fournisseur.
 */
async function deleteSupplierImpl(id: number): Promise<{ success: boolean }> {
  await assertAuthenticated();
  const d = requireDb();
  await d.update(suppliers).set({ deletedAt: new Date() }).where(eq(suppliers.id, id));
  return { success: true };
}

/**
 * Balance âgée des dettes fournisseurs (par ancienneté de la réception impayée).
 */
export async function getSupplierAging(): Promise<{ rows: PartyAgingRow[]; totals: AgingBuckets }> {
  await assertAuthenticated();
  const d = requireDb();

  const receipts = await d.select().from(supplierReceipts).where(ne(supplierReceipts.status, "ANNULE"));
  const sups = await d.select({ id: suppliers.id, name: suppliers.name }).from(suppliers);
  const nameById = new Map(sups.map((s) => [s.id, s.name]));
  const now = Date.now();

  const empty = (): AgingBuckets => ({ notDue: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0 });
  const key = (days: number): keyof AgingBuckets =>
    days <= 30 ? "b0_30" : days <= 60 ? "b31_60" : days <= 90 ? "b61_90" : "b90_plus";

  const map = new Map<number, { name: string; buckets: AgingBuckets; count: number; oldest: Date | null }>();
  for (const r of receipts) {
    const remaining = Math.max(0, r.totalTtcCents - r.paidAmountCents);
    if (remaining <= 0) continue;
    const date = new Date(r.receiptDate ?? r.createdAt ?? new Date());
    const days = Math.floor((now - date.getTime()) / 86400000);
    const e = map.get(r.supplierId) ?? { name: nameById.get(r.supplierId) ?? "", buckets: empty(), count: 0, oldest: null };
    e.buckets[key(days)] += remaining;
    e.buckets.total += remaining;
    e.count += 1;
    if (!e.oldest || date < e.oldest) e.oldest = date;
    map.set(r.supplierId, e);
  }

  const rows = Array.from(map.entries())
    .map(([id, e]) => ({
      id,
      name: e.name,
      buckets: e.buckets,
      documentsCount: e.count,
      oldest: e.oldest ? e.oldest.toISOString() : null,
    }))
    .sort((a, b) => b.buckets.total - a.buckets.total);

  const totals = rows.reduce((acc, r) => {
    acc.b0_30 += r.buckets.b0_30;
    acc.b31_60 += r.buckets.b31_60;
    acc.b61_90 += r.buckets.b61_90;
    acc.b90_plus += r.buckets.b90_plus;
    acc.total += r.buckets.total;
    return acc;
  }, empty());

  return { rows, totals };
}

// Seuils de déductibilité des règlements en espèces à un fournisseur
// (CGI art. 11, décisions §8) : 5 000 DH/jour et 50 000 DH/mois par fournisseur.
const CASH_DAY_LIMIT_CENTS = 500_000;
const CASH_MONTH_LIMIT_CENTS = 5_000_000;

export interface CashSupplierUsage {
  todayCents: number;
  monthCents: number;
  dayLimitCents: number;
  monthLimitCents: number;
}

/**
 * Cumul des règlements en espèces déjà versés à un fournisseur (jour courant + mois
 * courant), pour avertir l'utilisateur avant de franchir les seuils CGI.
 */
export async function getCashToSupplierUsage(supplierId: number): Promise<CashSupplierUsage> {
  await assertAuthenticated();
  const d = requireDb();
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const rows = await d
    .select({ paymentDate: supplierPayments.paymentDate, amountCents: supplierPayments.amountCents })
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.supplierId, supplierId),
        eq(supplierPayments.paymentMethod, "ESPECES"),
        ne(supplierPayments.status, "REJETE"),
        gte(supplierPayments.paymentDate, monthStart)
      )
    );

  let todayCents = 0;
  let monthCents = 0;
  for (const r of rows) {
    monthCents += r.amountCents;
    if ((r.paymentDate ?? now) >= dayStart) todayCents += r.amountCents;
  }

  return {
    todayCents,
    monthCents,
    dayLimitCents: CASH_DAY_LIMIT_CENTS,
    monthLimitCents: CASH_MONTH_LIMIT_CENTS,
  };
}

/**
 * Avoir prix fournisseur SANS retour physique (décisions §G.8, CGNC : l'avoir reçu
 * débite 4411 Fournisseurs et crédite 6111 Achats + 34552 TVA récupérable).
 * Sans mouvement de quantité : la valeur du stock restant diminue, donc le CMUP est
 * recalculé (nouveau CMUP = (qté × CMUP − avoir HT) / qté). Le total du bon de
 * réception est réduit en HT, TVA et TTC.
 */
async function createSupplierPriceCreditNoteImpl(data: {
  receiptId: number;
  lines: Array<{ lineId: number; amountHtCents: number }>;
  reason?: string;
}): Promise<{ success: boolean; totalCreditHtCents: number }> {
  await assertAuthenticated();
  const d = requireDb();
  await assertPeriodOpen();

  const receipt = (await d.select().from(supplierReceipts).where(eq(supplierReceipts.id, data.receiptId)).limit(1))[0];
  if (!receipt) throw new Error("Bon de réception introuvable");
  const lines = await d.select().from(supplierReceiptLines).where(eq(supplierReceiptLines.receiptId, data.receiptId));
  const byId = new Map(lines.map((l) => [l.id, l]));

  let totalCreditHt = 0;
  await d.transaction(async (tx) => {
    await lockProducts(tx, data.lines.map((r) => byId.get(r.lineId)?.productId));
    for (const r of data.lines) {
      const line = byId.get(r.lineId);
      if (!line || !line.productId) continue;
      const credit = Math.max(0, Math.round(r.amountHtCents));
      if (credit <= 0) continue;
      if (credit > line.totalCostCents) throw new Error("AVOIR_PRIX_SUPERIEUR_LIGNE");

      const p = (await tx.select().from(products).where(eq(products.id, line.productId)).limit(1))[0];
      if (!p || p.currentStock <= 0) continue;

      const stockValue = p.currentStock * p.cmupCents;
      const newCmup = Math.max(0, Math.round((stockValue - credit) / p.currentStock));

      await tx.insert(stockMovements).values({
        productId: p.id,
        businessLineId: p.businessLineId,
        movementType: "AVOIR_PRIX_FOURNISSEUR",
        quantity: 0, // ajustement de valeur uniquement, aucun mouvement physique
        unitCostCents: newCmup,
        sourceDocumentId: receipt.id,
        sourceDocumentType: "AVOIR_PRIX_BR",
        reason: `${data.reason ?? "Avoir prix fournisseur"} ${receipt.receiptNumber} : -${(credit / 100).toFixed(2)} DH (CMUP ${(p.cmupCents / 100).toFixed(2)} → ${(newCmup / 100).toFixed(2)})`,
      });
      await tx
        .update(products)
        .set({ cmupCents: newCmup, updatedAt: new Date() })
        .where(eq(products.id, p.id));

      totalCreditHt += credit;
    }
    if (totalCreditHt === 0) throw new Error("Aucun montant valide à créditer");

    const creditTva = Math.round((totalCreditHt * receipt.tvaRate) / 100);
    await tx
      .update(supplierReceipts)
      .set({
        totalHtCents: Math.max(0, receipt.totalHtCents - totalCreditHt),
        tvaAmountCents: Math.max(0, receipt.tvaAmountCents - creditTva),
        totalTtcCents: Math.max(0, receipt.totalTtcCents - totalCreditHt - creditTva),
      })
      .where(eq(supplierReceipts.id, receipt.id));

    await tx.insert(auditLogs).values({
      action: "AVOIR_PRIX_FOURNISSEUR",
      entityType: "SUPPLIER_RECEIPT",
      actorName: await currentActor(),
      entityId: receipt.id,
      details: `Avoir prix (sans retour) ${receipt.receiptNumber} : ${(totalCreditHt / 100).toFixed(2)} DH HT`,
    });
  });

  return { success: true, totalCreditHtCents: totalCreditHt };
}

/** Bons de réception (avec leurs lignes) pour un fournisseur donné (ou tous). */
export async function getSupplierReceipts(supplierId?: number): Promise<SupplierReceiptItem[]> {
  await assertAuthenticated();
  const d = requireDb();
  const receipts = await d
    .select()
    .from(supplierReceipts)
    .where(supplierId ? eq(supplierReceipts.supplierId, supplierId) : undefined)
    .orderBy(desc(supplierReceipts.id))
    .limit(200);
  if (receipts.length === 0) return [];

  const ids = receipts.map((r) => r.id);
  const lineRows = await d.select().from(supplierReceiptLines).where(inArray(supplierReceiptLines.receiptId, ids));

  const supIds = Array.from(new Set(receipts.map((r) => r.supplierId)));
  const supRows = await d
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(inArray(suppliers.id, supIds));
  const nameById = new Map(supRows.map((s) => [s.id, s.name]));

  const linesByReceipt = new Map<number, ReceiptLineRow[]>();
  for (const l of lineRows) {
    const arr = linesByReceipt.get(l.receiptId) ?? [];
    arr.push(l);
    linesByReceipt.set(l.receiptId, arr);
  }

  return receipts.map((r) => mapReceipt(r, nameById.get(r.supplierId) ?? "", linesByReceipt.get(r.id) ?? []));
}
