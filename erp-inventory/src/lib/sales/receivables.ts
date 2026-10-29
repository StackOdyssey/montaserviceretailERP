// Règle unique « créance client » (soldes, relevés, balance âgée) :
// BL non facturé + FACTURE = débit ; AVOIR = crédit ; DEVIS/BC = aucun effet.
// Un BL converti (lien BL_TO_FAC) est remplacé par sa facture : ne pas le compter deux fois.
import { eq } from "drizzle-orm";
import { db, documentLinks } from "@/db";

export async function convertedBlIds(): Promise<Set<number>> {
  if (!db) return new Set();
  const rows = await db
    .select({ id: documentLinks.sourceDocumentId })
    .from(documentLinks)
    .where(eq(documentLinks.linkType, "BL_TO_FAC"));
  return new Set(rows.map((r) => r.id));
}

/** +1 débit, -1 crédit, 0 sans effet sur le solde client. */
export function receivableSign(docType: string, docId: number, converted: Set<number>): 1 | -1 | 0 {
  if (docType === "FACTURE") return 1;
  if (docType === "BL") return converted.has(docId) ? 0 : 1;
  if (docType === "AVOIR") return -1;
  return 0;
}
