"use server";

import { db, supplierEmails } from "@/db";

export interface EmailAttachment {
  name: string;
  url: string;
  size: string;
  mimeType: string;
}

export interface SupplierEmailItem {
  id: number;
  supplierId: number | null;
  supplierName: string;
  direction: "SORTANT" | "ENTRANT";
  fromAddress: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  status: "ENVOYE" | "RECU" | "ECHEC" | "BROUILLON";
  isRead: boolean;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
  sentAt: string;
  createdAt: string;
}

// Données initiales en mémoire
let memoryEmails: SupplierEmailItem[] = [
  {
    id: 1,
    supplierId: 1,
    supplierName: "Bashan Motorcycle Industrial Co., Ltd",
    direction: "ENTRANT",
    fromAddress: "export@bashanmotor.com",
    toAddress: "contact@bmmotors.ma",
    subject: "Proforma Invoice & Shipping Schedule - Container 40ft (Tanger Med)",
    bodyText: `Dear Alexis,

Hope this email finds you well.

Please find attached the final Proforma Invoice (PI-BSH-2026-902) for your order of spare parts (Cylinder blocks 250cc, PZ30 carburetors, brake pads, and complete clutch sets).

Container loading is scheduled for next Tuesday at Chongqing Port, transiting to Shanghai, with final destination Tanger Med Port, Morocco.
Estimated transit time: 32 days.

Please arrange the 30% advance deposit via TT bank transfer so we can release the Bill of Lading (B/L).

Best regards,
Chen Wei - International Sales Director
Chongqing Bashan Motorcycle Industrial Co., Ltd.`,
    bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1f2937;">
<p>Dear Alexis,</p>
<p>Hope this email finds you well.</p>
<p>Please find attached the final <strong>Proforma Invoice (PI-BSH-2026-902)</strong> for your order of spare parts (Cylinder blocks 250cc, PZ30 carburetors, brake pads, and complete clutch sets).</p>
<p>Container loading is scheduled for next Tuesday at Chongqing Port, transiting to Shanghai, with final destination <strong>Tanger Med Port, Morocco</strong>.<br/>
Estimated transit time: 32 days.</p>
<p>Please arrange the 30% advance deposit via TT bank transfer so we can release the Bill of Lading (B/L).</p>
<p>Best regards,<br/>
<strong>Chen Wei</strong> - <em>International Sales Director</em><br/>
Chongqing Bashan Motorcycle Industrial Co., Ltd.</p>
</div>`,
    status: "RECU",
    isRead: false,
    hasAttachments: true,
    attachments: [
      {
        name: "Proforma_Invoice_PI-BSH-2026-902.pdf",
        url: "#",
        size: "340 Ko",
        mimeType: "application/pdf",
      },
      {
        name: "Packing_List_Container_40ft.xlsx",
        url: "#",
        size: "185 Ko",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
    sentAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: 2,
    supplierId: 2,
    supplierName: "Grossiste Pièces Moto Derb Omar",
    direction: "ENTRANT",
    fromAddress: "abdelkrim.pieces@gmail.com",
    toAddress: "contact@bmmotors.ma",
    subject: "Disponibilité immédiate kit chaînes 428H Gold & Bougies NGK",
    bodyText: `Salam Alexis,

Faisant suite à votre appel de ce matin, je vous confirme que nous avons reçu l'arrivage de kits chaînes renforcés 428H Gold (136 maillons) et les bougies NGK D8EA.
Les prix convenus sont :
- Kit chaîne 428H : 110 DH HT / pièce (remise 5% sur lot de 20 pièces)
- Bougies NGK D8EA : 18 DH HT / pièce

Le livreur peut déposer le colis à votre magasin de Derb Ghallef cet après-midi vers 16h30 avec le Bon de Livraison.

Cordialement,
Hajj Abdelkrim - Comptoir Derb Omar`,
    bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1f2937;">
<p>Salam Alexis,</p>
<p>Faisant suite à votre appel de ce matin, je vous confirme que nous avons reçu l'arrivage de <strong>kits chaînes renforcés 428H Gold (136 maillons)</strong> et les <strong>bougies NGK D8EA</strong>.</p>
<p>Les prix convenus sont :<br/>
• Kit chaîne 428H : 110 DH HT / pièce (remise 5% sur lot de 20 pièces)<br/>
• Bougies NGK D8EA : 18 DH HT / pièce</p>
<p>Le livreur peut déposer le colis à votre magasin de Derb Ghallef cet après-midi vers 16h30 avec le Bon de Livraison.</p>
<p>Cordialement,<br/>
<strong>Hajj Abdelkrim</strong> - <em>Comptoir Derb Omar</em></p>
</div>`,
    status: "RECU",
    isRead: false,
    hasAttachments: false,
    attachments: [],
    sentAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  },
  {
    id: 3,
    supplierId: 1,
    supplierName: "Bashan Motorcycle Industrial Co., Ltd",
    direction: "SORTANT",
    fromAddress: "contact@bmmotors.ma",
    toAddress: "export@bashanmotor.com",
    subject: "Bon de Commande Pièces Détachées - BC-2026-089 (SARL BM Motors)",
    bodyText: `Dear Chen Wei,

Please find attached our official Purchase Order BC-2026-089 for the upcoming batch.
We have confirmed the quantities for:
- 100x Brake pads Bashan 200/250cc
- 50x Carburetors PZ30
- 30x Complete wire harness

Please prepare the proforma invoice so we can initiate the bank transfer.

Best regards,
Alexis - Gérant
SARL BM Motors Casablanca`,
    bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1f2937;">
<p>Dear Chen Wei,</p>
<p>Please find attached our official <strong>Purchase Order BC-2026-089</strong> for the upcoming batch.<br/>
We have confirmed the quantities for :<br/>
• 100x Plaquettes de frein Bashan 200/250cc<br/>
• 50x Carburateurs PZ30<br/>
• 30x Faisceaux électriques complets</p>
<p>Please prepare the proforma invoice so we can initiate the bank transfer.</p>
<p>Best regards,<br/>
<strong>Alexis</strong> - <em>Gérant</em><br/>
SARL BM Motors Casablanca</p>
</div>`,
    status: "ENVOYE",
    isRead: true,
    hasAttachments: true,
    attachments: [
      {
        name: "Bon_de_Commande_BC-2026-089.pdf",
        url: "#",
        size: "210 Ko",
        mimeType: "application/pdf",
      },
    ],
    sentAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
  },
  {
    id: 4,
    supplierId: 3,
    supplierName: "Maghreb Pneus & Accessoires SARL",
    direction: "ENTRANT",
    fromAddress: "commandes@maghrebpneus.ma",
    toAddress: "contact@bmmotors.ma",
    subject: "Avis d'expédition commande pneus Quads 10 pouces",
    bodyText: `Bonjour Alexis,

Votre commande de 15 pneus Quads 21x7-10 et 15 pneus 20x10-10 est expédiée.
Notre chauffeur sera à Derb Ghallef demain matin à 10h00.
Facture n° MP-2026-441 jointe.

Salutations,
Karim Bennani - Maghreb Pneus`,
    bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1f2937;">
<p>Bonjour Alexis,</p>
<p>Votre commande de <strong>15 pneus Quads 21x7-10</strong> et <strong>15 pneus 20x10-10</strong> est expédiée.<br/>
Notre chauffeur sera à Derb Ghallef demain matin à 10h00.<br/>
Facture n° MP-2026-441 jointe.</p>
<p>Salutations,<br/>
<strong>Karim Bennani</strong> - <em>Maghreb Pneus</em></p>
</div>`,
    status: "RECU",
    isRead: true,
    hasAttachments: true,
    attachments: [
      {
        name: "Facture_MP-2026-441.pdf",
        url: "#",
        size: "160 Ko",
        mimeType: "application/pdf",
      },
    ],
    sentAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
  },
];

