"use server";

import { asc, eq } from "drizzle-orm";
import { assertOwner } from "@/lib/action-guard";
import { pinHmac, verifyAdminPin } from "@/lib/auth";
import { validateInput, saveUserSchema } from "@/lib/action-validation";
import { auditLogs, db, users } from "@/db";
import { actionResult, type ActionResult } from "@/lib/action-result";

export interface UserItem {
  id: number;
  displayName: string;
  role: "GERANT" | "CAISSIER";
  plafondCents: number | null;
  isActive: boolean;
  createdAt: string;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

/** Liste des utilisateurs (gérant uniquement). Jamais de pin_hmac exposé. */
export async function getUsers(): Promise<ActionResult<UserItem[]>> {
  return actionResult(async () => {
  await assertOwner();
  const d = requireDb();
  const rows = await d
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
      plafondCents: users.plafondCents,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.displayName));
  return rows.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    role: u.role === "GERANT" ? "GERANT" : "CAISSIER",
    plafondCents: u.plafondCents,
    isActive: u.isActive,
    createdAt: (u.createdAt ?? new Date()).toISOString(),
  }));
  });
}

function assertPinNotMaster(pin: string) {
  // Un PIN utilisateur identique à la clé maîtresse court-circuiterait
  // l'attribution : toute session serait « gerant/ADMIN ».
  try {
    if (verifyAdminPin(pin)) {
      throw new Error("PIN_RESERVE: ce code est réservé à la clé maîtresse (ADMIN_PIN).");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("PIN_RESERVE")) throw e;
    // ADMIN_PIN absent de l'env : pas de collision possible
  }
}

/**
 * Crée ou met à jour un utilisateur (gérant uniquement).
 * `pin` : obligatoire à la création, optionnel à l'édition (réinitialisation).
 */
export async function saveUser(data: {
  id?: number;
  displayName: string;
  pin?: string;
  role: "GERANT" | "CAISSIER";
  plafondCents?: number | null;
}): Promise<ActionResult<{ id: number }>> {
  return actionResult(() => saveUserImpl(data));
}

export async function setUserActive(id: number, isActive: boolean): Promise<ActionResult<void>> {
  return actionResult(() => setUserActiveImpl(id, isActive));
}

async function saveUserImpl(data: {
  id?: number;
  displayName: string;
  pin?: string;
  role: "GERANT" | "CAISSIER";
  plafondCents?: number | null;
}): Promise<{ id: number }> {
  const session = await assertOwner();
  data = validateInput(saveUserSchema, data);
  const d = requireDb();

  if (!data.id && !data.pin) {
    throw new Error("PIN_REQUIS: un code PIN de 4 à 8 chiffres est requis à la création.");
  }
  if (data.pin) assertPinNotMaster(data.pin);

  if (data.id) {
    const existing = (await d.select({ id: users.id }).from(users).where(eq(users.id, data.id)).limit(1))[0];
    if (!existing) throw new Error("UTILISATEUR_INTROUVABLE");
    try {
      await d
        .update(users)
        .set({
          displayName: data.displayName,
          role: data.role,
          ...(data.plafondCents !== undefined ? { plafondCents: data.plafondCents } : {}),
          ...(data.pin ? { pinHmac: pinHmac(data.pin) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, data.id));
    } catch {
      throw new Error("PIN_DEJA_ATTRIBUE: ce code PIN est déjà utilisé par un autre compte.");
    }
    await d.insert(auditLogs).values({
      action: "UTILISATEUR_MODIFIE",
      entityType: "USER",
      entityId: data.id,
      actorName: session.user,
      details: `${data.displayName} (${data.role}) — ${data.pin ? "PIN réinitialisé" : "fiche mise à jour"}`,
    });
    return { id: data.id };
  }

  let created;
  try {
    created = (
      await d
        .insert(users)
        .values({
          displayName: data.displayName,
          pinHmac: pinHmac(data.pin!),
          role: data.role,
          plafondCents: data.plafondCents ?? null,
        })
        .returning({ id: users.id })
    )[0];
  } catch {
    throw new Error("PIN_DEJA_ATTRIBUE: ce code PIN est déjà utilisé par un autre compte.");
  }
  await d.insert(auditLogs).values({
    action: "UTILISATEUR_CREE",
    entityType: "USER",
    entityId: created.id,
    actorName: session.user,
    details: `${data.displayName} (${data.role})`,
  });
  return { id: created.id };
}

/**
 * Active/désactive un utilisateur (gérant uniquement).
 * La désactivation coupe les accès dès la prochaine action (contrôle is_active
 * dans assertAuthenticated — le jeton existant devient inutilisable).
 */
async function setUserActiveImpl(id: number, isActive: boolean): Promise<void> {
  const session = await assertOwner();
  const d = requireDb();
  const u = (await d.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!u) throw new Error("UTILISATEUR_INTROUVABLE");
  await d.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, id));
  await d.insert(auditLogs).values({
    action: isActive ? "UTILISATEUR_ACTIVE" : "UTILISATEUR_DESACTIVE",
    entityType: "USER",
    entityId: id,
    actorName: session.user,
    details: `${u.displayName} → ${isActive ? "activé" : "désactivé"}`,
  });
}
