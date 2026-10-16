// Contrôle post-migration 0018 (lecture seule). Usage: node --env-file=.env.local scripts/post-0018-check.mjs
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL manquant");
const sql = neon(url);

const tables = await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('stock_units')");
console.log("stock_units existe:", tables.length > 0 ? "OUI (anormal)" : "non (attendu)");
const cols = await sql.query("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='is_serialized'");
console.log("products.is_serialized existe:", cols.length > 0 ? "OUI (anormal)" : "non (attendu)");
const total = await sql.query("SELECT count(*)::int AS n FROM products");
console.log("products total:", total[0]?.n);
const migs = await sql.query("SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 3");
console.log("dernières migrations:", migs.map((m) => String(m.hash).slice(-12)));
if (tables.length > 0 || cols.length > 0 || (total[0]?.n ?? 0) !== 427) process.exit(1);
console.log("OK — 0018 appliquée, catalogue intact.");
