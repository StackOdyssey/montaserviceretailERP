// Validation des entrées des Server Actions (hors "use server" pour export libre).
// Les actions sont des endpoints POST publics : le type TS ne borne que l'appelant
// interne, pas le wire. Toute mutation doit valider son payload avant d'agir.
import { z } from "zod";

/** Valide un payload d'action ; lève une erreur métier lisible en cas d'entrée forgée. */
export function validateInput<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new Error(`ENTREE_INVALIDE: ${issue.path.join(".")} — ${issue.message}`);
  }
  return r.data;
}

// ---- Atomes réutilisables ----
const id = z.number().int().positive();
const cents = z.number().int().min(0).max(9_999_999_99); // ≤ 99 999 999,99 DH
const positiveCents = z.number().int().positive().max(9_999_999_99);
const qty = z.number().int().positive().max(1_000_000);
const pct = z.number().min(0).max(100);
const name = z.string().trim().min(1).max(200);
const optStr = (max = 200) => z.string().trim().max(max).optional();
const paymentMethod = z.enum(["ESPECES", "CHEQUE", "EFFET_LCN", "VIREMENT", "A_CREDIT"]);
const moneyMethod = z.enum(["ESPECES", "CHEQUE", "EFFET_LCN", "VIREMENT"]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format AAAA-MM-JJ attendu").optional();

// ---- Schémas par action ----

export const createSalesDocumentSchema = z.object({
  docType: z.enum(["BL", "FACTURE", "AVOIR", "BC", "DEVIS"]).optional(),
  customerId: id.nullish(),
  customerName: name,
  customerPhone: optStr(40),
  customerEmail: z.string().trim().email().max(200).optional(),
  customerCity: optStr(100),
  customerIce: optStr(30),
  lines: z
    .array(
      z.object({
        productId: id,
        productName: z.string().trim().min(1).max(300),
        sku: z.string().trim().min(1).max(100),
        oemCode: optStr(100).nullish(),
        unitPriceHTCents: positiveCents,
        quantity: qty,
      })
    )
    .min(1)
    .max(500),
  discountPercent: pct,
  paymentMethod,
  paidAmountCents: cents.optional(),
  notes: optStr(2000),
  businessLineCode: optStr(30),
  overrideReason: optStr(500),
  idempotencyKey: z.string().trim().min(8).max(64).optional(),
});

export const createSupplierReceiptSchema = z.object({
  supplierId: id,
  supplierInvoiceNumber: optStr(100),
  lines: z
    .array(
      z.object({
        productId: id,
        productName: z.string().trim().min(1).max(300),
        sku: z.string().trim().min(1).max(100),
        quantity: qty,
        unitCostCents: positiveCents,
      })
    )
    .min(1)
    .max(500),
  notes: optStr(2000),
});

export const recordStockMovementSchema = z.object({
  productId: id,
  movementType: z.enum(["ACHAT_RECEPTION", "VENTE_BL", "AVOIR_RETOUR", "AJUSTEMENT_INVENTAIRE"]),
  quantity: z.number().int().min(-1_000_000).max(1_000_000).refine((q) => q !== 0, "quantité nulle interdite"),
  reason: z.string().trim().min(1).max(500),
  unitCostCents: cents.optional(),
});

export const saveProductSchema = z.object({
  id: id.optional(),
  sku: z.string().trim().min(1).max(100),
  oemCode: optStr(100),
  name: z.string().trim().min(1).max(300),
  brand: optStr(100),
  categoryName: optStr(150),
  purchasePriceCents: cents,
  salePriceRetailCents: cents,
  salePriceWholesaleCents: cents.optional(),
  tvaRate: pct.optional(),
  minStockAlert: z.number().int().min(0).max(1_000_000),
  currentStock: z.number().int().min(-1_000_000).max(1_000_000),
  shelfLocation: optStr(100),
  barcode: optStr(100),
  photoUrl: z.string().trim().max(500).optional(),
  businessLineCode: optStr(30),
});

export const recordCustomerPaymentSchema = z.object({
  customerId: id,
  amountCents: positiveCents,
  paymentMethod: moneyMethod,
  documentId: id.nullish(),
  referenceNumber: optStr(100),
  chequeDueDate: dateStr,
  bankName: optStr(100),
  notes: optStr(2000),
});

export const recordSupplierPaymentSchema = z.object({
  supplierId: id,
  amountCents: positiveCents,
  paymentMethod: moneyMethod,
  receiptId: id.nullish(),
  referenceNumber: optStr(100),
  dueDate: dateStr,
  bankName: optStr(100),
  notes: optStr(2000),
});
