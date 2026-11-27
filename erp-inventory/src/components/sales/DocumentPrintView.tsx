"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Printer, Share2, Mail, X, Check, AlertCircle } from "lucide-react";
import { SalesDocumentItem } from "@/lib/actions/sales";
import {
  sendDocumentByEmail,
  getDocumentPrintContext,
  type DocumentPrintContext,
} from "@/lib/actions/sales-documents";
import { formatMoney } from "@/lib/money";
import { unwrap } from "@/lib/action-result";
import { amountInWordsMAD } from "@/lib/amount-in-words";
import { conditionLabel } from "@/lib/payment-terms";

interface DocumentPrintViewProps {
  document: SalesDocumentItem;
  onClose: () => void;
}

/** Montant en dirhams, 2 décimales, sans devise (comme sur le modèle papier). */
function num(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DocumentPrintView({ document: doc, onClose }: DocumentPrintViewProps) {
  const [recipientEmail, setRecipientEmail] = useState(doc.customerEmail || "");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [ctx, setCtx] = useState<DocumentPrintContext | null>(null);

  useEffect(() => {
    let active = true;
    getDocumentPrintContext(doc.id)
      .then((r) => {
        if (active && r.ok) setCtx(r.value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [doc.id]);

  const company = ctx?.company ?? null;
  const docLabel = ctx?.docLabel ?? (doc.docType === "FACTURE" ? "FACTURE" : "BON DE LIVRAISON");
  // Décision propriétaire (Q13–Q16) : seule la remise est affichée sur les documents ;
  // la TVA n'est jamais rendue à l'impression (elle reste saisie dans les paramètres).
  // Exception légale : une FACTURE/AVOIR validée en régime assujetti (TVA calculée)
  // doit montrer HT / TVA / TTC — jamais le cas en régime non-assujetti.
  const showDiscount = true;
  const showVatTotals =
    (doc.docType === "FACTURE" || doc.docType === "AVOIR") && Boolean(ctx?.vatDisplay.showVat) && doc.tvaAmountCents > 0;
  const arretePrefix: Record<string, string> = {
    FACTURE: "Arrêtée la présente facture",
    AVOIR: "Arrêté le présent avoir",
    BL: "Arrêté le présent bon de livraison",
    BC: "Arrêté le présent bon de commande",
    DEVIS: "Arrêté le présent devis",
  };
  const legalIds = [
    company?.ice && `ICE : ${company.ice}`,
    company?.identifiantFiscal && `IF : ${company.identifiantFiscal}`,
    company?.registreCommerce &&
      `RC : ${company.registreCommerce}${company.rcTribunal ? ` (${company.rcTribunal})` : ""}`,
    company?.taxeProfessionnelle && `TP : ${company.taxeProfessionnelle}`,
    company?.cnss && `CNSS : ${company.cnss}`,
  ].filter(Boolean) as string[];
  const conditionText = conditionLabel(doc.paymentCondition);

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
      const res = unwrap(await sendDocumentByEmail({ documentId: doc.id, recipientEmail: recipientEmail.trim() }));
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
            : doc.paymentMethod === "CARTE_BANCAIRE"
              ? "Carte bancaire (TPE)"
              : doc.paymentMethod === "VERSEMENT"
                ? "Versement bancaire"
                : doc.paymentMethod === "A_CREDIT"
                  ? "À Crédit (En compte)"
                  : "—";

  const commercial = doc.customerPhone ? `${doc.customerName} Tél :${doc.customerPhone}` : doc.customerName;
  const lieuLivraison = doc.customerCity || "—";
  const fillerRows = Math.max(0, 14 - doc.lines.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto print:static print:overflow-visible print:bg-transparent print:backdrop-blur-none print:p-0">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] my-6 flex flex-col max-h-[92vh] overflow-hidden print:shadow-none print:border-0 print:rounded-none print:my-0 print:max-h-none print:overflow-visible">
        {/* Barre d'outils (non imprimée) */}
        <div className="print:hidden flex items-center justify-between px-6 py-3.5 bg-[#111827] text-white">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Aperçu & Impression A4</span>
            <span className="text-xs bg-[#F7162D] px-2 py-0.5 rounded font-mono font-bold">{doc.docNumber}</span>
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
              className={`flex items-center gap-1 text-[11px] font-semibold ${emailStatus.success ? "text-[#059669]" : "text-[#F7162D]"}`}
            >
              {emailStatus.success ? <Check size={14} /> : <AlertCircle size={14} />}
              {emailStatus.message}
            </span>
          )}
        </div>

        {/* Document imprimable (modèle papier BM Motors) */}
        <div className="flex-1 overflow-y-auto p-8 sm:p-12 print:p-0 print:overflow-visible bg-white text-[#000]">
          {/* doc-sheet = page nommée @page a4doc (marges 0 : pas d'en-tête/pied
              navigateur) — les marges papier sont portées par le padding print */}
          <div className="doc-sheet max-w-[210mm] mx-auto text-[11px] leading-tight print:p-[10mm]">
            {/* EN-TÊTE : logo + société (gauche) ; cartouche + client (droite) */}
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1">
                <div className="relative w-44 h-14">
                  <Image
                    src={company?.logoUrl || "/bm-motors-logo-wide.png"}
                    alt="Logo"
                    fill
                    sizes="176px"
                    className="object-contain object-left"
                  />
                </div>
                <p className="font-bold">Sté {company?.raisonSociale || ""}</p>
                {company?.address && <p>{company.address}</p>}
                {company?.city && <p>{company.city}</p>}
                {company?.phone && <p>Tél. : {company.phone}</p>}
              </div>

              <div className="w-80 shrink-0">
                <div className="border-2 border-black text-center font-black text-lg py-1 tracking-wide">{docLabel}</div>
                <p className="text-right font-black text-base mt-1">
                  N° : <span className="underline">{doc.docNumber}</span>
                </p>
                <div className="border border-black mt-1 p-2 space-y-0.5">
                  <p>Code Clt : {doc.customerId ?? "—"}</p>
                  <p>Clt : {doc.customerName}</p>
                  {doc.commercialName && <p>Com : {doc.commercialName}</p>}
                  <p>Adresse : {doc.customerCity || "—"}</p>
                  <p>ICE : {doc.customerIce || ""}</p>
                </div>
              </div>
            </div>

            {/* BANDEAU : Date / N° / Commercial / Lieu de livraison */}
            <table className="w-full border-collapse mt-4 border-2 border-black">
              <thead>
                <tr className="font-bold">
                  <th className="border border-black py-1 px-2 text-left w-32">Date</th>
                  <th className="border border-black py-1 px-2 text-left w-32">N°</th>
                  <th className="border border-black py-1 px-2 text-left">Commercial</th>
                  <th className="border border-black py-1 px-2 text-left">Lieu de Livraison</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black py-1 px-2">{new Date(doc.docDate).toLocaleDateString("fr-FR")}</td>
                  <td className="border border-black py-1 px-2">{doc.docNumber}</td>
                  <td className="border border-black py-1 px-2">{commercial}</td>
                  <td className="border border-black py-1 px-2">{lieuLivraison}</td>
                </tr>
              </tbody>
            </table>

            {/* ARTICLES (filigrane logo derrière le tableau) */}
            <div className="relative mt-3">
              <div
                aria-hidden
                className="absolute inset-0 z-0 flex items-center justify-center opacity-50 pointer-events-none select-none print:opacity-50"
              >
                <div className="relative w-2/3 h-2/3">
                  <Image
                    src="/bm-motors-logo-wide.png"
                    alt=""
                    fill
                    sizes="500px"
                    className="object-contain"
                  />
                </div>
              </div>
              <table className="relative w-full border-collapse border-2 border-black">
              <thead>
                <tr className="font-bold">
                  <th className="border border-black py-1 px-2 text-left w-20">REF MVT</th>
                  <th className="border border-black py-1 px-2 text-left w-20">CODE</th>
                  <th className="border border-black py-1 px-2 text-left">DESIGNATION</th>
                  <th className="border border-black py-1 px-2 text-center w-14">QTE</th>
                  <th className="border border-black py-1 px-2 text-right w-24">P.VENTE</th>
                  <th className="border border-black py-1 px-2 text-right w-28">TOT_LIGNE</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="border-x border-black py-1 px-2">{line.oemCode || ""}</td>
                    <td className="border-x border-black py-1 px-2">{line.sku}</td>
                    <td className="border-x border-black py-1 px-2">{line.productName}</td>
                    <td className="border-x border-black py-1 px-2 text-center">{line.quantity}</td>
                    <td className="border-x border-black py-1 px-2 text-right">{num(line.unitPriceHTCents)}</td>
                    <td className="border-x border-black py-1 px-2 text-right">{num(line.totalHtCents)}</td>
                  </tr>
                ))}
                {Array.from({ length: fillerRows }).map((_, i) => (
                  <tr key={`f${i}`}>
                    <td className="border-x border-black py-1 px-2 h-6">&nbsp;</td>
                    <td className="border-x border-black py-1 px-2">&nbsp;</td>
                    <td className="border-x border-black py-1 px-2">&nbsp;</td>
                    <td className="border-x border-black py-1 px-2">&nbsp;</td>
                    <td className="border-x border-black py-1 px-2">&nbsp;</td>
                    <td className="border-x border-black py-1 px-2">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="mt-1 font-semibold">PAGE NUMERO : 1</p>

            {/* OBSERVATIONS + TOTAL NET */}
            <div className="flex justify-between items-start gap-6 mt-3">
              <div className="border border-black w-1/2">
                <p className="border-b border-black px-2 py-1 font-bold">Observations</p>
                <p className="px-2 py-3 min-h-[44px] whitespace-pre-line">{doc.notes || ""}</p>
              </div>
              <div className="w-80 shrink-0">
                {showDiscount && doc.discountPercent > 0 && (
                  <div className="flex justify-between border border-black px-2 py-1">
                    <span>Remise {doc.discountPercent}% ............:</span>
                    <span>{num(doc.discountAmountCents)}</span>
                  </div>
                )}
                {showVatTotals ? (
                  <>
                    <div className="flex justify-between border border-black px-2 py-1">
                      <span>Total HT ............:</span>
                      <span>{num(doc.totalNetHtCents)}</span>
                    </div>
                    <div className="flex justify-between border border-black px-2 py-1">
                      <span>TVA {doc.tvaRate}% ............:</span>
                      <span>{num(doc.tvaAmountCents)}</span>
                    </div>
                    <div className="flex justify-between border border-black px-2 py-1 font-bold">
                      <span>Total TTC ............:</span>
                      <span>{num(doc.totalTtcCents)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between border border-black px-2 py-1 font-bold">
                    <span>Total Net ............:</span>
                    <span>{num(doc.totalNetHtCents)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* MONTANT EN LETTRES */}
            <p className="mt-3">
              {arretePrefix[doc.docType] ?? "Arrêté le présent document"} à la somme de :{" "}
              <span className="font-bold">{amountInWordsMAD(showVatTotals ? doc.totalTtcCents : doc.totalNetHtCents)}</span>
            </p>

            {/* MODE DE PAIEMENT */}
            <p className="mt-4 font-bold">Mode de Paiement :</p>
            <div className="border border-black px-2 py-2">
              {paymentLabel}
              {(conditionText || doc.dueDate) && (
                <span>
                  {conditionText ? ` — Conditions : ${conditionText}` : ""}
                  {doc.dueDate ? ` — Échéance : ${new Date(doc.dueDate).toLocaleDateString("fr-FR")}` : ""}
                </span>
              )}
            </div>

            {/* CACHET & SIGNATURE — factures uniquement */}
            {doc.docType === "FACTURE" && (
              <div className="mt-4 flex justify-end">
                <div className="text-center">
                  <p className="font-bold text-[10px] uppercase tracking-wide mb-1">Signature & Cachet</p>
                  <div className="relative w-56 h-28">
                    <Image src="/cachet.png" alt="Cachet et signature" fill sizes="224px" className="object-contain" />
                  </div>
                </div>
              </div>
            )}

            {/* PIED DE PAGE */}
            <div className="mt-6 pt-2 border-t border-black flex items-start gap-3">
              <div className="relative w-28 h-10 shrink-0">
                <Image
                  src={company?.logoUrl || "/bm-motors-logo-wide.png"}
                  alt="Logo"
                  fill
                  sizes="112px"
                  className="object-contain object-left"
                />
              </div>
              <div className="space-y-0.5">
                <p className="font-bold">Sté {company?.raisonSociale || ""}</p>
                {(company?.address || company?.city) && (
                  <p>
                    Adresse : {company?.address || ""}
                    {company?.city ? `, ${company.city}` : ""}
                  </p>
                )}
                {(company?.email || company?.phone) && (
                  <p>
                    {company?.email || ""}
                    {company?.phone ? `   GSM : ${company.phone}` : ""}
                  </p>
                )}
                {(company?.legalForm || company?.capitalCents) && (
                  <p>
                    {(company?.legalForm || "").replace(/_/g, " ")}
                    {company?.capitalCents ? ` au capital de ${num(company.capitalCents)} DH` : ""}
                  </p>
                )}
                {legalIds.length > 0 && <p className="font-semibold">{legalIds.join("  |  ")}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
