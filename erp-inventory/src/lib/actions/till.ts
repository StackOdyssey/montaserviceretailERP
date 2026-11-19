"use server";

import { and, desc, eq, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  auditLogs,
  businessLines,
  cashierDays,
  customerPayments,
  expenses,
  salesDocuments,
  salesTenders,
  users,
} from "@/db/schema";
import { assertAuthenticated, currentActor } from "@/lib/action-guard";
import { actionResult, type ActionResult } from "@/lib/action-result";
import { requireDb } from "@/lib/sales/shared";

// Modes déclarés à la clôture : voir src/lib/till-constants.ts (un fichier
// "use server" ne peut exporter que des fonctions async — vérifiable à l'appel).

export interface TillDayItem {
  id: number;
  status: string;
  openedBy: string | null;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  floatCents: number;
  floatDenominations: Record<string, number> | null;
  declaredTenders: Record<string, number> | null;
  theoreticalTenders: Record<string, number> | null;
  observation: string | null;
}

export interface TillModeStat {
  method: string;
  salesCents: number; // encaissé via ventes du jour (sales_tenders)
  settlementsCents: number; // règlements de créances antérieures (customer_payments)
  totalCents: number;
}

export interface TillStats {
  journee: TillDayItem;
  /** Théorique par mode : ventes + règlements clients. */
  byMethod: TillModeStat[];
  /** Espèces en tiroir = fond + espèces encaissées − dépenses caisse. */
  cashDrawerCents: number;
  ticketCount: number;
  salesNetCents: number; // CA net (BL/FACTURE − AVOIR)
  returnsCents: number;
  expensesCents: number;
  expenseRows: Array<{ id: number; title: string; amountCents: number; category: string }>;
  /** Ventes du jour non soldées (crédit partiel/total). */
  unpaidSales: Array<{ docNumber: string; customerName: string; totalCents: number; remainingCents: number }>;
  /** C7 — plafond caisse du caissier connecté (legacy employe.plafond). null = pas de limite. */
  plafondCents: number | null;
}

async function businessLineId(code?: string): Promise<number> {
  const d = requireDb();
  const line = (
    await d
      .select({ id: businessLines.id })
      .from(businessLines)
      .where(eq(businessLines.code, code || "PIECES"))
      .limit(1)
  )[0];
  if (!line) throw new Error("LIGNE_METIER_INTROUVABLE");
  return line.id;
}

const toItem = (r: typeof cashierDays.$inferSelect): TillDayItem => ({
  id: r.id,
  status: r.status,
  openedBy: r.openedBy,
  openedAt: r.openedAt?.toISOString() ?? "",
  closedBy: r.closedBy,
  closedAt: r.closedAt?.toISOString() ?? null,
  floatCents: r.floatCents,
  floatDenominations: (r.floatDenominations as Record<string, number> | null) ?? null,
  declaredTenders: (r.declaredTenders as Record<string, number> | null) ?? null,
  theoreticalTenders: (r.theoreticalTenders as Record<string, number> | null) ?? null,
  observation: r.observation,
});

/** Journée ouverte de la ligne métier (null si la caisse doit être ouverte). */
export async function getOpenTillDay(businessLineCode?: string): Promise<ActionResult<TillDayItem | null>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const row = (
      await d
        .select()
        .from(cashierDays)
        .where(and(eq(cashierDays.businessLineId, await businessLineId(businessLineCode)), eq(cashierDays.status, "OUVERTE")))
        .orderBy(desc(cashierDays.openedAt))
        .limit(1)
    )[0];
    return row ? toItem(row) : null;
  });
}

/** C1+C2 — ouverture de journée : fond de caisse + comptage par coupure. */
export async function openTillDay(data: {
  businessLineCode?: string;
  floatCents: number;
  denominations?: Record<string, number>;
}): Promise<ActionResult<TillDayItem>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const lineId = await businessLineId(data.businessLineCode);
    const actor = await currentActor();

    return await d.transaction(async (tx) => {
      const existing = (
        await tx
          .select({ id: cashierDays.id })
          .from(cashierDays)
          .where(and(eq(cashierDays.businessLineId, lineId), eq(cashierDays.status, "OUVERTE")))
          .for("update")
          .limit(1)
      )[0];
      if (existing) throw new Error("JOURNEE_DEJA_OUVERTE: la journée de caisse est déjà ouverte");

      const row = (
        await tx
          .insert(cashierDays)
          .values({
            businessLineId: lineId,
            openedBy: actor,
            floatCents: data.floatCents,
            floatDenominations: data.denominations ?? null,
          })
          .returning()
      )[0];
      await tx.insert(auditLogs).values({
        action: "OUVERTURE_JOURNEE",
        entityType: "CASHIER_DAY",
        entityId: row.id,
        actorName: actor,
        details: `Ouverture caisse #${row.id} — fond ${(data.floatCents / 100).toFixed(2)} DH`,
      });
      return toItem(row);
    });
  });
}

