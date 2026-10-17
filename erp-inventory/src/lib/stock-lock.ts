// Verrous de ligne sur `products` pour les écritures de stock / CMUP.
// Toute transaction qui lit puis réécrit currentStock/cmupCents DOIT d'abord verrouiller
// les produits concernés : sinon deux écritures concurrentes (2 instances Cloud Run,
// 2 onglets) perdent une mise à jour (stock et CMUP faux).
// Verrouillage en un seul ordre (id croissant) pour éviter les interblocages.
// En READ COMMITTED, les lectures faites APRÈS ce verrou voient la dernière valeur validée.
import { asc, inArray } from "drizzle-orm";
import { db, products } from "@/db";

type Db = NonNullable<typeof db>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function lockProducts(tx: Tx, productIds: Array<number | null | undefined>): Promise<void> {
  const ids = [...new Set(productIds.filter((id): id is number => typeof id === "number"))].sort((a, b) => a - b);
  if (ids.length === 0) return;
  await tx
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, ids))
    .orderBy(asc(products.id))
    .for("update");
}
