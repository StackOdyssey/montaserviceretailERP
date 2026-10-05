"use server";

import { db, customers, customerPayments, salesDocuments, auditLogs } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getSalesDocuments, SalesDocumentItem } from "./sales";

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
  balanceDueCents: number; // Solde débiteur restant dû
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

// Données en mémoire initiales réalistes (clients réguliers de BM Motors)
let memoryCustomers: CustomerItem[] = [
  {
    id: 1,
    name: "Garage Moto Hassan",
    phone: "0661234567",
    email: "contact@garagemotohassan.ma",
    city: "Ain Sebaa, Casablanca",
    address: "Bd Chefchaouni, Quartier Industriel",
    ice: "001892837000045",
    isWholesale: true,
    notes: "Client fidèle gros volume - Règlement fin de mois ou chèque à 30 jours",
    createdAt: new Date("2026-01-10").toISOString(),
  },
  {
    id: 2,
    name: "Atelier Pro Biker",
    phone: "0662889900",
    email: "probiker.casa@gmail.com",
    city: "Derb Ghallef, Casablanca",
    address: "Rue 14, N° 45 Derb Ghallef",
    ice: "002441928000088",
    isWholesale: true,
    notes: "Spécialiste quads et motos Bashan / Docker",
    createdAt: new Date("2026-01-15").toISOString(),
  },
  {
    id: 3,
    name: "Moto Express Marrakech",
    phone: "0663112233",
    email: "motoexpress.kech@yahoo.fr",
    city: "Gueliz, Marrakech",
    address: "Avenue Mohammed V",
    ice: "001994821000012",
    isWholesale: true,
    notes: "Commandes par expédition CTM / Ghazala",
    createdAt: new Date("2026-02-01").toISOString(),
  },
  {
    id: 4,
    name: "Comptoir Particuliers (Cash)",
    phone: "0660000000",
    email: null,
    city: "Casablanca",
    address: "Vente directe magasin",
    ice: null,
    isWholesale: false,
    notes: "Clients de passage réglant au comptoir",
    createdAt: new Date("2026-01-01").toISOString(),
  },
];

// Règlements initiaux en mémoire
let memoryCustomerPayments: CustomerPaymentItem[] = [
  {
    id: 1,
    customerId: 2,
    customerName: "Atelier Pro Biker",
    documentId: 2,
    documentNumber: "BL-2026-0127",
    amountCents: 132000,
    paymentMethod: "ESPECES",
    paymentDate: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
    referenceNumber: null,
    chequeDueDate: null,
    bankName: null,
    status: "ENCAISSE",
    notes: "Règlement comptoir espèces",
    createdAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    customerId: 1,
    customerName: "Garage Moto Hassan",
    documentId: null,
    documentNumber: null,
    amountCents: 350000,
    paymentMethod: "CHEQUE",
    paymentDate: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    referenceNumber: "CHQ-884920",
    chequeDueDate: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(), // Dans 4 jours
    bankName: "Attijariwafa Bank",
    status: "EN_ATTENTE",
    notes: "Acompte sur commandes en cours",
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 3,
    customerId: 3,
    customerName: "Moto Express Marrakech",
    documentId: null,
    documentNumber: null,
    amountCents: 480000,
    paymentMethod: "EFFET_LCN",
    paymentDate: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    referenceNumber: "LCN-99210",
    chequeDueDate: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(), // Échu hier !
    bankName: "Banque Populaire",
    status: "EN_ATTENTE",
    notes: "Effet de commerce 30 jours à déposer",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
  },
];

/**
 * Récupère tous les clients avec leur solde calculé
 */
