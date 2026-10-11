"use server";

import { and, desc, eq, inArray, ilike, isNull, or } from "drizzle-orm";
import {
  businessLines,
  db,
  products,
  salesDocuments,
  salesLines,
  settings,
  stockMovements,
} from "@/db";
import { calculateDocumentTotals } from "@/lib/money";
import { nextDocumentNumber } from "@/lib/numbering";
import { assertAuthenticated } from "@/lib/action-guard";
import { applyMovement, type CmupState } from "@/lib/stock";
import { Resend } from "resend";

export interface SalesLineInput {
  productId: number;
  productName: string;
  sku: string;
  oemCode?: string | null;
  unitPriceHTCents: number;
  quantity: number;
}

export interface SalesDocumentItem {
  id: number;
  docType: "BL" | "FACTURE" | "AVOIR";
  docNumber: string;
  customerId: number | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerCity?: string | null;
  customerIce?: string | null;
  docDate: string;
  status: "BROUILLON" | "VALIDE" | "ANNULE" | "PAYE";
  totalBrutHtCents: number;
  discountPercent: number;
  discountAmountCents: number;
  totalNetHtCents: number;
  tvaRate: number;
  tvaAmountCents: number;
  totalTtcCents: number;
  paidAmountCents: number;
  paymentMethod?: string | null;
  notes?: string | null;
  lines: Array<{
    id: number;
    productId: number | null;
    productName: string;
    sku: string;
    oemCode?: string | null;
    unitPriceHTCents: number;
    quantity: number;
    totalHtCents: number;
  }>;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

type DocRow = typeof salesDocuments.$inferSelect;
type LineRow = typeof salesLines.$inferSelect;

function mapDoc(doc: DocRow, lines: LineRow[]): SalesDocumentItem {
  return {
    id: doc.id,
    docType: doc.docType as SalesDocumentItem["docType"],
    docNumber: doc.docNumber,
    customerId: doc.customerId,
    customerName: doc.customerName,
    customerPhone: doc.customerPhone,
    customerEmail: doc.customerEmail,
    customerCity: doc.customerCity,
    customerIce: doc.customerIce,
    docDate: (doc.docDate ?? doc.createdAt ?? new Date()).toISOString(),
    status: doc.status as SalesDocumentItem["status"],
    totalBrutHtCents: doc.totalBrutHtCents,
    discountPercent: doc.discountPercent,
    discountAmountCents: doc.discountAmountCents,
    totalNetHtCents: doc.totalNetHtCents,
    tvaRate: doc.tvaRate,
    tvaAmountCents: doc.tvaAmountCents,
    totalTtcCents: doc.totalTtcCents,
    paidAmountCents: doc.paidAmountCents,
    paymentMethod: doc.paymentMethod,
    notes: doc.notes,
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.productNameSnapshot,
      sku: l.skuSnapshot,
      oemCode: l.oemCodeSnapshot,
      unitPriceHTCents: l.unitPriceHtCents,
      quantity: l.quantity,
      totalHtCents: l.totalHtCents,
    })),
  };
}

/** Charge un document + ses lignes (interne). */
async function loadDocumentById(id: number): Promise<SalesDocumentItem | null> {
  const d = requireDb();
  const doc = (await d.select().from(salesDocuments).where(eq(salesDocuments.id, id)).limit(1))[0];
  if (!doc) return null;
  const lines = await d.select().from(salesLines).where(eq(salesLines.documentId, id));
  return mapDoc(doc, lines);
}

/**
 * Récupère les documents de vente (base de données).
 */
export async function getSalesDocuments(options?: {
  docType?: "BL" | "FACTURE" | "AVOIR";
  search?: string;
  status?: string;
}): Promise<SalesDocumentItem[]> {
  await assertAuthenticated();
  const d = requireDb();

  const conds = [isNull(salesDocuments.deletedAt)];
  if (options?.docType) conds.push(eq(salesDocuments.docType, options.docType));
  if (options?.status && options.status !== "ALL") conds.push(eq(salesDocuments.status, options.status));
  const search = options?.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conds.push(or(ilike(salesDocuments.docNumber, like), ilike(salesDocuments.customerName, like))!);
  }

  const docs = await d
    .select()
    .from(salesDocuments)
    .where(and(...conds))
    .orderBy(desc(salesDocuments.id))
    .limit(200);
  if (docs.length === 0) return [];

  const ids = docs.map((x) => x.id);
  const lines = await d.select().from(salesLines).where(inArray(salesLines.documentId, ids));
  const byDoc = new Map<number, LineRow[]>();
  for (const l of lines) {
    const arr = byDoc.get(l.documentId) ?? [];
    arr.push(l);
    byDoc.set(l.documentId, arr);
  }

  return docs.map((doc) => mapDoc(doc, byDoc.get(doc.id) ?? []));
}

