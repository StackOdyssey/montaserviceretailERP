import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  unique,
} from "drizzle-orm/pg-core";

// ==========================================
// 1. PARAMÈTRES GÉNÉRAUX DE L'ENTREPRISE
// ==========================================
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  // Identité société — saisie manuellement, aucune valeur codée en dur.
  raisonSociale: text("raison_sociale").notNull().default(""),
  tradeName: text("trade_name").default(""),
  legalForm: text("legal_form").notNull().default("SARL"), // SARL, SARL AU, SA, PERSONNE_PHYSIQUE, AUTO_ENTREPRENEUR, AUTRE
  address: text("address").default(""),
  city: text("city").default(""),
  phone: text("phone").default(""),
  email: text("email").default(""),
  ice: text("ice").notNull().default(""), // 15 chiffres
  identifiantFiscal: text("identifiant_fiscal").default(""), // IF
  registreCommerce: text("registre_commerce").default(""), // RC
  rcTribunal: text("rc_tribunal").default(""),
  taxeProfessionnelle: text("taxe_professionnelle").default(""), // TP / Patente
  capitalCents: integer("capital_cents").notNull().default(0),
  cnss: text("cnss").default(""),
  website: text("website").default(""),
  logoUrl: text("logo_url"),
  footerText: text("footer_text").default(""),
  mobileWhatsapp: text("mobile_whatsapp").default(""),
  // Coordonnées bancaires (figurant sur les documents)
  bankName: text("bank_name").default(""),
  bankAgency: text("bank_agency").default(""),
  bankRib: text("bank_rib").default(""),
  bank2Name: text("bank2_name").default(""),
  bank2Agency: text("bank2_agency").default(""),
  bank2Rib: text("bank2_rib").default(""),
  // Fiscalité & paramètres généraux
  defaultVatRateId: integer("default_vat_rate_id").references(() => vatRates.id),
  vatRegime: text("vat_regime").notNull().default("ENCAISSEMENTS"), // ENCAISSEMENTS | DEDITS
  // Interrupteur global de régime TVA : true = assujetti (comportement historique),
  // false = non-assujetti (ventes à taux 0, TVA ni calculée ni affichée). Les documents
  // existants gardent leur snapshot (tvaRate/vatDisplay) : effet immédiat, sans rétroactivité.
  vatLiable: boolean("vat_liable").notNull().default(true),
  currency: text("currency").notNull().default("MAD"),
  localeDefault: text("locale_default").notNull().default("fr"),
  localeSecondary: text("locale_secondary").notNull().default("en"),
  timezone: text("timezone").notNull().default("Africa/Casablanca"),
  negativeStockAllowed: boolean("negative_stock_allowed").notNull().default(false),
  defaultPaymentDueDays: integer("default_payment_due_days").notNull().default(30),
  displayDiscountUnderBrut: boolean("display_discount_under_brut").notNull().default(true),
  cashDailyThresholdCents: integer("cash_daily_threshold_cents").notNull().default(500000),
  cashMonthlyThresholdCents: integer("cash_monthly_threshold_cents").notNull().default(5000000),
  yearStartMonth: integer("year_start_month").notNull().default(1),
  numberWidth: integer("number_width").notNull().default(5),
  // Préfixes de numérotation
  devisPrefix: text("devis_prefix").notNull().default("DV-"),
  bcPrefix: text("bc_prefix").notNull().default("BC-"),
  blPrefix: text("bl_prefix").notNull().default("BL-"),
  facPrefix: text("fac_prefix").notNull().default("FAC-"),
  avPrefix: text("av_prefix").notNull().default("AV-"),
  brPrefix: text("br_prefix").notNull().default("BR-"),
  // Version des sessions : l'incrémenter révoque tous les cookies de session émis.
  sessionVersion: integer("session_version").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==========================================
