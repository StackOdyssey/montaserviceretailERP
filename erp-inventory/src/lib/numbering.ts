// Numérotation documentaire séquentielle et sans rupture (gapless), atomique.
// S'appuie sur la table `numbering_sequences` (clé (doc_type, year, scope) NULLS NOT DISTINCT).
// Accepte un client (db ou transaction) pour s'exécuter DANS la transaction d'écriture.
import { sql, type SQL } from "drizzle-orm";

export type SqlExecutor = { execute: (query: SQL) => Promise<unknown> };

const PREFIX_COLUMN: Record<string, string> = {
  DEVIS: "devis_prefix",
  BC: "bc_prefix",
  BL: "bl_prefix",
  FAC: "fac_prefix",
  AV: "av_prefix",
  BR: "br_prefix",
};

export interface GeneratedNumber {
  docNumber: string;
  sequenceNo: number;
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const r = result as { rows?: Array<Record<string, unknown>> } | undefined;
  return r?.rows ?? [];
}

/**
 * Réserve et renvoie le prochain numéro pour (type, année, ligne).
 * Atomique : un seul upsert, sûr sous concurrence ; à exécuter dans la transaction d'écriture.
 */
export async function nextDocumentNumber(
  exec: SqlExecutor,
  opts: { docType: string; year: number; businessLineId?: number | null }
): Promise<GeneratedNumber> {
  const col = PREFIX_COLUMN[opts.docType] ?? "bl_prefix";
  const settingsRows = rowsOf(
    await exec.execute(sql`select ${sql.raw(col)} as prefix, number_width from settings limit 1`)
  );
  const prefix = (settingsRows[0]?.prefix as string | undefined) ?? `${opts.docType}-`;
  const width = Number(settingsRows[0]?.number_width ?? 5);
  const scope = opts.businessLineId ?? null;

  const result = await exec.execute(sql`
    INSERT INTO numbering_sequences (doc_type, year, scope_business_line_id, prefix, width, next_number)
    VALUES (${opts.docType}, ${opts.year}, ${scope}, ${prefix}, ${width}, 2)
    ON CONFLICT (doc_type, year, scope_business_line_id)
    DO UPDATE SET next_number = numbering_sequences.next_number + 1, updated_at = now()
    RETURNING next_number - 1 AS assigned, prefix, width
  `);

  const row = rowsOf(result)[0];
  const sequenceNo = Number(row.assigned);
  const docNumber = `${row.prefix}${opts.year}-${String(sequenceNo).padStart(Number(row.width), "0")}`;
  return { docNumber, sequenceNo };
}
