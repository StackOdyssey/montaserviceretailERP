"use server";

import { and, asc, eq, gt, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
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

export interface DailySheetData {
  from: string;
  to: string;
  sales: Array<{ docType: string; count: number; totalTtcCents: number; totalHtCents: number; tvaCents: number }>;
  encaissements: Array<{ method: string; count: number; amountCents: number }>;
  decaissements: Array<{ method: string; count: number; amountCents: number }>;
  expensesCents: number;
  expenseCount: number;
  cashEspeceNetCents: number;
  cancelledDocs: number;
}

/**
 * Feuille de journée (legacy feuilleJournee) : synthèse d'activité sur une plage
 * de dates — ventes par type de doc, encaissements par mode, décaissements FRS,
 * dépenses caisse, et position espèces nette.
 */
export async function getDailySheet(from: string, to: string): Promise<DailySheetData> {
  await assertAuthenticated();
  const d = requireDb();
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59.999`);

  const sales = await d
    .select({
      docType: salesDocuments.docType,
      count: sql<number>`count(*)`,
      totalTtcCents: sql<number>`coalesce(sum(${salesDocuments.totalTtcCents}),0)::bigint`,
      totalHtCents: sql<number>`coalesce(sum(${salesDocuments.totalNetHtCents}),0)::bigint`,
      tvaCents: sql<number>`coalesce(sum(${salesDocuments.tvaAmountCents}),0)::bigint`,
    })
    .from(salesDocuments)
    .where(and(
      gte(salesDocuments.docDate, fromDate),
      lte(salesDocuments.docDate, toDate),
      or(eq(salesDocuments.status, "VALIDE"), eq(salesDocuments.status, "PAYE")),
      // Chiffre d'affaires : BL/FACTURE (− AVOIR). DEVIS/BC ne sont pas des ventes ;
      // une facture issue de BL ne recompte pas une vente déjà comptée au BL.
      or(eq(salesDocuments.docType, "BL"), eq(salesDocuments.docType, "FACTURE"), eq(salesDocuments.docType, "AVOIR")),
      sql`not exists (select 1 from document_links dl where dl.target_document_id = ${salesDocuments.id} and dl.link_type = 'BL_TO_FAC')`
    ))
    .groupBy(salesDocuments.docType);

  const encaissements = await d
    .select({
      method: customerPayments.paymentMethod,
      count: sql<number>`count(*)`,
      amountCents: sql<number>`coalesce(sum(${customerPayments.amountCents}),0)::bigint`,
    })
    .from(customerPayments)
    .where(and(
      gte(customerPayments.paymentDate, fromDate),
      lte(customerPayments.paymentDate, toDate),
      ne(customerPayments.status, "REJETE")
    ))
    .groupBy(customerPayments.paymentMethod);

  // Paiement immédiat à la vente : les docs soldés à la validation n'écrivent
  // pas de ligne customer_payments — le résiduel (paid - paiements liés)
  // représente l'encaissement au comptoir de ce jour.
  const docPaidRows = await d
    .select({ paymentMethod: salesDocuments.paymentMethod, paid: salesDocuments.paidAmountCents, id: salesDocuments.id })
    .from(salesDocuments)
    .where(and(
      gte(salesDocuments.docDate, fromDate),
      lte(salesDocuments.docDate, toDate),
      sql`${salesDocuments.paidAmountCents} > 0`,
      // Seules les ventes comptoir anonymes n'ont pas de ligne customer_payments
      // (client identifié ⇒ règlement enregistré à la vente) ; un BL soldé par lettrage
      // FIFO ne doit pas être recompté.
      isNull(salesDocuments.customerId),
      or(eq(salesDocuments.docType, "BL"), eq(salesDocuments.docType, "FACTURE")),
      sql`not exists (select 1 from document_links dl where dl.target_document_id = ${salesDocuments.id} and dl.link_type = 'BL_TO_FAC')`,
      or(eq(salesDocuments.status, "VALIDE"), eq(salesDocuments.status, "PAYE"))
    ));
  const paidByDoc = new Map<string, { count: number; amountCents: number }>();
  const addPaid = (method: string, amount: number, count: number) => {
    const e = paidByDoc.get(method) ?? { count: 0, amountCents: 0 };
    e.count += count; e.amountCents += amount;
    paidByDoc.set(method, e);
  };
  for (const e of encaissements) addPaid(e.method, Number(e.amountCents), Number(e.count));
  for (const doc of docPaidRows) {
    const linked = (await d
      .select({ s: sql<number>`coalesce(sum(${customerPayments.amountCents}),0)::bigint` })
      .from(customerPayments)
      .where(and(eq(customerPayments.documentId, doc.id), ne(customerPayments.status, "REJETE"))))[0];
    const residual = doc.paid - Number(linked.s);
    if (residual > 0) addPaid(doc.paymentMethod ?? "ESPECES", residual, 1);
  }

  const decaissements = await d
    .select({
      method: supplierPayments.paymentMethod,
      count: sql<number>`count(*)`,
      amountCents: sql<number>`coalesce(sum(${supplierPayments.amountCents}),0)::bigint`,
    })
    .from(supplierPayments)
    .where(and(
      gte(supplierPayments.paymentDate, fromDate),
      lte(supplierPayments.paymentDate, toDate),
      ne(supplierPayments.status, "REJETE")
    ))
    .groupBy(supplierPayments.paymentMethod);

  const [exp] = await d
    .select({
      total: sql<number>`coalesce(sum(${expenses.amountCents}),0)::bigint`,
      count: sql<number>`count(*)`,
    })
    .from(expenses)
    .where(and(gte(expenses.expenseDate, fromDate), lte(expenses.expenseDate, toDate)));

  const [cancelled] = await d
    .select({ n: sql<number>`count(*)` })
    .from(salesDocuments)
    .where(and(
      gte(salesDocuments.docDate, fromDate),
      lte(salesDocuments.docDate, toDate),
      eq(salesDocuments.status, "ANNULE")
    ));

  const especesIn = paidByDoc.get("ESPECES")?.amountCents ?? 0;
  const especesOut = decaissements.find((e) => e.method === "ESPECES")?.amountCents ?? 0;

  return {
    from,
    to,
    sales: sales.map((s) => {
      const sign = s.docType === "AVOIR" ? -1 : 1;
      return {
        docType: s.docType,
        count: Number(s.count),
        totalTtcCents: sign * Number(s.totalTtcCents),
        totalHtCents: sign * Number(s.totalHtCents),
        tvaCents: sign * Number(s.tvaCents),
      };
    }),
    encaissements: [...paidByDoc.entries()].map(([method, e]) => ({ method, count: e.count, amountCents: e.amountCents })),
    decaissements: decaissements.map((e) => ({ method: e.method, count: Number(e.count), amountCents: Number(e.amountCents) })),
    expensesCents: Number(exp?.total ?? 0),
    expenseCount: Number(exp?.count ?? 0),
    cashEspeceNetCents: Number(especesIn) - Number(especesOut) - Number(exp?.total ?? 0),
    cancelledDocs: Number(cancelled?.n ?? 0),
  };
}

// ==========================================
// G15 — CA MENSUEL (chiffre d'affaires par mois)
// ==========================================

export interface MonthlyRevenueData {
  /** 12 derniers mois : total TTC signé + même mois N-1 pour comparaison. */
  months: Array<{ ym: string; totalTtcCents: number; priorYearCents: number }>;
  byCommercial: Array<{ name: string; totalTtcCents: number }>;
  topClients: Array<{ name: string; totalTtcCents: number }>;
}

/**
 * CA TTC par mois (12 derniers + N-1), par commercial et top clients.
 * Même convention que getDailySheet : BL/FACTURE +, AVOIR −, VALE/PAYE,
 * BL→FAC dédupliqué via document_links.
 */
export async function getMonthlyRevenue(): Promise<ActionResult<MonthlyRevenueData>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const salesConds = and(
      or(eq(salesDocuments.status, "VALIDE"), eq(salesDocuments.status, "PAYE")),
      or(eq(salesDocuments.docType, "BL"), eq(salesDocuments.docType, "FACTURE"), eq(salesDocuments.docType, "AVOIR")),
      sql`not exists (select 1 from document_links dl where dl.target_document_id = ${salesDocuments.id} and dl.link_type = 'BL_TO_FAC')`,
      isNull(salesDocuments.deletedAt)
    );
    const signedTotal = sql<number>`coalesce(sum(case when ${salesDocuments.docType} = 'AVOIR' then -${salesDocuments.totalTtcCents} else ${salesDocuments.totalTtcCents} end),0)::bigint`;

    const [monthRows, comRows, cliRows] = await Promise.all([
      d.select({
        ym: sql<string>`to_char(${salesDocuments.docDate}, 'YYYY-MM')`,
        total: signedTotal,
      }).from(salesDocuments).where(salesConds).groupBy(sql`1`),
      d.select({
        name: salesDocuments.commercialName,
        total: signedTotal,
      }).from(salesDocuments)
        .where(and(salesConds, gte(salesDocuments.docDate, sql`(date_trunc('month', now()) - interval '11 months')::timestamp`)))
        .groupBy(salesDocuments.commercialName)
        .orderBy(sql`2 desc`),
      d.select({
        name: salesDocuments.customerName,
        total: signedTotal,
      }).from(salesDocuments)
        .where(and(salesConds, gte(salesDocuments.docDate, sql`(date_trunc('month', now()) - interval '11 months')::timestamp`)))
        .groupBy(salesDocuments.customerName)
        .orderBy(sql`2 desc`)
        .limit(10),
    ]);

    const byYm = new Map(monthRows.map((r) => [r.ym, Number(r.total)]));
    const months: MonthlyRevenueData["months"] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const cur = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      const prior = `${cur.getFullYear() - 1}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        ym,
        totalTtcCents: byYm.get(ym) ?? 0,
        priorYearCents: byYm.get(prior) ?? 0,
      });
    }
    return {
      months,
      byCommercial: comRows.map((r) => ({ name: r.name ?? "Non attribué", totalTtcCents: Number(r.total) })),
      topClients: cliRows.map((r) => ({ name: r.name, totalTtcCents: Number(r.total) })),
    };
  });
}
