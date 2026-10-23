"use server";

import { and, asc, eq, gt, gte, isNull, lt, lte, ne, or } from "drizzle-orm";
import {
  accountingPeriods,
  customers,
  customerPayments,
  db,
  expenseCategories,
  expenses,
  products,
  salesDocuments,
  suppliers,
  supplierPayments,
} from "@/db";
import { assertAuthenticated, assertOwner } from "@/lib/action-guard";
import { actionResult, type ActionResult } from "@/lib/action-result";
import { getTvaAccountingExport } from "./analytics";

export type PeriodStatus = "OPEN" | "REVIEWED" | "EXPORTED" | "LOCKED";

export interface AccountingPeriodItem {
  id: number;
  year: number;
  month: number;
  status: PeriodStatus;
  lockedAt: string | null;
  notes: string | null;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

function toItem(r: typeof accountingPeriods.$inferSelect): AccountingPeriodItem {
  return {
    id: r.id,
    year: r.year,
    month: r.month,
    status: r.status as PeriodStatus,
    lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
    notes: r.notes,
  };
}

/** Périodes comptables (verrouillage) — éventuellement filtrées par année. */
export async function getAccountingPeriods(year?: number): Promise<AccountingPeriodItem[]> {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d
    .select()
    .from(accountingPeriods)
    .where(year ? eq(accountingPeriods.year, year) : undefined)
    .orderBy(asc(accountingPeriods.year), asc(accountingPeriods.month));
  return rows.map(toItem);
}

/**
 * Fait avancer/reculer le statut d'une période comptable :
 * OPEN (brouillon) → REVIEWED (revue) → EXPORTED (exportée) → LOCKED (clôturée).
 * Seul LOCKED bloque les écritures.
 */
export async function setPeriodStatus(
  year: number,
  month: number,
  status: PeriodStatus,
  notes?: string
): Promise<ActionResult<AccountingPeriodItem>> {
  return actionResult(() => setPeriodStatusImpl(year, month, status, notes));
}

export async function setPeriodLock(
  year: number,
  month: number,
  locked: boolean,
  notes?: string
): Promise<ActionResult<AccountingPeriodItem>> {
  return actionResult(() => setPeriodLockImpl(year, month, locked, notes));
}

async function setPeriodStatusImpl(
  year: number,
  month: number,
  status: PeriodStatus,
  notes?: string
): Promise<AccountingPeriodItem> {
  await assertOwner();
  const d = requireDb();
  const allowed: PeriodStatus[] = ["OPEN", "REVIEWED", "EXPORTED", "LOCKED"];
  if (!allowed.includes(status)) throw new Error("STATUT_PERIODE_INVALIDE");

  const existing = (
    await d
      .select()
      .from(accountingPeriods)
      .where(and(eq(accountingPeriods.year, year), eq(accountingPeriods.month, month)))
      .limit(1)
  )[0];

  if (existing) {
    const updated = (
      await d
        .update(accountingPeriods)
        .set({ status, lockedAt: status === "LOCKED" ? new Date() : null, notes: notes ?? existing.notes })
        .where(eq(accountingPeriods.id, existing.id))
        .returning()
    )[0];
    return toItem(updated);
  }

  const inserted = (
    await d
      .insert(accountingPeriods)
      .values({ year, month, status, lockedAt: status === "LOCKED" ? new Date() : null, notes: notes ?? null })
      .returning()
  )[0];
  return toItem(inserted);
}

/** Verrouille (clôture = LOCKED) ou rouvre (OPEN) une période comptable. */
async function setPeriodLockImpl(
  year: number,
  month: number,
  locked: boolean,
  notes?: string
): Promise<AccountingPeriodItem> {
  await assertOwner();
  return setPeriodStatusImpl(year, month, locked ? "LOCKED" : "OPEN", notes);
}

export interface ValidationIssue {
  type: string;
  label: string;
  severity: "ERROR" | "WARNING";
  count: number;
  samples: string[];
}

/**
 * Contrôle de cohérence avant clôture (Phase 8) : ICE manquant, justificatifs,
 * stock négatif, échéances manquantes, surpaiements.
 */
export async function getValidationIssues(options?: { year?: number; month?: number }): Promise<ValidationIssue[]> {
  await assertAuthenticated();
  const d = requireDb();
  const now = new Date();
  const year = options?.year ?? now.getFullYear();
  const month = options?.month ?? now.getMonth() + 1; // 1..12
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const issues: ValidationIssue[] = [];

  const noIce = await d
    .select({ n: salesDocuments.docNumber, name: salesDocuments.customerName })
    .from(salesDocuments)
    .where(
      and(
        eq(salesDocuments.docType, "FACTURE"),
        ne(salesDocuments.status, "ANNULE"),
        isNull(salesDocuments.deletedAt),
        gte(salesDocuments.docDate, start),
        lte(salesDocuments.docDate, end),
        or(isNull(salesDocuments.customerIce), eq(salesDocuments.customerIce, ""))!
      )
    );
  if (noIce.length) {
    issues.push({
      type: "FACTURE_SANS_ICE",
      label: "Factures sans ICE client",
      severity: "ERROR",
      count: noIce.length,
      samples: noIce.slice(0, 5).map((r) => `${r.n} — ${r.name}`),
    });
  }

  const noReceipt = await d
    .select({ title: expenses.title })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(
      and(
        eq(expenseCategories.receiptRequired, true),
        isNull(expenses.receiptPhotoUrl),
        gte(expenses.expenseDate, start),
        lte(expenses.expenseDate, end)
      )
    );
  if (noReceipt.length) {
    issues.push({
      type: "DEPENSE_SANS_JUSTIFICATIF",
      label: "Dépenses sans justificatif (catégorie l'exigeant)",
      severity: "WARNING",
      count: noReceipt.length,
      samples: noReceipt.slice(0, 5).map((r) => r.title),
    });
  }

  const neg = await d
    .select({ sku: products.sku, q: products.currentStock })
    .from(products)
    .where(lt(products.currentStock, 0));
  if (neg.length) {
    issues.push({
      type: "STOCK_NEGATIF",
      label: "Articles en stock négatif",
      severity: "ERROR",
      count: neg.length,
      samples: neg.slice(0, 5).map((r) => `${r.sku} (${r.q})`),
    });
  }

  const noDue = await d
    .select({ id: customerPayments.id })
    .from(customerPayments)
    .where(
      and(
        or(eq(customerPayments.paymentMethod, "CHEQUE"), eq(customerPayments.paymentMethod, "EFFET_LCN"))!,
        isNull(customerPayments.chequeDueDate)
      )
    );
  if (noDue.length) {
    issues.push({
      type: "ECHEANCE_MANQUANTE",
      label: "Chèques / effets sans date d'échéance",
      severity: "WARNING",
      count: noDue.length,
      samples: noDue.slice(0, 5).map((r) => `Règlement #${r.id}`),
    });
  }

  const overpaid = await d
    .select({ n: salesDocuments.docNumber })
    .from(salesDocuments)
    .where(
      and(
        gt(salesDocuments.paidAmountCents, salesDocuments.totalTtcCents),
        isNull(salesDocuments.deletedAt),
        ne(salesDocuments.status, "ANNULE")
      )
    );
  if (overpaid.length) {
    issues.push({
      type: "SURPAIEMENT",
      label: "Documents encaissés au-delà du total (lettrage incohérent)",
      severity: "ERROR",
      count: overpaid.length,
      samples: overpaid.slice(0, 5).map((r) => r.n),
    });
  }

  return issues;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
function esc(v: string): string {
  return String(v ?? "").replace(/;/g, ",");
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

/**
 * Export comptable CSV (TVA collectée + déductible + bilan) pour un mois donné.
 */
export async function getAccountingCsv(options?: {
  year?: number;
  month?: number;
}): Promise<{ filename: string; csv: string }> {
  await assertAuthenticated();
  const d = requireDb();
  const monthIdx = options?.month !== undefined ? options.month - 1 : new Date().getMonth();
  const tva = await getTvaAccountingExport({ year: options?.year, month: monthIdx });

  const out: string[] = [];
  out.push("Journal des Ventes (TVA collectee)");
  out.push("Date;N°;Client;ICE;Ligne;H.T.;Remise;Net H.T.;TVA;T.T.C.;Reglement");
  for (const s of tva.salesLines) {
    out.push(
      [
        fmtDate(s.date),
        s.docNumber,
        esc(s.customerName),
        s.customerIce ?? "",
        s.businessLine,
        money(s.totalBrutHtCents),
        money(s.discountAmountCents),
        money(s.totalNetHtCents),
        money(s.tvaAmountCents),
        money(s.totalTtcCents),
        s.paymentMethod,
      ].join(";")
    );
  }

  out.push("");
  out.push("Journal des Achats (TVA deductible)");
  out.push("Date;N° BR;Fournisseur;ICE;Ligne;N° Facture;H.T.;TVA;T.T.C.");
  for (const p of tva.purchaseLines) {
    out.push(
      [
        fmtDate(p.date),
        p.receiptNumber,
        esc(p.supplierName),
        p.supplierIce ?? "",
        p.businessLine,
        p.invoiceNumber ?? "",
        money(p.totalHtCents),
        money(p.tvaAmountCents),
        money(p.totalTtcCents),
      ].join(";")
    );
  }

  // ---- Journaux de trésorerie (livre-journal auxiliaire : caisse et banque) ----
  const csvYear = options?.year ?? new Date().getFullYear();
  const csvMonth = options?.month !== undefined ? options.month - 1 : new Date().getMonth();
  const mStart = new Date(csvYear, csvMonth, 1);
  const mEnd = new Date(csvYear, csvMonth + 1, 0, 23, 59, 59);
  const [custPays, supPays] = await Promise.all([
    d
      .select({
        date: customerPayments.paymentDate,
        method: customerPayments.paymentMethod,
        ref: customerPayments.referenceNumber,
        amount: customerPayments.amountCents,
        name: customers.name,
      })
      .from(customerPayments)
      .innerJoin(customers, eq(customerPayments.customerId, customers.id))
      .where(
        and(
          gte(customerPayments.paymentDate, mStart),
          lte(customerPayments.paymentDate, mEnd),
          ne(customerPayments.status, "REJETE")
        )
      )
      .orderBy(asc(customerPayments.paymentDate)),
    d
      .select({
        date: supplierPayments.paymentDate,
        method: supplierPayments.paymentMethod,
        ref: supplierPayments.referenceNumber,
        amount: supplierPayments.amountCents,
        name: suppliers.name,
      })
      .from(supplierPayments)
      .innerJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
      .where(
        and(
          gte(supplierPayments.paymentDate, mStart),
          lte(supplierPayments.paymentDate, mEnd),
          ne(supplierPayments.status, "REJETE")
        )
      )
      .orderBy(asc(supplierPayments.paymentDate)),
  ]);

  const writeTreasuryJournal = (title: string, cash: boolean) => {
    out.push("");
    out.push(title);
    out.push("Date;Libelle;Reference;Encaissement;Decaissement");
    const rowsT = [
      ...custPays
        .filter((p) => ((p.method ?? "") === "ESPECES") === cash)
        .map((p) => ({ date: p.date, label: `Client ${p.name}`, ref: p.ref, enc: p.amount, dec: 0 })),
      ...supPays
        .filter((p) => ((p.method ?? "") === "ESPECES") === cash)
        .map((p) => ({ date: p.date, label: `Fournisseur ${p.name}`, ref: p.ref, enc: 0, dec: p.amount })),
    ].sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());

    let enc = 0;
    let dec = 0;
    for (const r of rowsT) {
      enc += r.enc;
      dec += r.dec;
      out.push(
        [
          fmtDate((r.date ?? new Date()).toISOString()),
          esc(r.label),
          esc(r.ref ?? ""),
          r.enc ? money(r.enc) : "",
          r.dec ? money(r.dec) : "",
        ].join(";")
      );
    }
    out.push(`TOTAUX;;;${money(enc)};${money(dec)}`);
    out.push(`SOLDE ${cash ? "CAISSE" : "BANQUE"};;;${money(enc - dec)};`);
  };
  writeTreasuryJournal("Journal de Caisse (especes)", true);
  writeTreasuryJournal("Journal de Banque (cheque / effet / virement)", false);

  out.push("");
  out.push("Bilan TVA");
  out.push(`Periode;${esc(tva.periodLabel)}`);
  out.push(`TVA collectee (${tva.tvaCollectedRate}%);${money(tva.tvaCollectedCents)}`);
  out.push(`TVA deductible achats (${tva.tvaDeductibleRate}%);${money(tva.tvaDeductiblePurchasesCents)}`);
  out.push(`TVA deductible charges;${money(tva.tvaDeductibleExpensesCents)}`);
  out.push(`TVA nette ${tva.isCreditTva ? "(credit)" : "(a payer)"};${money(tva.netTvaDueCents)}`);

  const csv = "\uFEFF" + out.join("\r\n");
  const filename = `TVA_${tva.periodLabel.replace(/\s+/g, "-")}.csv`;
  return { filename, csv };
}
