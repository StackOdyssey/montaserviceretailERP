"use server";

import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { db, expenses } from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";
import { assertPeriodOpen } from "@/lib/accounting-period";
import type { ExpenseCategory, ExpenseItem } from "@/lib/constants/expenses";

export type { ExpenseCategory, ExpenseItem };

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

type ExpenseRow = typeof expenses.$inferSelect;

function mapExpense(r: ExpenseRow): ExpenseItem {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    categoryId: r.categoryId,
    amountCents: r.amountCents,
    amountHtCents: r.amountHtCents,
    tvaRate: r.tvaRate,
    tvaAmountCents: r.tvaAmountCents,
    expenseDate: (r.expenseDate ?? r.createdAt ?? new Date()).toISOString(),
    receiptPhotoUrl: r.receiptPhotoUrl,
    notes: r.notes,
    createdAt: (r.createdAt ?? new Date()).toISOString(),
  };
}

/**
 * Dépenses de caisse (base) avec filtres et statistiques.
 */
export async function getExpenses(options?: {
  category?: string;
  period?: "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "ALL";
  search?: string;
}) {
  await assertAuthenticated();
  const d = requireDb();

  const period = options?.period || "THIS_MONTH";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday.getTime() - ((now.getDay() + 6) % 7) * 24 * 3600 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const conds = [];
  if (options?.category && options.category !== "ALL") conds.push(eq(expenses.category, options.category));
  if (options?.search) conds.push(ilike(expenses.title, `%${options.search.trim()}%`));
  const periodStart =
    period === "TODAY"
      ? startOfToday
      : period === "THIS_WEEK"
        ? startOfWeek
        : period === "THIS_MONTH"
          ? startOfMonth
          : null;
  if (periodStart) conds.push(gte(expenses.expenseDate, periodStart));

  const rows = await d
    .select()
    .from(expenses)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(expenses.expenseDate))
    .limit(500);

  const todayRow = (
    await d
      .select({ n: sql<string>`coalesce(sum(${expenses.amountCents}),0)::bigint` })
      .from(expenses)
      .where(gte(expenses.expenseDate, startOfToday))
  )[0];
  const monthRow = (
    await d
      .select({ n: sql<string>`coalesce(sum(${expenses.amountCents}),0)::bigint` })
      .from(expenses)
      .where(gte(expenses.expenseDate, startOfMonth))
  )[0];
  const catRows = await d
    .select({ category: expenses.category, total: sql<string>`coalesce(sum(${expenses.amountCents}),0)::bigint` })
    .from(expenses)
    .where(gte(expenses.expenseDate, startOfMonth))
    .groupBy(expenses.category);

  const categoryTotals: Record<string, number> = {};
  for (const r of catRows) {
    categoryTotals[r.category] = Number(r.total);
  }

  return {
    expenses: rows.map(mapExpense),
    stats: {
      todayTotalCents: Number(todayRow?.n ?? 0),
      monthTotalCents: Number(monthRow?.n ?? 0),
      categoryTotals,
    },
  };
}

/**
 * Enregistre une dépense de caisse.
 */
export async function recordExpense(data: {
  title: string;
  category: string;
  categoryId?: number | null;
  amountHtCents?: number;
  amountCents?: number; // legacy : TTC
  tvaRate?: number;
  expenseDate?: string;
  receiptPhotoUrl?: string;
  notes?: string;
}): Promise<ExpenseItem> {
  await assertAuthenticated();
  const d = requireDb();
  await assertPeriodOpen(data.expenseDate ? new Date(data.expenseDate) : new Date());

  if (!data.title.trim()) throw new Error("L'intitulé de la dépense est obligatoire");

  const rate = data.tvaRate ?? 20;
  let ht: number;
  let tva: number;
  let ttc: number;
  if (typeof data.amountHtCents === "number") {
    ht = data.amountHtCents;
    tva = Math.round((ht * rate) / 100);
    ttc = ht + tva;
  } else {
    ttc = data.amountCents ?? 0;
    ht = Math.round(ttc / (1 + rate / 100));
    tva = ttc - ht;
  }
  if (ttc <= 0) throw new Error("Le montant de la dépense doit être supérieur à 0");

  const row = (
    await d
      .insert(expenses)
      .values({
        title: data.title.trim(),
        category: data.category,
        categoryId: data.categoryId ?? null,
        amountCents: ttc,
        amountHtCents: ht,
        tvaRate: rate,
        tvaAmountCents: tva,
        expenseDate: data.expenseDate ? new Date(data.expenseDate) : new Date(),
        receiptPhotoUrl: data.receiptPhotoUrl ?? null,
        notes: data.notes ?? null,
      })
      .returning()
  )[0];

  return mapExpense(row);
}

/**
 * Supprime une dépense.
 */
export async function deleteExpense(id: number) {
  await assertAuthenticated();
  const d = requireDb();
  await d.delete(expenses).where(eq(expenses.id, id));
  return { success: true };
}
