import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// ==========================================
// 1. PARAMÈTRES GÉNÉRAUX DE L'ENTREPRISE
// ==========================================
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("SARL BM Motors"),
  ice: text("ice").notNull().default(""), // Identifiant Commun de l'Entreprise (Maroc)
  identifiantFiscal: text("identifiant_fiscal").default(""), // IF
  registreCommerce: text("registre_commerce").default(""), // RC
  taxeProfessionnelle: text("taxe_professionnelle").default(""), // TP / Patente
  address: text("address").default(""),
  city: text("city").default("Casablanca"),
  phone: text("phone").default(""),
  email: text("email").default(""),
  defaultTvaRate: integer("default_tva_rate").notNull().default(10), // 10% TVA SARL
  currency: text("currency").notNull().default("MAD"),
  blPrefix: text("bl_prefix").notNull().default("BL-"),
  facturePrefix: text("facture_prefix").notNull().default("FAC-"),
  avoirPrefix: text("avoir_prefix").notNull().default("AV-"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==========================================
// 2. CATÉGORIES DE PIÈCES DÉTACHÉES MOTO
// ==========================================
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Moteur, Freinage, Transmission, Électricité, etc.
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 3. CATALOGUE DES PIÈCES & ARTICLES
// ==========================================
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(), // Référence interne
  oemCode: text("oem_code"), // Code constructeur OEM
  name: text("name").notNull(), // Désignation de la pièce
  brand: text("brand").default("Bashan"), // Bashan, Yamaha, Honda, MBK, Docker, etc.
  categoryId: integer("category_id").references(() => categories.id),
  purchasePriceCents: integer("purchase_price_cents").notNull().default(0), // Prix d'achat unitaire HT en centimes
  salePriceRetailCents: integer("sale_price_retail_cents").notNull().default(0), // Prix de vente détail TTC en centimes
  salePriceWholesaleCents: integer("sale_price_wholesale_cents").default(0), // Prix de vente gros TTC en centimes
  tvaRate: integer("tva_rate").notNull().default(10), // 10%
  minStockAlert: integer("min_stock_alert").notNull().default(2), // Seuil d'alerte stock faible
  currentStock: integer("current_stock").notNull().default(0), // Stock en temps réel (tolère les négatifs)
  shelfLocation: text("shelf_location"), // Rayon / Emplacement en boutique
  barcode: text("barcode"),
  photoUrl: text("photo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==========================================
// 4. RÉFÉRENCES ÉQUIVALENTES ET CODES OEM
// ==========================================
export const productReferences = pgTable("product_references", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  referenceCode: text("reference_code").notNull(),
  referenceType: text("reference_type").default("OEM"), // OEM, Adaptable, Fabricant
});

// ==========================================
// 5. GRAND LIVRE DES MOUVEMENTS DE STOCK
// ==========================================
export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  movementType: text("movement_type").notNull(), // ACHAT_RECEPTION, VENTE_BL, AVOIR_RETOUR, AJUSTEMENT_INVENTAIRE, STOCK_INITIAL
  quantity: integer("quantity").notNull(), // Signé : positif pour entrées, négatif pour sorties
  unitCostCents: integer("unit_cost_cents"), // Coût unitaire d'achat
  sourceDocumentId: integer("source_document_id"),
  sourceDocumentType: text("source_document_type"), // BL, FACTURE, AVOIR, RECEPTION
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 6. CLIENTS
// ==========================================
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"), // WhatsApp
  email: text("email"), // Resend
  city: text("city").default("Casablanca"),
  address: text("address"),
  ice: text("ice"),
  isWholesale: boolean("is_wholesale").default(false), // Grossiste ou détail
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 7. FOURNISSEURS
// ==========================================
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"), // Resend
  city: text("city"),
  ice: text("ice"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 8. DOCUMENTS COMMERCIAUX (BL, FACTURE, AVOIR)
// ==========================================
export const salesDocuments = pgTable("sales_documents", {
  id: serial("id").primaryKey(),
  docType: text("doc_type").notNull().default("BL"), // BL, FACTURE, AVOIR
  docNumber: text("doc_number").notNull().unique(), // ex: "BL-2026-0001"
  customerId: integer("customer_id").references(() => customers.id),
  docDate: timestamp("doc_date").defaultNow(),
  status: text("status").notNull().default("BROUILLON"), // BROUILLON, VALIDE, ANNULE, PAYE
  totalBrutHtCents: integer("total_brut_ht_cents").notNull().default(0),
  discountPercent: integer("discount_percent").notNull().default(0), // Remise personnalisée en %
  discountAmountCents: integer("discount_amount_cents").notNull().default(0), // Montant remise
  totalNetHtCents: integer("total_net_ht_cents").notNull().default(0), // Brut HT - Remise
  tvaRate: integer("tva_rate").notNull().default(10), // 10% SARL
  tvaAmountCents: integer("tva_amount_cents").notNull().default(0),
  totalTtcCents: integer("total_ttc_cents").notNull().default(0), // Net HT + TVA
  paidAmountCents: integer("paid_amount_cents").notNull().default(0),
  notes: text("notes"),
  sourceBlId: integer("source_bl_id"), // Lien si facture ou avoir issu d'un BL
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==========================================
// 9. LIGNES DU DOCUMENT COMMERCIAL
// ==========================================
export const salesLines = pgTable("sales_lines", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => salesDocuments.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  skuSnapshot: text("sku_snapshot").notNull(),
  oemCodeSnapshot: text("oem_code_snapshot"),
  unitPriceHtCents: integer("unit_price_ht_cents").notNull(),
  quantity: integer("quantity").notNull(),
  totalHtCents: integer("total_ht_cents").notNull(),
  tvaRate: integer("tva_rate").notNull().default(10),
});

// ==========================================
// ==========================================
// 10. RÈGLEMENTS CLIENTS & ENCAISSEMENTS
// ==========================================
export const customerPayments = pgTable("customer_payments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  documentId: integer("document_id").references(() => salesDocuments.id),
  amountCents: integer("amount_cents").notNull(),
  paymentMethod: text("payment_method").notNull().default("ESPECES"), // ESPECES, CHEQUE, EFFET_LCN, VIREMENT
  paymentDate: timestamp("payment_date").defaultNow(),
  referenceNumber: text("reference_number"), // N° chèque / effet / virement
  chequeDueDate: timestamp("cheque_due_date"), // Date d'échéance chèque ou effet LCN
  bankName: text("bank_name"),
  status: text("status").notNull().default("ENCAISSE"), // ENCAISSE, EN_ATTENTE, REJETE
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 11. BONS DE RÉCEPTION FOURNISSEURS (BR)
// ==========================================
export const supplierReceipts = pgTable("supplier_receipts", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  receiptNumber: text("receipt_number").notNull().unique(), // ex: "BR-2026-0042"
  supplierInvoiceNumber: text("supplier_invoice_number"), // N° facture/BL du fournisseur
  receiptDate: timestamp("receipt_date").defaultNow(),
  status: text("status").notNull().default("RECU"), // RECU, EN_ATTENTE, ANNULE
  totalHtCents: integer("total_ht_cents").notNull().default(0),
  tvaRate: integer("tva_rate").notNull().default(10),
  tvaAmountCents: integer("tva_amount_cents").notNull().default(0),
  totalTtcCents: integer("total_ttc_cents").notNull().default(0),
  paidAmountCents: integer("paid_amount_cents").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const supplierReceiptLines = pgTable("supplier_receipt_lines", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id")
    .notNull()
    .references(() => supplierReceipts.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id),
  productName: text("product_name").notNull(),
  sku: text("sku").notNull(),
  quantity: integer("quantity").notNull(),
  unitCostCents: integer("unit_cost_cents").notNull(),
  totalCostCents: integer("total_cost_cents").notNull(),
});

// ==========================================
// 12. RÈGLEMENTS FOURNISSEURS (DÉCAISSEMENTS)
// ==========================================
export const supplierPayments = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  receiptId: integer("receipt_id").references(() => supplierReceipts.id),
  amountCents: integer("amount_cents").notNull(),
  paymentMethod: text("payment_method").notNull().default("CHEQUE"), // ESPECES, CHEQUE, EFFET_LCN, VIREMENT
  paymentDate: timestamp("payment_date").defaultNow(),
  referenceNumber: text("reference_number"), // N° chèque / effet / virement
  dueDate: timestamp("due_date"), // Date d'échéance si chèque ou effet
  bankName: text("bank_name"),
  status: text("status").notNull().default("EN_ATTENTE"), // EN_ATTENTE, DEBITE, REJETE
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 13. DÉPENSES QUOTIDIENNES DE CAISSE
// ==========================================
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(), // ex: "Loyer magasin", "Électricité", "Transport pièces"
  category: text("category").notNull().default("AUTRE"), // LOYER, ELECTRICITE_EAU, TRANSPORT, REPAS_EQUIPE, FOURNITURES, AUTRE
  amountCents: integer("amount_cents").notNull(),
  expenseDate: timestamp("expense_date").defaultNow(),
  receiptPhotoUrl: text("receipt_photo_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 14. JOURNAL D'AUDIT
// ==========================================
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // CREATION_BL, VALIDATION_BL, ENCAISSEMENT, REGLEMENT_FOURNISSEUR, DEPENSE_CAISSE, etc.
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 15. COURRIELS & ÉCHANGES FOURNISSEURS
// ==========================================
export const supplierEmails = pgTable("supplier_emails", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  direction: text("direction").notNull().default("SORTANT"), // SORTANT, ENTRANT
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  status: text("status").notNull().default("ENVOYE"), // ENVOYE, RECU, ECHEC, BROUILLON
  isRead: boolean("is_read").notNull().default(false),
  hasAttachments: boolean("has_attachments").notNull().default(false),
  attachmentsJson: text("attachments_json").default("[]"), // Sérialisé JSON
  messageId: text("message_id"),
  threadId: text("thread_id"),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

