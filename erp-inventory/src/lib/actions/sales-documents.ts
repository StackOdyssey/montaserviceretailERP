"use server";

import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  auditLogs,
  businessLineDocumentSettings,
  businessLines,
  documentLinks,
  products,
  salesDocuments,
  salesLines,
  settings,
  stockMovements,
} from "@/db";
import { VAT_NOT_LIABLE_MENTION } from "@/lib/vat-regime";
import { nextDocumentNumber } from "@/lib/numbering";
import { assertAuthenticated, assertOwner, currentActor } from "@/lib/action-guard";
import { assertPeriodOpen } from "@/lib/accounting-period";
import { lockProducts } from "@/lib/stock-lock";
import { bumpWarehouseStock } from "@/lib/warehouse";
import { applyMovement, type CmupState } from "@/lib/stock";
import {
  loadDocumentById,
  requireDb,
  DOC_LABELS,
  type SalesDocumentItem,
  type DocumentPrintContext,
  type CompanyPrintInfo,
} from "@/lib/sales/shared";
import { actionResult, BusinessError, type ActionResult } from "@/lib/action-result";
import { PREP_TRANSITIONS } from "@/lib/prep";
import { Resend } from "resend";

export type { SalesDocumentItem, DocumentPrintContext, CompanyPrintInfo } from "@/lib/sales/shared";

/**
 * Envoie le document par email (Resend). Simulation si RESEND_API_KEY absente.
 */
export async function sendDocumentByEmail(data: {
  documentId: number;
  recipientEmail: string;
}): Promise<ActionResult<{ success: boolean; message: string }>> {
  return actionResult(() => sendDocumentByEmailImpl(data));
}

async function sendDocumentByEmailImpl(data: {
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
            ${doc.tvaRate > 0
              ? `<p><strong>TVA (${doc.tvaRate}%) :</strong> ${(doc.tvaAmountCents / 100).toFixed(2)} DH</p>`
              : `<p><em>TVA non applicable</em></p>`}
            <h3 style="color: #F7162D;">Total TTC : ${(doc.totalTtcCents / 100).toFixed(2)} DH</h3>
          </div>
        </div>`,
    });
    return { success: true, message: `Email envoyé avec succès à ${data.recipientEmail} via Resend` };
  } catch (err) {
    throw new Error(`Échec d'envoi par Resend: ${(err as Error).message}`);
  }
}

/**
 * Contexte d'impression : document, visibilité TVA par ligne métier (§6A) et identité société.
 * La visibilité TVA provient de `business_line_document_settings` (FAC/AV toujours affichés).
 */
export async function getDocumentPrintContext(
  documentId: number
): Promise<ActionResult<DocumentPrintContext | null>> {
  return actionResult(() => getDocumentPrintContextImpl(documentId));
}

async function getDocumentPrintContextImpl(documentId: number): Promise<DocumentPrintContext | null> {
  await assertAuthenticated();
  const d = requireDb();

  const document = await loadDocumentById(documentId);
  if (!document) return null;

  const blId = document.businessLineId ?? null;
  let businessLineCode = "PIECES";
  if (blId) {
    const bl = (await d.select({ code: businessLines.code }).from(businessLines).where(eq(businessLines.id, blId)).limit(1))[0];
    businessLineCode = bl?.code ?? "PIECES";
  }

  const settingsKey = document.docType === "FACTURE" ? "FAC" : document.docType === "AVOIR" ? "AV" : document.docType;
  let vatDisplay: DocumentPrintContext["vatDisplay"] = { showVat: true, priceBasis: "TTC", showDiscount: true };
  if (blId) {
    const row = (
      await d
        .select()
        .from(businessLineDocumentSettings)
        .where(
          and(
            eq(businessLineDocumentSettings.businessLineId, blId),
            eq(businessLineDocumentSettings.docType, settingsKey)
          )
        )
        .limit(1)
    )[0];
    if (row) {
      vatDisplay = {
        showVat: row.showVat,
        priceBasis: row.priceBasis as "TTC" | "HT",
        showDiscount: row.showDiscount,
      };
    }
  }

  const c = (await d.select().from(settings).limit(1))[0];
  const company: CompanyPrintInfo | null = c
    ? {
        raisonSociale: c.raisonSociale,
        tradeName: c.tradeName,
        legalForm: c.legalForm,
        address: c.address,
        city: c.city,
        phone: c.phone,
        email: c.email,
        ice: c.ice,
        identifiantFiscal: c.identifiantFiscal,
        registreCommerce: c.registreCommerce,
        taxeProfessionnelle: c.taxeProfessionnelle,
        cnss: c.cnss,
        rcTribunal: c.rcTribunal,
        capitalCents: c.capitalCents,
        footerText: c.footerText,
        logoUrl: c.logoUrl,
      }
    : null;

  return {
    document,
    businessLineCode,
    vatDisplay,
    company,
    docLabel: DOC_LABELS[document.docType] ?? document.docType,
  };
}