// 1b. LIGNE MÉTIER (PIECES — pièces moto uniquement ; Side 2 véhicules annulé, voir Side2-Q16-Q19)
// ==========================================
export const businessLines = pgTable("business_lines", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // PIECES (ligne unique, Side 2 annulé)
  displayName: text("display_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  logoUrl: text("logo_url"),
  footerText: text("footer_text"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Visibilité TVA par ligne métier et type de document (l'affichage, pas le calcul).
export const businessLineDocumentSettings = pgTable(
  "business_line_document_settings",
  {
    id: serial("id").primaryKey(),
    businessLineId: integer("business_line_id")
      .notNull()
      .references(() => businessLines.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(), // DEVIS, BC, BL, FAC, AV
    showVat: boolean("show_vat").notNull().default(true),
    priceBasis: text("price_basis").notNull().default("TTC"), // TTC | HT (utilisé si show_vat = false)
    showDiscount: boolean("show_discount").notNull().default(true),
    templateCode: text("template_code"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("business_line_document_settings_unique").on(table.businessLineId, table.docType),
    // Note : l'ancienne contrainte FAC/AV toujours SHOWN a été retirée (migration) :
    // en régime non-assujetti, FAC/AV sont HIDDEN avec mention « TVA non applicable ».
    // La cohérence est enforced côté serveur dans createSalesDocument selon le régime.
  ]
);

// ==========================================
// 1c. PARAMÈTRES SYSTÈME (NUMÉROTATION, DÉPENSES, PAIEMENTS, HISTORIQUE)
// ==========================================
export const numberingSequences = pgTable(
  "numbering_sequences",
  {
    id: serial("id").primaryKey(),
    docType: text("doc_type").notNull(), // DEVIS, BC, BL, FAC, AV, BR
    year: integer("year").notNull(),
    scopeBusinessLineId: integer("scope_business_line_id").references(() => businessLines.id, {
      onDelete: "cascade",
    }), // NULL = série société (défaut)
    prefix: text("prefix").notNull(),
    width: integer("width").notNull().default(5),
    nextNumber: integer("next_number").notNull().default(1),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("numbering_sequences_scope_unique").on(
      table.docType,
      table.year,
      table.scopeBusinessLineId
    ),
  ]
);

export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  vatDeductibleDefault: boolean("vat_deductible_default").notNull().default(true),
  receiptRequired: boolean("receipt_required").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // ESPECES, CHEQUE, EFFET_LCN, VIREMENT
  label: text("label").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const settingsHistory = pgTable("settings_history", {
  id: serial("id").primaryKey(),
  actorUserId: integer("actor_user_id"),
  fieldName: text("field_name").notNull(),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  changedAt: timestamp("changed_at").defaultNow(),
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
// 3. PARAMÈTRES DU CATALOGUE (TVA, ENTREPÔTS, NIVEAUX DE PRIX)
// ==========================================
export const vatRates = pgTable("vat_rates", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(), // "TVA 20%", "TVA 10%", "Exonéré"
  ratePercent: integer("rate_percent").notNull(), // 20, 10, 0
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(), // "Entrepôt Principal"
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const priceLevels = pgTable(
  "price_levels",
  {
    id: serial("id").primaryKey(),
    businessLineId: integer("business_line_id")
      .notNull()
      .references(() => businessLines.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // GROS, SEMI_GROS, LISTE
    label: text("label").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [unique("price_levels_line_code_unique").on(table.businessLineId, table.code)]
);

// ==========================================
// 4. CATALOGUE DES PIÈCES & ARTICLES
// ==========================================
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(), // Ref (BestWay)
  barcode: text("barcode"), // Code Barre
  name: text("name").notNull(), // Designation
  brand: text("brand"), // Marque
  oemCode: text("oem_code"), // Code constructeur OEM
  nature: text("nature"), // Nature (NORMAL, ...)
  businessLineId: integer("business_line_id")
    .notNull()
    .references(() => businessLines.id), // PIECES (ligne unique)
  categoryId: integer("category_id").references(() => categories.id),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  vatRateId: integer("vat_rate_id").references(() => vatRates.id),
  tvaRate: integer("tva_rate").notNull().default(20), // Taux par défaut 20%
  costPriceHtCents: integer("cost_price_ht_cents").notNull().default(0), // C.R HT importé (coût de référence)
  lastPurchasePriceCents: integer("last_purchase_price_cents").notNull().default(0), // dernier prix d'achat (informatif)
  cmupCents: integer("cmup_cents").notNull().default(0), // coût moyen pondéré (CMUP)
  salePriceHtCents: integer("sale_price_ht_cents").notNull().default(0), // P.V HT (prix de vente)
  marginPercent: numeric("margin_percent", { precision: 8, scale: 2 }), // T.Marge % (valeur du fichier, non recalculée)
  stockValuePurchaseCents: integer("stock_value_purchase_cents").notNull().default(0), // Val_PA_HT (valeur du fichier)
  minStockAlert: integer("min_stock_alert").notNull().default(5),
  currentStock: integer("current_stock").notNull().default(0),
  shelfLocation: text("shelf_location"),
  photoUrl: text("photo_url"),
  unit: text("unit").default("PIECE"),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const productPrices = pgTable(
  "product_prices",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceLevelId: integer("price_level_id")
      .notNull()
      .references(() => priceLevels.id),
    priceHtCents: integer("price_ht_cents").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("product_prices_product_level_unique").on(table.productId, table.priceLevelId),
  ]
);

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
  businessLineId: integer("business_line_id")
    .notNull()
    .references(() => businessLines.id),
  movementType: text("movement_type").notNull(), // ACHAT_RECEPTION, VENTE_BL, AVOIR_RETOUR, AJUSTEMENT_INVENTAIRE, STOCK_INITIAL
  quantity: integer("quantity").notNull(), // Signé : positif pour entrées, négatif pour sorties
  unitCostCents: integer("unit_cost_cents"), // Coût unitaire d'achat
  sourceDocumentId: integer("source_document_id"),
  sourceDocumentType: text("source_document_type"), // BL, FACTURE, AVOIR, RECEPTION
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 5b. INVENTAIRE
// ==========================================
// Note G9 : la table `stock_units` (unités sérialisées Side 2, décision Side2-Q16-Q19)
// a été supprimée par la migration 0018. Tout code la référençant est du code mort.

export const stockCounts = pgTable("stock_counts", {
  id: serial("id").primaryKey(),
  businessLineId: integer("business_line_id")
    .notNull()
    .references(() => businessLines.id),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("DRAFT"), // DRAFT, VALIDATED, CANCELLED
  countedAt: timestamp("counted_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const stockCountLines = pgTable("stock_count_lines", {
  id: serial("id").primaryKey(),
  stockCountId: integer("stock_count_id")
    .notNull()
    .references(() => stockCounts.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  countedQty: integer("counted_qty").notNull(),
  expectedQty: integer("expected_qty").notNull(),
  varianceQty: integer("variance_qty").notNull(),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
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
  ice: text("ice"), // obligatoire uniquement si is_professional (B2B)
  identityNumber: text("identity_number"), // CIN / passeport — OPTIONNEL (particulier, Q14)
  isWholesale: boolean("is_wholesale").default(false), // Grossiste ou détail
  isProfessional: boolean("is_professional").default(false), // professionnel (ICE requis) vs particulier
  defaultPriceLevelId: integer("default_price_level_id").references(() => priceLevels.id),
  creditLimitCents: integer("credit_limit_cents"), // plafond de crédit (nullable = pas de limite)
  paymentTerms: text("payment_terms"), // conditions de règlement (ex: "30 jours")
  representative: text("representative"),
  externalRef: text("external_ref"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at"),
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
  isActive: boolean("is_active").default(true),
  externalRef: text("external_ref"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// 8. DOCUMENTS COMMERCIAUX (BL, FACTURE, AVOIR)
// ==========================================
export const salesDocuments = pgTable("sales_documents", {
  id: serial("id").primaryKey(),
  docType: text("doc_type").notNull().default("BL"), // BL, FACTURE, AVOIR
  docNumber: text("doc_number").notNull().unique(), // ex: "BL-2026-00001"
  businessLineId: integer("business_line_id")
    .notNull()
    .references(() => businessLines.id),
  docYear: integer("doc_year").notNull(),
  sequenceNo: integer("sequence_no").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  customerCity: text("customer_city"),
  customerIce: text("customer_ice"),
  docDate: timestamp("doc_date").defaultNow(),
  status: text("status").notNull().default("BROUILLON"), // BROUILLON, VALIDE, ANNULE, PAYE
  totalBrutHtCents: integer("total_brut_ht_cents").notNull().default(0),
  discountPercent: integer("discount_percent").notNull().default(0), // Remise personnalisée en %
  discountAmountCents: integer("discount_amount_cents").notNull().default(0), // Montant remise
  totalNetHtCents: integer("total_net_ht_cents").notNull().default(0), // Brut HT - Remise
  tvaRate: integer("tva_rate").notNull().default(20), // TVA 20% par défaut
  tvaAmountCents: integer("tva_amount_cents").notNull().default(0),
  totalTtcCents: integer("total_ttc_cents").notNull().default(0), // Net HT + TVA
  paidAmountCents: integer("paid_amount_cents").notNull().default(0),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  sourceBlId: integer("source_bl_id"), // Lien si facture ou avoir issu d'un BL
  avType: text("av_type"), // Avoir : RETOUR (marchandise reprise), COMMERCIAL (geste), CORRECTION
  // Champs réservés DGI (Phase 9 — readiness, aucune intégration active)
  dgiValidationId: text("dgi_validation_id"),
  dgiStatus: text("dgi_status"),
  dgiSignature: text("dgi_signature"),
  vatDisplay: text("vat_display").notNull().default("SHOWN"), // snapshot §6A : SHOWN | HIDDEN
  priceBasis: text("price_basis").notNull().default("TTC"), // snapshot §6A : TTC | HT
  validatedAt: timestamp("validated_at"),
  cancelledAt: timestamp("cancelled_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
},
  (table) => [
    // Invariant §5.4 assoupli (régime non-assujetti) : FACTURE/AVOIR HIDDEN autorisé
    // uniquement avec mention « TVA non applicable ». Enforcement serveur régime-aware
    // dans createSalesDocument (la contrainte DB ne peut pas lire settings).
  ]
);

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
  discountPercent: integer("discount_percent").notNull().default(0),
  discountAmountCents: integer("discount_amount_cents").notNull().default(0),
  unitCostCents: integer("unit_cost_cents").notNull().default(0), // COGS (CMUP au moment de la vente)
  tvaRate: integer("tva_rate").notNull().default(20),
  totalTtcCents: integer("total_ttc_cents").notNull().default(0),
  originalLineId: integer("original_line_id"), // AV : ligne d'origine (FAC/BL) créditée
});

// ==========================================
// 9b. LIAISONS ENTRE DOCUMENTS (BL↔FAC, AV↔origine)
// ==========================================
export const documentLinks = pgTable("document_links", {
  id: serial("id").primaryKey(),
  sourceDocumentId: integer("source_document_id")
    .notNull()
    .references(() => salesDocuments.id, { onDelete: "cascade" }),
  targetDocumentId: integer("target_document_id")
    .notNull()
    .references(() => salesDocuments.id, { onDelete: "cascade" }),
  linkType: text("link_type").notNull(), // BL_TO_FAC, AV_TO_SOURCE
  createdAt: timestamp("created_at").defaultNow(),
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
  categoryId: integer("category_id").references(() => expenseCategories.id),
  amountCents: integer("amount_cents").notNull(), // Total TTC
  amountHtCents: integer("amount_ht_cents").notNull().default(0),
  tvaRate: integer("tva_rate").notNull().default(20),
  tvaAmountCents: integer("tva_amount_cents").notNull().default(0),
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

// ==========================================
// 16. PROFILS UTILISATEURS (auth gérée — Neon Auth / Better Auth)
// ==========================================
export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(), // id utilisateur Neon Auth (neon_auth.user.id)
  email: text("email"),
  displayName: text("display_name"),
  role: text("role").notNull().default("ADMIN"), // ADMIN actif; GERANT, VENTE, STOCK, COMPTA, LECTURE réservés
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ==========================================
// 17. PÉRIODES COMPTABLES (VERROUILLAGE APRÈS RÉVISION)
// ==========================================
export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1..12
    status: text("status").notNull().default("OPEN"), // OPEN, LOCKED
    lockedAt: timestamp("locked_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [unique("accounting_periods_year_month_unique").on(table.year, table.month)]
);

// ==========================================
// 18. MANIFESTES D'ARCHIVAGE (PHASE 9)
// ==========================================
export const archiveManifests = pgTable("archive_manifests", {
  id: serial("id").primaryKey(),
  periodLabel: text("period_label").notNull(), // ex: "2026-10"
  objectKey: text("object_key").notNull(), // clé objet (R2)
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  docCount: integer("doc_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