/**
 * Récupère un document par identifiant.
 */
export async function getSalesDocumentById(id: number): Promise<SalesDocumentItem | null> {
  await assertAuthenticated();
  return loadDocumentById(id);
}

/**
 * Crée et valide un document commercial (BL/FACTURE/AVOIR) dans une TRANSACTION :
 * numéro gapless, lignes avec snapshot COGS (CMUP) et sortie de stock, le tout atomique.
 */
export async function createSalesDocument(data: {
  docType?: "BL" | "FACTURE" | "AVOIR";
  customerId?: number | null;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerCity?: string;
  customerIce?: string;
  lines: SalesLineInput[];
  discountPercent: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "A_CREDIT";
  paidAmountCents?: number;
  notes?: string;
  businessLineCode?: string;
}): Promise<SalesDocumentItem> {
  await assertAuthenticated();
  const d = requireDb();

  if (!data.lines || data.lines.length === 0) {
    throw new Error("Le document doit contenir au moins un article");
  }

  const docType = data.docType ?? "BL";
  const year = new Date().getFullYear();
  const tvaRate = 20; // TVA 20% (CGI pièces détachées)

  let docId = 0;

  await d.transaction(async (tx) => {
    // Ligne métier (défaut PIECES)
    const line = (
      await tx
        .select({ id: businessLines.id })
        .from(businessLines)
        .where(eq(businessLines.code, data.businessLineCode || "PIECES"))
        .limit(1)
    )[0];
    if (!line) throw new Error("LIGNE_METIER_INTROUVABLE");

    const totals = calculateDocumentTotals(
      data.lines.map((l) => ({ unitPriceHT: l.unitPriceHTCents, quantity: l.quantity })),
      data.discountPercent,
      tvaRate
    );

    const negRow = (await tx.select({ neg: settings.negativeStockAllowed }).from(settings).limit(1))[0];
    const negativeAllowed = negRow?.neg ?? false;

    // Effets de stock (COGS = CMUP courant) AVANT écriture
    const effects: Array<{
      productId: number;
      businessLineId: number;
      quantity: number;
      unitCostCents: number;
      nextStock: number;
      nextCmup: number;
    }> = [];
    for (const l of data.lines) {
      const p = (await tx.select().from(products).where(eq(products.id, l.productId)).limit(1))[0];
      if (!p) throw new Error(`PIECE_INTROUVABLE: ${l.sku}`);
      const state: CmupState = { quantity: p.currentStock, cmupCents: p.cmupCents };
      const { state: next } = applyMovement(state, -l.quantity, 0);
      if (next.quantity < 0 && !negativeAllowed) throw new Error(`STOCK_NEGATIF_INTERDIT: ${p.sku}`);
      effects.push({
        productId: p.id,
        businessLineId: p.businessLineId,
        quantity: -l.quantity,
        unitCostCents: p.cmupCents,
        nextStock: next.quantity,
        nextCmup: next.cmupCents,
      });
    }

    // Numéro gapless (dans la transaction)
    const { docNumber, sequenceNo } = await nextDocumentNumber(tx, {
      docType,
      year,
      businessLineId: line.id,
    });

    const isFullyPaid =
      data.paymentMethod !== "A_CREDIT" && (data.paidAmountCents ?? totals.totalTTC) >= totals.totalTTC;

    docId = (
      await tx
        .insert(salesDocuments)
        .values({
          docType,
          docNumber,
          businessLineId: line.id,
          docYear: year,
          sequenceNo,
          customerId: data.customerId ?? null,
          customerName: data.customerName || "Client Comptoir Particulier",
          customerPhone: data.customerPhone ?? null,
          customerEmail: data.customerEmail ?? null,
          customerCity: data.customerCity ?? "Casablanca",
          customerIce: data.customerIce ?? null,
          docDate: new Date(),
          status: isFullyPaid ? "PAYE" : "VALIDE",
          totalBrutHtCents: totals.totalBrutHT,
          discountPercent: totals.discountPercent,
          discountAmountCents: totals.discountAmount,
          totalNetHtCents: totals.totalNetHT,
          tvaRate: totals.tvaRate,
          tvaAmountCents: totals.tvaAmount,
          totalTtcCents: totals.totalTTC,
          paidAmountCents: isFullyPaid ? totals.totalTTC : data.paidAmountCents ?? 0,
          paymentMethod: data.paymentMethod,
          notes: data.notes ?? null,
          validatedAt: new Date(),
        })
        .returning({ id: salesDocuments.id })
    )[0].id;

    await tx.insert(salesLines).values(
      data.lines.map((l) => ({
        documentId: docId,
        productId: l.productId,
        productNameSnapshot: l.productName,
        skuSnapshot: l.sku,
        oemCodeSnapshot: l.oemCode ?? null,
        unitPriceHtCents: l.unitPriceHTCents,
        quantity: l.quantity,
        totalHtCents: l.unitPriceHTCents * l.quantity,
        unitCostCents: effects.find((e) => e.productId === l.productId)?.unitCostCents ?? 0,
        tvaRate,
        totalTtcCents: Math.round(l.unitPriceHTCents * l.quantity * (1 + tvaRate / 100)),
      }))
    );

    for (const e of effects) {
      await tx.insert(stockMovements).values({
        productId: e.productId,
        businessLineId: e.businessLineId,
        movementType: "VENTE_BL",
        quantity: e.quantity,
        unitCostCents: e.unitCostCents,
        sourceDocumentId: docId,
        sourceDocumentType: docType,
        reason: `Vente au comptoir — ${docNumber}`,
      });
      await tx
        .update(products)
        .set({ currentStock: e.nextStock, cmupCents: e.nextCmup, updatedAt: new Date() })
        .where(eq(products.id, e.productId));
    }
  });

  const created = await loadDocumentById(docId);
  if (!created) throw new Error("ECHEC_CREATION_DOCUMENT");
  return created;
}

