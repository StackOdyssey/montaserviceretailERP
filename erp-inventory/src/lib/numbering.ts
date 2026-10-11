// Numérotation documentaire séquentielle et sans rupture (gapless), atomique.
// S'appuie sur la table `numbering_sequences` (clé (doc_type, year, scope) NULLS NOT DISTINCT).
import { sql } from "drizzle-orm";
import { db, settings } from "@/db";

type SettingsRow = typeof settings.$inferSelect;

const PREFIX_FIELD: Record<string, keyof SettingsRow> = {
  DEVIS: "devisPrefix",
  BC: "bcPrefix",
  BL: "blPrefix",
  FAC: "facPrefix",
  AV: "avPrefix",
  BR: "brPrefix",
};

export interface GeneratedNumber {
  docNumber: string;
  sequenceNo: number;
}

/**
 * Réserve et renvoie le prochain numéro pour (type, année, ligne).
 * Atomique : un seul upsert, sûr même avec plusieurs instances Cloud Run concurrentes.
 */
export async function nextDocumentNumber(opts: {
  docType: string;
  year: number;
  businessLineId?: number | null;
}): Promise<GeneratedNumber> {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");

  const s = (await db.select().from(settings).limit(1))[0];
  const field = PREFIX_FIELD[opts.docType];
  const prefix = (field ? (s?.[field] as string | undefined) : undefined) ?? `${opts.docType}-`;
  const width = s?.numberWidth ?? 5;
  const scope = opts.businessLineId ?? null;

  const result = await db.execute(sql`
    INSERT INTO numbering_sequences (doc_type, year, scope_business_line_id, prefix, width, next_number)
    VALUES (${opts.docType}, ${opts.year}, ${scope}, ${prefix}, ${width}, 2)
    ON CONFLICT (doc_type, year, scope_business_line_id)
    DO UPDATE SET next_number = numbering_sequences.next_number + 1, updated_at = now()
    RETURNING next_number - 1 AS assigned, prefix, width
  `);

  const rows = (result as unknown as {
    rows: Array<{ assigned: number; prefix: string; width: number }>;
  }).rows;
  const row = rows[0];
  const sequenceNo = Number(row.assigned);
  const docNumber = `${row.prefix}${opts.year}-${String(sequenceNo).padStart(Number(row.width), "0")}`;
  return { docNumber, sequenceNo };
}
