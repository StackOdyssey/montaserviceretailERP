"use server";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, settings, supplierEmails, suppliers } from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";
import { actionResult, type ActionResult } from "@/lib/action-result";

export interface EmailAttachment {
  name: string;
  url: string;
  size: string;
  mimeType: string;
}

export interface SupplierEmailItem {
  id: number;
  supplierId: number | null;
  supplierName: string;
  direction: "SORTANT" | "ENTRANT";
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  status: "ENVOYE" | "RECU" | "ECHEC" | "BROUILLON";
  isRead: boolean;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
  sentAt: string;
  createdAt: string;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

type EmailRow = typeof supplierEmails.$inferSelect;

function mapEmail(r: EmailRow, supplierName: string): SupplierEmailItem {
  let attachments: EmailAttachment[] = [];
  try {
    attachments = JSON.parse(r.attachmentsJson || "[]");
  } catch {
    attachments = [];
  }
  return {
    id: r.id,
    supplierId: r.supplierId,
    supplierName,
    direction: r.direction as SupplierEmailItem["direction"],
    fromAddress: r.fromAddress,
    toAddress: r.toAddress,
    subject: r.subject,
    bodyText: r.bodyText ?? "",
    bodyHtml: r.bodyHtml ?? undefined,
    status: r.status as SupplierEmailItem["status"],
    isRead: r.isRead,
    hasAttachments: r.hasAttachments,
    attachments,
    sentAt: (r.sentAt ?? r.createdAt ?? new Date()).toISOString(),
    createdAt: (r.createdAt ?? new Date()).toISOString(),
  };
}

/** Récupère les courriels fournisseurs (base de données) avec filtres. */
export async function getSupplierEmails(options?: {
  folder?: "INBOX" | "SENT" | "ALL";
  supplierId?: number;
  search?: string;
}): Promise<SupplierEmailItem[]> {
  await assertAuthenticated();
  const d = requireDb();

  const conds = [];
  if (options?.folder === "INBOX") conds.push(eq(supplierEmails.direction, "ENTRANT"));
  if (options?.folder === "SENT") conds.push(eq(supplierEmails.direction, "SORTANT"));
  if (options?.supplierId) conds.push(eq(supplierEmails.supplierId, options.supplierId));

  const search = options?.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conds.push(
      or(
        ilike(supplierEmails.subject, like),
        ilike(supplierEmails.fromAddress, like),
        ilike(supplierEmails.toAddress, like),
        ilike(supplierEmails.bodyText, like),
        ilike(suppliers.name, like)
      )!
    );
  }

  const rows = await d
    .select({ e: supplierEmails, supplierName: suppliers.name })
    .from(supplierEmails)
    .leftJoin(suppliers, eq(supplierEmails.supplierId, suppliers.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(supplierEmails.sentAt))
    .limit(500);

  return rows.map((r) => mapEmail(r.e, r.supplierName ?? ""));
}

/** Envoie un courriel à un fournisseur (Resend si la clé est fournie, sinon enregistré). */
export async function sendSupplierEmail(data: {
  supplierId: number;
  supplierName: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
}): Promise<ActionResult<SupplierEmailItem>> {
  return actionResult(() => sendSupplierEmailImpl(data));
}

export async function markEmailAsRead(id: number): Promise<ActionResult<Awaited<ReturnType<typeof markEmailAsReadImpl>>>> {
  return actionResult(() => markEmailAsReadImpl(id));
}

export async function deleteSupplierEmail(id: number): Promise<ActionResult<Awaited<ReturnType<typeof deleteSupplierEmailImpl>>>> {
  return actionResult(() => deleteSupplierEmailImpl(id));
}

async function sendSupplierEmailImpl(data: {
  supplierId: number;
  supplierName: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
}): Promise<SupplierEmailItem> {
  await assertAuthenticated();
  const d = requireDb();

  if (!data.toAddress || !data.subject || !data.bodyText) {
    throw new Error("L'adresse destinataire, l'objet et le message sont obligatoires.");
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "BM Motors <contact@bmmotors.ma>",
          to: [data.toAddress],
          subject: data.subject,
          text: data.bodyText,
          html: data.bodyHtml || `<p>${data.bodyText.replace(/\n/g, "<br/>")}</p>`,
        }),
      });
    } catch (err) {
      console.warn("Erreur envoi Resend, enregistrement local de secours:", err);
    }
  }

  const s = (await d.select({ email: settings.email }).from(settings).limit(1))[0];
  const fromAddress = s?.email || "contact@bmmotors.ma";
  const attachments = data.attachments ?? [];

  const inserted = (
    await d
      .insert(supplierEmails)
      .values({
        supplierId: data.supplierId,
        direction: "SORTANT",
        fromAddress,
        toAddress: data.toAddress,
        subject: data.subject,
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml || `<p>${data.bodyText.replace(/\n/g, "<br/>")}</p>`,
        status: "ENVOYE",
        isRead: true,
        hasAttachments: attachments.length > 0,
        attachmentsJson: JSON.stringify(attachments),
        sentAt: new Date(),
      })
      .returning()
  )[0];

  return mapEmail(inserted, data.supplierName);
}

/** Marque un courriel comme lu. */
async function markEmailAsReadImpl(id: number) {
  await assertAuthenticated();
  const d = requireDb();
  await d.update(supplierEmails).set({ isRead: true }).where(eq(supplierEmails.id, id));
  return { success: true };
}

/** Supprime un courriel. */
async function deleteSupplierEmailImpl(id: number) {
  await assertAuthenticated();
  const d = requireDb();
  await d.delete(supplierEmails).where(eq(supplierEmails.id, id));
  return { success: true };
}

/** Nombre de courriels entrants non lus. */
export async function getUnreadEmailsCount(): Promise<number> {
  await assertAuthenticated();
  const d = requireDb();
  const row = (
    await d
      .select({ n: sql<number>`count(*)::int` })
      .from(supplierEmails)
      .where(and(eq(supplierEmails.direction, "ENTRANT"), eq(supplierEmails.isRead, false)))
  )[0];
  return row?.n ?? 0;
}
