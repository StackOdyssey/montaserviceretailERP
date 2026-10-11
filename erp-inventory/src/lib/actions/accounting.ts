"use server";

import { and, asc, eq } from "drizzle-orm";
import { accountingPeriods, db } from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";
import { getTvaAccountingExport } from "./analytics";

export interface AccountingPeriodItem {
  id: number;
  year: number;
  month: number;
  status: "OPEN" | "LOCKED";
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
    status: r.status as "OPEN" | "LOCKED",
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

/** Verrouille (clôture) ou déverrouille une période comptable. */
export async function setPeriodLock(
  year: number,
  month: number,
  locked: boolean,
  notes?: string
): Promise<AccountingPeriodItem> {
  await assertAuthenticated();
  const d = requireDb();
  const status = locked ? "LOCKED" : "OPEN";
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
        .set({ status, lockedAt: locked ? new Date() : null, notes: notes ?? existing.notes })
        .where(eq(accountingPeriods.id, existing.id))
        .returning()
    )[0];
    return toItem(updated);
  }

  const inserted = (
    await d
      .insert(accountingPeriods)
      .values({ year, month, status, lockedAt: locked ? new Date() : null, notes: notes ?? null })
      .returning()
  )[0];
  return toItem(inserted);
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
  const monthIdx = options?.month !== undefined ? options.month - 1 : new Date().getMonth();
  const tva = await getTvaAccountingExport({ year: options?.year, month: monthIdx });

  const out: string[] = [];
  out.push("Journal des Ventes (TVA collectee)");
  out.push("Date;N°;Client;ICE;H.T.;Remise;Net H.T.;TVA;T.T.C.;Reglement");
  for (const s of tva.salesLines) {
    out.push(
      [
        fmtDate(s.date),
        s.docNumber,
        esc(s.customerName),
        s.customerIce ?? "",
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
  out.push("Date;N° BR;Fournisseur;ICE;N° Facture;H.T.;TVA;T.T.C.");
  for (const p of tva.purchaseLines) {
    out.push(
      [
        fmtDate(p.date),
        p.receiptNumber,
        esc(p.supplierName),
        p.supplierIce ?? "",
        p.invoiceNumber ?? "",
        money(p.totalHtCents),
        money(p.tvaAmountCents),
        money(p.totalTtcCents),
      ].join(";")
    );
  }

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