export async function getCustomers(searchQuery?: string) {
  const allDocs = await getSalesDocuments();
  const search = searchQuery?.toLowerCase().trim() || "";

  return memoryCustomers
    .filter((c) => {
      if (!search) return true;
      return (
        c.name.toLowerCase().includes(search) ||
        (c.phone && c.phone.includes(search)) ||
        (c.city && c.city.toLowerCase().includes(search)) ||
        (c.ice && c.ice.includes(search))
      );
    })
    .map((customer) => {
      // Calcul du total facturé TTC
      const customerDocs = allDocs.filter(
        (d) => d.customerId === customer.id && d.status !== "ANNULE"
      );
      const totalBilled = customerDocs.reduce(
        (sum, d) => sum + d.totalTtcCents,
        0
      );

      // Calcul du total réglé (encaissé ou en cours)
      const customerPmts = memoryCustomerPayments.filter(
        (p) => p.customerId === customer.id && p.status !== "REJETE"
      );
      const totalPaid = customerPmts.reduce(
        (sum, p) => sum + p.amountCents,
        0
      );

      const balanceDue = totalBilled - totalPaid;
      const unpaidCount = customerDocs.filter((d) => d.status !== "PAYE").length;

      return {
        ...customer,
        totalBilledTtcCents: totalBilled,
        totalPaidCents: totalPaid,
        balanceDueCents: balanceDue,
        unpaidDocumentsCount: unpaidCount,
      };
    });
}

/**
 * Récupère le relevé de compte complet d'un client
 */
export async function getCustomerStatement(
  customerId: number
): Promise<CustomerAccountStatement | null> {
  const customer = memoryCustomers.find((c) => c.id === customerId);
  if (!customer) return null;

  const allDocs = await getSalesDocuments();
  const customerDocs = allDocs
    .filter((d) => d.customerId === customerId && d.status !== "ANNULE")
    .map((doc) => {
      const remaining = Math.max(0, doc.totalTtcCents - doc.paidAmountCents);
      return {
        ...doc,
        remainingDueCents: remaining,
      };
    });

  const customerPmts = memoryCustomerPayments
    .filter((p) => p.customerId === customerId)
    .sort(
      (a, b) =>
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
    );

  const totalBilled = customerDocs.reduce(
    (sum, d) => sum + d.totalTtcCents,
    0
  );
  const totalPaid = customerPmts
    .filter((p) => p.status !== "REJETE")
    .reduce((sum, p) => sum + p.amountCents, 0);

  const balanceDue = totalBilled - totalPaid;
  const unpaidCount = customerDocs.filter((d) => d.status !== "PAYE").length;

  return {
    customer,
    totalBilledTtcCents: totalBilled,
    totalPaidCents: totalPaid,
    balanceDueCents: balanceDue,
    unpaidDocumentsCount: unpaidCount,
    documents: customerDocs,
    payments: customerPmts,
  };
}

/**
 * Enregistre un nouveau règlement client (Espèces, Chèque, Effet LCN, Virement)
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
}) {
  if (data.amountCents <= 0) {
    throw new Error("Le montant du règlement doit être supérieur à 0");
  }

  const customer = memoryCustomers.find((c) => c.id === data.customerId);
  if (!customer) {
    throw new Error("Client introuvable");
  }

  // Statut initial : les espèces et virements sont réputés encaissés immédiatement
  const initialStatus =
    data.paymentMethod === "ESPECES" || data.paymentMethod === "VIREMENT"
      ? "ENCAISSE"
      : "EN_ATTENTE";

  let docNumber: string | null = null;
  const allDocs = await getSalesDocuments();

  if (data.documentId) {
    const doc = allDocs.find((d) => d.id === data.documentId);
    if (doc) {
      docNumber = doc.docNumber;
      // Lettrage / mise à jour du montant réglé sur le BL
      doc.paidAmountCents += data.amountCents;
      if (doc.paidAmountCents >= doc.totalTtcCents) {
        doc.status = "PAYE";
      }
    }
  } else {
    // Si aucun BL spécifique n'est ciblé, lettrage automatique FIFO sur les BL impayés
    let remainingToAllocate = data.amountCents;
    const unpaidDocs = allDocs
      .filter((d) => d.customerId === data.customerId && d.status !== "PAYE")
      .sort(
        (a, b) =>
          new Date(a.docDate).getTime() - new Date(b.docDate).getTime()
      );

    for (const doc of unpaidDocs) {
      if (remainingToAllocate <= 0) break;
      const unpaidOnDoc = Math.max(0, doc.totalTtcCents - doc.paidAmountCents);
      const allocated = Math.min(unpaidOnDoc, remainingToAllocate);
      doc.paidAmountCents += allocated;
      remainingToAllocate -= allocated;
      if (doc.paidAmountCents >= doc.totalTtcCents) {
        doc.status = "PAYE";
      }
    }
  }

  const newPayment: CustomerPaymentItem = {
    id: Date.now(),
    customerId: data.customerId,
    customerName: customer.name,
    documentId: data.documentId || null,
    documentNumber: docNumber,
    amountCents: data.amountCents,
    paymentMethod: data.paymentMethod,
    paymentDate: new Date().toISOString(),
    referenceNumber: data.referenceNumber || null,
    chequeDueDate: data.chequeDueDate || null,
    bankName: data.bankName || null,
    status: initialStatus,
    notes: data.notes || null,
    createdAt: new Date().toISOString(),
  };

  memoryCustomerPayments.unshift(newPayment);
  return newPayment;
}

/**
 * Met à jour le statut d'un chèque ou effet LCN (Encaissement ou Rejet)
 */
