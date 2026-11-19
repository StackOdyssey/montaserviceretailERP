"use client";

import React, { useEffect, useState } from "react";
import { X, Printer, Ban, RefreshCw, ReceiptText, Undo2 } from "lucide-react";
import { getDayTickets, type SalesDocumentItem } from "@/lib/actions/sales";
import { cancelDocument } from "@/lib/actions/sales-documents";
import { unwrap } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import { TicketPrintView } from "@/components/pos/TicketPrintView";
import { ReturnModal } from "@/components/pos/ReturnModal";

const METHOD_SHORT: Record<string, string> = {
  ESPECES: "Esp",
  CARTE_BANCAIRE: "TPE",
  CHEQUE: "Chq",
  VIREMENT: "Vir",
  VERSEMENT: "Ver",
  EFFET_LCN: "Eff",
  BON_REDUCTION: "Bon",
  AVOIR: "Avoir",
};

const STATUS_CLS: Record<string, string> = {
  PAYE: "bg-emerald-100 text-emerald-700",
  VALIDE: "bg-blue-100 text-blue-700",
  BROUILLON: "bg-gray-200 text-gray-600",
  ANNULE: "bg-red-100 text-red-700 line-through",
};

interface TicketsModalProps {
  onClose: () => void;
  /** Appelé après annulation d'un ticket (ex. rafraîchir le stock affiché). */
  onCancelled?: (doc: SalesDocumentItem) => void;
}

/** Liste des tickets du jour — consultation, réimpression thermique, annulation. */
export function TicketsModal({ onClose, onCancelled }: TicketsModalProps) {
  const [tickets, setTickets] = useState<SalesDocumentItem[] | null>(null);
  const [printDoc, setPrintDoc] = useState<SalesDocumentItem | null>(null);
  const [returnDoc, setReturnDoc] = useState<SalesDocumentItem | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    try {
      setTickets(unwrap(await getDayTickets(from.toISOString())));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du chargement");
      setTickets([]);
    }
  };

  useEffect(() => {
    let active = true;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    getDayTickets(from.toISOString())
      .then((r) => {
        if (active) setTickets(unwrap(r));
      })
      .catch(() => {
        if (active) setTickets([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCancel = async (doc: SalesDocumentItem) => {
    if (!confirm(`Annuler le ${doc.docNumber} ? Les quantités seront réintégrées au stock.`)) return;
    try {
      setCancellingId(doc.id);
      setError(null);
      const updated = unwrap(await cancelDocument(doc.id, "Annulation ticket (POS)"));
      onCancelled?.(updated);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'annulation");
    } finally {
      setCancellingId(null);
    }
  };

  // Total net de la journée : ventes − avoirs, hors annulés et devis.
  const totalJour = (tickets ?? [])
    .filter((t) => t.status !== "ANNULE" && t.docType !== "DEVIS")
    .reduce((s, t) => s + (t.docType === "AVOIR" ? -t.totalTtcCents : t.totalTtcCents), 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <ReceiptText size={20} className="text-[#F7162D]" /> Tickets du jour
              {tickets && <span className="text-xs font-normal text-gray-500">({tickets.length})</span>}
            </h2>
            <div className="flex items-center gap-1">
              <button onClick={() => void load()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Rafraîchir">
                <RefreshCw size={16} />
              </button>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {error && <div className="m-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
            {tickets === null ? (
              <div className="p-8 text-center text-sm text-gray-400">Chargement…</div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">Aucun ticket aujourd&rsquo;hui.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Heure</th>
                    <th className="text-left px-3 py-2 font-semibold">N°</th>
                    <th className="text-left px-3 py-2 font-semibold">Client</th>
                    <th className="text-left px-3 py-2 font-semibold">Règlement</th>
                    <th className="text-right px-3 py-2 font-semibold">Total</th>
                    <th className="text-center px-3 py-2 font-semibold">Statut</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => {
                    const methods = (t.tenders ?? []).length
                      ? (t.tenders ?? []).map((x) => METHOD_SHORT[x.method] ?? x.method).join("+")
                      : t.paymentMethod
                        ? (METHOD_SHORT[t.paymentMethod] ?? t.paymentMethod)
                        : "—";
                    const canCancel = (t.docType === "BL" || t.docType === "BC" || t.docType === "DEVIS") && t.status !== "ANNULE";
                    const canReturn = (t.docType === "BL" || t.docType === "FACTURE") && t.status !== "ANNULE";
                    return (
                      <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-500">
                          {new Date(t.docDate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-gray-900">{t.docNumber}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-32 truncate">{t.customerName || "Comptoir"}</td>
                        <td className="px-3 py-2 text-gray-500">{methods}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{formatMoney(t.totalTtcCents)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_CLS[t.status] ?? "bg-gray-200"}`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              onClick={() => setPrintDoc(t)}
                              className="p-1.5 text-gray-500 hover:text-[#F7162D] hover:bg-red-50 rounded-lg"
                              title="Réimprimer le ticket"
                              aria-label={`Réimprimer ${t.docNumber}`}
                            >
                              <Printer size={15} />
                            </button>
                            {canReturn && (
                              <button
                                onClick={() => setReturnDoc(t)}
                                className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                                title="Retour marchandise (avoir)"
                                aria-label={`Retour sur ${t.docNumber}`}
                              >
                                <Undo2 size={15} />
                              </button>
                            )}
                            {canCancel && (
                              <button
                                onClick={() => void handleCancel(t)}
                                disabled={cancellingId === t.id}
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
                                title="Annuler le ticket"
                                aria-label={`Annuler ${t.docNumber}`}
                              >
                                <Ban size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-3 border-t border-gray-200 flex items-center justify-between text-xs shrink-0">
            <span className="text-gray-500">Total journée (hors annulés)</span>
            <span className="font-mono font-bold text-base text-gray-900">{formatMoney(totalJour)}</span>
          </div>
        </div>
      </div>

      {printDoc && <TicketPrintView document={printDoc} onClose={() => setPrintDoc(null)} />}
      {returnDoc && (
        <ReturnModal
          source={returnDoc}
          onClose={() => setReturnDoc(null)}
          onReturned={() => void load()}
        />
      )}
    </>
  );
}
