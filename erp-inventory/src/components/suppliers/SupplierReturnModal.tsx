"use client";

import { useEffect, useState } from "react";
import { X, Undo2, AlertCircle } from "lucide-react";
import {
  SupplierItem,
  SupplierReceiptItem,
  getSupplierReceipts,
} from "@/lib/actions/suppliers";
import { createSupplierReturn } from "@/lib/actions/sales-stock";
import { formatMoney } from "@/lib/money";
import { unwrap } from "@/lib/action-result";

interface SupplierReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  suppliers: SupplierItem[];
  preselectedSupplierId?: number;
}

export function SupplierReturnModal({
  isOpen,
  onClose,
  onSaved,
  suppliers,
  preselectedSupplierId,
}: SupplierReturnModalProps) {
  const [supplierId, setSupplierId] = useState<number>(preselectedSupplierId || (suppliers[0]?.id ?? 1));
  const [receipts, setReceipts] = useState<SupplierReceiptItem[]>([]);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ré-applique la présélection à chaque ouverture (useState ne capture que le 1er render).
  const [prevIsOpen, setPrevIsOpen] = useState(false);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setSupplierId(preselectedSupplierId || (suppliers[0]?.id ?? 1));
      setReceiptId(null);
      setQuantities({});
      setReason("");
      setError(null);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getSupplierReceipts(supplierId)
      .then((r) => {
        if (!active) return;
        setReceipts(r.filter((x) => x.status !== "ANNULE"));
        setReceiptId(r.find((x) => x.status !== "ANNULE")?.id ?? null);
        setQuantities({});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, supplierId]);

  if (!isOpen) return null;

  const receipt = receipts.find((r) => r.id === receiptId) ?? null;
  const remaining = (l: SupplierReceiptItem["lines"][number]) =>
    Math.max(0, l.quantity - l.returnedQuantity);

  const totalUnits = receipt
    ? receipt.lines.reduce((s, l) => {
        const v = parseInt(quantities[l.id] ?? "", 10);
        return s + (Number.isFinite(v) && v > 0 ? Math.min(v, remaining(l)) : 0);
      }, 0)
    : 0;

  const totalCreditHtCents = receipt
    ? receipt.lines.reduce((s, l) => {
        const v = parseInt(quantities[l.id] ?? "", 10);
        const q = Number.isFinite(v) && v > 0 ? Math.min(v, remaining(l)) : 0;
        return s + q * l.unitCostCents;
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
        const v = parseInt(quantities[l.id] ?? "", 10);
        const quantity = Number.isFinite(v) && v > 0 ? Math.min(v, remaining(l)) : 0;
        return { lineId: l.id, quantity };
      })
      .filter((l) => l.quantity > 0);

    if (lines.length === 0) {
      setError("Saisissez au moins une quantité à retourner.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      unwrap(await createSupplierReturn({
        receiptId: receipt.id,
        lines,
        reason: reason.trim() || undefined,
      }));
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message || "Erreur lors de l'enregistrement du retour.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-600">
              <Undo2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Retour fournisseur</h3>
              <p className="text-xs text-gray-500">
                Marchandises renvoyées — sort le stock et réduit la dette du BR
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
                  setQuantities({});
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
                    <th className="py-2 px-3 text-right">Reçu / retourné</th>
                    <th className="py-2 px-3 text-right w-28">Retour (qté)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {receipt.lines.map((l) => {
                    const reste = remaining(l);
                    return (
                      <tr key={l.id} className={reste === 0 ? "opacity-40" : ""}>
                        <td className="py-2 px-3 font-mono text-gray-600">{l.sku}</td>
                        <td className="py-2 px-3 text-gray-800 dark:text-gray-200">{l.productName}</td>
                        <td className="py-2 px-3 text-right">
                          {l.quantity} / {l.returnedQuantity}
                          {reste === 0 && <span className="ml-1 text-[10px] text-amber-600 font-bold">épuisé</span>}
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            max={reste}
                            disabled={reste === 0}
                            value={quantities[l.id] ?? ""}
                            onChange={(e) => setQuantities((c) => ({ ...c, [l.id]: e.target.value }))}
                            placeholder="0"
                            className="w-full px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-right text-xs disabled:opacity-40"
                          />
                        </td>
                      </tr>
                    );
                  })}
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
              placeholder="Ex: pièces défectueuses renvoyées au fournisseur"
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="text-sm">
              <span className="text-gray-500">{totalUnits} pièce{totalUnits > 1 ? "s" : ""} — valeur HT :</span>{" "}
              <span className="font-black text-red-600">{formatMoney(totalCreditHtCents)}</span>
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
                disabled={isSubmitting || totalUnits <= 0}
                className="px-6 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md transition disabled:opacity-50"
              >
                {isSubmitting ? "Enregistrement..." : "Enregistrer le retour"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
