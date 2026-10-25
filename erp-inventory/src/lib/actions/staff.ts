"use server";

import { asc, eq } from "drizzle-orm";
import { assertAuthenticated, assertOwner, currentActor } from "@/lib/action-guard";
import { auditLogs, db, staff } from "@/db";
import { actionResult, type ActionResult } from "@/lib/action-result";

export interface StaffItem {
  id: number;
  name: string;
  role: "COMMERCIAL" | "LIVREUR";
  isActive: boolean;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

/** Staff actif (commerciaux / livreurs) — lisible par tout utilisateur connecté (formulaires de vente). */
export async function getStaff(role?: "COMMERCIAL" | "LIVREUR"): Promise<StaffItem[]> {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d
    .select()
    .from(staff)
    .where(role ? eq(staff.role, role) : undefined)
    .orderBy(asc(staff.name));
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role === "LIVREUR" ? "LIVREUR" : "COMMERCIAL",
    isActive: s.isActive,
  }));
}

export async function saveStaff(data: {
  id?: number;
  name: string;
  role: "COMMERCIAL" | "LIVREUR";
}): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    await assertOwner();
    const d = requireDb();
    const name = data.name.trim();
    if (!name) throw new Error("Nom du membre requis");
    if (!["COMMERCIAL", "LIVREUR"].includes(data.role)) throw new Error("Rôle staff invalide");

    if (data.id) {
      await d
        .update(staff)
        .set({ name, role: data.role, updatedAt: new Date() })
        .where(eq(staff.id, data.id));
      return { id: data.id };
    }
    const dup = (
      await d.select({ id: staff.id }).from(staff).where(eq(staff.name, name)).limit(1)
    )[0];
    if (dup) throw new Error("Un membre avec ce nom existe déjà");
    const inserted = await d.insert(staff).values({ name, role: data.role }).returning({ id: staff.id });
    await d.insert(auditLogs).values({
      action: "CREATION_STAFF",
      entityType: "STAFF",
      actorName: await currentActor(),
      entityId: inserted[0].id,
      details: `Staff ${data.role} "${name}" créé`,
    });
    return { id: inserted[0].id };
  });
}

export async function setStaffActive(id: number, isActive: boolean): Promise<ActionResult<void>> {
  return actionResult(async () => {
    await assertOwner();
    const d = requireDb();
    await d.update(staff).set({ isActive, updatedAt: new Date() }).where(eq(staff.id, id));
  });
}
