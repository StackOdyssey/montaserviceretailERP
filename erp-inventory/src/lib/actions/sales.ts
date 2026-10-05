"use server";

import { db, salesDocuments, salesLines, stockMovements, products, customers } from "@/db";
import { eq, desc } from "drizzle-orm";
import { calculateDocumentTotals, DocumentTotals, toCentimes } from "@/lib/money";
import { recordStockMovement } from "./products";
import { Resend } from "resend";

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
  docType: "BL" | "FACTURE" | "AVOIR";
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
  lines: Array<{
    id: number;
    productId: number;
    productName: string;
    sku: string;
    oemCode?: string | null;
    unitPriceHTCents: number;
    quantity: number;
    totalHtCents: number;
  }>;
}

// Compteur séquentiel de documents en mémoire pour 2026
let documentCounter = 130;

// Stockage en mémoire pour fonctionnement immédiat en dev
let memorySalesDocuments: SalesDocumentItem[] = [
  {
    id: 1,
    docType: "BL",
    docNumber: "BL-2026-0128",
    customerId: 1,
    customerName: "Garage Moto Hassan",
    customerPhone: "0661234567",
    customerEmail: "contact@garagemotohassan.ma",
    customerCity: "Ain Sebaa, Casablanca",
    customerIce: "001892837000045",
    docDate: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    status: "VALIDE",
    totalBrutHtCents: 75000,
    discountPercent: 5,
    discountAmountCents: 3750,
    totalNetHtCents: 71250,
    tvaRate: 10,
    tvaAmountCents: 7125,
    totalTtcCents: 78375,
    paidAmountCents: 0,
    paymentMethod: "A_CREDIT",
    notes: "Règlement prévu fin de semaine",
    lines: [
      {
        id: 101,
        productId: 1,
        productName: "Plaquettes de frein avant Bashan 200 / 250cc",
        sku: "BASH-014",
        oemCode: "16001-BSH-001",
        unitPriceHTCents: 4500,
        quantity: 5,
        totalHtCents: 22500,
      },
      {
        id: 102,
        productId: 7,
        productName: "Kit chaîne renforcé 428H - 136 maillons Gold",
        sku: "KIT-CHAINE-428",
        oemCode: "428H-136L-GOLD",
        unitPriceHTCents: 17500,
        quantity: 3,
        totalHtCents: 52500,
      },
    ],
  },
  {
    id: 2,
    docType: "BL",
    docNumber: "BL-2026-0127",
    customerId: 2,
    customerName: "Atelier Pro Biker",
    customerPhone: "0662889900",
    customerEmail: "probiker.casa@gmail.com",
    customerCity: "Derb Ghallef, Casablanca",
    customerIce: "002441928000088",
    docDate: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
    status: "PAYE",
    totalBrutHtCents: 120000,
    discountPercent: 0,
    discountAmountCents: 0,
    totalNetHtCents: 120000,
    tvaRate: 10,
    tvaAmountCents: 12000,
    totalTtcCents: 132000,
    paidAmountCents: 132000,
    paymentMethod: "ESPECES",
    notes: "Payé en espèces au comptoir",
    lines: [
      {
        id: 103,
        productId: 5,
        productName: "Carburateur complet PZ30 starter manuel Bashan 250",
        sku: "CARB-PZ30",
        oemCode: "PZ30-BASH",
        unitPriceHTCents: 24000,
        quantity: 5,
        totalHtCents: 120000,
      },
    ],
  },
];

/**
 * Récupère tous les documents de vente
 */
export async function getSalesDocuments(options?: {
  docType?: "BL" | "FACTURE" | "AVOIR";
  search?: string;
  status?: string;
}): Promise<SalesDocumentItem[]> {
  const search = options?.search?.toLowerCase().trim() || "";
  const docType = options?.docType;
  const status = options?.status;

  return memorySalesDocuments.filter((doc) => {
    if (docType && doc.docType !== docType) return false;
    if (status && status !== "ALL" && doc.status !== status) return false;

    if (search) {
      const matchNum = doc.docNumber.toLowerCase().includes(search);
      const matchClient = doc.customerName.toLowerCase().includes(search);
      if (!matchNum && !matchClient) return false;
    }

    return true;
  });
}

/**
 * Récupère un document par son identifiant ou numéro
 */
export async function getSalesDocumentById(id: number): Promise<SalesDocumentItem | null> {
  const found = memorySalesDocuments.find((d) => d.id === id);
  return found || null;
}

/**
 * Crée et valide un Bon de Livraison (BL) au comptoir
 */
