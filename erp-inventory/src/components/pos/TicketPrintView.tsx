"use client";

import React, { useEffect, useState } from "react";
import { X, Printer, Ticket } from "lucide-react";
import { SalesDocumentItem } from "@/lib/actions/sales";
import { getDocumentPrintContext, type DocumentPrintContext } from "@/lib/actions/sales-documents";
import { formatMoney } from "@/lib/money";

const METHOD_LABELS: Record<string, string> = {
  ESPECES: "Espèces",
  CARTE_BANCAIRE: "Carte (TPE)",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  VERSEMENT: "Versement",
  EFFET_LCN: "Effet / LCN",
  BON_REDUCTION: "Bon réduction",
  AVOIR: "Avoir",
};

const SEP = "--------------------------------";

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function fmtDate(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "";
}

interface TicketPrintViewProps {
  document: SalesDocumentItem;
  onClose: () => void;
}

/** Ticket thermique 80mm — réimpression caisse (legacy ticketPosixD). */
export function TicketPrintView({ document: doc, onClose }: TicketPrintViewProps) {
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
  const tenders = doc.tenders ?? [];
  const paidCents = tenders.length
    ? tenders.reduce((s, t) => s + t.amountCents, 0)
    : doc.paidAmountCents;
  const creditCents = Math.max(0, doc.totalTtcCents - paidCents);
  const lineDiscountCents = doc.lines.reduce((s, l) => s + (l.discountAmountCents ?? 0), 0);
  const docLabel =
    doc.docType === "FACTURE"
      ? "FACTURE"
      : doc.docType === "BC"
        ? "BON DE COMMANDE"
        : doc.docType === "AVOIR"
          ? "AVOIR / RETOUR"
          : doc.docType === "DEVIS"
            ? "DEVIS"
            : "TICKET DE CAISSE";

  const lineTotalTtc = (l: SalesDocumentItem["lines"][number]) => {
    const unit = l.unitPriceTtcCents ?? Math.round(l.unitPriceHTCents * (1 + (l.tvaRate ?? 0) / 100));
    return unit * l.quantity - (l.discountAmountCents ?? 0);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex flex-col">
      {/* Barre d'outils écran */}
      <div className="print:hidden flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Ticket size={18} className="text-amber-400" /> Ticket {doc.docNumber}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-[#F7162D] hover:bg-[#D90E23] rounded-lg font-bold text-sm"
          >
            <Printer size={16} /> Imprimer
          </button>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Aperçu + zone d'impression */}
      <div className="flex-1 overflow-y-auto bg-gray-700 print:bg-white flex justify-center p-4 print:p-0 print:overflow-visible">
        <div className="ticket-sheet bg-white text-black font-mono text-[11px] leading-snug w-[72mm] h-fit p-3 shadow-2xl print:shadow-none">
          {/* En-tête société */}
          <div className="text-center">
            <div className="text-sm font-bold">{company?.tradeName ?? company?.raisonSociale ?? "BM Motors"}</div>
            {company?.address && <div>{company.address}{company.city ? ` — ${company.city}` : ""}</div>}
            {company?.phone && <div>Tél : {company.phone}</div>}
            {company?.ice && <div>ICE : {company.ice}</div>}
          </div>
          <div className="my-1.5">{SEP}</div>

          {/* Infos ticket */}
          <div className="text-center font-bold">{docLabel}{doc.status === "ANNULE" ? " — ANNULÉ" : ""}</div>
          <div className="flex justify-between"><span>N° {doc.docNumber}</span><span>{fmtDateTime(doc.docDate)}</span></div>
          <div>Client : {doc.customerName || "Comptoir"}</div>
          {doc.commercialName && <div>Vendeur : {doc.commercialName}</div>}
          <div className="my-1.5">{SEP}</div>

          {/* Lignes */}
          <div className="space-y-1">
            {doc.lines.map((l) => (
              <div key={l.id}>
                <div className="truncate">
                  {l.customLabel || l.productName}
                  {l.isFree ? " (OFFERT)" : ""}
                </div>
                <div className="flex justify-between">
                  <span>
                    {l.quantity} x {formatMoney(l.unitPriceTtcCents ?? l.unitPriceHTCents)}
                    {(l.discountPercent ?? 0) > 0 && ` −${l.discountPercent}%`}
                  </span>
                  <span className="font-bold">{formatMoney(lineTotalTtc(l))}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="my-1.5">{SEP}</div>

          {/* Totaux */}
          <div className="space-y-0.5">
            {lineDiscountCents > 0 && (
              <div className="flex justify-between"><span>Remises lignes</span><span>-{formatMoney(lineDiscountCents)}</span></div>
            )}
            {doc.discountAmountCents > 0 && (
              <div className="flex justify-between"><span>Remise globale ({doc.discountPercent}%)</span><span>-{formatMoney(doc.discountAmountCents)}</span></div>
            )}
            <div className="flex justify-between text-sm font-bold">
              <span>TOTAL</span>
              <span>{formatMoney(doc.totalTtcCents)}</span>
            </div>
          </div>
          <div className="my-1.5">{SEP}</div>

          {/* Règlements — absent sur un devis (pas de paiement) */}
          {doc.docType !== "DEVIS" && (
          <div className="space-y-0.5">
            {tenders.length === 0 && doc.status === "PAYE" && doc.totalTtcCents === 0 && (
              <div className="flex justify-between"><span>Offert</span><span>0,00</span></div>
            )}
            {tenders.map((t) => (
              <div key={t.id}>
                <div className="flex justify-between">
                  <span>{METHOD_LABELS[t.method] ?? t.method}</span>
                  <span>{formatMoney(t.amountCents)}</span>
                </div>
                {t.method === "ESPECES" && (t.cashReceivedCents ?? 0) > t.amountCents && (
                  <div className="flex justify-between text-[10px]">
                    <span>Reçu {formatMoney(t.cashReceivedCents!)}</span>
                    <span>Rendu {formatMoney(t.cashReceivedCents! - t.amountCents)}</span>
                  </div>
                )}
                {t.referenceNumber && (
                  <div className="text-[10px]">Réf : {t.referenceNumber}{t.bankName ? ` — ${t.bankName}` : ""}</div>
                )}
                {t.dueDate && <div className="text-[10px]">Échéance : {fmtDate(t.dueDate)}</div>}
              </div>
            ))}
            {creditCents > 0 && (
              <div className="flex justify-between font-bold">
                <span>Reste à crédit</span>
                <span>{formatMoney(creditCents)}</span>
              </div>
            )}
          </div>
          )}
          {doc.docType !== "DEVIS" && <div className="my-1.5">{SEP}</div>}

          {/* Pied */}
          <div className="text-center">
            <div>{company?.footerText ?? "Merci de votre visite !"}</div>
            <div className="mt-1 text-[10px]">{doc.docNumber}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