/**
 * Envoie le document par email (Resend). Simulation si RESEND_API_KEY absente.
 */
export async function sendDocumentByEmail(data: {
  documentId: number;
  recipientEmail: string;
}): Promise<{ success: boolean; message: string }> {
  await assertAuthenticated();
  const doc = await loadDocumentById(data.documentId);
  if (!doc) throw new Error("Document introuvable");

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return {
      success: true,
      message: `[Simulation] Email préparé pour ${data.recipientEmail} concernant ${doc.docNumber}. (Ajoutez RESEND_API_KEY pour l'envoi réel)`,
    };
  }

  try {
    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: "BM Motors <onboarding@resend.dev>",
      to: data.recipientEmail,
      subject: `Document N° ${doc.docNumber} - SARL BM Motors`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2 style="color: #F7162D;">SARL BM Motors - Pièces Moto</h2>
          <p>Document <strong>${doc.docNumber}</strong> du ${new Date(doc.docDate).toLocaleDateString("fr-FR")}.</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <thead><tr style="background: #F8F9FA; text-align: left;">
              <th style="padding: 8px;">Désignation</th><th style="padding: 8px;">Qté</th><th style="padding: 8px; text-align: right;">Total HT</th>
            </tr></thead>
            <tbody>
              ${doc.lines
                .map(
                  (l) =>
                    `<tr><td style="padding:8px;">${l.productName} (${l.sku})</td><td style="padding:8px;">${l.quantity}</td><td style="padding:8px;text-align:right;">${(l.totalHtCents / 100).toFixed(2)} DH</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
          <div style="margin-top: 20px; text-align: right;">
            <p><strong>Total Net HT :</strong> ${(doc.totalNetHtCents / 100).toFixed(2)} DH</p>
            <p><strong>TVA (${doc.tvaRate}%) :</strong> ${(doc.tvaAmountCents / 100).toFixed(2)} DH</p>
            <h3 style="color: #F7162D;">Total TTC : ${(doc.totalTtcCents / 100).toFixed(2)} DH</h3>
          </div>
        </div>`,
    });
    return { success: true, message: `Email envoyé avec succès à ${data.recipientEmail} via Resend` };
  } catch (err) {
    throw new Error(`Échec d'envoi par Resend: ${(err as Error).message}`);
  }
}