export async function createSalesDocument(data: {
  docType?: "BL" | "FACTURE" | "AVOIR";
  customerId?: number | null;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerCity?: string;
  customerIce?: string;
  lines: SalesLineInput[];
  discountPercent: number; // Remise personnalisée en %
  paymentMethod: "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "A_CREDIT";
  paidAmountCents?: number;
  notes?: string;
}): Promise<SalesDocumentItem> {
  if (!data.lines || data.lines.length === 0) {
    throw new Error("Le Bon de Livraison doit contenir au moins un article");
  }

  // 1. Calcul strict des montants et de la remise
  const totals = calculateDocumentTotals(
    data.lines.map((l) => ({
      unitPriceHT: l.unitPriceHTCents,
      quantity: l.quantity,
    })),
    data.discountPercent,
    10 // TVA 10% SARL
  );

  // 2. Génération séquentielle sans rupture du numéro de document
  documentCounter += 1;
  const prefix = data.docType || "BL";
  const docNumber = `${prefix}-2026-${documentCounter.toString().padStart(4, "0")}`;

  // 3. Décrémentation du stock via le grand livre append-only
  for (const line of data.lines) {
    await recordStockMovement({
      productId: line.productId,
      movementType: "VENTE_BL",
      quantity: -line.quantity, // Décrémentation
      reason: `Vente au comptoir selon ${docNumber} pour ${data.customerName}`,
    });
  }

  // 4. Enregistrement du document commercial
  const isFullyPaid =
    data.paymentMethod !== "A_CREDIT" &&
    (data.paidAmountCents ?? totals.totalTTC) >= totals.totalTTC;

  const newDoc: SalesDocumentItem = {
    id: Date.now(),
    docType: data.docType || "BL",
    docNumber,
    customerId: data.customerId || null,
    customerName: data.customerName || "Client Comptoir Particulier",
    customerPhone: data.customerPhone || null,
    customerEmail: data.customerEmail || null,
    customerCity: data.customerCity || "Casablanca",
    customerIce: data.customerIce || null,
    docDate: new Date().toISOString(),
    status: isFullyPaid ? "PAYE" : "VALIDE",
    totalBrutHtCents: totals.totalBrutHT,
    discountPercent: totals.discountPercent,
    discountAmountCents: totals.discountAmount,
    totalNetHtCents: totals.totalNetHT,
    tvaRate: totals.tvaRate,
    tvaAmountCents: totals.tvaAmount,
    totalTtcCents: totals.totalTTC,
    paidAmountCents: isFullyPaid
      ? totals.totalTTC
      : data.paidAmountCents || 0,
    paymentMethod: data.paymentMethod,
    notes: data.notes || null,
    lines: data.lines.map((l, idx) => ({
      id: Date.now() + idx,
      productId: l.productId,
      productName: l.productName,
      sku: l.sku,
      oemCode: l.oemCode || null,
      unitPriceHTCents: l.unitPriceHTCents,
      quantity: l.quantity,
      totalHtCents: l.unitPriceHTCents * l.quantity,
    })),
  };

  memorySalesDocuments.unshift(newDoc);
  return newDoc;
}

/**
 * Envoie le Bon de Livraison par email avec Resend
 */
export async function sendDocumentByEmail(data: {
  documentId: number;
  recipientEmail: string;
}): Promise<{ success: boolean; message: string }> {
  const doc = memorySalesDocuments.find((d) => d.id === data.documentId);
  if (!doc) {
    throw new Error("Document introuvable");
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    // Mode simulation si la clé n'est pas encore configurée dans .env
    return {
      success: true,
      message: `[Simulation] Email préparé pour ${data.recipientEmail} concernant ${doc.docNumber}. (Ajoutez RESEND_API_KEY dans votre .env pour l'envoi réel)`,
    };
  }

  try {
    const resend = new Resend(resendApiKey);

    await resend.emails.send({
      from: "BM Motors <onboarding@resend.dev>",
      to: data.recipientEmail,
      subject: `Bon de Livraison N° ${doc.docNumber} - SARL BM Motors`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2 style="color: #F7162D;">SARL BM Motors - Pièces Moto</h2>
          <p>Bonjour,</p>
          <p>Veuillez trouver ci-dessous le récapitulatif de votre <strong>Bon de Livraison N° ${doc.docNumber}</strong> du ${new Date(doc.docDate).toLocaleDateString("fr-FR")}.</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <thead>
              <tr style="background: #F8F9FA; border-bottom: 2px solid #E5E7EB; text-align: left;">
                <th style="padding: 8px;">Désignation</th>
                <th style="padding: 8px;">Qté</th>
                <th style="padding: 8px; text-align: right;">Total HT</th>
              </tr>
            </thead>
            <tbody>
              ${doc.lines
                .map(
                  (l) => `
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 8px;">${l.productName} (${l.sku})</td>
                  <td style="padding: 8px;">${l.quantity}</td>
                  <td style="padding: 8px; text-align: right;">${(l.totalHtCents / 100).toFixed(2)} DH</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
          <div style="margin-top: 20px; text-align: right;">
            <p><strong>Total Brut HT :</strong> ${(doc.totalBrutHtCents / 100).toFixed(2)} DH</p>
            ${
              doc.discountPercent > 0
                ? `<p style="color: #059669;"><strong>Remise (${doc.discountPercent}%) :</strong> -${(doc.discountAmountCents / 100).toFixed(2)} DH</p>`
                : ""
            }
            <p><strong>Total Net HT :</strong> ${(doc.totalNetHtCents / 100).toFixed(2)} DH</p>
            <p><strong>TVA (10%) :</strong> ${(doc.tvaAmountCents / 100).toFixed(2)} DH</p>
            <h3 style="color: #F7162D;">Total TTC : ${(doc.totalTtcCents / 100).toFixed(2)} DH</h3>
          </div>
          <p style="margin-top: 30px; font-size: 12px; color: #6B7280;">
            SARL BM Motors • ICE: 001892837000045 • Casablanca, Maroc
          </p>
        </div>
      `,
    });

    return {
      success: true,
      message: `Email envoyé avec succès à ${data.recipientEmail} via Resend`,
    };
  } catch (err: any) {
    throw new Error(`Échec d'envoi par Resend: ${err.message}`);
  }
}
