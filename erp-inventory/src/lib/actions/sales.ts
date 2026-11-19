"use server";

import { and, asc, desc, eq, gte, inArray, ilike, isNull, ne, or, sql } from "drizzle-orm";
import {
  auditLogs,
  businessLineDocumentSettings,
  businessLines,
  customerPayments,
  customers,
  products,
  salesDocuments,
  salesLines,
  salesTenders,
  settings,
  staff,
  stockMovements,
  vatRates,
} from "@/db";
import { calculateDocumentTotals } from "@/lib/money";
import { effectiveVatRate, VAT_NOT_LIABLE_MENTION } from "@/lib/vat-regime";
import { nextDocumentNumber } from "@/lib/numbering";
import { assertAuthenticated, currentActor } from "@/lib/action-guard";
import { assertPeriodOpen } from "@/lib/accounting-period";
import { lockProducts } from "@/lib/stock-lock";
import { bumpWarehouseStock } from "@/lib/warehouse";
import { initialStatusFor } from "@/lib/payments";
import { applyMovement, type CmupState } from "@/lib/stock";
import { resolveCustomerPrices } from "@/lib/pricing";
import { validateInput, createSalesDocumentSchema } from "@/lib/action-validation";
import {
  computeDueDate,
  defaultConditionFor,
  isCustomCondition,
  LEGAL_ABSOLUTE_MAX_DAYS,
  termDays,
  toDateInput,
  type PaymentConditionCode,
} from "@/lib/payment-terms";
import { actionResult, type ActionResult } from "@/lib/action-result";
import {
  businessMessage,
  loadDocumentById,
  mapDoc,
  requireDb,
  type SalesDocResult,
  type SalesLineInput,
  type SalesDocumentItem,
  type TenderInput,
} from "@/lib/sales/shared";

export type {
  SalesLineInput,
  SalesDocumentItem,
  SalesDocResult,
  TenderInput,
  CompanyPrintInfo,
  DocumentPrintContext,
} from "@/lib/sales/shared";

type LineRow = typeof salesLines.$inferSelect;
type TenderRow = typeof salesTenders.$inferSelect;

/** Plafond serveur de la remise par ligne (legacy « Rem % » était plafonnée
 * à 10 %… côté client uniquement — ici l'enforcement est réel). */
const LINE_DISCOUNT_CAP_PERCENT = 10;

type SalesDocFilters = {
  docType?: "BL" | "FACTURE" | "AVOIR" | "BC" | "DEVIS";
  search?: string;
  status?: string;
  customerId?: number;
  commercial?: string;
};

function salesDocConds(options?: SalesDocFilters) {
  const conds = [isNull(salesDocuments.deletedAt)];
  if (options?.docType) conds.push(eq(salesDocuments.docType, options.docType));
  if (options?.status && options.status !== "ALL") conds.push(eq(salesDocuments.status, options.status));
  if (options?.customerId) conds.push(eq(salesDocuments.customerId, options.customerId));
  if (options?.commercial) conds.push(eq(salesDocuments.commercialName, options.commercial));
  const search = options?.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conds.push(or(ilike(salesDocuments.docNumber, like), ilike(salesDocuments.customerName, like))!);
  }
  return conds;
}

/**
 * Récupère les documents de vente (base de données).
 * Sans `limit` explicite, plafonné à 200 documents récents ; avec `limit` +
 * `offset`, pagination serveur (ordre stable par id décroissant).
 */
