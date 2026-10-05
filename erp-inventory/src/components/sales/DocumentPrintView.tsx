"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Printer, Share2, Mail, X, Check, AlertCircle } from "lucide-react";
import { SalesDocumentItem, sendDocumentByEmail } from "@/lib/actions/sales";
import { formatMoney } from "@/lib/money";

interface DocumentPrintViewProps {
  document: SalesDocumentItem;
  onClose: () => void;
}

export function DocumentPrintView({ document: doc, onClose }: DocumentPrintViewProps) {
  const [recipientEmail, setRecipientEmail] = useState(doc.customerEmail || "");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Impression native A4 (compatible iPhone AirPrint et PC)
  const handlePrint = () => {
    window.print();
  };

  // Partage WhatsApp via Web Share API sur smartphone ou lien wa.me
  const handleShareWhatsApp = async () => {
    const textMessage = `*SARL BM MOTORS - Bon de Livraison N° ${doc.docNumber}*\nDate: ${new Date(
      doc.docDate
    ).toLocaleDateString("fr-FR")}\nClient: ${doc.customerName}\nTotal TTC: ${formatMoney(
      doc.totalTtcCents
    )}\n\nMerci de votre confiance.`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Bon de Livraison ${doc.docNumber}`,
          text: textMessage,
        });
        return;
      } catch {
        // Fallback wa.me
      }
    }

    const cleanPhone = (doc.customerPhone || "").replace(/\D/g, "");
    const waUrl = cleanPhone
      ? `https://wa.me/212${cleanPhone.startsWith("0") ? cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(textMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(textMessage)}`;
    window.open(waUrl, "_blank");
  };

  // Envoi d'email via Resend
  const handleSendEmail = async () => {
    if (!recipientEmail.trim()) {
      setEmailStatus({ success: false, message: "Veuillez saisir une adresse email valide." });
      return;
    }

    try {
      setIsSendingEmail(true);
      setEmailStatus(null);
      const res = await sendDocumentByEmail({
        documentId: doc.id,
        recipientEmail: recipientEmail.trim(),
      });
      setEmailStatus(res);
    } catch (err: any) {
      setEmailStatus({ success: false, message: err.message || "Erreur lors de l'envoi de l'email" });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      {/* ======================================================== */}
      {/* CONTENEUR PRINCIPAL DU DOCUMENT                         */}
      {/* ======================================================== */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] my-6 flex flex-col max-h-[92vh] overflow-hidden">
        {/* BARRE D'ACTIONS DU HAUT (MASQUÉE À L'IMPRESSION) */}
        <div className="print:hidden flex items-center justify-between px-6 py-3.5 bg-[#111827] text-white">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Aperçu & Impression A4</span>
            <span className="text-xs bg-[#F7162D] px-2 py-0.5 rounded font-mono font-bold">
              {doc.docNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-[#F7162D] hover:bg-[#D90E23] text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-all"
            >
              <Printer size={15} />
              <span>Imprimer A4</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-all"
            >
              <Share2 size={15} />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors ml-2"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* BARRE D'ENVOI EMAIL RESEND (MASQUÉE À L'IMPRESSION) */}
        <div className="print:hidden px-6 py-2.5 bg-[#F8F9FA] border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Mail size={15} className="text-[#2563EB] shrink-0" />
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Email du client ou fournisseur..."
              className="flex-1 px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-xs outline-none focus:border-[#2563EB]"
            />
            <button
              onClick={handleSendEmail}
              disabled={isSendingEmail}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-3 py-1.5 rounded-lg shrink-0 disabled:opacity-50"
            >
              {isSendingEmail ? "Envoi..." : "Envoyer par Resend"}
            </button>
          </div>

          {emailStatus && (
            <span
              className={`flex items-center gap-1 text-[11px] font-semibold ${
                emailStatus.success ? "text-[#059669]" : "text-[#F7162D]"
              }`}
            >
              {emailStatus.success ? <Check size={14} /> : <AlertCircle size={14} />}
              {emailStatus.message}
            </span>
          )}
        </div>

        {/* ======================================================== */}
        {/* CORPS DE LA PAGE FORMAT A4 (IMPRIMABLE)                  */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-8 sm:p-12 print:p-0 print:overflow-visible bg-white text-[#111827]">
          <div className="max-w-[210mm] mx-auto space-y-6">
            {/* 1. EN-TÊTE DU BON DE LIVRAISON */}
            <div className="flex justify-between items-start border-b-2 border-[#111827] pb-6">
              {/* Logo & Coordonnées Société */}
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12">
                    <Image
                      src="/bashan-logo.png"
                      alt="Logo Bashan"
                      width={48}
                      height={48}
                      className="object-contain"
                    />
                  </div>
                  <div>
                    <h1 className="font-black text-xl tracking-tight text-[#111827]">
                      SARL BM MOTORS
                    </h1>
                    <p className="text-xs font-semibold text-[#F7162D]">
                      Pièces Détachées Motos & Quads
                    </p>
                  </div>
                </div>

                <div className="text-[11px] text-[#4B5563] pt-2 space-y-0.5">
                  <p>Angle Bd Moulay Ismail & Rue Al Fourat, Ain Sebaa, Casablanca</p>
                  <p>Tél : +212 5 22 35 44 20 • GSM : +212 6 61 28 90 12</p>
                  <p className="font-semibold text-[#111827]">
                    ICE : 001892837000045 • IF : 40291823 • RC : 389201 Casablanca
                  </p>
                  <p>Taxe Professionnelle : 35290184 • Régime TVA : 10%</p>
                </div>
              </div>

              {/* Bloc N° Document & Date */}
              <div className="text-right space-y-1">
                <div className="inline-block bg-[#F7162D] text-white px-3 py-1 rounded text-sm font-black tracking-wider uppercase">
                  {doc.docType === "FACTURE" ? "FACTURE" : "BON DE LIVRAISON"}
                </div>
                <div className="font-mono font-black text-lg text-[#111827]">
                  {doc.docNumber}
                </div>
                <div className="text-xs text-[#4B5563]">
                  Date : <strong>{new Date(doc.docDate).toLocaleDateString("fr-FR")}</strong> à{" "}
                  {new Date(doc.docDate).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="text-xs">
                  Statut :{" "}
                  <span className="font-bold text-[#059669]">
                    {doc.status === "PAYE" ? "ACQUITTÉ / PAYÉ" : "LIVRÉ / VALIDÉ"}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. BLOC CLIENT */}
            <div className="flex justify-between items-start bg-[#F8F9FA] p-4 rounded-xl border border-[#E5E7EB]">
              <div>
                <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block">
                  Destinataire / Client
                </span>
                <p className="font-bold text-sm text-[#111827] mt-0.5">
                  {doc.customerName}
                </p>
                {doc.customerPhone && (
                  <p className="text-xs text-[#4B5563]">Tél : {doc.customerPhone}</p>
                )}
                {doc.customerCity && (
                  <p className="text-xs text-[#4B5563]">Ville : {doc.customerCity}</p>
                )}
              </div>

              {doc.customerIce && (
                <div className="text-right">
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block">
                    Identifiant Légal Client
                  </span>
                  <p className="text-xs font-mono font-bold text-[#111827] mt-0.5">
                    ICE : {doc.customerIce}
                  </p>
                </div>
              )}
            </div>

            {/* 3. TABLEAU DES ARTICLES */}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-[#111827] bg-[#F8F9FA] text-[11px] font-black text-[#111827] uppercase">
                  <th className="py-2.5 px-3">Réf / OEM</th>
                  <th className="py-2.5 px-3">Désignation de la pièce</th>
                  <th className="py-2.5 px-3 text-center">Qté</th>
                  <th className="py-2.5 px-3 text-right">P.U. HT</th>
                  <th className="py-2.5 px-3 text-right">Total HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs">
                {doc.lines.map((line, idx) => (
                  <tr key={idx} className="leading-normal">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#111827]">
                      {line.sku}
                      {line.oemCode && (
                        <span className="block text-[9px] text-[#6B7280] font-normal">
                          {line.oemCode}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#111827]">
                      {line.productName}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold font-mono">
                      {line.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatMoney(line.unitPriceHTCents)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#111827]">
                      {formatMoney(line.totalHtCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 4. BLOC DES TOTAUX AVEC REMISE PERSONNALISÉE MENTIONNÉE SOUS LE TOTAL HT */}
            <div className="flex justify-end pt-2">
              <div className="w-80 space-y-1.5 bg-[#F8F9FA] p-4 rounded-xl border border-[#E5E7EB]">
                {/* 1. TOTAL BRUT HT */}
                <div className="flex justify-between text-xs text-[#374151]">
                  <span className="font-semibold">TOTAL BRUT HT :</span>
                  <span className="font-mono font-bold text-[#111827]">
                    {formatMoney(doc.totalBrutHtCents)}
                  </span>
                </div>

                {/* 2. REMISE PERSONNALISÉE (%) MENTIONNÉE SOUS LE TOTAL BRUT HT */}
                {doc.discountPercent > 0 ? (
                  <div className="flex justify-between text-xs text-[#059669] font-bold border-y border-[#E5E7EB] py-1 bg-[#ECFDF5]/60 -mx-4 px-4">
                    <span>REMISE ACCORDÉE ({doc.discountPercent}%) :</span>
                    <span className="font-mono">
                      -{formatMoney(doc.discountAmountCents)}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between text-[11px] text-[#6B7280]">
                    <span>Remise commerciale :</span>
                    <span className="font-mono">0,00 DH</span>
                  </div>
                )}

                {/* 3. TOTAL NET HT */}
                <div className="flex justify-between text-xs font-semibold text-[#111827] pt-0.5">
                  <span>TOTAL NET HT :</span>
                  <span className="font-mono font-bold">
                    {formatMoney(doc.totalNetHtCents)}
                  </span>
                </div>

                {/* 4. TVA (10%) */}
                <div className="flex justify-between text-xs text-[#374151]">
                  <span>TVA (10% SARL) :</span>
                  <span className="font-mono font-bold text-[#111827]">
                    {formatMoney(doc.tvaAmountCents)}
                  </span>
                </div>

                {/* 5. TOTAL TTC (NET À PAYER) */}
                <div className="flex justify-between text-sm font-black text-white bg-[#F7162D] p-2.5 rounded-lg -mx-2 mt-2">
                  <span>NET À PAYER (TTC) :</span>
                  <span className="font-mono tracking-tight">
                    {formatMoney(doc.totalTtcCents)}
                  </span>
                </div>

                {/* Règlement */}
                <div className="pt-2 text-[11px] text-[#6B7280] flex justify-between">
                  <span>Mode de règlement :</span>
                  <span className="font-bold text-[#111827]">
                    {doc.paymentMethod === "ESPECES"
                      ? "Espèces"
                      : doc.paymentMethod === "CHEQUE"
                      ? "Chèque bancaire"
                      : doc.paymentMethod === "EFFET_LCN"
                      ? "Effet de commerce (LCN)"
                      : doc.paymentMethod === "VIREMENT"
                      ? "Virement bancaire"
                      : "À Crédit (En compte)"}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. SIGNATURES & CACHET */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-[#E5E7EB] text-xs">
              <div className="border border-dashed border-[#9CA3AF] rounded-xl p-4 h-28 flex flex-col justify-between">
                <span className="font-bold text-[#4B5563] text-center block">
                  Cachet & Signature du Client (Reçu conforme)
                </span>
                <span className="text-[10px] text-[#9CA3AF] text-center">
                  Mention manuscrite &quot;Bon pour accord&quot;
                </span>
              </div>

              <div className="border border-dashed border-[#9CA3AF] rounded-xl p-4 h-28 flex flex-col justify-between">
                <span className="font-bold text-[#F7162D] text-center block">
                  Pour SARL BM MOTORS
                </span>
                <span className="text-[10px] text-[#9CA3AF] text-center">
                  Cachet commercial & Visa
                </span>
              </div>
            </div>

            {/* 6. PIED DE PAGE LÉGAL MAROCAIN */}
            <div className="pt-4 text-center text-[10px] text-[#6B7280] border-t border-[#E5E7EB]">
              <p>
                SARL BM MOTORS au Capital de 100 000 DH • ICE : 001892837000045 • IF : 40291823 • RC : 389201 Casablanca
              </p>
              <p>Les marchandises voyagent aux risques et périls du destinataire. Tout retour de pièce doit être préalablement autorisé.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