/**
 * Théorique par mode pour la journée : sales_tenders sur les docs du jour
 * (non annulés) + règlements de créances (customer_payments du jour rattachés
 * à un doc antérieur ou sans doc). Les jambes de règlement à la vente écrivent
 * déjà dans sales_tenders — ne pas les recompter via customer_payments.
 */
async function computeTheoretical(d: ReturnType<typeof requireDb>, lineId: number, dayStart: Date) {
  const tenderRows = await d
    .select({
      method: salesTenders.method,
      total: sql<number>`coalesce(sum(${salesTenders.amountCents}),0)::bigint`,
    })
    .from(salesTenders)
    .innerJoin(salesDocuments, eq(salesDocuments.id, salesTenders.documentId))
    .where(
      and(
        eq(salesDocuments.businessLineId, lineId),
        gte(salesDocuments.docDate, dayStart),
        ne(salesDocuments.status, "ANNULE")
      )
    )
    .groupBy(salesTenders.method);

  // Règlements du jour non liés à un doc du jour = encaissement de créances.
  const settlementRows = await d
    .select({
      method: customerPayments.paymentMethod,
      total: sql<number>`coalesce(sum(${customerPayments.amountCents}),0)::bigint`,
    })
    .from(customerPayments)
    .where(
      and(
        gte(customerPayments.paymentDate, dayStart),
        ne(customerPayments.status, "REJETE"),
        or(
          isNull(customerPayments.documentId),
          sql`not exists (select 1 from sales_documents d2 where d2.id = ${customerPayments.documentId} and d2.doc_date >= ${dayStart})`
        )
      )
    )
    .groupBy(customerPayments.paymentMethod);

  const map = new Map<string, { sales: number; settlements: number }>();
  for (const r of tenderRows) {
    const e = map.get(r.method) ?? { sales: 0, settlements: 0 };
    e.sales += Number(r.total);
    map.set(r.method, e);
  }
  for (const r of settlementRows) {
    const e = map.get(r.method) ?? { sales: 0, settlements: 0 };
    e.settlements += Number(r.total);
    map.set(r.method, e);
  }
  return map;
}

