"use server";

import { and, asc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { auditLogs, customerPayments, customers, db, salesDocuments, staff } from "@/db";
import { assertAuthenticated, currentActor } from "@/lib/action-guard";
import { assertPeriodOpen } from "@/lib/accounting-period";
import { convertedBlIds, receivableSign } from "@/lib/sales/receivables";
import { initialStatusFor, statusesForMethod } from "@/lib/payments";
import { matchTokens } from "@/lib/search";
import { getSalesDocuments, type SalesDocumentItem } from "./sales";
import { validateInput, recordCustomerPaymentSchema } from "@/lib/action-validation";
import { actionResult, type ActionResult } from "@/lib/action-result";

export interface CustomerItem {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  city: string;
  address: string | null;
  ice: string | null;
  identityNumber: string | null;
  isWholesale: boolean;
  isProfessional: boolean;
  defaultPriceLevelId: number | null;
  creditLimitCents: number | null;
  paymentTerms: string | null;
  paymentTermDays: number | null;
  riskClass: "NORMAL" | "ROI" | "DOUTEUX" | "LITIGIEUX" | "ARNAQUEUR";
  assignedStaffId: number | null;
  assignedStaffName: string | null;
  representative: string | null;
  externalRef: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerPaymentItem {
  id: number;
  customerId: number;
  customerName: string;
  documentId: number | null;
  documentNumber?: string | null;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "CARTE_BANCAIRE" | "VERSEMENT";
  paymentDate: string;
  referenceNumber: string | null;
  chequeDueDate: string | null;
  bankName: string | null;
  payeeName: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface CustomerLedgerLine {
  date: string;
  label: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
}

export interface CustomerAccountStatement {
  customer: CustomerItem;
  totalBilledTtcCents: number;
  totalPaidCents: number;
  balanceDueCents: number;
  unpaidDocumentsCount: number;
  documents: Array<SalesDocumentItem & { remainingDueCents: number }>;
  payments: CustomerPaymentItem[];
  /** Relevé chronologique Débit / Crédit / Solde (factures, avoirs, règlements). */
  ledger: CustomerLedgerLine[];
}

export interface ChequeEffetAlert {
  id: number;
  customerId: number;
  customerName: string;
  paymentMethod: "CHEQUE" | "EFFET_LCN";
  amountCents: number;
  referenceNumber: string;
  bankName: string;
  dueDate: string;
  status: string;
  urgency: "RETARD" | "AUJOURDHUI" | "PROCHE" | "FUTUR";
  daysRemaining: number;
  depositDate?: string | null;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

type CustomerRow = typeof customers.$inferSelect;
type PaymentRow = typeof customerPayments.$inferSelect;

function mapCustomer(r: CustomerRow): CustomerItem {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    city: r.city ?? "",
    address: r.address,
    ice: r.ice,
    identityNumber: r.identityNumber,
    isWholesale: r.isWholesale ?? false,
    isProfessional: r.isProfessional ?? false,
    defaultPriceLevelId: r.defaultPriceLevelId ?? null,
    creditLimitCents: r.creditLimitCents ?? null,
    paymentTerms: r.paymentTerms,
    paymentTermDays: r.paymentTermDays ?? null,
    riskClass: (r.riskClass ?? "NORMAL") as CustomerItem["riskClass"],
    assignedStaffId: r.assignedStaffId ?? null,
    assignedStaffName: null,
    representative: r.representative,
    externalRef: r.externalRef,
    notes: r.notes,
    createdAt: (r.createdAt ?? new Date()).toISOString(),
  };
}

function mapPayment(p: PaymentRow, customerName: string, documentNumber: string | null = null): CustomerPaymentItem {
  return {
    id: p.id,
    customerId: p.customerId,
    customerName,
    documentId: p.documentId,
    documentNumber,
    amountCents: p.amountCents,
    paymentMethod: p.paymentMethod as CustomerPaymentItem["paymentMethod"],
    paymentDate: (p.paymentDate ?? p.createdAt ?? new Date()).toISOString(),
    referenceNumber: p.referenceNumber,
    chequeDueDate: p.chequeDueDate ? p.chequeDueDate.toISOString() : null,
    bankName: p.bankName,
    payeeName: p.payeeName,
    status: p.status as CustomerPaymentItem["status"],
    notes: p.notes,
    createdAt: (p.createdAt ?? new Date()).toISOString(),
  };
}

/**
 * Clients avec solde calculé depuis la base (documents + règlements).
 */
export async function getCustomers(searchQuery?: string, options?: { staffId?: number }) {
  await assertAuthenticated();
  const d = requireDb();

  const conds = [isNull(customers.deletedAt)];
  // Recherche tolérante caisse : sous-chaînes multi-mots (ET) + squelette consonantique
  // (« ben », « bennani », « bennani el » retrouvent « EL BANNANI »).
  const match = matchTokens(searchQuery, [customers.name], [customers.phone, customers.city, customers.ice]);
  if (match) conds.push(match);
  if (options?.staffId) conds.push(eq(customers.assignedStaffId, options.staffId));

  const rows = await d
    .select({ customer: customers, staffName: staff.name })
    .from(customers)
    .leftJoin(staff, eq(customers.assignedStaffId, staff.id))
    .where(and(...conds))
    .orderBy(asc(customers.name))
    .limit(500);

  const docRows = await d
    .select({
      id: salesDocuments.id,
      customerId: salesDocuments.customerId,
      docType: salesDocuments.docType,
      status: salesDocuments.status,
      ttc: salesDocuments.totalTtcCents,
    })
    .from(salesDocuments)
    .where(and(isNull(salesDocuments.deletedAt), ne(salesDocuments.status, "ANNULE"), isNotNull(salesDocuments.customerId)));
  const converted = await convertedBlIds();
  const billedMap = new Map<number | null, { billed: number; unpaid: number }>();
  for (const r of docRows) {
    const sign = receivableSign(r.docType, r.id, converted);
    if (sign === 0) continue;
    const e = billedMap.get(r.customerId) ?? { billed: 0, unpaid: 0 };
    e.billed += sign * r.ttc;
    if (sign === 1 && r.status !== "PAYE") e.unpaid += 1;
    billedMap.set(r.customerId, e);
  }

  const paidRows = await d
    .select({
      customerId: customerPayments.customerId,
      paid: sql<string>`coalesce(sum(${customerPayments.amountCents}),0)::bigint`,
    })
    .from(customerPayments)
    .where(ne(customerPayments.status, "REJETE"))
    .groupBy(customerPayments.customerId);

  const paidMap = new Map(paidRows.map((r) => [r.customerId, Number(r.paid)]));

  return rows.map((r) => {
    const c = { ...mapCustomer(r.customer), assignedStaffName: r.staffName ?? null };
    const totalBilledTtcCents = billedMap.get(r.customer.id)?.billed ?? 0;
    const unpaidDocumentsCount = billedMap.get(r.customer.id)?.unpaid ?? 0;
    const totalPaidCents = paidMap.get(r.customer.id) ?? 0;
    return {
      ...c,
      totalBilledTtcCents,
      totalPaidCents,
      balanceDueCents: totalBilledTtcCents - totalPaidCents,
      unpaidDocumentsCount,
    };
  });
}

/**
 * Relevé de compte complet d'un client.
 */
export async function getCustomerStatement(customerId: number): Promise<CustomerAccountStatement | null> {
  await assertAuthenticated();
  const d = requireDb();

  const row = (
    await d
      .select({ customer: customers, staffName: staff.name })
      .from(customers)
      .leftJoin(staff, eq(customers.assignedStaffId, staff.id))
      .where(eq(customers.id, customerId))
      .limit(1)
  )[0];
  if (!row) return null;
  const customer = { ...mapCustomer(row.customer), assignedStaffName: row.staffName ?? null };

  const allDocs = await getSalesDocuments({ customerId, limit: 500 });
  const converted = await convertedBlIds();
  const documents = allDocs
    .filter((doc) => doc.status !== "ANNULE")
    .map((doc) => {
      const sign = receivableSign(doc.docType, doc.id, converted);
      return { ...doc, remainingDueCents: sign === 1 ? Math.max(0, doc.totalTtcCents - doc.paidAmountCents) : 0 };
    });

  const paymentRows = await d
    .select()
    .from(customerPayments)
    .where(eq(customerPayments.customerId, customerId))
    .orderBy(sql`${customerPayments.paymentDate} desc`);

  const docNumbers = new Map(allDocs.map((doc) => [doc.id, doc.docNumber]));
  const payments = paymentRows.map((p) => mapPayment(p, customer.name, p.documentId ? docNumbers.get(p.documentId) ?? null : null));

  const totalBilledTtcCents = documents.reduce(
    (s, doc) => s + receivableSign(doc.docType, doc.id, converted) * doc.totalTtcCents,
    0
  );
  const totalPaidCents = payments.filter((p) => p.status !== "REJETE").reduce((s, p) => s + p.amountCents, 0);
  const unpaidDocumentsCount = documents.filter((doc) => doc.remainingDueCents > 0).length;

  // Relevé de compte (débit/crédit/solde) : factures = débit, avoirs + règlements = crédit.
  const entries: Array<{ date: string; label: string; debit: number; credit: number }> = [];
  for (const doc of documents) {
    const sign = receivableSign(doc.docType, doc.id, converted);
    if (sign === 1) {
      const label = doc.docType === "FACTURE" ? "Facture" : "BL";
      entries.push({ date: doc.docDate, label: `${label} ${doc.docNumber}`, debit: doc.totalTtcCents, credit: 0 });
    } else if (sign === -1) {
      entries.push({ date: doc.docDate, label: `Avoir ${doc.docNumber}`, debit: 0, credit: doc.totalTtcCents });
    }
  }
  for (const p of payments) {
    if (p.status === "REJETE") continue;
    entries.push({
      date: p.paymentDate,
      label: `Règlement ${p.referenceNumber ? p.referenceNumber + " " : ""}(${p.paymentMethod})`,
      debit: 0,
      credit: p.amountCents,
    });
  }
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let running = 0;
  const ledger = entries.map((e) => {
    running += e.debit - e.credit;
    return { date: e.date, label: e.label, debitCents: e.debit, creditCents: e.credit, balanceCents: running };
  });

  return {
    customer,
    totalBilledTtcCents,
    totalPaidCents,
    balanceDueCents: totalBilledTtcCents - totalPaidCents,
    unpaidDocumentsCount,
    documents,
    payments,
    ledger,
  };
}

/**
 * Enregistre un règlement client (transaction) et lettre (ciblé ou FIFO) les documents.
 */
export async function recordCustomerPayment(data: {
  customerId: number;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "CARTE_BANCAIRE" | "VERSEMENT";
  documentId?: number | null;
  referenceNumber?: string;
  chequeDueDate?: string;
  bankName?: string;
  payeeName?: string;
  notes?: string;
}): Promise<ActionResult<CustomerPaymentItem>> {
  return actionResult(() => recordCustomerPaymentImpl(data));
}

export async function updatePaymentStatus(paymentId: number, newStatus: string): Promise<ActionResult<CustomerPaymentItem>> {
  return actionResult(() => updatePaymentStatusImpl(paymentId, newStatus));
}

export async function saveCustomer(data: {
  id?: number;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  ice?: string;
  identityNumber?: string;
  isWholesale?: boolean;
  isProfessional?: boolean;
  defaultPriceLevelId?: number | null;
  creditLimitCents?: number | null;
  paymentTerms?: string;
  paymentTermDays?: number | null;
  riskClass?: string;
  assignedStaffId?: number | null;
  representative?: string;
  externalRef?: string;
  notes?: string;
  force?: boolean;
}): Promise<ActionResult<CustomerItem>> {
  return actionResult(() => saveCustomerImpl(data));
}

export async function mergeCustomers(sourceId: number, targetId: number): Promise<ActionResult<CustomerItem>> {
  return actionResult(() => mergeCustomersImpl(sourceId, targetId));
}

async function recordCustomerPaymentImpl(data: {
  customerId: number;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "CARTE_BANCAIRE" | "VERSEMENT";
  documentId?: number | null;
  referenceNumber?: string;
  chequeDueDate?: string;
  bankName?: string;
  payeeName?: string;
  notes?: string;
}): Promise<CustomerPaymentItem> {
  await assertAuthenticated();
  data = validateInput(recordCustomerPaymentSchema, data);
  const d = requireDb();
  await assertPeriodOpen();

  const customer = (await d.select().from(customers).where(eq(customers.id, data.customerId)).limit(1))[0];
  if (!customer) throw new Error("Client introuvable");

  const initialStatus = initialStatusFor(data.paymentMethod);

  let docNumber: string | null = null;
  let paymentId = 0;

  await d.transaction(async (tx) => {
    // Documents ciblés : un BL précis, sinon FIFO sur les BL impayés du client
    const targetDocs = data.documentId
      ? await tx
          .select()
          .from(salesDocuments)
          .where(and(eq(salesDocuments.id, data.documentId), ne(salesDocuments.status, "ANNULE")))
          .limit(1)
      : await tx
          .select()
          .from(salesDocuments)
          .where(
            and(
              eq(salesDocuments.customerId, data.customerId),
              ne(salesDocuments.status, "PAYE"),
              ne(salesDocuments.status, "ANNULE"),
              isNull(salesDocuments.deletedAt)
            )
          )
          .orderBy(asc(salesDocuments.docDate));

    const convertedPay = await convertedBlIds();
    let remaining = data.amountCents;
    for (const doc of targetDocs) {
      if (remaining <= 0) break;
      // Seules les créances (BL non facturé / FACTURE) se lettrent : pas de DEVIS/BC/AVOIR.
      if (receivableSign(doc.docType, doc.id, convertedPay) !== 1) continue;
      const unpaidOnDoc = Math.max(0, doc.totalTtcCents - doc.paidAmountCents);
      const allocated = Math.min(unpaidOnDoc, remaining);
      if (allocated <= 0) continue;
      const newPaid = doc.paidAmountCents + allocated;
      remaining -= allocated;
      await tx
        .update(salesDocuments)
        .set({ paidAmountCents: newPaid, status: newPaid >= doc.totalTtcCents ? "PAYE" : doc.status, updatedAt: new Date() })
        .where(eq(salesDocuments.id, doc.id));
      if (data.documentId) docNumber = doc.docNumber;
    }

    paymentId = (
      await tx
        .insert(customerPayments)
        .values({
          customerId: data.customerId,
          documentId: data.documentId ?? null,
          amountCents: data.amountCents,
          paymentMethod: data.paymentMethod,
          paymentDate: new Date(),
          referenceNumber: data.referenceNumber ?? null,
          chequeDueDate: data.chequeDueDate ? new Date(data.chequeDueDate) : null,
          bankName: data.bankName ?? null,
          payeeName: data.payeeName ?? null,
          status: initialStatus,
          notes: data.notes ?? null,
        })
        .returning({ id: customerPayments.id })
    )[0].id;

    if (data.documentId && !docNumber) {
      const dn = (await tx.select({ n: salesDocuments.docNumber }).from(salesDocuments).where(eq(salesDocuments.id, data.documentId)).limit(1))[0];
      docNumber = dn?.n ?? null;
    }
  });

  const row = (await d.select().from(customerPayments).where(eq(customerPayments.id, paymentId)).limit(1))[0];
  try {
    await d.insert(auditLogs).values({
      action: "REGLEMENT_CLIENT",
      entityType: "CUSTOMER_PAYMENT",
      actorName: await currentActor(),
      entityId: paymentId,
      details: `Encaissement ${(data.amountCents / 100).toFixed(2)} DH (${data.paymentMethod}) — ${customer.name}${docNumber ? ` sur ${docNumber}` : ""}`,
    });
  } catch {
    // journal non bloquant
  }
  return mapPayment(row, customer.name, docNumber);
}

/**
 * Met à jour le statut d'un chèque ou effet LCN.
 */
async function updatePaymentStatusImpl(paymentId: number, newStatus: string): Promise<CustomerPaymentItem> {
  await assertAuthenticated();
  const d = requireDb();

  const existing = (await d.select().from(customerPayments).where(eq(customerPayments.id, paymentId)).limit(1))[0];
  if (!existing) throw new Error("Règlement introuvable");
  if (!statusesForMethod(existing.paymentMethod).includes(newStatus)) {
    throw new Error(`Statut invalide pour le moyen de paiement ${existing.paymentMethod}`);
  }

  const updated = (
    await d
      .update(customerPayments)
      .set({
        status: newStatus,
        // Date de dépôt bancaire (chèque remis / effet remis à l'encaissement).
        depositDate: ["REMIS_BANQUE", "REMIS_ENCAISSEMENT"].includes(newStatus)
          ? new Date()
          : existing.depositDate,
      })
      .where(eq(customerPayments.id, paymentId))
      .returning()
  )[0];
  if (!updated) throw new Error("Règlement introuvable");

  const customer = (await d.select().from(customers).where(eq(customers.id, updated.customerId)).limit(1))[0];
  try {
    await d.insert(auditLogs).values({
      action: "STATUT_REGLEMENT",
      entityType: "CUSTOMER_PAYMENT",
      actorName: await currentActor(),
      entityId: paymentId,
      details: `${updated.paymentMethod} ${(updated.amountCents / 100).toFixed(2)} DH — ${customer?.name ?? ""} : statut → ${newStatus}`,
    });
  } catch {
    // journal non bloquant
  }
  return mapPayment(updated, customer?.name ?? "");
}

/**
 * Échéancier des chèques et effets de commerce.
 */
export async function getChequesEffetsSchedule(): Promise<ChequeEffetAlert[]> {
  await assertAuthenticated();
  const d = requireDb();

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const rows = await d
    .select({ p: customerPayments, customerName: customers.name })
    .from(customerPayments)
    .innerJoin(customers, eq(customerPayments.customerId, customers.id))
    .where(
      and(
        or(eq(customerPayments.paymentMethod, "CHEQUE"), eq(customerPayments.paymentMethod, "EFFET_LCN"))!,
        sql`${customerPayments.chequeDueDate} is not null`
      )
    );

  return rows
    .map(({ p, customerName }) => {
      const dueDate = new Date(p.chequeDueDate!);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      let urgency: ChequeEffetAlert["urgency"] = "FUTUR";
      if (diffDays < 0) urgency = "RETARD";
      else if (diffDays === 0) urgency = "AUJOURDHUI";
      else if (diffDays <= 7) urgency = "PROCHE";

      return {
        id: p.id,
        customerId: p.customerId,
        customerName,
        paymentMethod: p.paymentMethod as "CHEQUE" | "EFFET_LCN",
        amountCents: p.amountCents,
        referenceNumber: p.referenceNumber || "Sans N°",
        bankName: p.bankName || "Non spécifiée",
        dueDate: p.chequeDueDate!.toISOString(),
        status: p.status as ChequeEffetAlert["status"],
        urgency,
        daysRemaining: diffDays,
        depositDate: p.depositDate ? p.depositDate.toISOString() : null,
      };
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

/**
 * Détecte les doublons clients (nom, téléphone, ICE). Exclut `excludeId` (édition).
 */
export async function findCustomerDuplicates(
  data: { name?: string; phone?: string; ice?: string },
  excludeId?: number
): Promise<Array<{ id: number; name: string; phone: string | null; ice: string | null }>> {
  await assertAuthenticated();
  const d = requireDb();
  const ors = [];
  if (data.name?.trim()) ors.push(ilike(customers.name, data.name.trim()));
  if (data.phone?.trim()) ors.push(eq(customers.phone, data.phone.trim()));
  if (data.ice?.trim()) ors.push(eq(customers.ice, data.ice.trim()));
  if (ors.length === 0) return [];
  const conds = [isNull(customers.deletedAt), or(...ors)!];
  if (excludeId) conds.push(ne(customers.id, excludeId));
  const rows = await d
    .select({ id: customers.id, name: customers.name, phone: customers.phone, ice: customers.ice })
    .from(customers)
    .where(and(...conds));
  return rows;
}

/**
 * Crée ou modifie un client. Détecte les doublons et applique la règle ICE (B2B).
 */
async function saveCustomerImpl(data: {
  id?: number;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  ice?: string;
  identityNumber?: string;
  isWholesale?: boolean;
  isProfessional?: boolean;
  defaultPriceLevelId?: number | null;
  creditLimitCents?: number | null;
  paymentTerms?: string;
  paymentTermDays?: number | null;
  riskClass?: string;
  assignedStaffId?: number | null;
  representative?: string;
  externalRef?: string;
  notes?: string;
  force?: boolean;
}): Promise<CustomerItem> {
  await assertAuthenticated();
  const d = requireDb();

  // T2.3 — normalisation (anti `Mohamed` x3) : trim + espaces simples.
  const cleanName = data.name.trim().replace(/\s+/g, " ");
  if (!cleanName) throw new Error("Le nom du client ou de la société est obligatoire");

  const isProfessional = data.isProfessional ?? false;
  const iceValue = data.ice?.trim().replace(/\s+/g, "") || null;
  if (isProfessional && !iceValue) {
    throw new Error("ICE obligatoire pour un client professionnel (B2B).");
  }
  // ICE marocain = 15 chiffres, exigé strictement pour un Pro (FACTURE).
  // Hors Pro, on accepte la valeur telle quelle (compatibilité fiches legacy
  // importées, ex. ICE à 14 chiffres) au lieu de bloquer toute modification.
  if (isProfessional && iceValue && !/^\d{15}$/.test(iceValue)) {
    throw new Error("ICE invalide : 15 chiffres requis (registre marocain).");
  }

  if (!data.force) {
    const dups = await findCustomerDuplicates(
      { name: cleanName, phone: data.phone?.trim(), ice: iceValue ?? undefined },
      data.id
    );
    if (dups.length > 0) {
      throw new Error(
        `Doublon potentiel : client existant « ${dups[0].name} » (#${dups[0].id}). Confirmez pour créer malgré tout.`
      );
    }
  }

  const cleanPhone = data.phone?.trim() || null;
  const cleanCity = data.city?.trim() || "Casablanca";
  const values = {
    name: cleanName,
    phone: cleanPhone,
    email: data.email?.trim() || null,
    city: cleanCity,
    address: data.address?.trim() || null,
    ice: iceValue,
    identityNumber: data.identityNumber?.trim() || null,
    isWholesale: data.isWholesale ?? false,
    isProfessional,
    defaultPriceLevelId: data.defaultPriceLevelId ?? null,
    creditLimitCents: data.creditLimitCents ?? null,
    paymentTerms: data.paymentTerms?.trim() || null,
    paymentTermDays:
      data.paymentTermDays != null && Number.isInteger(data.paymentTermDays) && data.paymentTermDays >= 0
        ? data.paymentTermDays
        : null,
    riskClass: ["NORMAL", "ROI", "DOUTEUX", "LITIGIEUX", "ARNAQUEUR"].includes(data.riskClass ?? "")
      ? data.riskClass
      : "NORMAL",
    assignedStaffId: data.assignedStaffId ?? null,
    representative: data.representative?.trim() || null,
    externalRef: data.externalRef?.trim() || null,
    notes: data.notes?.trim() || null,
  };

  const saved = data.id
    ? (
        await d.update(customers).set(values).where(eq(customers.id, data.id)).returning()
      )[0]
    : (await d.insert(customers).values(values).returning())[0];

  if (!saved) throw new Error("Client introuvable");
  // T3.1 — traçabilité des créations (dont POS à la volée).
  if (!data.id) {
    try {
      await d.insert(auditLogs).values({
        action: "CREATION_CLIENT",
        entityType: "CUSTOMER",
        actorName: await currentActor(),
        entityId: saved.id,
        details: `Création fiche « ${saved.name} »${saved.phone ? ` (${saved.phone})` : ""}${isProfessional ? " [PRO]" : ""}`,
      });
    } catch {
      // audit non bloquant
    }
  }
  return mapCustomer(saved);
}

/**
 * Fusionne deux clients : ré-affecte documents + règlements à la cible puis
 * archive (soft-delete) la source.
 */
async function mergeCustomersImpl(sourceId: number, targetId: number): Promise<CustomerItem> {
  await assertAuthenticated();
  const d = requireDb();
  if (sourceId === targetId) throw new Error("La source et la cible sont identiques");

  const rows = await d.select().from(customers).where(inArray(customers.id, [sourceId, targetId]));
  const source = rows.find((r) => r.id === sourceId);
  const target = rows.find((r) => r.id === targetId);
  if (!source || !target) throw new Error("Client source ou cible introuvable");

  await d.transaction(async (tx) => {
    await tx.update(salesDocuments).set({ customerId: targetId }).where(eq(salesDocuments.customerId, sourceId));
    await tx.update(customerPayments).set({ customerId: targetId }).where(eq(customerPayments.customerId, sourceId));
    await tx.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, sourceId));
    await tx.insert(auditLogs).values({
      action: "FUSION_CLIENT",
      entityType: "CUSTOMER",
      actorName: await currentActor(),
      entityId: targetId,
      details: `Fusion #${sourceId} « ${source.name} » → #${targetId} « ${target.name} »`,
    });
  });

  return mapCustomer(target);
}

export interface AgingBuckets {
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b90_plus: number;
  total: number;
}

export interface PartyAgingRow {
  id: number;
  name: string;
  buckets: AgingBuckets;
  documentsCount: number;
  oldest: string | null;
}

function emptyAging(): AgingBuckets {
  return { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0 };
}

function agingKey(days: number): keyof AgingBuckets {
  if (days <= 30) return "b0_30";
  if (days <= 60) return "b31_60";
  if (days <= 90) return "b61_90";
  return "b90_plus";
}

/**
 * Balance âgée des créances clients (par ancienneté du document impayé).
 */
export async function getCustomerAging(): Promise<{ rows: PartyAgingRow[]; totals: AgingBuckets }> {
  await assertAuthenticated();
  const d = requireDb();

  const docs = await d
    .select()
    .from(salesDocuments)
    .where(
      and(
        isNull(salesDocuments.deletedAt),
        ne(salesDocuments.status, "ANNULE"),
        ne(salesDocuments.status, "PAYE")
      )
    );
  const custs = await d.select({ id: customers.id, name: customers.name }).from(customers);
  const nameById = new Map(custs.map((c) => [c.id, c.name]));
  const now = Date.now();

  const map = new Map<number, { name: string; buckets: AgingBuckets; count: number; oldest: Date | null }>();
  const convertedAging = await convertedBlIds();
  for (const doc of docs) {
    if (!doc.customerId) continue;
    if (receivableSign(doc.docType, doc.id, convertedAging) !== 1) continue;
    const remaining = Math.max(0, doc.totalTtcCents - doc.paidAmountCents);
    if (remaining <= 0) continue;
    const date = new Date(doc.docDate ?? doc.createdAt ?? new Date());
    const days = Math.floor((now - date.getTime()) / 86400000);
    const e =
      map.get(doc.customerId) ??
      { name: nameById.get(doc.customerId) ?? doc.customerName, buckets: emptyAging(), count: 0, oldest: null };
    e.buckets[agingKey(days)] += remaining;
    e.buckets.total += remaining;
    e.count += 1;
    if (!e.oldest || date < e.oldest) e.oldest = date;
    map.set(doc.customerId, e);
  }

  const rows = Array.from(map.entries())
    .map(([id, e]) => ({
      id,
      name: e.name,
      buckets: e.buckets,
      documentsCount: e.count,
      oldest: e.oldest ? e.oldest.toISOString() : null,
    }))
    .sort((a, b) => b.buckets.total - a.buckets.total);

  const totals = rows.reduce((acc, r) => {
    acc.b0_30 += r.buckets.b0_30;
    acc.b31_60 += r.buckets.b31_60;
    acc.b61_90 += r.buckets.b61_90;
    acc.b90_plus += r.buckets.b90_plus;
    acc.total += r.buckets.total;
    return acc;
  }, emptyAging());

  return { rows, totals };
}

/**
 * Import CSV de clients en masse (G9) : dédoublonnage par nom normalisé +
 * findCustomerDuplicates (nom/tél/ICE). Les doublons sont ignorés, pas bloquants.
 */
export async function importCustomersBatch(
  items: Array<{
    name: string;
    phone?: string;
    email?: string;
    city?: string;
    address?: string;
    ice?: string;
    creditLimitDh?: number;
  }>
): Promise<ActionResult<{ created: number; skipped: number; errors: string[] }>> {
  return actionResult(async () => {
    await assertAuthenticated();
    const d = requireDb();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of items) {
      const cleanName = item.name.trim().replace(/\s+/g, " ");
      if (!cleanName) { skipped++; continue; }
      const iceValue = item.ice?.trim().replace(/\s+/g, "") || null;
      try {
        const dups = await findCustomerDuplicates(
          { name: cleanName, phone: item.phone?.trim(), ice: iceValue ?? undefined },
          undefined
        );
        if (dups.length > 0) { skipped++; continue; }

        const isPro = !!iceValue && /^\d{15}$/.test(iceValue);
        await d.insert(customers).values({
          name: cleanName,
          phone: item.phone?.trim() || null,
          email: item.email?.trim() || null,
          city: item.city?.trim() || null,
          address: item.address?.trim() || null,
          ice: isPro ? iceValue : null,
          identityNumber: null,
          isWholesale: false,
          isProfessional: isPro,
          creditLimitCents: item.creditLimitDh != null ? Math.round(item.creditLimitDh * 100) : null,
        });
        created++;
      } catch (e) {
        errors.push(`${cleanName}: ${(e as Error).message}`);
      }
    }

    try {
      await d.insert(auditLogs).values({
        action: "IMPORT_CLIENTS",
        entityType: "CUSTOMER",
        actorName: await currentActor(),
        details: `Import clients — ${created} créés, ${skipped} ignorés (doublons), ${errors.length} erreurs.`,
      });
    } catch { /* journal non bloquant */ }

    return { created, skipped, errors };
  });
}
