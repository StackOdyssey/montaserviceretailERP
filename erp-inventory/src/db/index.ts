import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "";

// Pool WebSocket : supporte les transactions interactives (db.transaction).
// Nécessite Node 22+ (WebSocket global) ou le paquet `ws`.
const pool = connectionString ? new Pool({ connectionString }) : null;

export const db = pool ? drizzle(pool, { schema }) : null;

export * from "./schema";