/**
 * Convertit un ou plusieurs BL en une Facture (FAC). Aucune sortie de stock
 * supplémentaire (le BL l'a déjà déduit) ; liaison BL→FAC via document_links.
 */
export async function convertBlToFacture(
  blIds: number[],
  opts?: { customerId?: number | null }
): Promise<ActionResult<SalesDocumentItem>> {
  return actionResult(() => convertBlToFactureImpl(blIds, opts));
}

async function convertBlToFactureImpl(
  blIds: number[],
  opts?: { customerId?: number | null }
): Promise<SalesDocumentItem> {
  await assertAuthenticated();
  const d = requireDb();

  if (!blIds || blIds.length === 0) throw new Error("Sélectionnez au moins un BL à facturer");
  await assertPeriodOpen();

  const bls = await d
    .select()
    .from(salesDocuments)
    .where(and(inArray(salesDocuments.id, blIds), eq(salesDocuments.docType, "BL")));
  const active = bls.filter((b) => b.status !== "ANNULE" && !b.deletedAt);
  if (active.length === 0) throw new Error("Aucun BL valide sélectionné");

  const srcLines = await d.select().from(salesLines).where(inArray(salesLines.documentId, active.map((b) => b.id)));
  if (srcLines.length === 0) throw new Error("Les BL sélectionnés n'ont aucune ligne");

  const head = active[0];
  const year = new Date().getFullYear();
  const sameCustomer = active.every((b) => b.customerId === head.customerId);
  if (!sameCustomer) throw new Error("Les BL doivent concerner le même client");

  // Un BL ne se facture qu'une fois (sinon facture en double + créance doublée).
  const already = await d
    .select({ id: documentLinks.sourceDocumentId })
    .from(documentLinks)
    .where(and(inArray(documentLinks.sourceDocumentId, active.map((b) => b.id)), eq(documentLinks.linkType, "BL_TO_FAC")));
  if (already.length > 0) {
    const nums = active.filter((b) => already.some((a) => a.id === b.id)).map((b) => b.docNumber).join(", ");
    throw new BusinessError(`BL_DEJA_FACTURE: ${nums} déjà converti(s) en facture.`);
  }

  // Totaux repris des BL (remise pied de document + règlements inclus) : la facture
  // doit reproduire exactement ce qui a été livré/encaissé.
  const totalBrutHt = active.reduce((s, b) => s + b.totalBrutHtCents, 0);
  const discountAmount = active.reduce((s, b) => s + b.discountAmountCents, 0);
  const totalNetHt = active.reduce((s, b) => s + b.totalNetHtCents, 0);
  const tvaAmount = active.reduce((s, b) => s + b.tvaAmountCents, 0);
  const totalTtc = active.reduce((s, b) => s + b.totalTtcCents, 0);
  const paidAmount = Math.min(totalTtc, active.reduce((s, b) => s + b.paidAmountCents, 0));

  // Régime au moment de la conversion : non-assujetti ⇒ facture masquée + mention.
  const liableRow = (
    await d.select({ liable: settings.vatLiable }).from(settings).limit(1)
  )[0];
  const convVatLiable = liableRow?.liable ?? true;
  const convNotes = `Facture issue des BL : ${active.map((b) => b.docNumber).join(", ")}${convVatLiable ? "" : ` — ${VAT_NOT_LIABLE_MENTION}`}`;
  // Le délai court depuis la livraison (loi 69-21) : la facture reprend l'échéance
  // la plus proche des BL, pas un nouveau délai depuis la date de facture.
  const blDueDates = active.map((b) => b.dueDate).filter((x): x is Date => x != null);
  const convDueDate = blDueDates.length ? new Date(Math.min(...blDueDates.map((x) => x.getTime()))) : null;

  let docId = 0;
  await d.transaction(async (tx) => {
    const { docNumber, sequenceNo } = await nextDocumentNumber(tx, {
      docType: "FAC",
      year,
      businessLineId: head.businessLineId,
    });

    docId = (
      await tx
        .insert(salesDocuments)
        .values({
          docType: "FACTURE",
          docNumber,
          businessLineId: head.businessLineId,
          docYear: year,
          sequenceNo,
          customerId: opts?.customerId ?? head.customerId,
          customerName: head.customerName,
          customerPhone: head.customerPhone,
          customerEmail: head.customerEmail,
          customerCity: head.customerCity,
          customerIce: head.customerIce,
          docDate: new Date(),
          status: paidAmount >= totalTtc ? "PAYE" : "VALIDE",
          totalBrutHtCents: totalBrutHt,
          discountPercent: active.length === 1 ? head.discountPercent : 0,
          discountAmountCents: discountAmount,
          totalNetHtCents: totalNetHt,
          tvaRate: head.tvaRate ?? 20,
          tvaAmountCents: tvaAmount,
          totalTtcCents: totalTtc,
          paidAmountCents: paidAmount,
          paymentMethod: head.paymentMethod,
          paymentCondition: head.paymentCondition,
          dueDate: convDueDate,
          notes: convNotes,
          vatDisplay: convVatLiable ? "SHOWN" : "HIDDEN",
          priceBasis: "TTC",
          validatedAt: new Date(),
        })
        .returning({ id: salesDocuments.id })
    )[0].id;

    await tx.insert(salesLines).values(
      srcLines.map((l) => ({
        documentId: docId,
        productId: l.productId,
        productNameSnapshot: l.productNameSnapshot,
        skuSnapshot: l.skuSnapshot,
        oemCodeSnapshot: l.oemCodeSnapshot,
        unitPriceHtCents: l.unitPriceHtCents,
        quantity: l.quantity,
        totalHtCents: l.totalHtCents,
        discountPercent: l.discountPercent,
        discountAmountCents: l.discountAmountCents,
        unitCostCents: l.unitCostCents,
        tvaRate: l.tvaRate,
        totalTtcCents: l.totalTtcCents,
      }))
    );

    await tx.insert(documentLinks).values(
      active.map((b) => ({ sourceDocumentId: b.id, targetDocumentId: docId, linkType: "BL_TO_FAC" }))
    );

    await tx.insert(auditLogs).values({
      action: "CONVERSION_BL_FAC",
      entityType: "FACTURE",
      actorName: await currentActor(),
      entityId: docId,
      details: `Facture ${docNumber} issue des BL : ${active.map((b) => b.docNumber).join(", ")} — ${(totalTtc / 100).toFixed(2)} DH TTC`,
    });
  });

  const created = await loadDocumentById(docId);
  if (!created) throw new Error("ECHEC_CONVERSION_FACTURE");
  return created;
}

