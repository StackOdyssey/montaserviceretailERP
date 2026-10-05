"use server";

import { db, suppliers, supplierReceipts, supplierReceiptLines, supplierPayments } from "@/db";
import { recordStockMovement } from "./products";

export interface SupplierItem {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  ice: string | null;
  notes: string | null;
  createdAt: string;
  totalPurchasesTtcCents?: number;
  totalPaidCents?: number;
  balanceDueCents?: number;
}

export interface SupplierReceiptItem {
  id: number;
  supplierId: number;
  supplierName: string;
  receiptNumber: string; // BR-2026-0042
  supplierInvoiceNumber: string | null;
  receiptDate: string;
  status: "RECU" | "EN_ATTENTE" | "ANNULE";
  totalHtCents: number;
  tvaRate: number;
  tvaAmountCents: number;
  totalTtcCents: number;
  paidAmountCents: number;
  notes: string | null;
  lines: Array<{
    id: number;
    productId: number;
    productName: string;
    sku: string;
    quantity: number;
    unitCostCents: number;
    totalCostCents: number;
  }>;
}

export interface SupplierPaymentItem {
  id: number;
  supplierId: number;
  supplierName: string;
  receiptId: number | null;
  receiptNumber?: string | null;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT";
  paymentDate: string;
  referenceNumber: string | null;
  dueDate: string | null;
  bankName: string | null;
  status: "EN_ATTENTE" | "DEBITE" | "REJETE";
  notes: string | null;
  createdAt: string;
}

// Numérotation séquentielle des bons de réception
let receiptCounter = 42;

// Fournisseurs initiaux en mémoire (Bashan Chine, Grossistes Derb Omar)
let memorySuppliers: SupplierItem[] = [
  {
    id: 1,
    name: "Bashan Motorcycle Industrial Co., Ltd",
    contactName: "Mr. Chen Wei (Export Dept)",
    phone: "+86 23 6280 8888",
    email: "export@bashanmotor.com",
    city: "Chongqing, Chine",
    ice: "FOREIGN-CN-99201",
    notes: "Fabricant officiel pièces d'origine Bashan Quads & Motos. Expédition par conteneur Port Tanger Med.",
    createdAt: new Date("2025-11-01").toISOString(),
  },
  {
    id: 2,
    name: "Grossiste Pièces Moto Derb Omar",
    contactName: "Hajj Abdelkrim",
    phone: "0522304050",
    email: "abdelkrim.pieces@gmail.com",
    city: "Casablanca",
    ice: "001554289000072",
    notes: "Fournisseur local pièces courantes (bougies, huiles, câbles, kit chaînes) - Paiement par chèque 60 jours.",
    createdAt: new Date("2026-01-05").toISOString(),
  },
  {
    id: 3,
    name: "Maghreb Pneus & Accessoires SARL",
    contactName: "Karim Bennani",
    phone: "0522889911",
    email: "commandes@maghrebpneus.ma",
    city: "Casablanca",
    ice: "001889214000033",
    notes: "Fournisseur pneus quads 10 pouces et chambres à air.",
    createdAt: new Date("2026-01-20").toISOString(),
  },
];

// Réceptions en mémoire
let memoryReceipts: SupplierReceiptItem[] = [
  {
    id: 1,
    supplierId: 1,
    supplierName: "Bashan Motorcycle Industrial Co., Ltd",
    receiptNumber: "BR-2026-0040",
    supplierInvoiceNumber: "INV-BSH-2026-881",
    receiptDate: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    status: "RECU",
    totalHtCents: 4500000,
    tvaRate: 10,
    tvaAmountCents: 450000,
    totalTtcCents: 4950000,
    paidAmountCents: 4950000,
    notes: "Conteneur dédouané Port Tanger Med - Réception complète",
    lines: [
      {
        id: 1,
        productId: 1,
        productName: "Plaquettes de frein avant Bashan 200 / 250cc",
        sku: "BASH-014",
        quantity: 100,
        unitCostCents: 2500,
        totalCostCents: 250000,
      },
      {
        id: 2,
        productId: 5,
        productName: "Carburateur complet PZ30 starter manuel Bashan 250",
        sku: "CARB-PZ30",
        quantity: 50,
        unitCostCents: 15000,
        totalCostCents: 750000,
      },
    ],
  },
  {
    id: 2,
    supplierId: 2,
    supplierName: "Grossiste Pièces Moto Derb Omar",
    receiptNumber: "BR-2026-0041",
    supplierInvoiceNumber: "FAC-DO-8892",
    receiptDate: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    status: "RECU",
    totalHtCents: 1200000,
    tvaRate: 10,
    tvaAmountCents: 120000,
    totalTtcCents: 1320000,
    paidAmountCents: 500000,
    notes: "Réassort kit chaînes et batteries",
    lines: [
      {
        id: 3,
        productId: 7,
        productName: "Kit chaîne renforcé 428H - 136 maillons Gold",
        sku: "KIT-CHAINE-428",
        quantity: 20,
        unitCostCents: 11000,
        totalCostCents: 220000,
      },
      {
        id: 4,
        productId: 8,
        productName: "Batterie Gel 12V 9Ah YTX9-BS",
        sku: "BAT-12V-9AH",
        quantity: 15,
        unitCostCents: 18000,
        totalCostCents: 270000,
      },
    ],
  },
];

