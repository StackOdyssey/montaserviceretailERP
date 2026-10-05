"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle, Banknote, CreditCard, Building2, Calendar, FileText, ArrowRight } from "lucide-react";
import { CustomerItem, recordCustomerPayment, getCustomerStatement } from "@/lib/actions/customers";
import { formatMoney, toCentimes } from "@/lib/money";

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
  "Umnia Bank",
  "Autre Banque",
];

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  customers: CustomerItem[];
  preselectedCustomerId?: number;
  preselectedDocId?: number;
}

export function PaymentModal({
  isOpen,
  onClose,
  onSaved,
  customers,
  preselectedCustomerId,
  preselectedDocId,
}: PaymentModalProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(
    preselectedCustomerId || (customers[0]?.id ?? 1)
  );
  const [amountDh, setAmountDh] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT">("ESPECES");
  const [bankName, setBankName] = useState<string>("Attijariwafa Bank");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [chequeDueDate, setChequeDueDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split("T")[0]
  );
  const [targetDocId, setTargetDocId] = useState<string>(
    preselectedDocId ? preselectedDocId.toString() : "AUTO"
  );
  const [notes, setNotes] = useState<string>("");
  const [customerDocs, setCustomerDocs] = useState<Array<{ id: number; docNumber: string; remainingDueCents: number }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger les documents impayés du client sélectionné pour lettrage direct
  useEffect(() => {
    if (!selectedCustomerId) return;
    getCustomerStatement(selectedCustomerId).then((stmt) => {
      if (stmt) {
        const unpaid = stmt.documents.filter((d) => d.remainingDueCents > 0);
        setCustomerDocs(unpaid);
      }
    });
  }, [selectedCustomerId]);

  if (!isOpen) return null;

  const currentCustomer = customers.find((c) => c.id === selectedCustomerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDh = parseFloat(amountDh.replace(",", "."));
    if (isNaN(parsedDh) || parsedDh <= 0) {
      setError("Veuillez saisir un montant valide supérieur à 0 DH.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const amountCents = toCentimes(parsedDh);
      const docId = targetDocId === "AUTO" ? null : parseInt(targetDocId, 10);

      await recordCustomerPayment({
        customerId: selectedCustomerId,
        amountCents,
        paymentMethod,
        documentId: docId,
        referenceNumber: referenceNumber.trim() || undefined,
        chequeDueDate: paymentMethod === "CHEQUE" || paymentMethod === "EFFET_LCN" ? chequeDueDate : undefined,
        bankName: paymentMethod === "CHEQUE" || paymentMethod === "EFFET_LCN" || paymentMethod === "VIREMENT" ? bankName : undefined,
        notes: notes.trim() || undefined,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'enregistrement de l'encaissement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Enregistrer un encaissement client
              </h3>
              <p className="text-xs text-gray-500">
                Règlement espèces, chèque, effet LCN ou virement
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

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}

          {/* Sélection du client */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Client débiteur <span className="text-[#F7162D]">*</span>
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.city ? `(${c.city})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Montant du règlement */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Montant du règlement en Dirhams (DH) <span className="text-[#F7162D]">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.10"
                value={amountDh}
                onChange={(e) => setAmountDh(e.target.value)}
                placeholder="Ex: 2 500,00"
                className="w-full pl-4 pr-12 py-3 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-bold text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
                required
                autoFocus
              />
              <span className="absolute right-4 top-3.5 font-bold text-gray-400">DH</span>
            </div>
          </div>

          {/* Mode de règlement */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
              Mode de paiement <span className="text-[#F7162D]">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "ESPECES", label: "Espèces" },
                { id: "CHEQUE", label: "Chèque" },
                { id: "EFFET_LCN", label: "Effet LCN" },
                { id: "VIREMENT", label: "Virement" },
              ].map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition flex items-center justify-center text-center ${
                    paymentMethod === m.id
                      ? "bg-[#F7162D] text-white border-[#F7162D] shadow-xs"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Détails Chèque ou Effet LCN */}
          {(paymentMethod === "CHEQUE" || paymentMethod === "EFFET_LCN") && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-3 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    N° {paymentMethod === "CHEQUE" ? "du Chèque" : "de l'Effet LCN"} <span className="text-[#F7162D]">*</span>
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Ex: CHQ-889102"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F7162D]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Date d'échéance <span className="text-[#F7162D]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={chequeDueDate}
                      onChange={(e) => setChequeDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F7162D]"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Banque émettrice
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

          {/* Virement bancaire */}
          {paymentMethod === "VIREMENT" && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-2 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Référence Virement / N° Ordre
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Ex: VIR-2026-99"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F7162D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Banque réceptrice
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
            </div>
          )}

          {/* Lettrage / Affectation du règlement */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Lettrage / Affectation au Bon de Livraison
            </label>
            <select
              value={targetDocId}
              onChange={(e) => setTargetDocId(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
            >
              <option value="AUTO">
                ⚡ Affectation automatique FIFO (sur les BL les plus anciens)
              </option>
              {customerDocs.map((doc) => (
                <option key={doc.id} value={doc.id.toString()}>
                  {doc.docNumber} — Reste dû : {formatMoney(doc.remainingDueCents)}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Remarques
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Acompte sur commande de pièces Bashan 250"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
            />
          </div>

          {/* Actions */}
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
              className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? "Validation..." : "Valider l'encaissement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