export async function getSalesDocuments(
  options?: SalesDocFilters & { limit?: number; offset?: number }
): Promise<SalesDocumentItem[]> {
  await assertAuthenticated();
  const d = requireDb();
  const limit = Math.min(Math.max(1, options?.limit ?? 200), 500);
  const offset = Math.max(0, options?.offset ?? 0);

  const docs = await d
    .select()
    .from(salesDocuments)
    .where(and(...salesDocConds(options)))
    .orderBy(desc(salesDocuments.id))
    .limit(limit)
    .offset(offset);
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
 * Tickets du jour pour le POS : documents BL/FACTURE/BC créés depuis `fromIso`
 * (début de journée côté caisse — le client envoie son minuit local).
 * Inclut lignes + jambes de règlement pour la réimpression ticket.
 */
export async function getDayTickets(fromIso?: string): Promise<ActionResult<SalesDocumentItem[]>> {
  await assertAuthenticated();
  return actionResult(async () => {
    const d = requireDb();
    const from = fromIso ? new Date(fromIso) : new Date(new Date().setHours(0, 0, 0, 0));
    const docs = await d
      .select()
      .from(salesDocuments)
      .where(
        and(
          isNull(salesDocuments.deletedAt),
          inArray(salesDocuments.docType, ["BL", "FACTURE", "BC", "AVOIR", "DEVIS"]),
          gte(salesDocuments.docDate, from)
        )
      )
      .orderBy(desc(salesDocuments.id))
      .limit(100);
    if (docs.length === 0) return [];

    const ids = docs.map((x) => x.id);
    const [lines, tenderRows] = await Promise.all([
      d.select().from(salesLines).where(inArray(salesLines.documentId, ids)),
      d.select().from(salesTenders).where(inArray(salesTenders.documentId, ids)),
    ]);
    const byDoc = new Map<number, LineRow[]>();
    for (const l of lines) {
      const arr = byDoc.get(l.documentId) ?? [];
      arr.push(l);
      byDoc.set(l.documentId, arr);
    }
    const byDocT = new Map<number, TenderRow[]>();
    for (const t of tenderRows) {
      const arr = byDocT.get(t.documentId) ?? [];
      arr.push(t);
      byDocT.set(t.documentId, arr);
    }

    return docs.map((doc) => mapDoc(doc, byDoc.get(doc.id) ?? [], byDocT.get(doc.id) ?? []));
  });
}

/**
 * Nombre total de documents correspondant aux filtres de getSalesDocuments
 * (sans la limite) — sert à la pagination côté UI.
 */
/** Commerciaux distincts ayant des documents — alimente le filtre /ventes (G18). */
export async function getDocumentCommercials(): Promise<string[]> {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d
    .selectDistinct({ name: salesDocuments.commercialName })
    .from(salesDocuments)
    .where(isNull(salesDocuments.deletedAt))
    .orderBy(asc(salesDocuments.commercialName));
  return rows.map((r) => r.name).filter((n): n is string => !!n);
}

export async function getSalesDocumentsCount(options?: SalesDocFilters): Promise<number> {
  await assertAuthenticated();
  const d = requireDb();
  const row = (
    await d
      .select({ n: sql<number>`count(*)` })
      .from(salesDocuments)
      .where(and(...salesDocConds(options)))
  )[0];
  return Number(row?.n ?? 0);
}

/**
 * T3.3 — Diagnostic : ventes orphelines qui n'auraient plus le droit d'exister
 * depuis le garde T1.4 (FACTURE ou crédit/différé sans `customerId`).
 * Vise zéro ligne. Les BL/BC/DEVIS comptoir en espèces n'apparaissent pas ici.
 */
export async function getOrphanCreditSales(): Promise<
  Array<{
    id: number;
    docNumber: string;
    docType: string;
    paymentMethod: string | null;
    totalTtcCents: number;
    docDate: string;
  }>
> {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d
    .select({
      id: salesDocuments.id,
      docNumber: salesDocuments.docNumber,
      docType: salesDocuments.docType,
      paymentMethod: salesDocuments.paymentMethod,
      totalTtcCents: salesDocuments.totalTtcCents,
      docDate: salesDocuments.docDate,
    })
    .from(salesDocuments)
    .where(
      and(
        isNull(salesDocuments.deletedAt),
        ne(salesDocuments.status, "ANNULE"),
        isNull(salesDocuments.customerId),
        or(
          eq(salesDocuments.docType, "FACTURE"),
          ne(salesDocuments.paymentMethod, "ESPECES")
        )!
      )
    )
    .orderBy(desc(salesDocuments.id))
    .limit(100);
  return rows.map((r) => ({
    ...r,
    docDate: (r.docDate ?? new Date()).toISOString(),
  }));
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
  docType?: "BL" | "FACTURE" | "AVOIR" | "BC" | "DEVIS";
  customerId?: number | null;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerCity?: string;
  customerIce?: string;
  lines: SalesLineInput[];
  discountPercent: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "CARTE_BANCAIRE" | "VERSEMENT" | "A_CREDIT";
  paidAmountCents?: number;
  notes?: string;
  businessLineCode?: string;
  /** Motif d'un prix négocié hors catalogue (question ouverte Prix-negocie). */
  overrideReason?: string;
  /** Clé de déduplication caisse : un retry/double-clic renvoie le doc existant. */
  idempotencyKey?: string;
  commercialId?: number | null;
  livreurId?: number | null;
  /** Chèque / effet remis à la vente : alimente l'échéancier (customer_payments). */
  paymentReference?: string;
  paymentDueDate?: string;
  paymentBankName?: string;
  /** Conditions de règlement (src/lib/payment-terms.ts) ; défaut = fiche client. */
  paymentCondition?: PaymentConditionCode | null;
  conditionDueDate?: string;
  /** Paiement fractionné POS : si présent, remplace paymentMethod/paidAmountCents.
   * Le reliquat non couvert devient du crédit (fiche client exigée). */
  tenders?: TenderInput[];
}): Promise<SalesDocResult> {
  await assertAuthenticated();
  try {
  data = validateInput(createSalesDocumentSchema, data);
  const d = requireDb();

  // Idempotence : si la clé a déjà produit un document, on le renvoie tel quel
  // (retry réseau / double-clic / F5 en cours de validation).
  const findByIdemKey = async (key: string) => {
    const row = (
      await d
        .select({ id: salesDocuments.id })
        .from(salesDocuments)
        .where(eq(salesDocuments.idempotencyKey, key))
        .limit(1)
    )[0];
    return row ? loadDocumentById(row.id) : null;
  };
  if (data.idempotencyKey) {
    const existing = await findByIdemKey(data.idempotencyKey);
    if (existing) return { ok: true, document: existing };
  }

  await assertPeriodOpen();

  const docType = data.docType ?? "BL";
  const year = new Date().getFullYear();

  // Taux de TVA par défaut, paramétrable (settings.defaultVatRateId → vat_rates), repli 20%.
  // Régime global : non-assujetti ⇒ taux effectif 0 (TVA ni calculée ni affichée).
  const vatRow = (
    await d
      .select({ rate: vatRates.ratePercent, liable: settings.vatLiable })
      .from(settings)
      .leftJoin(vatRates, eq(settings.defaultVatRateId, vatRates.id))
      .limit(1)
  )[0];
  const vatLiable = vatRow?.liable ?? true;
  const tvaRate = effectiveVatRate(vatRow?.rate ?? 20, vatLiable);

  // Résolution des prix ligne : le comptoir saisit en TTC, le HT est dérivé
  // côté serveur (jamais de confiance aux seuls data-* du client). OFFERT ⇒ 0,
  // prix nul interdit sinon. Le hors-catalogue est refusé plus bas sans motif.
  const resolvedLines = data.lines.map((l) => {
    let ht = l.unitPriceHTCents;
    if (l.unitPriceTtcCents != null) {
      const derived = Math.round(l.unitPriceTtcCents / (1 + tvaRate / 100));
      if (ht == null) {
        ht = derived;
      } else if (Math.abs(Math.round(ht * (1 + tvaRate / 100)) - l.unitPriceTtcCents) > 2) {
        throw new Error(`PRIX_INCOHERENT: ${l.sku} — HT et TTC envoyés divergent`);
      }
    }
    if (ht == null) throw new Error(`PRIX_REQUIS: ${l.sku} — prix HT ou TTC attendu`);
    if (l.isFree && ht !== 0) throw new Error(`OFFERT_PRIX_NON_NUL: ${l.sku} — une ligne offerte doit être à 0`);
    if (!l.isFree && ht <= 0) throw new Error(`PRIX_INVALIDE: ${l.sku} — prix nul interdit hors OFFERT`);
    if ((l.discountPercent ?? 0) > LINE_DISCOUNT_CAP_PERCENT) {
      throw new Error(`REMISE_PLAFOND_DEPASSE: ${l.sku} — remise ligne > ${LINE_DISCOUNT_CAP_PERCENT}%`);
    }
    return { ...l, unitPriceHTCents: ht };
  });

  // Totaux calculés une fois (hors transaction) : remises ligne → brut,
  // remise globale → net. Réutilisés par la gate client puis dans la tx.
  const totals = calculateDocumentTotals(
    resolvedLines.map((l) => ({
      unitPriceHT: l.unitPriceHTCents,
      quantity: l.quantity,
      discountPercent: l.discountPercent,
    })),
    data.discountPercent,
    tvaRate
  );

  // Jambes de règlement (split tenders) : le crédit n'est pas une jambe,
  // c'est le reliquat non couvert — il exige une fiche client.
  const tenders = data.tenders?.length ? data.tenders : null;
  const tenderSum = tenders ? tenders.reduce((s, t) => s + t.amountCents, 0) : 0;
  if (tenders) {
    if (tenderSum > totals.totalTTC) {
      throw new Error("REGLEMENT_EXCEDENT: le total des règlements dépasse le total TTC");
    }
    for (const t of tenders) {
      if (t.method === "ESPECES" && t.cashReceivedCents != null && t.cashReceivedCents < t.amountCents) {
        throw new Error("ESPECES_INSUFFISANT: montant remis inférieur à la jambe espèces");
      }
    }
  }
  const DEFERRED_METHODS = new Set(["CHEQUE", "EFFET_LCN", "VIREMENT", "VERSEMENT"]);
  const hasDeferredLeg = tenders
    ? tenders.some((t) => DEFERRED_METHODS.has(t.method))
    : DEFERRED_METHODS.has(data.paymentMethod);
  const hasCredit = tenders ? tenderSum < totals.totalTTC : data.paymentMethod === "A_CREDIT";
  const paidAtSaleCents = tenders
    ? tenderSum
    : data.paymentMethod === "A_CREDIT"
      ? (data.paidAmountCents ?? 0)
      : (data.paidAmountCents ?? totals.totalTTC);

  // Exit gate Phase 3 : une facture à un client professionnel exige son ICE.
  // Matrice POS T1.4 (fail-closed) : Client Comptoir (customerId=null) uniquement
  // pour BL/BC/DEVIS en ESPECES. FACTURE et tout crédit/différé exigent une fiche.
  const requiresCustomerFile =
    docType === "FACTURE" ||
    hasCredit ||
    hasDeferredLeg;
  if (requiresCustomerFile && !data.customerId) {
    throw new Error(
      "CLIENT_REQUIS: créez ou sélectionnez la fiche client avant de valider (FACTURE et ventes à crédit / chèque / effet / virement exigent un client enregistré, pas de client comptoir)."
    );
  }
  let clientTermDays: number | null = null;
  if (data.customerId) {
    const existing = (
      await d
        .select({ id: customers.id, termDays: customers.paymentTermDays })
        .from(customers)
        .where(eq(customers.id, data.customerId))
        .limit(1)
    )[0];
    if (!existing) throw new Error("CLIENT_INTROUVABLE: la fiche client sélectionnée n'existe plus.");
    clientTermDays = existing.termDays;
  }

  // Conditions de règlement : saisie explicite, sinon fiche client, sinon immédiat si réglé.
  const docDateNow = new Date();
  const paidUpFront =
    data.paymentMethod !== "A_CREDIT" && (data.paidAmountCents === undefined || data.paidAmountCents > 0);
  let paymentCondition: string | null = data.paymentCondition ?? null;
  let conditionDueDate = data.conditionDueDate ?? null;
  if (data.paymentCondition === undefined) {
    const def = defaultConditionFor(paidUpFront ? null : clientTermDays, paidUpFront);
    paymentCondition = def.code;
    if (def.customDays != null) conditionDueDate = toDateInput(new Date(docDateNow.getTime() + def.customDays * 86400000));
  }
  if (isCustomCondition(paymentCondition) && !conditionDueDate) {
    throw new Error("ECHEANCE_REQUISE: saisissez la date d'échéance pour une condition personnalisée ou en plusieurs échéances.");
  }
  const dueDate = computeDueDate(paymentCondition, docDateNow, conditionDueDate);
  if (dueDate && termDays(docDateNow, dueDate) > LEGAL_ABSOLUTE_MAX_DAYS) {
    throw new Error("DELAI_LEGAL_DEPASSE: le délai de paiement dépasse 120 jours (maximum légal, loi 69-21).");
  }
  if (dueDate && termDays(docDateNow, dueDate) < 0) {
    throw new Error("ECHEANCE_INVALIDE: la date d'échéance ne peut pas précéder la date du document.");
  }
  if (docType === "FACTURE") {
    let ice = data.customerIce?.trim() || null;
    let isProfessional = false;
    if (data.customerId) {
      const c = (await d.select().from(customers).where(eq(customers.id, data.customerId)).limit(1))[0];
      isProfessional = c?.isProfessional ?? false;
      ice = ice ?? c?.ice ?? null;
    }
    if (isProfessional && !ice) {
      throw new Error("ICE_CLIENT_REQUIS: la facturation d'un client professionnel est bloquée sans ICE.");
    }
  }

  let docId = 0;

  // Mention légale auto-ajoutée aux FACTURE/AVOIR en régime non-assujetti.
  const resolvedNotes =
    !vatLiable && (docType === "FACTURE" || docType === "AVOIR")
      ? [data.notes?.trim(), VAT_NOT_LIABLE_MENTION].filter(Boolean).join(" — ")
      : data.notes;

  try {
    await d.transaction(async (tx) => {
    await lockProducts(tx, resolvedLines.map((l) => l.productId));
    // Ligne métier (défaut PIECES)
    const line = (
      await tx
        .select({ id: businessLines.id })
        .from(businessLines)
        .where(eq(businessLines.code, data.businessLineCode || "PIECES"))
        .limit(1)
    )[0];
    if (!line) throw new Error("LIGNE_METIER_INTROUVABLE");

    // Snapshot §6A de la visibilité TVA au moment de la validation.
    const settingsKey = docType === "FACTURE" ? "FAC" : docType === "AVOIR" ? "AV" : docType;
    const vatCfg = (
      await tx
        .select()
        .from(businessLineDocumentSettings)
        .where(
          and(
            eq(businessLineDocumentSettings.businessLineId, line.id),
            eq(businessLineDocumentSettings.docType, settingsKey)
          )
        )
        .limit(1)
    )[0];
    const vatDisplay = !vatLiable ? "HIDDEN" : vatCfg ? (vatCfg.showVat ? "SHOWN" : "HIDDEN") : "SHOWN";
    const priceBasis = vatCfg?.priceBasis ?? "TTC";
    // Régime assujetti : FAC/AV affichent toujours la TVA. Régime non-assujetti :
    // FAC/AV masquées avec mention légale auto-ajoutée aux notes (contrainte DB
    // FAC/AV-SHOWN retirée, enforcement régime-aware ici).
    if ((docType === "FACTURE" || docType === "AVOIR") && vatDisplay === "HIDDEN" && vatLiable) {
      throw new Error("TVA_OBLIGATOIRE_FAC_AV: FAC et AV doivent afficher la TVA");
    }

    const affectsStock = docType === "BL" || docType === "FACTURE";
    const negRow = (await tx.select({ neg: settings.negativeStockAllowed }).from(settings).limit(1))[0];
    const negativeAllowed = negRow?.neg ?? false;

    // M1 — prix résolus client (clientproduits → price_level → catalogue).
    // Un prix égal au tarif résolu n'est PAS « hors catalogue ».
    const clientPrices = data.customerId
      ? await resolveCustomerPrices(tx, data.customerId, resolvedLines.map((l) => l.productId))
      : new Map<number, { priceHtCents: number }>();

    // Effets de stock (COGS = CMUP courant). BL/FACTURE décrémentent ; BC/DEVIS non.
    const effects: Array<{
      productId: number;
      businessLineId: number;
      quantity: number;
      unitCostCents: number;
      nextStock: number;
      nextCmup: number;
    }> = [];
    for (const l of resolvedLines) {
      const p = (await tx.select().from(products).where(eq(products.id, l.productId)).limit(1))[0];
      if (!p) throw new Error(`PIECE_INTROUVABLE: ${l.sku}`);

      // Question ouverte « Prix-negocie » : le prix est résolu côté serveur depuis
      // la base. Un prix hors catalogue est refusé (fail-closed) sauf motif tracé.
      // Produit SANS prix catalogue : tout prix saisi est « hors catalogue » et exige
      // aussi un motif (sinon un prix arbitraire passerait inaperçu).
      const catalogPrices = [
        p.salePriceHtCents,
        clientPrices.get(l.productId)?.priceHtCents,
      ].filter((v): v is number => typeof v === "number" && v > 0);
      const isOffCatalog = catalogPrices.length === 0 || !catalogPrices.includes(l.unitPriceHTCents);
      if (isOffCatalog) {
        if (!data.overrideReason?.trim()) {
          throw new Error(
            `PRIX_HORS_CATALOGUE: ${p.sku}. Un prix négocié doit être justifié (prix fixé audité).`
          );
        }
        await tx.insert(auditLogs).values({
          action: "PRIX_FIXE",
          entityType: "PRODUCT",
          actorName: await currentActor(),
          entityId: p.id,
          details: `${p.sku}: prix catalogue ${catalogPrices.join("/")} → ${l.unitPriceHTCents} — motif: ${data.overrideReason.trim()}`,
        });
      }

      const state: CmupState = { quantity: p.currentStock, cmupCents: p.cmupCents };
      const { state: next } = applyMovement(state, -l.quantity, 0);
      if (affectsStock && next.quantity < 0 && !negativeAllowed) throw new Error(`STOCK_NEGATIF_INTERDIT: ${p.sku}`);
      effects.push({
        productId: p.id,
        businessLineId: p.businessLineId,
        quantity: -l.quantity,
        unitCostCents: p.cmupCents,
        nextStock: next.quantity,
        nextCmup: next.cmupCents,
      });
    }

    // Numéro gapless (clé de numérotation canonique : FAC/AV, pas FACTURE/AVOIR)
    const sequenceKey = docType === "FACTURE" ? "FAC" : docType === "AVOIR" ? "AV" : docType;
    const { docNumber, sequenceNo } = await nextDocumentNumber(tx, {
      docType: sequenceKey,
      year,
      businessLineId: line.id,
    });

    const isFullyPaid = paidAtSaleCents >= totals.totalTTC;

    // Attribution : snapshot des noms (le doc garde le nom même si le staff change).
    const [commercial, livreur] = await Promise.all([
      data.commercialId
        ? tx.select({ name: staff.name }).from(staff).where(eq(staff.id, data.commercialId)).limit(1)
        : Promise.resolve([]),
      data.livreurId
        ? tx.select({ name: staff.name }).from(staff).where(eq(staff.id, data.livreurId)).limit(1)
        : Promise.resolve([]),
    ]);

    docId = (
      await tx
        .insert(salesDocuments)
        .values({
          docType,
          docNumber,
          idempotencyKey: data.idempotencyKey ?? null,
          businessLineId: line.id,
          docYear: year,
          sequenceNo,
          customerId: data.customerId ?? null,
          customerName: data.customerName || "Client Comptoir Particulier",
          customerPhone: data.customerPhone ?? null,
          customerEmail: data.customerEmail ?? null,
          customerCity: data.customerCity ?? "Casablanca",
          customerIce: data.customerIce ?? null,
          docDate: docDateNow,
          paymentCondition,
          dueDate,
          status: isFullyPaid ? "PAYE" : "VALIDE",
          totalBrutHtCents: totals.totalBrutHT,
          discountPercent: totals.discountPercent,
          discountAmountCents: totals.discountAmount,
          totalNetHtCents: totals.totalNetHT,
          tvaRate: totals.tvaRate,
          tvaAmountCents: totals.tvaAmount,
          totalTtcCents: totals.totalTTC,
          paidAmountCents: Math.min(totals.totalTTC, paidAtSaleCents),
          // Jambe principale (affichage/compat) — le découpage réel vit dans sales_tenders.
          paymentMethod: tenders ? tenders[0].method : data.paymentMethod,
          notes: resolvedNotes ?? null,
          vatDisplay,
          priceBasis,
          validatedAt: new Date(),
          commercialId: commercial.length ? data.commercialId! : null,
          commercialName: commercial[0]?.name ?? null,
          livreurId: livreur.length ? data.livreurId! : null,
          livreurName: livreur[0]?.name ?? null,
        })
        .returning({ id: salesDocuments.id })
    )[0].id;

    await tx.insert(salesLines).values(
      resolvedLines.map((l) => {
        const gross = l.unitPriceHTCents * l.quantity;
        const ld = Math.min(100, Math.max(0, l.discountPercent ?? 0));
        const net = ld > 0 ? Math.round(gross * (1 - ld / 100)) : gross;
        return {
          documentId: docId,
          productId: l.productId,
          productNameSnapshot: l.productName,
          skuSnapshot: l.sku,
          oemCodeSnapshot: l.oemCode ?? null,
          unitPriceHtCents: l.unitPriceHTCents,
          unitPriceTtcCents: l.unitPriceTtcCents ?? Math.round(l.unitPriceHTCents * (1 + tvaRate / 100)),
          quantity: l.quantity,
          totalHtCents: net,
          discountPercent: ld,
          discountAmountCents: gross - net,
          unitCostCents: effects.find((e) => e.productId === l.productId)?.unitCostCents ?? 0,
          tvaRate,
          totalTtcCents: Math.round(net * (1 + tvaRate / 100)),
          customLabel: l.customLabel?.trim() || null,
          isFree: l.isFree ?? false,
          priceForced: l.priceForced ?? false,
        };
      })
    );

    // Journal des opérations : toute validation BL/FACTURE/BC/DEVIS/AVOIR y figure.
    await tx.insert(auditLogs).values({
      action: "VALIDATION_DOCUMENT",
      entityType: docType,
      actorName: await currentActor(),
      entityId: docId,
      details: `${docType} ${docNumber} — ${data.customerName || "Client Comptoir Particulier"} — ${(totals.totalTTC / 100).toFixed(2)} DH TTC (${data.paymentMethod}${isFullyPaid ? ", soldé" : ", à crédit"})`,
    });

    if (affectsStock) {
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
        await bumpWarehouseStock(tx, e.productId, e.quantity);
      }
    }

    // Jambes de règlement : source de vérité du découpage (clôture caisse,
    // ticket). En mode simple (appelants existants), une jambe déduite des
    // champs historiques — même résultat qu'avant pour les anciens appelants.
    const legRows: TenderInput[] = tenders
      ? tenders
      : paidAtSaleCents > 0 && data.paymentMethod !== "A_CREDIT"
        ? [{
            method: data.paymentMethod as TenderInput["method"],
            amountCents: paidAtSaleCents,
            referenceNumber: data.paymentReference,
            bankName: data.paymentBankName,
            dueDate: data.paymentDueDate,
          }]
        : [];
    if (affectsStock && legRows.length) {
      await tx.insert(salesTenders).values(
        legRows.map((t) => ({
          documentId: docId,
          method: t.method,
          amountCents: t.amountCents,
          cashReceivedCents: t.cashReceivedCents ?? null,
          referenceNumber: t.referenceNumber?.trim() || null,
          bankName: t.bankName?.trim() || null,
          payeeName: t.payeeName?.trim() || null,
          issueDate: t.issueDate ? new Date(t.issueDate) : null,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
        }))
      );
    }

    // Règlement à la vente (client identifié) : une ligne customer_payments PAR
    // JAMBE liée au document — sinon soldes clients, relevés et échéancier
    // ignorent le paiement (doc PAYE mais client « débiteur », chèque absent).
    if (data.customerId && affectsStock && legRows.length) {
      for (const leg of legRows) {
        const deferred = leg.method === "CHEQUE" || leg.method === "EFFET_LCN";
        await tx.insert(customerPayments).values({
          customerId: data.customerId,
          documentId: docId,
          amountCents: leg.amountCents,
          paymentMethod: leg.method,
          referenceNumber: leg.referenceNumber?.trim() || null,
          chequeDueDate: deferred ? new Date(leg.dueDate || Date.now()) : null,
          bankName: leg.bankName?.trim() || null,
          payeeName: leg.payeeName?.trim() || null,
          status: initialStatusFor(leg.method),
          notes: `Règlement à la vente ${docNumber}`,
        });
      }
    }

    // Acomptes clients (question ouverte Acomptes-Q19, réponse : oui) : impute les
    // règlements non affectés du client sur le nouveau document (FIFO par date).
    if (data.customerId && affectsStock) {
      const credits = await tx
        .select()
        .from(customerPayments)
        .where(
          and(
            eq(customerPayments.customerId, data.customerId),
            isNull(customerPayments.documentId),
            ne(customerPayments.status, "REJETE")
          )
        )
        .orderBy(asc(customerPayments.paymentDate));
      const docPaid = Math.min(totals.totalTTC, paidAtSaleCents);
      let remainingDue = Math.max(0, totals.totalTTC - docPaid);
      let applied = 0;
      for (const p of credits) {
        if (remainingDue <= 0) break;
        await tx.update(customerPayments).set({ documentId: docId }).where(eq(customerPayments.id, p.id));
        applied += p.amountCents;
        remainingDue -= p.amountCents;
      }
      if (applied > 0) {
        const newPaid = Math.min(totals.totalTTC, docPaid + applied);
        await tx
          .update(salesDocuments)
          .set({ paidAmountCents: newPaid, status: newPaid >= totals.totalTTC ? "PAYE" : "VALIDE" })
          .where(eq(salesDocuments.id, docId));
      }
    }
  });
  } catch (err) {
    // Contrainte unique sur idempotency_key : la transaction concurrente a gagné
    // entre la pré-vérif et l'insert — on renvoie le document qu'elle a créé.
    if (data.idempotencyKey) {
      const existing = await findByIdemKey(data.idempotencyKey);
      if (existing) return { ok: true, document: existing };
    }
    throw err;
  }

  const created = await loadDocumentById(docId);
  if (!created) throw new Error("ECHEC_CREATION_DOCUMENT");
  return { ok: true, document: created };
  } catch (err) {
    // En production, les erreurs jetées sont masquées ("React error #441") :
    // les règles de gestion sont renvoyées, les erreurs internes restent masquées.
    const msg = businessMessage(err);
    if (msg) return { ok: false, error: msg };
    throw err;
  }
}
