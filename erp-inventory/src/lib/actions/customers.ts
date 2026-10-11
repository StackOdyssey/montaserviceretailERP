"use server";

import { and, asc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { customerPayments, customers, db, salesDocuments } from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";
import { assertPeriodOpen } from "@/lib/accounting-period";
import { getSalesDocuments, type SalesDocumentItem } from "./sales";

export interface CustomerItem {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  city: string;
  address: string | null;
  ice: string | null;
  isWholesale: boolean;
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
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT";
  paymentDate: string;
  referenceNumber: string | null;
  chequeDueDate: string | null;
  bankName: string | null;
  status: "ENCAISSE" | "EN_ATTENTE" | "REJETE";
  notes: string | null;
  createdAt: string;
}

export interface CustomerAccountStatement {
  customer: CustomerItem;
  totalBilledTtcCents: number;
  totalPaidCents: number;
  balanceDueCents: number;
  unpaidDocumentsCount: number;
  documents: Array<SalesDocumentItem & { remainingDueCents: number }>;
  payments: CustomerPaymentItem[];
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
  status: "ENCAISSE" | "EN_ATTENTE" | "REJETE";
  urgency: "RETARD" | "AUJOURDHUI" | "PROCHE" | "FUTUR";
  daysRemaining: number;
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
    isWholesale: r.isWholesale ?? false,
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
    status: p.status as CustomerPaymentItem["status"],
    notes: p.notes,
    createdAt: (p.createdAt ?? new Date()).toISOString(),
  };
}

/**
 * Clients avec solde calculé depuis la base (documents + règlements).
 */
export async function getCustomers(searchQuery?: string) {
  await assertAuthenticated();
  const d = requireDb();

  const search = searchQuery?.trim().toLowerCase() || "";
  const conds = search
    ? [
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.phone, `%${search}%`),
          ilike(customers.city, `%${search}%`),
          ilike(customers.ice, `%${search}%`)
        )!,
      ]
    : [];

  const rows = await d
    .select()
    .from(customers)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(customers.name))
    .limit(500);

  const billedRows = await d
    .select({
      customerId: salesDocuments.customerId,
      billed: sql<string>`coalesce(sum(${salesDocuments.totalTtcCents}),0)::bigint`,
      unpaid: sql<number>`count(*) filter (where ${salesDocuments.status} <> 'PAYE')::int`,
    })
    .from(salesDocuments)
    .where(and(isNull(salesDocuments.deletedAt), ne(salesDocuments.status, "ANNULE")))
    .groupBy(salesDocuments.customerId);

  const paidRows = await d
    .select({
      customerId: customerPayments.customerId,
      paid: sql<string>`coalesce(sum(${customerPayments.amountCents}),0)::bigint`,
    })
    .from(customerPayments)
    .where(ne(customerPayments.status, "REJETE"))
    .groupBy(customerPayments.customerId);

  const billedMap = new Map(billedRows.map((r) => [r.customerId, { billed: Number(r.billed), unpaid: r.unpaid }]));
  const paidMap = new Map(paidRows.map((r) => [r.customerId, Number(r.paid)]));

  return rows.map((r) => {
    const c = mapCustomer(r);
    const totalBilledTtcCents = billedMap.get(r.id)?.billed ?? 0;
    const unpaidDocumentsCount = billedMap.get(r.id)?.unpaid ?? 0;
    const totalPaidCents = paidMap.get(r.id) ?? 0;
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

  const row = (await d.select().from(customers).where(eq(customers.id, customerId)).limit(1))[0];
  if (!row) return null;
  const customer = mapCustomer(row);

  const allDocs = await getSalesDocuments();
  const documents = allDocs
    .filter((doc) => doc.customerId === customerId && doc.status !== "ANNULE")
    .map((doc) => ({ ...doc, remainingDueCents: Math.max(0, doc.totalTtcCents - doc.paidAmountCents) }));

  const paymentRows = await d
    .select()
    .from(customerPayments)
    .where(eq(customerPayments.customerId, customerId))
    .orderBy(sql`${customerPayments.paymentDate} desc`);

  const docNumbers = new Map(allDocs.map((doc) => [doc.id, doc.docNumber]));
  const payments = paymentRows.map((p) => mapPayment(p, customer.name, p.documentId ? docNumbers.get(p.documentId) ?? null : null));

  const totalBilledTtcCents = documents.reduce((s, doc) => s + doc.totalTtcCents, 0);
  const totalPaidCents = payments.filter((p) => p.status !== "REJETE").reduce((s, p) => s + p.amountCents, 0);
  const unpaidDocumentsCount = documents.filter((doc) => doc.status !== "PAYE").length;

  return {
    customer,
    totalBilledTtcCents,
    totalPaidCents,
    balanceDueCents: totalBilledTtcCents - totalPaidCents,
    unpaidDocumentsCount,
    documents,
    payments,
  };
}

/**
 * Enregistre un règlement client (transaction) et lettre (ciblé ou FIFO) les documents.
 */
export async function recordCustomerPayment(data: {
  customerId: number;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT";
  documentId?: number | null;
  referenceNumber?: string;
  chequeDueDate?: string;
  bankName?: string;
  notes?: string;
}): Promise<CustomerPaymentItem> {
  await assertAuthenticated();
  const d = requireDb();
  await assertPeriodOpen();

  if (data.amountCents <= 0) throw new Error("Le montant du règlement doit être supérieur à 0");

  const customer = (await d.select().from(customers).where(eq(customers.id, data.customerId)).limit(1))[0];
  if (!customer) throw new Error("Client introuvable");

  const initialStatus: CustomerPaymentItem["status"] =
    data.paymentMethod === "ESPECES" || data.paymentMethod === "VIREMENT" ? "ENCAISSE" : "EN_ATTENTE";

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

    let remaining = data.amountCents;
    for (const doc of targetDocs) {
      if (remaining <= 0) break;
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
  return mapPayment(row, customer.name, docNumber);
}

/**
 * Met à jour le statut d'un chèque ou effet LCN.
 */
export async function updatePaymentStatus(
  paymentId: number,
  newStatus: "ENCAISSE" | "EN_ATTENTE" | "REJETE"
): Promise<CustomerPaymentItem> {
  await assertAuthenticated();
  const d = requireDb();

  const updated = (
    await d
      .update(customerPayments)
      .set({ status: newStatus })
      .where(eq(customerPayments.id, paymentId))
      .returning()
  )[0];
  if (!updated) throw new Error("Règlement introuvable");

  const customer = (await d.select().from(customers).where(eq(customers.id, updated.customerId)).limit(1))[0];
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
      };
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

/**
 * Crée ou modifie un client.
 */
export async function saveCustomer(data: {
  id?: number;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  ice?: string;
  isWholesale?: boolean;
  notes?: string;
}): Promise<CustomerItem> {
  await assertAuthenticated();
  const d = requireDb();

  if (!data.name.trim()) throw new Error("Le nom du client ou de la société est obligatoire");

  const values = {
    name: data.name.trim(),
    phone: data.phone || null,
    email: data.email || null,
    city: data.city || "Casablanca",
    address: data.address || null,
    ice: data.ice || null,
    isWholesale: data.isWholesale ?? false,
    notes: data.notes || null,
    updatedAt: new Date(),
  };

  const saved = data.id
    ? (
        await d.update(customers).set(values).where(eq(customers.id, data.id)).returning()
      )[0]
    : (await d.insert(customers).values(values).returning())[0];

  if (!saved) throw new Error("Client introuvable");
  return mapCustomer(saved);
}
