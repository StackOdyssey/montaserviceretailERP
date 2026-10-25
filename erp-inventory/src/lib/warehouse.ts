// Multi-entrepôts (G1) — helpers serveur (pas de "use server" : internes uniquement).
// products.current_stock = total global ; product_stock = répartition par entrepôt.
// Toute mutation de stock met à jour les deux dans la même transaction.
import { eq, sql } from "drizzle-orm";
import { db, productStock, warehouses } from "@/db";
import type { Tx } from "@/lib/stock-lock";

/** Entrepôt par défaut (Principal) — résultat caché en mémoire process. */
let cachedDefaultId: number | null = null;
export async function defaultWarehouseId(): Promise<number> {
  if (cachedDefaultId != null) return cachedDefaultId;
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  const row = (await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.isDefault, true)).limit(1))[0];
  if (!row) throw new Error("ENTREPOT_DEFAUT_INTROUVABLE");
  cachedDefaultId = row.id;
  return row.id;
}

/**
 * Ajuste la quantité d'un produit dans un entrepôt (delta signé). Crée la ligne si absente.
 * warehouseId omis = entrepôt par défaut (Principal) — tous les flux actuels y vivent.
 */
export async function bumpWarehouseStock(tx: Tx, productId: number, delta: number, warehouseId?: number): Promise<void> {
  if (delta === 0) return;
  const whId = warehouseId ?? (await defaultWarehouseId());
  await tx
    .insert(productStock)
    .values({ productId, warehouseId: whId, quantity: delta })
    .onConflictDoUpdate({
      target: [productStock.productId, productStock.warehouseId],
      set: { quantity: sql`${productStock.quantity} + ${delta}`, updatedAt: new Date() },
    });
}
