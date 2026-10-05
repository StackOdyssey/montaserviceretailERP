"use client";

import { useState } from "react";
import { X, CreditCard, Banknote, Building2 } from "lucide-react";
import { SupplierItem, recordSupplierPayment } from "@/lib/actions/suppliers";
import { toCentimes } from "@/lib/money";

const MOROCCAN_BANKS = [
  "Attijariwafa Bank",
  "Banque Populaire (BP)",
  "Bank of Africa (BMCE)",
  "CIH Bank",
  "Société Générale Maroc",
  "BMCI (BNP Paribas)",
  "Crédit du Maroc (CDM)",
  "Al Barid Bank",
  "CFG Bank",
  "Autre Banque",
];

interface SupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  suppliers: SupplierItem[];
  preselectedSupplierId?: number;
}

export function SupplierPaymentModal({
  isOpen,
  onClose,
  onSaved,
  suppliers,
  preselectedSupplierId,
}: SupplierPaymentModalProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(
    preselectedSupplierId || (suppliers[0]?.id ?? 1)
  );
  const [amountDh, setAmountDh] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CHEQUE" | "EFFET_LCN" | "VIREMENT" | "ESPECES">("CHEQUE");
  const [bankName, setBankName] = useState<string>("Attijariwafa Bank");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().split("T")[0] // Échéance à 60 jours habituelle
  );
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDh = parseFloat(amountDh.replace(",", "."));
    if (isNaN(parsedDh) || parsedDh <= 0) {
      setError("Veuillez saisir un montant valide en Dirhams.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await recordSupplierPayment({
        supplierId: selectedSupplierId,
        amountCents: toCentimes(parsedDh),
        paymentMethod,
        bankName: paymentMethod !== "ESPECES" ? bankName : undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        dueDate: paymentMethod === "CHEQUE" || paymentMethod === "EFFET_LCN" ? dueDate : undefined,
        notes: notes.trim() || undefined,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'enregistrement du paiement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Émettre un règlement fournisseur
              </h3>
              <p className="text-xs text-gray-500">
                Paiement par chèque, effet de commerce, virement ou espèces
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
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Bénéficiaire (Fournisseur) <span className="text-[#F7162D]">*</span>
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.city ? `(${s.city})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Montant à décaisser (DH) <span className="text-[#F7162D]">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.10"
                value={amountDh}
                onChange={(e) => setAmountDh(e.target.value)}
                placeholder="Ex: 15 000,00"
                className="w-full pl-4 pr-12 py-3 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F7162D]"
                required
                autoFocus
              />
              <span className="absolute right-4 top-3.5 font-bold text-gray-400">DH</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
              Mode de paiement émis <span className="text-[#F7162D]">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "CHEQUE", label: "Chèque" },
                { id: "EFFET_LCN", label: "Effet LCN" },
                { id: "VIREMENT", label: "Virement" },
                { id: "ESPECES", label: "Espèces" },
              ].map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition flex items-center justify-center text-center ${
                    paymentMethod === m.id
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod !== "ESPECES" && (
            <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    N° Pièce / Réf Chèque / LCN
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Ex: CHQ-BM-449102"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F7162D]"
                  />
                </div>

                {(paymentMethod === "CHEQUE" || paymentMethod === "EFFET_LCN") && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Date d'échéance émise
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F7162D]"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Banque de tirage (BM Motors)
                </label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F7162D]"
                >
                  {MOROCCAN_BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Remarques
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Règlement solde arrivage conteneur 2026"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition disabled:opacity-50"
            >
              {isSubmitting ? "Validation..." : "Enregistrer le décaissement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
