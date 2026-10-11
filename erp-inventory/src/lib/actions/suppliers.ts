"use server";

import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  products,
  stockMovements,
  supplierPayments,
  supplierReceiptLines,
  supplierReceipts,
  suppliers,
} from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";
import { nextDocumentNumber } from "@/lib/numbering";
import { applyMovement, type CmupState } from "@/lib/stock";

export interface SupplierItem {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  ice: string | null;
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
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT";
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

  const search = searchQuery?.trim().toLowerCase() || "";
  const conds = search
    ? [
        or(
          ilike(suppliers.name, `%${search}%`),
          ilike(suppliers.contactName, `%${search}%`),
          ilike(suppliers.phone, `%${search}%`),
          ilike(suppliers.city, `%${search}%`)
        )!,
      ]
    : [];

  const rows = await d
    .select()
    .from(suppliers)
    .where(conds.length ? and(...conds) : undefined)
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
}): Promise<SupplierReceiptItem> {
  await assertAuthenticated();
  const d = requireDb();

  if (!data.lines || data.lines.length === 0) throw new Error("Le Bon de Réception doit contenir au moins un article");

  const supplier = (await d.select().from(suppliers).where(eq(suppliers.id, data.supplierId)).limit(1))[0];
  if (!supplier) throw new Error("Fournisseur introuvable");

  const tvaRate = 20;
  let receiptId = 0;

  await d.transaction(async (tx) => {
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
    }
  });

  const row = (await d.select().from(supplierReceipts).where(eq(supplierReceipts.id, receiptId)).limit(1))[0];
  const lines = await d.select().from(supplierReceiptLines).where(eq(supplierReceiptLines.receiptId, receiptId));
  return mapReceipt(row, supplier.name, lines);
}

/**
 * Enregistre un règlement émis à un fournisseur (et met à jour la réception ciblée).
 */
export async function recordSupplierPayment(data: {
  supplierId: number;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT";
  receiptId?: number | null;
  referenceNumber?: string;
  dueDate?: string;
  bankName?: string;
  notes?: string;
}): Promise<SupplierPaymentItem> {
  await assertAuthenticated();
  const d = requireDb();

  if (data.amountCents <= 0) throw new Error("Le montant du règlement doit être supérieur à 0");

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
            status: data.paymentMethod === "ESPECES" || data.paymentMethod === "VIREMENT" ? "DEBITE" : "EN_ATTENTE",
            notes: data.notes ?? null,
          })
          .returning({ id: supplierPayments.id })
      )[0].id;
    });

  const row = (await d.select().from(supplierPayments).where(eq(supplierPayments.id, paymentId)).limit(1))[0];
  return mapPayment(row, supplier.name, receiptNumber);
}

/**
 * Crée ou met à jour un fournisseur.
 */
export async function saveSupplier(data: {
  id?: number;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  city?: string;
  ice?: string;
  notes?: string;
}): Promise<SupplierItem> {
  await assertAuthenticated();
  const d = requireDb();

  if (!data.name.trim()) throw new Error("Le nom du fournisseur est obligatoire");

  const values = {
    name: data.name.trim(),
    contactName: data.contactName || null,
    phone: data.phone || null,
    email: data.email || null,
    city: data.city || null,
    ice: data.ice || null,
    notes: data.notes || null,
    updatedAt: new Date(),
  };

  const saved = data.id
    ? (await d.update(suppliers).set(values).where(eq(suppliers.id, data.id)).returning())[0]
    : (await d.insert(suppliers).values(values).returning())[0];

  if (!saved) throw new Error("Fournisseur introuvable");
  return mapSupplier(saved);
}
