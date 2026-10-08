"use server";

import { asc, eq } from "drizzle-orm";
import { businessLines, db } from "@/db";

export interface BusinessLineDTO {
  id: number;
  code: string;
  displayName: string;
}

const FALLBACK: BusinessLineDTO[] = [
  { id: 1, code: "PIECES", displayName: "Pièces moto" },
  { id: 2, code: "VEHICULES", displayName: "Quads & Buggy" },
];

/** Lignes métier actives (avec repli sûr si la base n'est pas joignable). */
export async function getBusinessLines(): Promise<BusinessLineDTO[]> {
  try {
    if (!db) throw new Error("no-db");
    const rows = await db
      .select({
        id: businessLines.id,
        code: businessLines.code,
        displayName: businessLines.displayName,
      })
      .from(businessLines)
      .where(eq(businessLines.isActive, true))
      .orderBy(asc(businessLines.sortOrder));
    return rows.length ? rows : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