/**
 * Crée un Avoir (AV) lié au document d'origine ET à ses lignes. Les quantités
 * créditées sont plafonnées (facturé − déjà crédité) ; la marchandise retourne
 * en stock au COGS d'origine. TVA au taux d'origine.
 */
export async function createAvoir(data: {
  sourceDocumentId: number;
  returns: Array<{ lineId: number; quantity: number }>;
  notes?: string;
  avType?: "RETOUR" | "COMMERCIAL" | "CORRECTION";
}): Promise<ActionResult<SalesDocumentItem>> {
  return actionResult(() => createAvoirImpl(data));
}

async function createAvoirImpl(data: {
  sourceDocumentId: number;
  returns: Array<{ lineId: number; quantity: number }>;
  notes?: string;
  avType?: "RETOUR" | "COMMERCIAL" | "CORRECTION";
}): Promise<SalesDocumentItem> {
  await assertAuthenticated();
  const d = requireDb();

  const source = (await d.select().from(salesDocuments).where(eq(salesDocuments.id, data.sourceDocumentId)).limit(1))[0];
  if (!source) throw new Error("Document d'origine introuvable");
  if (source.docType === "AVOIR") throw new Error("Impossible de créditer un avoir");
  await assertPeriodOpen(source.docDate ?? new Date());

  const srcLines = await d.select().from(salesLines).where(eq(salesLines.documentId, source.id));
  if (srcLines.length === 0) throw new Error("Le document d'origine n'a aucune ligne");
  const lineById = new Map(srcLines.map((l) => [l.id, l]));

  const creditedRows = await d
    .select({
      originalLineId: salesLines.originalLineId,
      qty: sql<string>`coalesce(sum(${salesLines.quantity}),0)::bigint`,
    })
    .from(salesLines)
    .where(inArray(salesLines.originalLineId, srcLines.map((l) => l.id)))
    .groupBy(salesLines.originalLineId);
  const credited = new Map(creditedRows.map((r) => [r.originalLineId, Number(r.qty)]));

  const avLines: Array<{ orig: typeof srcLines[number]; qty: number; lineHt: number; lineTva: number }> = [];
  let totalHt = 0;
  let tvaAmount = 0;
  for (const r of data.returns) {
    const orig = lineById.get(r.lineId);
    if (!orig) throw new Error("Ligne d'origine introuvable");
    const already = credited.get(orig.id) ?? 0;
    const qty = Math.min(r.quantity, orig.quantity - already);
    if (qty <= 0) continue;
    // Prorata du total ligne NET (totalHt − remise ligne) — ne pas rembourser
    // la remise : unit_price × qty ignorerait la remise ligne et sur-créditerait.
    const netLineHt = orig.totalHtCents - (orig.discountAmountCents ?? 0);
    const lineHt = Math.round((netLineHt * qty) / orig.quantity);
    const lineTva = Math.round((lineHt * orig.tvaRate) / 100);
    totalHt += lineHt;
    tvaAmount += lineTva;
    avLines.push({ orig, qty, lineHt, lineTva });
  }
  if (avLines.length === 0) throw new Error("Aucune quantité valide à créditer");

  // Type d'avoir : RETOUR = marchandise reprise (réintégrée au stock) ;
  // COMMERCIAL (geste) et CORRECTION n'affectent pas le stock.
  const avType = data.avType ?? "RETOUR";
  const restock = avType === "RETOUR";

  const year = new Date().getFullYear();
  let docId = 0;
  await d.transaction(async (tx) => {
    if (restock) await lockProducts(tx, avLines.map((x) => x.orig.productId));
    const { docNumber, sequenceNo } = await nextDocumentNumber(tx, {
      docType: "AV",
      year,
      businessLineId: source.businessLineId,
    });

    docId = (
      await tx
        .insert(salesDocuments)
        .values({
          docType: "AVOIR",
          docNumber,
          businessLineId: source.businessLineId,
          docYear: year,
          sequenceNo,
          customerId: source.customerId,
          customerName: source.customerName,
          customerPhone: source.customerPhone,
          customerEmail: source.customerEmail,
          customerCity: source.customerCity,
          customerIce: source.customerIce,
          docDate: new Date(),
          status: "VALIDE",
          totalBrutHtCents: totalHt,
          discountPercent: 0,
          discountAmountCents: 0,
          totalNetHtCents: totalHt,
          tvaRate: source.tvaRate ?? 20,
          tvaAmountCents: tvaAmount,
          totalTtcCents: totalHt + tvaAmount,
          paidAmountCents: 0,
          paymentMethod: source.paymentMethod,
          notes: data.notes ?? `Avoir sur ${source.docNumber}`,
          avType,
          vatDisplay: "SHOWN",
          priceBasis: "TTC",
          validatedAt: new Date(),
        })
        .returning({ id: salesDocuments.id })
    )[0].id;

    await tx.insert(salesLines).values(
      avLines.map((x) => ({
        documentId: docId,
        productId: x.orig.productId,
        productNameSnapshot: x.orig.productNameSnapshot,
        skuSnapshot: x.orig.skuSnapshot,
        oemCodeSnapshot: x.orig.oemCodeSnapshot,
        unitPriceHtCents: x.orig.unitPriceHtCents,
        quantity: x.qty,
        totalHtCents: x.lineHt,
        discountPercent: 0,
        discountAmountCents: 0,
        unitCostCents: x.orig.unitCostCents,
        tvaRate: x.orig.tvaRate,
        totalTtcCents: x.lineHt + x.lineTva,
        originalLineId: x.orig.id,
      }))
    );

    await tx.insert(documentLinks).values({
      sourceDocumentId: docId,
      targetDocumentId: source.id,
      linkType: "AV_TO_SOURCE",
    });

    await tx.insert(auditLogs).values({
      action: "AVOIR_EMIS",
      entityType: "AVOIR",
      actorName: await currentActor(),
      entityId: docId,
      details: `Avoir ${docNumber} (${avType}) sur ${source.docNumber} — ${((totalHt + tvaAmount) / 100).toFixed(2)} DH TTC`,
    });

    // Retour en stock au COGS d'origine (CMUP recalculé) — uniquement pour un avoir RETOUR.
    if (restock) {
      for (const x of avLines) {
        const pid = x.orig.productId;
        if (!pid) continue;
        const p = (await tx.select().from(products).where(eq(products.id, pid)).limit(1))[0];
        if (!p) continue;
        const state: CmupState = { quantity: p.currentStock, cmupCents: p.cmupCents };
        const { state: next } = applyMovement(state, x.qty, x.orig.unitCostCents);
        await tx.insert(stockMovements).values({
          productId: p.id,
          businessLineId: p.businessLineId,
          movementType: "AVOIR_RETOUR",
          quantity: x.qty,
          unitCostCents: x.orig.unitCostCents,
          sourceDocumentId: docId,
          sourceDocumentType: "AVOIR",
          reason: `Retour client ${docNumber} (${source.docNumber})`,
        });
        await tx
          .update(products)
          .set({ currentStock: next.quantity, cmupCents: next.cmupCents, updatedAt: new Date() })
          .where(eq(products.id, p.id));
        await bumpWarehouseStock(tx, p.id, x.qty);
      }
    }
  });

  const created = await loadDocumentById(docId);
  if (!created) throw new Error("ECHEC_CREATION_AVOIR");
  return created;
}

