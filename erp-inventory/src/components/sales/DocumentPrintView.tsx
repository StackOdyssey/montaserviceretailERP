"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Printer, Share2, Mail, X, Check, AlertCircle } from "lucide-react";
import {
  SalesDocumentItem,
  sendDocumentByEmail,
  getDocumentPrintContext,
  type DocumentPrintContext,
} from "@/lib/actions/sales";
import { formatMoney } from "@/lib/money";

interface DocumentPrintViewProps {
  document: SalesDocumentItem;
  onClose: () => void;
}

export function DocumentPrintView({ document: doc, onClose }: DocumentPrintViewProps) {
  const [recipientEmail, setRecipientEmail] = useState(doc.customerEmail || "");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [ctx, setCtx] = useState<DocumentPrintContext | null>(null);

  useEffect(() => {
    let active = true;
    getDocumentPrintContext(doc.id)
      .then((c) => {
        if (active) setCtx(c);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [doc.id]);

  const company = ctx?.company ?? null;
  const docLabel = ctx?.docLabel ?? (doc.docType === "FACTURE" ? "FACTURE" : "BON DE LIVRAISON");
  // Décision propriétaire (Q13–Q16) : seule la remise est affichée sur les documents.
  // La TVA reste saisie dans les paramètres mais n'est jamais affichée sur un document
  // (BL, FAC, BC, DEVIS, AV).
  const showVat = false;
  const priceBasis = ctx?.vatDisplay.priceBasis ?? "TTC";
  const showDiscount = true;
  const rate = doc.tvaRate || 20;

  const lineDisplay = (line: SalesDocumentItem["lines"][number]) => {
    if (showVat) {
      return { unit: line.unitPriceHTCents, total: line.totalHtCents, unitLabel: "P.U. HT", totalLabel: "Total HT" };
    }
    if (priceBasis === "TTC") {
      const r = line.tvaRate ?? rate;
      return {
        unit: Math.round(line.unitPriceHTCents * (1 + r / 100)),
        total: Math.round(line.totalHtCents * (1 + r / 100)),
        unitLabel: "P.U.",
        totalLabel: "Total",
      };
    }
    return { unit: line.unitPriceHTCents, total: line.totalHtCents, unitLabel: "P.U.", totalLabel: "Total" };
  };

  const handlePrint = () => window.print();

  const handleShareWhatsApp = async () => {
    const textMessage = `*${company?.raisonSociale || "BM MOTORS"} - ${docLabel} N° ${doc.docNumber}*\nDate: ${new Date(
      doc.docDate
    ).toLocaleDateString("fr-FR")}\nClient: ${doc.customerName}\nTotal: ${formatMoney(doc.totalTtcCents)}\n\nMerci de votre confiance.`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `${docLabel} ${doc.docNumber}`, text: textMessage });
        return;
      } catch {
        // fallback wa.me
      }
    }
    const cleanPhone = (doc.customerPhone || "").replace(/\D/g, "");
    const waUrl = cleanPhone
      ? `https://wa.me/212${cleanPhone.startsWith("0") ? cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(textMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(textMessage)}`;
    window.open(waUrl, "_blank");
  };

  const handleSendEmail = async () => {
    if (!recipientEmail.trim()) {
      setEmailStatus({ success: false, message: "Veuillez saisir une adresse email valide." });
      return;
    }
    try {
      setIsSendingEmail(true);
      setEmailStatus(null);
      const res = await sendDocumentByEmail({ documentId: doc.id, recipientEmail: recipientEmail.trim() });
      setEmailStatus(res);
    } catch (err) {
      setEmailStatus({ success: false, message: (err as Error).message || "Erreur lors de l'envoi de l'email" });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const paymentLabel =
    doc.paymentMethod === "ESPECES"
      ? "Espèces"
      : doc.paymentMethod === "CHEQUE"
        ? "Chèque bancaire"
        : doc.paymentMethod === "EFFET_LCN"
          ? "Effet de commerce (LCN)"
          : doc.paymentMethod === "VIREMENT"
            ? "Virement bancaire"
            : "À Crédit (En compte)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] my-6 flex flex-col max-h-[92vh] overflow-hidden">
        <div className="print:hidden flex items-center justify-between px-6 py-3.5 bg-[#111827] text-white">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Aperçu & Impression A4</span>
            <span className="text-xs bg-[#F7162D] px-2 py-0.5 rounded font-mono font-bold">{doc.docNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 bg-[#F7162D] hover:bg-[#D90E23] text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-all">
              <Printer size={15} />
              <span>Imprimer A4</span>
            </button>
            <button onClick={handleShareWhatsApp} className="flex items-center gap-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm transition-all">
              <Share2 size={15} />
              <span>WhatsApp</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors ml-2">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="print:hidden px-6 py-2.5 bg-[#F8F9FA] border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Mail size={15} className="text-[#2563EB] shrink-0" />
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Email du client..."
              className="flex-1 px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-xs outline-none focus:border-[#2563EB]"
            />
            <button onClick={handleSendEmail} disabled={isSendingEmail} className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-3 py-1.5 rounded-lg shrink-0 disabled:opacity-50">
              {isSendingEmail ? "Envoi..." : "Envoyer par Resend"}
            </button>
          </div>
          {emailStatus && (
            <span className={`flex items-center gap-1 text-[11px] font-semibold ${emailStatus.success ? "text-[#059669]" : "text-[#F7162D]"}`}>
              {emailStatus.success ? <Check size={14} /> : <AlertCircle size={14} />}
              {emailStatus.message}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 sm:p-12 print:p-0 print:overflow-visible bg-white text-[#111827]">
          <div className="max-w-[210mm] mx-auto space-y-6">
            {/* EN-TÊTE */}
            <div className="flex justify-between items-start border-b-2 border-[#111827] pb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12">
                    <Image src={company?.logoUrl || "/bashan-logo.png"} alt="Logo" width={48} height={48} className="object-contain" />
                  </div>
                  <div>
                    <h1 className="font-black text-xl tracking-tight text-[#111827]">{company?.raisonSociale || ""}</h1>
                    <p className="text-xs font-semibold text-[#F7162D]">{company?.tradeName || ""}</p>
                  </div>
                </div>
                <div className="text-[11px] text-[#4B5563] pt-2 space-y-0.5">
                  {company?.address && <p>{company.address}</p>}
                  {(company?.city || company?.phone || company?.email) && (
                    <p>
                      {company.city ? `${company.city} • ` : ""}
                      {company.phone ? `Tél : ${company.phone}` : ""}
                      {company.email ? ` • ${company.email}` : ""}
                    </p>
                  )}
                  {company?.ice && (
                    <p className="font-semibold text-[#111827]">
                      ICE : {company.ice}
                      {company.identifiantFiscal ? ` • IF : ${company.identifiantFiscal}` : ""}
                      {company.registreCommerce ? ` • RC : ${company.registreCommerce}` : ""}
                    </p>
                  )}
                  {company?.taxeProfessionnelle && <p>Taxe Professionnelle : {company.taxeProfessionnelle}</p>}
                </div>
              </div>

              <div className="text-right space-y-1">
                <div className="inline-block bg-[#F7162D] text-white px-3 py-1 rounded text-sm font-black tracking-wider uppercase">
                  {docLabel}
                </div>
                <div className="font-mono font-black text-lg text-[#111827]">{doc.docNumber}</div>
                <div className="text-xs text-[#4B5563]">
                  Date : <strong>{new Date(doc.docDate).toLocaleDateString("fr-FR")}</strong>
                </div>
                <div className="text-xs">
                  Statut :{" "}
                  <span className="font-bold text-[#059669]">
                    {doc.status === "PAYE" ? "ACQUITTÉ / PAYÉ" : "VALIDÉ"}
                  </span>
                </div>
              </div>
            </div>

            {/* CLIENT */}
            <div className="flex justify-between items-start bg-[#F8F9FA] p-4 rounded-xl border border-[#E5E7EB]">
              <div>
                <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block">Destinataire / Client</span>
                <p className="font-bold text-sm text-[#111827] mt-0.5">{doc.customerName}</p>
                {doc.customerPhone && <p className="text-xs text-[#4B5563]">Tél : {doc.customerPhone}</p>}
                {doc.customerCity && <p className="text-xs text-[#4B5563]">Ville : {doc.customerCity}</p>}
              </div>
              {doc.customerIce && (
                <div className="text-right">
                  <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block">Identifiant Légal Client</span>
                  <p className="text-xs font-mono font-bold text-[#111827] mt-0.5">ICE : {doc.customerIce}</p>
                </div>
              )}
            </div>

            {/* ARTICLES */}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-[#111827] bg-[#F8F9FA] text-[11px] font-black text-[#111827] uppercase">
                  <th className="py-2.5 px-3">Réf / OEM</th>
                  <th className="py-2.5 px-3">Désignation</th>
                  <th className="py-2.5 px-3 text-center">Qté</th>
                  <th className="py-2.5 px-3 text-right">{showVat ? "P.U. HT" : "P.U."}</th>
                  <th className="py-2.5 px-3 text-right">{showVat ? "Total HT" : "Total"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs">
                {doc.lines.map((line, idx) => {
                  const disp = lineDisplay(line);
                  return (
                    <tr key={idx} className="leading-normal">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#111827]">
                        {line.sku}
                        {line.oemCode && <span className="block text-[9px] text-[#6B7280] font-normal">{line.oemCode}</span>}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[#111827]">{line.productName}</td>
                      <td className="py-2.5 px-3 text-center font-bold font-mono">{line.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatMoney(disp.unit)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#111827]">{formatMoney(disp.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* TOTAUX — TVA masquée sur les lignes PIECES (BL/BC/etc.) */}
            <div className="flex justify-end pt-2">
              <div className="w-80 space-y-1.5 bg-[#F8F9FA] p-4 rounded-xl border border-[#E5E7EB]">
                <div className="flex justify-between text-xs text-[#374151]">
                  <span className="font-semibold">{showVat ? "TOTAL BRUT HT :" : "TOTAL BRUT :"}</span>
                  <span className="font-mono font-bold text-[#111827]">{formatMoney(doc.totalBrutHtCents)}</span>
                </div>

                {showDiscount && doc.discountPercent > 0 && (
                  <div className="flex justify-between text-xs text-[#059669] font-bold border-y border-[#E5E7EB] py-1 bg-[#ECFDF5]/60 -mx-4 px-4">
                    <span>REMISE ACCORDÉE ({doc.discountPercent}%) :</span>
                    <span className="font-mono">-{formatMoney(doc.discountAmountCents)}</span>
                  </div>
                )}

                {showVat ? (
                  <>
                    <div className="flex justify-between text-xs font-semibold text-[#111827] pt-0.5">
                      <span>TOTAL NET HT :</span>
                      <span className="font-mono font-bold">{formatMoney(doc.totalNetHtCents)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#374151]">
                      <span>TVA ({rate}%) :</span>
                      <span className="font-mono font-bold text-[#111827]">{formatMoney(doc.tvaAmountCents)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-white bg-[#F7162D] p-2.5 rounded-lg -mx-2 mt-2">
                      <span>NET À PAYER (TTC) :</span>
                      <span className="font-mono tracking-tight">{formatMoney(doc.totalTtcCents)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-sm font-black text-white bg-[#F7162D] p-2.5 rounded-lg -mx-2 mt-2">
                    <span>TOTAL :</span>
                    <span className="font-mono tracking-tight">
                      {formatMoney(priceBasis === "TTC" ? doc.totalTtcCents : doc.totalNetHtCents)}
                    </span>
                  </div>
                )}

                <div className="pt-2 text-[11px] text-[#6B7280] flex justify-between">
                  <span>Mode de règlement :</span>
                  <span className="font-bold text-[#111827]">{paymentLabel}</span>
                </div>
              </div>
            </div>

            {/* SIGNATURES */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-[#E5E7EB] text-xs">
              <div className="border border-dashed border-[#9CA3AF] rounded-xl p-4 h-28 flex flex-col justify-between">
                <span className="font-bold text-[#4B5563] text-center block">Cachet & Signature du Client (Reçu conforme)</span>
                <span className="text-[10px] text-[#9CA3AF] text-center">Mention manuscrite &quot;Bon pour accord&quot;</span>
              </div>
              <div className="border border-dashed border-[#9CA3AF] rounded-xl p-4 h-28 flex flex-col justify-between">
                <span className="font-bold text-[#F7162D] text-center block">{company?.raisonSociale ? `Pour ${company.raisonSociale}` : "Pour la société"}</span>
                <span className="text-[10px] text-[#9CA3AF] text-center">Cachet commercial & Visa</span>
              </div>
            </div>

            {/* PIED DE PAGE */}
            {company?.footerText ? (
              <div className="pt-4 text-center text-[10px] text-[#6B7280] border-t border-[#E5E7EB] whitespace-pre-line">
                {company.footerText}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
