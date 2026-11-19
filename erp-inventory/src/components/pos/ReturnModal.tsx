"use client";

import React, { useState } from "react";
import { X, Undo2, Check, Ticket } from "lucide-react";
import { createAvoir } from "@/lib/actions/sales-documents";
import type { SalesDocumentItem } from "@/lib/actions/sales";
import { unwrap } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import { TicketPrintView } from "@/components/pos/TicketPrintView";

interface ReturnModalProps {
  source: SalesDocumentItem;
  onClose: () => void;
  onReturned?: (avoir: SalesDocumentItem) => void;
}

/**
 * Retour marchandise depuis un ticket (legacy RETOUR / ajaxPosixRetVenteAdd) :
 * choix des lignes + quantités → émet un AVOIR (réintégration stock, CMUP
 * recalculé, avoir utilisable comme jambe de règlement).
 */
export function ReturnModal({ source, onClose, onReturned }: ReturnModalProps) {
  const [qty, setQty] = useState<Record<number, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avoir, setAvoir] = useState<SalesDocumentItem | null>(null);
  const [showTicket, setShowTicket] = useState(false);

  const setLineQty = (lineId: number, v: number, max: number) =>
    setQty((prev) => ({ ...prev, [lineId]: Math.max(0, Math.min(max, v)) }));

  const unitTtc = (l: SalesDocumentItem["lines"][number]) =>
    l.unitPriceTtcCents ?? l.unitPriceHTCents;
  const lineNetTtc = (l: SalesDocumentItem["lines"][number]) =>
    unitTtc(l) * l.quantity - (l.discountAmountCents ?? 0);

  const picked = source.lines
    .filter((l) => (qty[l.id] ?? 0) > 0)
    .map((l) => ({ lineId: l.id, quantity: qty[l.id] }));

  const refundTtc = source.lines
    .filter((l) => (qty[l.id] ?? 0) > 0)
    .reduce((s, l) => s + Math.round((lineNetTtc(l) * qty[l.id]) / l.quantity), 0);

  const handleSubmit = async () => {
    if (picked.length === 0) return;
    try {
      setIsSubmitting(true);
      setError(null);
      const av = unwrap(
        await createAvoir({
          sourceDocumentId: source.id,
          returns: picked,
          avType: "RETOUR",
          notes: `Retour ticket ${source.docNumber} (POS)`,
        })
      );
      setAvoir(av);
      onReturned?.(av);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du retour");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (avoir) {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 text-emerald-700 font-bold text-lg">
              <Check size={22} /> Avoir émis
            </div>
            <div className="font-mono text-2xl font-bold text-gray-900">{avoir.docNumber}</div>
            <div className="text-sm text-gray-600">
              {formatMoney(avoir.totalTtcCents)} — stock réintégré.
              {avoir.customerId
                ? " Utilisable comme règlement « Avoir » sur ce client."
                : " Le montant se rembourse en caisse ou reste en avoir."}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTicket(true)}
                className="flex-1 px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold rounded-lg flex items-center justify-center gap-2"
              >
                <Ticket size={16} /> Ticket
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#F7162D] hover:bg-[#D90E23] text-white font-semibold rounded-lg"
              >
                Terminé
              </button>
            </div>
          </div>
        </div>
        {showTicket && <TicketPrintView document={avoir} onClose={() => setShowTicket(false)} />}
      </>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Undo2 size={18} className="text-[#F7162D]" /> Retour — {source.docNumber}
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          <div className="text-xs text-gray-500">
            Sélectionnez les quantités à reprendre (réintégrées au stock au coût d&rsquo;origine).
          </div>
          {source.lines.map((l) => {
            const v = qty[l.id] ?? 0;
            return (
              <div key={l.id} className={`border rounded-xl p-3 flex items-center gap-3 ${v > 0 ? "border-[#F7162D] bg-red-50/40" : "border-gray-200"}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-gray-400">{l.sku}</div>
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {l.customLabel || l.productName}
                    {l.isFree ? " (OFFERT)" : ""}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    vendu {l.quantity} × {formatMoney(unitTtc(l))}
                    {(l.discountPercent ?? 0) > 0 && ` −${l.discountPercent}%`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setLineQty(l.id, v - 1, l.quantity)}
                    disabled={v === 0}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-mono font-bold">{v}</span>
                  <button
                    onClick={() => setLineQty(l.id, v + 1, l.quantity)}
                    disabled={v >= l.quantity}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold disabled:opacity-30"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setLineQty(l.id, l.quantity, l.quantity)}
                    className="ml-1 px-2 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-[10px] font-bold"
                  >
                    Tout
                  </button>
                </div>
              </div>
            );
          })}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 space-y-2 shrink-0">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">À créditer (estimé TTC)</span>
            <span className="font-mono font-bold">{formatMoney(refundTtc)}</span>
          </div>
          <button
            onClick={() => void handleSubmit()}
            disabled={picked.length === 0 || isSubmitting}
            className="w-full bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Undo2 size={18} />
            )}
            {isSubmitting ? "Traitement..." : `Émettre l'avoir — ${formatMoney(refundTtc)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