/**
 * Annule un document validé (immutabilité : on n'édite pas, on annule).
 * Contrepasse les mouvements de stock du document et journalise l'action.
 */
export async function cancelDocument(
  documentId: number,
  reason?: string
): Promise<ActionResult<SalesDocumentItem>> {
  return actionResult(() => cancelDocumentImpl(documentId, reason));
}

async function cancelDocumentImpl(documentId: number, reason?: string): Promise<SalesDocumentItem> {
  await assertOwner();
  const d = requireDb();

  const doc = (await d.select().from(salesDocuments).where(eq(salesDocuments.id, documentId)).limit(1))[0];
  if (!doc) throw new Error("Document introuvable");
  if (doc.status === "ANNULE") throw new Error("Document déjà annulé");
  await assertPeriodOpen(doc.docDate ?? new Date());

  await d.transaction(async (tx) => {
    // Verrou du document + re-contrôle : deux annulations concurrentes ne contrepassent pas deux fois.
    const locked = (
      await tx.select({ status: salesDocuments.status }).from(salesDocuments).where(eq(salesDocuments.id, documentId)).for("update")
    )[0];
    if (!locked || locked.status === "ANNULE") throw new Error("Document déjà annulé");
    const movs = await tx.select().from(stockMovements).where(eq(stockMovements.sourceDocumentId, documentId));
    await lockProducts(tx, movs.map((m) => m.productId));
    for (const m of movs) {
      const p = (await tx.select().from(products).where(eq(products.id, m.productId)).limit(1))[0];
      if (!p) continue;
      const state: CmupState = { quantity: p.currentStock, cmupCents: p.cmupCents };
      const { state: next } = applyMovement(state, -m.quantity, m.unitCostCents ?? 0);
      await tx.insert(stockMovements).values({
        productId: p.id,
        businessLineId: p.businessLineId,
        movementType: "AJUSTEMENT_INVENTAIRE",
        quantity: -m.quantity,
        unitCostCents: m.unitCostCents,
        sourceDocumentId: documentId,
        sourceDocumentType: "ANNULATION",
        reason: `Annulation ${doc.docNumber}${reason ? " — " + reason : ""}`,
      });
      await tx
        .update(products)
        .set({ currentStock: next.quantity, cmupCents: next.cmupCents, updatedAt: new Date() })
        .where(eq(products.id, p.id));
        await bumpWarehouseStock(tx, p.id, -m.quantity);
    }

    await tx
      .update(salesDocuments)
      .set({ status: "ANNULE", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(salesDocuments.id, documentId));

    await tx.insert(auditLogs).values({
      action: "ANNULATION_DOCUMENT",
      entityType: doc.docType,
      actorName: await currentActor(),
      entityId: documentId,
      details: `Annulation ${doc.docNumber}${reason ? " — " + reason : ""}`,
    });
  });

  const updated = await loadDocumentById(documentId);
  if (!updated) throw new Error("ECHEC_ANNULATION");
  return updated;
}

// ==========================================
// BONS DE PRÉPARATION + FEUILLE DE ROUTE (G2)
// ==========================================



/**
 * Crée un bon de préparation sur un document de vente (BC/BL/DEVIS).
 * Le BP est un état du document : pas de doc séparé, l'imprimé = DocumentPrintView.
 */
export async function createBonPreparation(
  documentId: number
): Promise<ActionResult<SalesDocumentItem>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const doc = (await d.select().from(salesDocuments).where(eq(salesDocuments.id, documentId)).limit(1))[0];
    if (!doc) throw new Error("Document introuvable");
    if (doc.status === "ANNULE") throw new Error("Document annulé — préparation impossible");
    if (!["BC", "BL", "DEVIS"].includes(doc.docType)) {
      throw new Error("Bon de préparation réservé aux BC, BL et Devis");
    }
    if (doc.prepStatus) throw new Error("Un bon de préparation existe déjà pour ce document");

    await d.update(salesDocuments).set({ prepStatus: "A_PREPARER" }).where(eq(salesDocuments.id, documentId));
    await d.insert(auditLogs).values({
      action: "CREATION_BP",
      entityType: "SALES_DOCUMENT",
      actorName: await currentActor(),
      entityId: documentId,
      details: `Bon de préparation créé — ${doc.docNumber}`,
    });
    const updated = await loadDocumentById(documentId);
    if (!updated) throw new Error("Document introuvable");
    return updated;
  });
}

