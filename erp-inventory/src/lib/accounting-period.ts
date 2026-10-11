// Verrouillage des périodes comptables (module sans dépendance : utilisable par les actions d'écriture).
import { and, eq } from "drizzle-orm";
import { accountingPeriods, db } from "@/db";

/** Lève une erreur si la période (année/mois) de la date est clôturée (LOCKED). */
export async function assertPeriodOpen(date: Date = new Date()): Promise<void> {
  if (!db) return;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const row = (
    await db
      .select({ status: accountingPeriods.status })
      .from(accountingPeriods)
      .where(and(eq(accountingPeriods.year, year), eq(accountingPeriods.month, month)))
      .limit(1)
  )[0];
  if (row?.status === "LOCKED") {
    throw new Error(`Période ${String(month).padStart(2, "0")}/${year} clôturée : aucune écriture possible.`);
  }
}