// Règlements fournisseurs en mémoire
let memorySupplierPayments: SupplierPaymentItem[] = [
  {
    id: 1,
    supplierId: 1,
    supplierName: "Bashan Motorcycle Industrial Co., Ltd",
    receiptId: 1,
    receiptNumber: "BR-2026-0040",
    amountCents: 4950000,
    paymentMethod: "VIREMENT",
    paymentDate: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
    referenceNumber: "SWIFT-BMCE-9921",
    dueDate: null,
    bankName: "Bank of Africa (BMCE)",
    status: "DEBITE",
    notes: "Virement international Swift",
    createdAt: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 2,
    supplierId: 2,
    supplierName: "Grossiste Pièces Moto Derb Omar",
    receiptId: 2,
    receiptNumber: "BR-2026-0041",
    amountCents: 500000,
    paymentMethod: "CHEQUE",
    paymentDate: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    referenceNumber: "CHQ-BM-449102",
    dueDate: new Date(Date.now() + 25 * 24 * 3600 * 1000).toISOString(),
    bankName: "Attijariwafa Bank",
    status: "EN_ATTENTE",
    notes: "Acompte chèque fin de mois",
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
  },
];

/**
 * Récupère tous les fournisseurs avec leurs dettes et totaux
 */
export async function getSuppliers(searchQuery?: string): Promise<SupplierItem[]> {
  const search = searchQuery?.toLowerCase().trim() || "";

  return memorySuppliers
    .filter((s) => {
      if (!search) return true;
      return (
        s.name.toLowerCase().includes(search) ||
        (s.contactName && s.contactName.toLowerCase().includes(search)) ||
        (s.phone && s.phone.includes(search)) ||
        (s.city && s.city.toLowerCase().includes(search))
      );
    })
    .map((supplier) => {
      const receipts = memoryReceipts.filter(
        (r) => r.supplierId === supplier.id && r.status !== "ANNULE"
      );
      const totalPurchases = receipts.reduce(
        (sum, r) => sum + r.totalTtcCents,
        0
      );

      const payments = memorySupplierPayments.filter(
        (p) => p.supplierId === supplier.id && p.status !== "REJETE"
      );
      const totalPaid = payments.reduce((sum, p) => sum + p.amountCents, 0);

      return {
        ...supplier,
        totalPurchasesTtcCents: totalPurchases,
        totalPaidCents: totalPaid,
        balanceDueCents: totalPurchases - totalPaid,
      };
    });
}

/**
 * Récupère l'historique complet d'un fournisseur
 */
export async function getSupplierDetail(supplierId: number) {
  const supplier = memorySuppliers.find((s) => s.id === supplierId);
  if (!supplier) return null;

  const receipts = memoryReceipts
    .filter((r) => r.supplierId === supplierId)
    .sort(
      (a, b) =>
        new Date(b.receiptDate).getTime() - new Date(a.receiptDate).getTime()
    );

  const payments = memorySupplierPayments
    .filter((p) => p.supplierId === supplierId)
    .sort(
      (a, b) =>
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
    );

  const totalPurchases = receipts
    .filter((r) => r.status !== "ANNULE")
    .reduce((sum, r) => sum + r.totalTtcCents, 0);

  const totalPaid = payments
    .filter((p) => p.status !== "REJETE")
    .reduce((sum, p) => sum + p.amountCents, 0);

  return {
    supplier,
    totalPurchasesTtcCents: totalPurchases,
    totalPaidCents: totalPaid,
    balanceDueCents: totalPurchases - totalPaid,
    receipts,
    payments,
  };
}

/**
 * Enregistre un Bon de Réception (BR) et alimente le stock en temps réel
 */
