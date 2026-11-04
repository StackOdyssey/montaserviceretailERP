"use server";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { auditLogs, db, salesDocuments, users } from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";
import { pinHmac } from "@/lib/auth";
import { actionResult, type ActionResult } from "@/lib/action-result";

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

export interface MyProfileData {
  name: string;
  role: string;
  /** Clé maîtresse (ADMIN_PIN env) — pas de fiche utilisateur, PIN non modifiable. */
  isMaster: boolean;
  todayDocs: Array<{
    docNumber: string;
    docType: string;
    totalTtcCents: number;
    createdAt: string;
  }>;
  todayTotalTtcCents: number;
}

/** Profil de l'utilisateur connecté + ses documents validés aujourd'hui (G16). */
export async function getMyProfile(): Promise<ActionResult<MyProfileData>> {
  return actionResult(async () => {
    const session = await assertAuthenticated();
    const d = requireDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const rows = await d
      .select({
        docNumber: salesDocuments.docNumber,
        docType: salesDocuments.docType,
        totalTtcCents: salesDocuments.totalTtcCents,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .innerJoin(salesDocuments, eq(auditLogs.entityId, salesDocuments.id))
      .where(
        and(
          eq(auditLogs.action, "VALIDATION_DOCUMENT"),
          eq(auditLogs.actorName, session.user),
          gte(auditLogs.createdAt, todayStart)
        )
      )
      .orderBy(desc(auditLogs.id))
      .limit(50);

    const todayDocs = rows.map((r) => ({
      docNumber: r.docNumber,
      docType: r.docType,
      totalTtcCents: r.totalTtcCents,
      createdAt: (r.createdAt ?? new Date()).toISOString(),
    }));
    return {
      name: session.user,
      role: session.role,
      isMaster: session.uid === null,
      todayDocs,
      todayTotalTtcCents: todayDocs.reduce((s, d) => s + (d.docType === "AVOIR" ? -d.totalTtcCents : d.totalTtcCents), 0),
    };
  });
}

/** Changer son propre PIN (vérif PIN actuel → nouveau pin_hmac). Clé maîtresse refusée. */
export async function changeMyPin(data: {
  currentPin: string;
  newPin: string;
}): Promise<ActionResult<{ ok: true }>> {
  return actionResult(async () => {
    const session = await assertAuthenticated();
    if (session.uid === null) {
      throw new Error("La clé maîtresse (PIN administrateur) se change via la configuration serveur, pas ici");
    }
    const newPin = data.newPin.trim();
    if (!/^\d{4,8}$/.test(newPin)) throw new Error("Le PIN doit contenir 4 à 8 chiffres");
    const d = requireDb();
    const user = (
      await d.select().from(users).where(eq(users.id, session.uid)).limit(1)
    )[0];
    if (!user) throw new Error("Utilisateur introuvable");
    if (user.pinHmac !== pinHmac(data.currentPin.trim())) {
      throw new Error("PIN actuel incorrect");
    }
    // Unicité : le PIN ne doit pas être celui d'un autre compte.
    const dup = (
      await d.select({ id: users.id }).from(users).where(eq(users.pinHmac, pinHmac(newPin))).limit(1)
    )[0];
    if (dup && dup.id !== session.uid) throw new Error("Ce PIN est déjà utilisé par un autre compte");
    await d
      .update(users)
      .set({ pinHmac: pinHmac(newPin), updatedAt: new Date() })
      .where(eq(users.id, session.uid));
    await d.insert(auditLogs).values({
      action: "CHANGEMENT_PIN",
      entityType: "USER",
      entityId: session.uid,
      actorName: session.user,
      details: "PIN personnel modifié par l'utilisateur",
    });
    return { ok: true };
  });
}
