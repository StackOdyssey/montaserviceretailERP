"use client";

import { useEffect, useState } from "react";
import { X, Receipt, AlertCircle } from "lucide-react";
import {
  SupplierItem,
  SupplierReceiptItem,
  getSupplierReceipts,
  createSupplierPriceCreditNote,
} from "@/lib/actions/suppliers";
import { formatMoney, toCentimes } from "@/lib/money";
import { unwrap } from "@/lib/action-result";

interface SupplierPriceCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  suppliers: SupplierItem[];
  preselectedSupplierId?: number;
}

export function SupplierPriceCreditModal({
  isOpen,
  onClose,
  onSaved,
  suppliers,
  preselectedSupplierId,
}: SupplierPriceCreditModalProps) {
  const [supplierId, setSupplierId] = useState<number>(preselectedSupplierId || (suppliers[0]?.id ?? 1));
  // Ré-applique la présélection à chaque ouverture (useState ne capture que le 1er render).
  const [prevIsOpen, setPrevIsOpen] = useState(false);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) setSupplierId(preselectedSupplierId || (suppliers[0]?.id ?? 1));
  }
  const [receipts, setReceipts] = useState<SupplierReceiptItem[]>([]);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [credits, setCredits] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getSupplierReceipts(supplierId)
      .then((r) => {
        if (!active) return;
        setReceipts(r);
        setReceiptId(r[0]?.id ?? null);
        setCredits({});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, supplierId]);

  if (!isOpen) return null;

  const receipt = receipts.find((r) => r.id === receiptId) ?? null;

  const totalCreditHtCents = receipt
    ? receipt.lines.reduce((s, l) => {
        const v = parseFloat((credits[l.id] ?? "").replace(",", "."));
        return s + (Number.isFinite(v) && v > 0 ? Math.min(toCentimes(v), l.totalCostCents) : 0);
      }, 0)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receipt) {
      setError("Veuillez sélectionner un bon de réception.");
      return;
    }
    const lines = receipt.lines
      .map((l) => {
        const v = parseFloat((credits[l.id] ?? "").replace(",", "."));
        const amountHtCents = Number.isFinite(v) && v > 0 ? Math.min(toCentimes(v), l.totalCostCents) : 0;
        return { lineId: l.id, amountHtCents };
      })
      .filter((l) => l.amountHtCents > 0);

    if (lines.length === 0) {
      setError("Saisissez au moins un montant d'avoir (en HT).");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      unwrap(await createSupplierPriceCreditNote({
        receiptId: receipt.id,
        lines,
        reason: reason.trim() || undefined,
      }));
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message || "Erreur lors de l'enregistrement de l'avoir.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Avoir prix fournisseur (sans retour)</h3>
              <p className="text-xs text-gray-500">
                Réduction de prix sur un BR existant — réduit la valeur du stock et le CMUP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Fournisseur
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Bon de réception
              </label>
              <select
                value={receiptId ?? ""}
                onChange={(e) => {
                  setReceiptId(e.target.value ? Number(e.target.value) : null);
                  setCredits({});
                }}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm"
              >
                <option value="">Sélectionner…</option>
                {receipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.receiptNumber} — {new Date(r.receiptDate).toLocaleDateString("fr-FR")} —{" "}
                    {formatMoney(r.totalTtcCents)}
                  </option>
                ))}
              </select>
              {receipts.length === 0 && (
                <p className="text-[11px] text-gray-500 mt-1">Aucun bon de réception pour ce fournisseur.</p>
              )}
            </div>
          </div>

          {receipt && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 uppercase font-bold">
                    <th className="py-2 px-3 text-left">Code</th>
                    <th className="py-2 px-3 text-left">Désignation</th>
                    <th className="py-2 px-3 text-right">Coût ligne</th>
                    <th className="py-2 px-3 text-right w-32">Avoir HT (DH)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {receipt.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 px-3 font-mono text-gray-600">{l.sku}</td>
                      <td className="py-2 px-3 text-gray-800 dark:text-gray-200">{l.productName}</td>
                      <td className="py-2 px-3 text-right">{formatMoney(l.totalCostCents)}</td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={(l.totalCostCents / 100).toFixed(2)}
                          value={credits[l.id] ?? ""}
                          onChange={(e) => setCredits((c) => ({ ...c, [l.id]: e.target.value }))}
                          placeholder="0,00"
                          className="w-full px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-right text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Motif (optionnel)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: remise accordée par le fournisseur sur l'arrivage"
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="text-sm">
              <span className="text-gray-500">Total avoir HT :</span>{" "}
              <span className="font-black text-amber-600">{formatMoney(totalCreditHtCents)}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting || totalCreditHtCents <= 0}
                className="px-6 py-2.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition disabled:opacity-50"
              >
                {isSubmitting ? "Enregistrement..." : "Enregistrer l'avoir prix"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