export async function createSupplierReceipt(data: {
  supplierId: number;
  supplierInvoiceNumber?: string;
  lines: Array<{
    productId: number;
    productName: string;
    sku: string;
    quantity: number;
    unitCostCents: number;
  }>;
  notes?: string;
}) {
  if (!data.lines || data.lines.length === 0) {
    throw new Error("Le Bon de Réception doit contenir au moins un article");
  }

  const supplier = memorySuppliers.find((s) => s.id === data.supplierId);
  if (!supplier) {
    throw new Error("Fournisseur introuvable");
  }

  receiptCounter += 1;
  const receiptNumber = `BR-2026-${receiptCounter.toString().padStart(4, "0")}`;

  let totalHtCents = 0;
  const processedLines = data.lines.map((line, idx) => {
    const totalLineCost = line.unitCostCents * line.quantity;
    totalHtCents += totalLineCost;
    return {
      id: Date.now() + idx,
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      quantity: line.quantity,
      unitCostCents: line.unitCostCents,
      totalCostCents: totalLineCost,
    };
  });

  const tvaRate = 10;
  const tvaAmountCents = Math.round((totalHtCents * tvaRate) / 100);
  const totalTtcCents = totalHtCents + tvaAmountCents;

  // Alimentation automatique du stock via le grand livre append-only
  for (const line of data.lines) {
    await recordStockMovement({
      productId: line.productId,
      movementType: "ACHAT_RECEPTION",
      quantity: line.quantity, // Entrée positive en stock
      unitCostCents: line.unitCostCents,
      reason: `Réception arrivage ${receiptNumber} (${supplier.name})`,
    });
  }

  const newReceipt: SupplierReceiptItem = {
    id: Date.now(),
    supplierId: data.supplierId,
    supplierName: supplier.name,
    receiptNumber,
    supplierInvoiceNumber: data.supplierInvoiceNumber || null,
    receiptDate: new Date().toISOString(),
    status: "RECU",
    totalHtCents,
    tvaRate,
    tvaAmountCents,
    totalTtcCents,
    paidAmountCents: 0,
    notes: data.notes || null,
    lines: processedLines,
  };

  memoryReceipts.unshift(newReceipt);
  return newReceipt;
}

/**
 * Enregistre un règlement émis à un fournisseur
 */
export async function recordSupplierPayment(data: {
  supplierId: number;
  amountCents: number;
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT";
  receiptId?: number | null;
  referenceNumber?: string;
  dueDate?: string;
  bankName?: string;
  notes?: string;
}) {
  if (data.amountCents <= 0) {
    throw new Error("Le montant du règlement doit être supérieur à 0");
  }

  const supplier = memorySuppliers.find((s) => s.id === data.supplierId);
  if (!supplier) throw new Error("Fournisseur introuvable");

  let receiptNum: string | null = null;
  if (data.receiptId) {
    const rc = memoryReceipts.find((r) => r.id === data.receiptId);
    if (rc) {
      receiptNum = rc.receiptNumber;
      rc.paidAmountCents += data.amountCents;
    }
  }

  const newPayment: SupplierPaymentItem = {
    id: Date.now(),
    supplierId: data.supplierId,
    supplierName: supplier.name,
    receiptId: data.receiptId || null,
    receiptNumber: receiptNum,
    amountCents: data.amountCents,
    paymentMethod: data.paymentMethod,
    paymentDate: new Date().toISOString(),
    referenceNumber: data.referenceNumber || null,
    dueDate: data.dueDate || null,
    bankName: data.bankName || null,
    status:
      data.paymentMethod === "ESPECES" || data.paymentMethod === "VIREMENT"
        ? "DEBITE"
        : "EN_ATTENTE",
    notes: data.notes || null,
    createdAt: new Date().toISOString(),
  };

  memorySupplierPayments.unshift(newPayment);
  return newPayment;
}

/**
 * Enregistre ou met à jour un fournisseur
 */
export async function saveSupplier(data: {
  id?: number;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  city?: string;
  ice?: string;
  notes?: string;
}): Promise<SupplierItem> {
  if (!data.name.trim()) {
    throw new Error("Le nom du fournisseur est obligatoire");
  }

  if (data.id) {
    const existing = memorySuppliers.find((s) => s.id === data.id);
    if (!existing) throw new Error("Fournisseur introuvable");
    existing.name = data.name.trim();
    existing.contactName = data.contactName || null;
    existing.phone = data.phone || null;
    existing.email = data.email || null;
    existing.city = data.city || null;
    existing.ice = data.ice || null;
    existing.notes = data.notes || null;
    return existing;
  }

  const newSupplier: SupplierItem = {
    id: Date.now(),
    name: data.name.trim(),
    contactName: data.contactName || null,
    phone: data.phone || null,
    email: data.email || null,
    city: data.city || null,
    ice: data.ice || null,
    notes: data.notes || null,
    createdAt: new Date().toISOString(),
  };

  memorySuppliers.push(newSupplier);
  return newSupplier;
}