/** C8 — stats live de la journée ouverte (panneau droit / modal caisse). */
export async function getTillStats(businessLineCode?: string): Promise<ActionResult<TillStats | null>> {
  return actionResult(async () => {
    const session = await assertAuthenticated();
    const d = requireDb();
    const lineId = await businessLineId(businessLineCode);
    // C7 — plafond de liquidité du caissier connecté (null session PIN maître).
    const plafondCents =
      session.uid != null
        ? (
            await d
              .select({ p: users.plafondCents })
              .from(users)
              .where(eq(users.id, session.uid))
              .limit(1)
          )[0]?.p ?? null
        : null;
    const journee = (
      await d
        .select()
        .from(cashierDays)
        .where(and(eq(cashierDays.businessLineId, lineId), eq(cashierDays.status, "OUVERTE")))
        .orderBy(desc(cashierDays.openedAt))
        .limit(1)
    )[0];
    if (!journee) return null;

    const dayStart = journee.openedAt ?? new Date();
    const theor = await computeTheoretical(d, lineId, dayStart);

    const expRows = await d
      .select({ id: expenses.id, title: expenses.title, amountCents: expenses.amountCents, category: expenses.category })
      .from(expenses)
      .where(eq(expenses.journeeId, journee.id));
    const expensesCents = expRows.reduce((s, e) => s + e.amountCents, 0);

    const salesAgg = await d
      .select({
        docType: salesDocuments.docType,
        n: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${salesDocuments.totalTtcCents}),0)::bigint`,
      })
      .from(salesDocuments)
      .where(
        and(
          eq(salesDocuments.businessLineId, lineId),
          gte(salesDocuments.docDate, dayStart),
          ne(salesDocuments.status, "ANNULE"),
          sql`${salesDocuments.docType} in ('BL','FACTURE','AVOIR')`,
          sql`not exists (select 1 from document_links dl where dl.target_document_id = ${salesDocuments.id} and dl.link_type = 'BL_TO_FAC')`
        )
      )
      .groupBy(salesDocuments.docType);

    const unpaid = await d
      .select({
        docNumber: salesDocuments.docNumber,
        customerName: salesDocuments.customerName,
        total: salesDocuments.totalTtcCents,
        paid: salesDocuments.paidAmountCents,
      })
      .from(salesDocuments)
      .where(
        and(
          eq(salesDocuments.businessLineId, lineId),
          gte(salesDocuments.docDate, dayStart),
          ne(salesDocuments.status, "ANNULE"),
          ne(salesDocuments.docType, "DEVIS"),
          lt(salesDocuments.paidAmountCents, salesDocuments.totalTtcCents)
        )
      )
      .orderBy(salesDocuments.docNumber);

    let salesNet = 0;
    let returns = 0;
    let ticketCount = 0;
    for (const s of salesAgg) {
      const t = Number(s.total);
      if (s.docType === "AVOIR") returns += t;
      else {
        salesNet += t;
        ticketCount += Number(s.n);
      }
    }
    salesNet -= returns;

    const especes = theor.get("ESPECES");
    return {
      journee: toItem(journee),
      byMethod: [...theor.entries()].map(([method, e]) => ({
        method,
        salesCents: e.sales,
        settlementsCents: e.settlements,
        totalCents: e.sales + e.settlements,
      })),
      cashDrawerCents: journee.floatCents + (especes?.sales ?? 0) + (especes?.settlements ?? 0) - expensesCents,
      ticketCount,
      salesNetCents: salesNet,
      returnsCents: returns,
      expensesCents,
      expenseRows: expRows.map((e) => ({ id: e.id, title: e.title, amountCents: e.amountCents, category: e.category })),
      unpaidSales: unpaid.map((u) => ({
        docNumber: u.docNumber,
        customerName: u.customerName ?? "Comptoir",
        totalCents: u.total,
        remainingCents: u.total - u.paid,
      })),
      plafondCents,
    };
  });
}

/** C3 — clôture : fige déclaré + théorique, calcule l'écart, clôt la journée. */
export async function closeTillDay(data: {
  journeeId: number;
  declared: Record<string, number>; // cents par mode
  observation?: string;
}): Promise<ActionResult<TillDayItem>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const actor = await currentActor();
    return await d.transaction(async (tx) => {
      const journee = (
        await tx
          .select()
          .from(cashierDays)
          .where(and(eq(cashierDays.id, data.journeeId), eq(cashierDays.status, "OUVERTE")))
          .for("update")
          .limit(1)
      )[0];
      if (!journee) throw new Error("JOURNEE_INTROUVABLE: déjà clôturée ou inexistante");

      const theor = await computeTheoretical(d, journee.businessLineId, journee.openedAt ?? new Date());
      const expRows = await tx
        .select({ t: sql<number>`coalesce(sum(${expenses.amountCents}),0)::bigint` })
        .from(expenses)
        .where(eq(expenses.journeeId, journee.id));
      const expCents = Number(expRows[0]?.t ?? 0);
      const theoretical: Record<string, number> = {};
      for (const [m, e] of theor) theoretical[m] = e.sales + e.settlements;
      // Espèces théoriques en tiroir = fond + encaissé − dépenses.
      theoretical.ESPECES = journee.floatCents + (theoretical.ESPECES ?? 0) - expCents;

      const variance =
        Object.entries(data.declared).reduce((s, [m, v]) => s + v - (theoretical[m] ?? 0), 0);

      const row = (
        await tx
          .update(cashierDays)
          .set({
            status: "CLOTUREE",
            closedBy: actor,
            closedAt: new Date(),
            declaredTenders: data.declared,
            theoreticalTenders: theoretical,
            observation: data.observation ?? null,
          })
          .where(eq(cashierDays.id, journee.id))
          .returning()
      )[0];
      await tx.insert(auditLogs).values({
        action: "CLOTURE_JOURNEE",
        entityType: "CASHIER_DAY",
        entityId: journee.id,
        actorName: actor,
        details: `Clôture caisse #${journee.id} — écart total ${(variance / 100).toFixed(2)} DH`,
      });
      return toItem(row);
    });
  });
}

/** C4 — dépense payée depuis le tiroir caisse de la journée ouverte. */
export async function recordTillExpense(data: {
  journeeId: number;
  title: string;
  category?: string;
  categoryId?: number | null;
  amountCents: number;
  notes?: string;
}): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    if (!data.title.trim()) throw new Error("LIBELLE_REQUIS: saisissez un motif de dépense");
    if (data.amountCents <= 0) throw new Error("MONTANT_INVALIDE");
    const journee = (
      await d.select({ id: cashierDays.id, status: cashierDays.status }).from(cashierDays).where(eq(cashierDays.id, data.journeeId)).limit(1)
    )[0];
    if (!journee || journee.status !== "OUVERTE") throw new Error("JOURNEE_FERMEE: ouvrez la journée avant de dépenser");
    const actor = await currentActor();
    const row = (
      await d
        .insert(expenses)
        .values({
          title: data.title.trim(),
          category: data.category ?? "AUTRE",
          categoryId: data.categoryId ?? null,
          amountCents: data.amountCents,
          amountHtCents: data.amountCents,
          tvaRate: 0,
          tvaAmountCents: 0,
          journeeId: journee.id,
          notes: data.notes ?? null,
        })
        .returning({ id: expenses.id })
    )[0];
    await d.insert(auditLogs).values({
      action: "DEPENSE_CAISSE",
      entityType: "EXPENSE",
      entityId: row.id,
      actorName: actor,
      details: `${data.title.trim()} — ${(data.amountCents / 100).toFixed(2)} DH (caisse #${journee.id})`,
    });
    return { id: row.id };
  });
}