/** Transition d'état de préparation / livraison (accord préparateur, statut livreur). */
export async function updatePrepStatus(
  documentId: number,
  newStatus: "A_PREPARER" | "EN_PREPARATION" | "PREPARE" | "LIVRE" | "NON_LIVRE"
): Promise<ActionResult<SalesDocumentItem>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    const doc = (await d.select().from(salesDocuments).where(eq(salesDocuments.id, documentId)).limit(1))[0];
    if (!doc) throw new Error("Document introuvable");
    if (!doc.prepStatus) throw new Error("Créez d'abord le bon de préparation");
    if (doc.status === "ANNULE") throw new Error("Document annulé");
    const allowed = PREP_TRANSITIONS[doc.prepStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Transition invalide : ${doc.prepStatus} → ${newStatus}`);
    }

    await d.update(salesDocuments).set({
      prepStatus: newStatus,
      preparedAt: newStatus === "PREPARE" ? new Date() : doc.preparedAt,
      deliveredAt: newStatus === "LIVRE" || newStatus === "NON_LIVRE" ? new Date() : doc.deliveredAt,
    }).where(eq(salesDocuments.id, documentId));

    await d.insert(auditLogs).values({
      action: "STATUT_PREPARATION",
      entityType: "SALES_DOCUMENT",
      actorName: await currentActor(),
      entityId: documentId,
      details: `${doc.docNumber} : ${doc.prepStatus} → ${newStatus}`,
    });
    const updated = await loadDocumentById(documentId);
    if (!updated) throw new Error("Document introuvable");
    return updated;
  });
}

export interface RouteSheetDoc {
  id: number;
  docNumber: string;
  docType: string;
  customerName: string;
  customerCity?: string | null;
  customerPhone?: string | null;
  totalTtcCents: number;
  docDate: string;
  prepStatus: string;
  commercialName: string | null;
  livreurId: number | null;
  livreurName: string | null;
}

/** Feuille de route : documents avec préparation, regroupables par livreur/date. */
export async function getDeliveryRouteSheet(from: string, to: string): Promise<ActionResult<RouteSheetDoc[]>> {
  return actionResult(async () => {
  await assertAuthenticated();
  const d = requireDb();
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59.999`);
  const rows = await d
    .select()
    .from(salesDocuments)
    .where(
      and(
        isNotNull(salesDocuments.prepStatus),
        gte(salesDocuments.docDate, fromDate),
        lte(salesDocuments.docDate, toDate)
      )
    )
    .orderBy(asc(salesDocuments.livreurName), asc(salesDocuments.docDate));
  return rows.map((r) => ({
    id: r.id,
    docNumber: r.docNumber,
    docType: r.docType,
    customerName: r.customerName,
    customerCity: r.customerCity,
    customerPhone: r.customerPhone,
    totalTtcCents: r.totalTtcCents,
    docDate: (r.docDate ?? r.createdAt ?? new Date()).toISOString(),
    prepStatus: r.prepStatus!,
    commercialName: r.commercialName,
    livreurId: r.livreurId,
    livreurName: r.livreurName,
  }));
  });
}