export async function updatePaymentStatus(
  paymentId: number,
  newStatus: "ENCAISSE" | "EN_ATTENTE" | "REJETE"
) {
  const pmt = memoryCustomerPayments.find((p) => p.id === paymentId);
  if (!pmt) throw new Error("Règlement introuvable");

  pmt.status = newStatus;
  return pmt;
}

/**
 * Récupère l'échéancier des chèques et effets de commerce
 */
export async function getChequesEffetsSchedule(): Promise<ChequeEffetAlert[]> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return memoryCustomerPayments
    .filter(
      (p) =>
        (p.paymentMethod === "CHEQUE" || p.paymentMethod === "EFFET_LCN") &&
        p.chequeDueDate
    )
    .map((p) => {
      const dueDate = new Date(p.chequeDueDate!);
      dueDate.setHours(0, 0, 0, 0);
      const diffTime = dueDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let urgency: "RETARD" | "AUJOURDHUI" | "PROCHE" | "FUTUR" = "FUTUR";
      if (diffDays < 0) {
        urgency = "RETARD";
      } else if (diffDays === 0) {
        urgency = "AUJOURDHUI";
      } else if (diffDays <= 7) {
        urgency = "PROCHE";
      }

      return {
        id: p.id,
        customerId: p.customerId,
        customerName: p.customerName,
        paymentMethod: p.paymentMethod as "CHEQUE" | "EFFET_LCN",
        amountCents: p.amountCents,
        referenceNumber: p.referenceNumber || "Sans N°",
        bankName: p.bankName || "Non spécifiée",
        dueDate: p.chequeDueDate!,
        status: p.status,
        urgency,
        daysRemaining: diffDays,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
}

/**
 * Crée ou modifie un client
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
  if (!data.name.trim()) {
    throw new Error("Le nom du client ou de la société est obligatoire");
  }

  if (data.id) {
    const existing = memoryCustomers.find((c) => c.id === data.id);
    if (!existing) throw new Error("Client introuvable");
    existing.name = data.name.trim();
    existing.phone = data.phone || null;
    existing.email = data.email || null;
    existing.city = data.city || "Casablanca";
    existing.address = data.address || null;
    existing.ice = data.ice || null;
    existing.isWholesale = data.isWholesale ?? false;
    existing.notes = data.notes || null;
    return existing;
  }

  const newCustomer: CustomerItem = {
    id: Date.now(),
    name: data.name.trim(),
    phone: data.phone || null,
    email: data.email || null,
    city: data.city || "Casablanca",
    address: data.address || null,
    ice: data.ice || null,
    isWholesale: data.isWholesale ?? false,
    notes: data.notes || null,
    createdAt: new Date().toISOString(),
  };

  memoryCustomers.push(newCustomer);
  return newCustomer;
}
