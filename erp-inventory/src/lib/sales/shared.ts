// Interne partagé entre les modules d'actions vente (sales, sales-documents,
// sales-stock). PAS de "use server" : ce fichier ne doit jamais être importé
// directement par un composant client — passer par les actions.

import { eq } from "drizzle-orm";
import { db, salesDocuments, salesLines } from "@/db";

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
  docType: "BL" | "FACTURE" | "AVOIR" | "BC" | "DEVIS";
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
  avType?: string | null;
  businessLineId?: number;
  lines: Array<{
    id: number;
    productId: number | null;
    productName: string;
    sku: string;
    oemCode?: string | null;
    unitPriceHTCents: number;
    quantity: number;
    totalHtCents: number;
    unitCostCents?: number;
    tvaRate?: number;
  }>;
}

export interface CompanyPrintInfo {
  raisonSociale: string;
  tradeName: string | null;
  legalForm: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  ice: string;
  identifiantFiscal: string | null;
  registreCommerce: string | null;
  taxeProfessionnelle: string | null;
  capitalCents: number;
  footerText: string | null;
  logoUrl: string | null;
}

export interface DocumentPrintContext {
  document: SalesDocumentItem;
  businessLineCode: string;
  vatDisplay: { showVat: boolean; priceBasis: "TTC" | "HT"; showDiscount: boolean };
  company: CompanyPrintInfo | null;
  docLabel: string;
}

export const DOC_LABELS: Record<string, string> = {
  BL: "BON DE LIVRAISON",
  FACTURE: "FACTURE",
  AVOIR: "AVOIR",
  BC: "BON DE COMMANDE",
  DEVIS: "DEVIS",
};

export function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

type DocRow = typeof salesDocuments.$inferSelect;
type LineRow = typeof salesLines.$inferSelect;

export function mapDoc(doc: DocRow, lines: LineRow[]): SalesDocumentItem {
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
    avType: doc.avType,
    businessLineId: doc.businessLineId,
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.productNameSnapshot,
      sku: l.skuSnapshot,
      oemCode: l.oemCodeSnapshot,
      unitPriceHTCents: l.unitPriceHtCents,
      quantity: l.quantity,
      totalHtCents: l.totalHtCents,
      unitCostCents: l.unitCostCents,
      tvaRate: l.tvaRate,
    })),
  };
}

/** Charge un document + ses lignes (interne). */
export async function loadDocumentById(id: number): Promise<SalesDocumentItem | null> {
  const d = requireDb();
  const doc = (await d.select().from(salesDocuments).where(eq(salesDocuments.id, id)).limit(1))[0];
  if (!doc) return null;
  const lines = await d.select().from(salesLines).where(eq(salesLines.documentId, id));
  return mapDoc(doc, lines);
}
