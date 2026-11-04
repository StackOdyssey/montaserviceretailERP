"use server";

import { asc, eq } from "drizzle-orm";
import { assertAuthenticated, assertOwner, currentActor } from "@/lib/action-guard";
import { auditLogs, brands, db } from "@/db";
import { actionResult, type ActionResult } from "@/lib/action-result";

export interface BrandItem {
  id: number;
  name: string;
  isActive: boolean;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

/** Marques actives — lisibles par tout utilisateur connecté (ProductModal, filtres). */
export async function getBrands(activeOnly = false): Promise<ActionResult<BrandItem[]>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const rows = await d
      .select()
      .from(brands)
      .where(activeOnly ? eq(brands.isActive, true) : undefined)
      .orderBy(asc(brands.sortOrder), asc(brands.name));
    return rows.map((b) => ({ id: b.id, name: b.name, isActive: b.isActive }));
  });
}

export async function saveBrand(data: {
  id?: number;
  name: string;
}): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    await assertOwner();
    const d = requireDb();
    const name = data.name.trim().toUpperCase();
    if (!name) throw new Error("Nom de marque requis");

    if (data.id) {
      await d.update(brands).set({ name }).where(eq(brands.id, data.id));
      await d.insert(auditLogs).values({
        action: "EDIT_BRAND",
        entityType: "BRAND",
        actorName: await currentActor(),
        entityId: data.id,
        details: `Marque renommée → ${name}`,
      });
      return { id: data.id };
    }
    const dup = (await d.select({ id: brands.id }).from(brands).where(eq(brands.name, name)).limit(1))[0];
    if (dup) {
      // Réactiver une marque existante désactivée plutôt que de dupliquer.
      await d.update(brands).set({ isActive: true }).where(eq(brands.id, dup.id));
      return { id: dup.id };
    }
    const row = (await d.insert(brands).values({ name }).returning({ id: brands.id }))[0];
    await d.insert(auditLogs).values({
      action: "CREATION_BRAND",
      entityType: "BRAND",
      actorName: await currentActor(),
      entityId: row.id,
      details: `Marque "${name}" créée`,
    });
    return { id: row.id };
  });
}

export async function setBrandActive(id: number, isActive: boolean): Promise<ActionResult<{ ok: true }>> {
  return actionResult(async () => {
    await assertOwner();
    const d = requireDb();
    await d.update(brands).set({ isActive }).where(eq(brands.id, id));
    await d.insert(auditLogs).values({
      action: "EDIT_BRAND",
      entityType: "BRAND",
      actorName: await currentActor(),
      entityId: id,
      details: `Marque ${isActive ? "réactivée" : "désactivée"}`,
    });
    return { ok: true };
  });
}
