// Interne partagé entre les modules d'actions vente (sales, sales-documents,
// sales-stock). PAS de "use server" : ce fichier ne doit jamais être importé
// directement par un composant client — passer par les actions.

import { eq } from "drizzle-orm";
import { db, salesDocuments, salesLines, salesTenders } from "@/db";

export interface SalesLineInput {
  productId: number;
  productName: string;
  sku: string;
  oemCode?: string | null;
  /** Prix HT — champ canonique. Le comptoir peut aussi envoyer le TTC saisi
   * (snapshot ticket + contrôle de cohérence HT↔TTC côté serveur, tol. 2 c). */
  unitPriceHTCents: number;
  unitPriceTtcCents?: number;
  quantity: number;
  /** Renommage de ligne pour le ticket (legacy POS rename). */
  customLabel?: string;
  /** OFFERT — prix à 0, motif exigé par le garde hors-catalogue. */
  isFree?: boolean;
  /** R.For — prix forcé par le caissier (marqueur audit). */
  priceForced?: boolean;
  /** Remise par ligne en % (plafond appliqué côté serveur). */
  discountPercent?: number;
}

/** Jambe de règlement POS — le crédit n'est pas une jambe, c'est le reliquat non réglé. */
export interface TenderInput {
  method: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "CARTE_BANCAIRE" | "VERSEMENT" | "BON_REDUCTION" | "AVOIR";
  /** Part de la vente couverte par cette jambe (TTC, centimes). */
  amountCents: number;
  /** ESPECES : montant remis par le client → rendu = reçu − part. */
  cashReceivedCents?: number;
  referenceNumber?: string;
  bankName?: string;
  payeeName?: string;
  issueDate?: string;
  dueDate?: string;
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
  paymentCondition?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  avType?: string | null;
  businessLineId?: number;
  commercialName?: string | null;
  livreurName?: string | null;
  prepStatus?: string | null;
  preparedAt?: string | null;
  deliveredAt?: string | null;
  lines: Array<{
    id: number;
    productId: number | null;
    productName: string;
    sku: string;
    oemCode?: string | null;
    unitPriceHTCents: number;
    unitPriceTtcCents?: number | null;
    quantity: number;
    totalHtCents: number;
    unitCostCents?: number;
    tvaRate?: number;
    customLabel?: string | null;
    isFree?: boolean;
    priceForced?: boolean;
    discountPercent?: number;
    discountAmountCents?: number;
  }>;
  tenders?: Array<{
    id: number;
    method: string;
    amountCents: number;
    cashReceivedCents?: number | null;
    referenceNumber?: string | null;
    bankName?: string | null;
    payeeName?: string | null;
    issueDate?: string | null;
    dueDate?: string | null;
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
  cnss: string | null;
  rcTribunal: string | null;
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

// La logique de résultat d'action vit dans @/lib/action-result (partagée).
export { BusinessError, businessMessage } from "@/lib/action-result";

/**
 * En production, Next masque les erreurs levées par les Server Actions
 * ("Minified React error #441") — les règles de gestion doivent donc être
 * RETOURNÉES, pas jetées, pour être visibles côté UI.
 */
export type SalesDocResult =
  | { ok: true; document: SalesDocumentItem }
  | { ok: false; error: string };

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
type TenderRow = typeof salesTenders.$inferSelect;

export function mapDoc(doc: DocRow, lines: LineRow[], tenderRows: TenderRow[] = []): SalesDocumentItem {
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
    paymentCondition: doc.paymentCondition,
    dueDate: doc.dueDate ? doc.dueDate.toISOString() : null,
    notes: doc.notes,
    avType: doc.avType,
    businessLineId: doc.businessLineId,
    commercialName: doc.commercialName,
    livreurName: doc.livreurName,
    prepStatus: doc.prepStatus,
    preparedAt: doc.preparedAt ? doc.preparedAt.toISOString() : null,
    deliveredAt: doc.deliveredAt ? doc.deliveredAt.toISOString() : null,
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.productNameSnapshot,
      sku: l.skuSnapshot,
      oemCode: l.oemCodeSnapshot,
      unitPriceHTCents: l.unitPriceHtCents,
      unitPriceTtcCents: l.unitPriceTtcCents,
      quantity: l.quantity,
      totalHtCents: l.totalHtCents,
      unitCostCents: l.unitCostCents,
      tvaRate: l.tvaRate,
      customLabel: l.customLabel,
      isFree: l.isFree,
      priceForced: l.priceForced,
      discountPercent: l.discountPercent,
      discountAmountCents: l.discountAmountCents,
    })),
    tenders: tenderRows.map((t) => ({
      id: t.id,
      method: t.method,
      amountCents: t.amountCents,
      cashReceivedCents: t.cashReceivedCents,
      referenceNumber: t.referenceNumber,
      bankName: t.bankName,
      payeeName: t.payeeName,
      issueDate: t.issueDate ? t.issueDate.toISOString() : null,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    })),
  };
}

/** Charge un document + ses lignes + ses jambes de règlement (interne). */
export async function loadDocumentById(id: number): Promise<SalesDocumentItem | null> {
  const d = requireDb();
  const doc = (await d.select().from(salesDocuments).where(eq(salesDocuments.id, id)).limit(1))[0];
  if (!doc) return null;
  const [lines, tenderRows] = await Promise.all([
    d.select().from(salesLines).where(eq(salesLines.documentId, id)),
    d.select().from(salesTenders).where(eq(salesTenders.documentId, id)),
  ]);
  return mapDoc(doc, lines, tenderRows);
}