/**
 * Récupère les courriels avec filtres
 */
export async function getSupplierEmails(options?: {
  folder?: "INBOX" | "SENT" | "ALL";
  supplierId?: number;
  search?: string;
}) {
  const folder = options?.folder || "ALL";
  const search = options?.search?.toLowerCase().trim() || "";
  const supplierId = options?.supplierId;

  return memoryEmails
    .filter((email) => {
      if (folder === "INBOX" && email.direction !== "ENTRANT") return false;
      if (folder === "SENT" && email.direction !== "SORTANT") return false;
      if (supplierId && email.supplierId !== supplierId) return false;

      if (search) {
        const matchSubject = email.subject.toLowerCase().includes(search);
        const matchSender = email.fromAddress.toLowerCase().includes(search);
        const matchSupplier = email.supplierName.toLowerCase().includes(search);
        const matchBody = email.bodyText.toLowerCase().includes(search);
        if (!matchSubject && !matchSender && !matchSupplier && !matchBody) return false;
      }

      return true;
    })
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

/**
 * Envoie un courriel à un fournisseur
 */
export async function sendSupplierEmail(data: {
  supplierId: number;
  supplierName: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
}): Promise<SupplierEmailItem> {
  if (!data.toAddress || !data.subject || !data.bodyText) {
    throw new Error("L'adresse destinataire, l'objet et le message sont obligatoires.");
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  // Envoi réel via Resend si la clé est fournie
  if (resendApiKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "BM Motors <contact@bmmotors.ma>",
          to: [data.toAddress],
          subject: data.subject,
          text: data.bodyText,
          html: data.bodyHtml || `<p>${data.bodyText.replace(/\n/g, "<br/>")}</p>`,
        }),
      });
    } catch (err) {
      console.warn("Erreur envoi Resend, enregistrement local de secours:", err);
    }
  }

  const newEmail: SupplierEmailItem = {
    id: Date.now(),
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    direction: "SORTANT",
    fromAddress: "contact@bmmotors.ma",
    toAddress: data.toAddress,
    subject: data.subject,
    bodyText: data.bodyText,
    bodyHtml: data.bodyHtml || `<p>${data.bodyText.replace(/\n/g, "<br/>")}</p>`,
    status: "ENVOYE",
    isRead: true,
    hasAttachments: (data.attachments && data.attachments.length > 0) || false,
    attachments: data.attachments || [],
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  memoryEmails.unshift(newEmail);
  return newEmail;
}

/**
 * Marque un courriel comme lu
 */
export async function markEmailAsRead(id: number) {
  const email = memoryEmails.find((e) => e.id === id);
  if (email) {
    email.isRead = true;
  }
  return { success: true };
}

/**
 * Supprime un courriel
 */
export async function deleteSupplierEmail(id: number) {
  memoryEmails = memoryEmails.filter((e) => e.id !== id);
  return { success: true };
}

/**
 * Récupère le nombre d'emails non lus
 */
export async function getUnreadEmailsCount(): Promise<number> {
  return memoryEmails.filter((e) => e.direction === "ENTRANT" && !e.isRead).length;
}
