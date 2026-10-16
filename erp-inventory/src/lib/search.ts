import { and, ilike, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// Voyelles (dont accentuées) ignorées par la comparaison floue.
// Les noms translittérés varient souvent sur les voyelles : Bennani/Bannani,
// Mohamed/Mohammed, El/Al… Le squelette consonantique les réconcilie.
const VOWELS = "aeiouyàâäéèêëîïôöùûüÿæœ";

function searchTokens(query: string | undefined): string[] {
  return (query ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[\\%_]/g, ""))
    .filter((t) => t.length > 0);
}

function skeleton(token: string): string {
  let out = "";
  for (const ch of token) if (!VOWELS.includes(ch)) out += ch;
  return out;
}

/**
 * Recherche tolérante multi-mots pour les combobox caisse :
 * - chaque mot doit apparaître (sous-chaîne, insensible à la casse) dans l'une des colonnes ;
 * - les mots se combinent en ET, ordre indifférent (« bennani el » retrouve « EL BANNANI ») ;
 * - repli flou : le squelette consonantique du mot est aussi cherché dans les colonnes
 *   `fuzzyCols` (« bennani » ou « ben » retrouve « EL BANNANI »).
 * Retourne `undefined` si la requête est vide (aucun filtre).
 */
export function matchTokens(
  query: string | undefined,
  fuzzyCols: PgColumn[],
  plainCols: PgColumn[] = []
): SQL | undefined {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return undefined;
  const all = [...fuzzyCols, ...plainCols];
  return and(
    ...tokens.map((t) => {
      const ors: SQL[] = all.map((c) => ilike(c, `%${t}%`));
      const sk = skeleton(t);
      if (sk.length > 0) {
        for (const c of fuzzyCols) {
          ors.push(ilike(sql`translate(lower(${c}), ${VOWELS}, '')`, `%${sk}%`));
        }
      }
      return or(...ors)!;
    })
  )!;
}
