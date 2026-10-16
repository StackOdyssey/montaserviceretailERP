// Contrôle pré-migration 0018 (lecture seule). Usage: node --env-file=.env.local scripts/pre-0018-check.mjs
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL manquant");
const sql = neon(url);

const units = await sql.query("SELECT count(*)::int AS n FROM stock_units");
const flagged = await sql.query("SELECT count(*)::int AS n FROM products WHERE is_serialized = true");
const total = await sql.query("SELECT count(*)::int AS n FROM products");
console.log("stock_units rows:", units[0]?.n);
console.log("products with is_serialized=true:", flagged[0]?.n);
console.log("products total:", total[0]?.n);
if ((units[0]?.n ?? 0) > 0 || (flagged[0]?.n ?? 0) > 0) {
  console.error("REFUS: données Side 2 présentes — migration 0018 non sûre en l'état.");
  process.exit(1);
}
console.log("OK — DROP sûr (table vide, aucune pièce sérialisée).");
