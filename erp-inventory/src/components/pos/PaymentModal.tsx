import React, { useState } from "react";
import { X, CreditCard, Banknote, FileText, Check, AlertTriangle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { useToast } from "@/components/ui/ToastProvider";

interface PaymentModalProps {
  totalTtc: number;
  creditLimitCents?: number | null;
  outstandingCents?: number | null;
  customerId?: number | null;
  docType?: "BL" | "FACTURE" | "BC";
  onClose: () => void;
  onRequireCustomer?: () => void;
  onPayment: (data: {
    paymentMethod: "ESPECES" | "CHEQUE" | "CARTE_BANCAIRE" | "A_CREDIT";
    chequeDetails?: {
      bankName: string;
      chequeNumber: string;
      issueDate: string;
      encaissementDate: string;
    };
  }) => void;
  isSubmitting: boolean;
}

export function PaymentModal({
  totalTtc,
  creditLimitCents,
  outstandingCents,
  customerId = null,
  docType = "BL",
  onClose,
  onRequireCustomer,
  onPayment,
  isSubmitting,
}: PaymentModalProps) {
  const toast = useToast();
  const [paymentMethod, setPaymentMethod] = useState<"ESPECES" | "CHEQUE" | "CARTE_BANCAIRE" | "A_CREDIT">("ESPECES");
  const [chequeDetails, setChequeDetails] = useState({
    bankName: "",
    chequeNumber: "",
    issueDate: "",
    encaissementDate: "",
  });

  const projectedBalance = (outstandingCents ?? 0) + totalTtc;
  const creditLimitExceeded =
    paymentMethod === "A_CREDIT" &&
    creditLimitCents != null &&
    projectedBalance > creditLimitCents;

  // T1.3 — crédit et chèque exigent une fiche client (matrice POS). Espèces et TPE = vente comptoir.
  const requiresFile = paymentMethod === "CHEQUE" || paymentMethod === "A_CREDIT" || docType === "FACTURE";
  const missingFile = requiresFile && customerId == null;

  const handleSubmit = () => {
    if (missingFile) return;
    if (paymentMethod === "CHEQUE") {
      if (!chequeDetails.bankName || !chequeDetails.chequeNumber) {
        toast.error("Veuillez remplir les informations du chèque");
        return;
      }
      onPayment({
        paymentMethod,
        chequeDetails,
      });
    } else {
      onPayment({ paymentMethod });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={20} className="text-[#F7162D]" />
            <h2 className="font-bold text-gray-900">Paiement</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Total */}
          <div className="text-center py-4 bg-gray-50 rounded-xl">
            <div className="text-sm text-gray-600 mb-1">Total à payer</div>
            <div className="text-3xl font-bold text-[#F7162D] font-mono">
              {formatMoney(totalTtc)}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700">
              Mode de paiement
            </label>

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => setPaymentMethod("ESPECES")}
                className={`p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${
                  paymentMethod === "ESPECES"
                    ? "border-[#F7162D] bg-red-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <Banknote size={20} className={paymentMethod === "ESPECES" ? "text-[#F7162D]" : "text-gray-500"} />
                <div className="text-left">
                  <div className="font-semibold text-sm">Espèces</div>
                  <div className="text-xs text-gray-500">Paiement immédiat</div>
                </div>
                {paymentMethod === "ESPECES" && (
                  <Check size={18} className="ml-auto text-[#F7162D]" />
                )}
              </button>

              <button
                onClick={() => setPaymentMethod("CHEQUE")}
                className={`p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${
                  paymentMethod === "CHEQUE"
                    ? "border-[#F7162D] bg-red-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <FileText size={20} className={paymentMethod === "CHEQUE" ? "text-[#F7162D]" : "text-gray-500"} />
                <div className="text-left">
                  <div className="font-semibold text-sm">Chèque</div>
                  <div className="text-xs text-gray-500">Encaissement différé</div>
                </div>
                {paymentMethod === "CHEQUE" && (
                  <Check size={18} className="ml-auto text-[#F7162D]" />
                )}
              </button>

              <button
                onClick={() => setPaymentMethod("CARTE_BANCAIRE")}
                className={`p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${
                  paymentMethod === "CARTE_BANCAIRE"
                    ? "border-[#F7162D] bg-red-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <CreditCard size={20} className={paymentMethod === "CARTE_BANCAIRE" ? "text-[#F7162D]" : "text-gray-500"} />
                <div className="text-left">
                  <div className="font-semibold text-sm">Carte bancaire (TPE)</div>
                  <div className="text-xs text-gray-500">Paiement immédiat par terminal</div>
                </div>
                {paymentMethod === "CARTE_BANCAIRE" && (
                  <Check size={18} className="ml-auto text-[#F7162D]" />
                )}
              </button>

              <button
                onClick={() => setPaymentMethod("A_CREDIT")}
                className={`p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${
                  paymentMethod === "A_CREDIT"
                    ? "border-[#F7162D] bg-red-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <CreditCard size={20} className={paymentMethod === "A_CREDIT" ? "text-[#F7162D]" : "text-gray-500"} />
                <div className="text-left">
                  <div className="font-semibold text-sm">Crédit client</div>
                  <div className="text-xs text-gray-500">Ajouté au solde client</div>
                </div>
                {paymentMethod === "A_CREDIT" && (
                  <Check size={18} className="ml-auto text-[#F7162D]" />
                )}
              </button>
            </div>
          </div>

          {/* Fiche requise */}
          {customerId == null && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
              <div className="font-bold">Vente au comptoir (sans fiche)</div>
              <div className="mt-0.5">
                {docType === "FACTURE"
                  ? "FACTURE impossible sans fiche client. Créez ou sélectionnez le client."
                  : "Espèces et carte bancaire acceptées sans fiche. Chèque et crédit exigent une fiche client."}
              </div>
              {onRequireCustomer && (docType === "FACTURE" || paymentMethod === "CHEQUE" || paymentMethod === "A_CREDIT") && (
                <button
                  onClick={onRequireCustomer}
                  className="mt-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg"
                >
                  Créer / sélectionner le client
                </button>
              )}
            </div>
          )}

          {/* Credit limit warning */}
          {creditLimitExceeded && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800">
                <div className="font-bold">Plafond de crédit dépassé</div>
                <div className="mt-0.5">
                  Solde actuel {formatMoney(outstandingCents ?? 0)} + vente{" "}
                  {formatMoney(totalTtc)} = {formatMoney(projectedBalance)}, au-delà du
                  plafond de {formatMoney(creditLimitCents ?? 0)}.
                </div>
                <div className="mt-0.5 font-semibold">Vous pouvez continuer malgré tout.</div>
              </div>
            </div>
          )}

          {/* Cheque Details Form */}
          {paymentMethod === "CHEQUE" && (
            <div className="space-y-3 pt-3 border-t border-gray-200 animate-in fade-in slide-in-from-top-2">
              <label className="text-xs font-semibold text-gray-700">
                Détails du chèque
              </label>

              <div>
                <label className="text-xs text-gray-600 mb-1 block">Nom de la banque *</label>
                <input id="bankName" name="bankName" aria-label="Nom de la banque"
                  type="text"
                  value={chequeDetails.bankName}
                  onChange={(e) =>
                    setChequeDetails({ ...chequeDetails, bankName: e.target.value })
                  }
                  placeholder="Ex: Attijariwafa Bank"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D]"
                />
              </div>

              <div>
                <label className="text-xs text-gray-600 mb-1 block">Numéro de chèque *</label>
                <input id="chequeNumber" name="chequeNumber" aria-label="Numéro de chèque"
                  type="text"
                  value={chequeDetails.chequeNumber}
                  onChange={(e) =>
                    setChequeDetails({ ...chequeDetails, chequeNumber: e.target.value })
                  }
                  placeholder="Ex: 123456789"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D] font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Date d&apos;émission</label>
                  <input id="issueDate" name="issueDate" aria-label="Date d’émission"
                    type="date"
                    value={chequeDetails.issueDate}
                    onChange={(e) =>
                      setChequeDetails({ ...chequeDetails, issueDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Date encaissement</label>
                  <input id="encaissementDate" name="encaissementDate" aria-label="Date d’encaissement"
                    type="date"
                    value={chequeDetails.encaissementDate}
                    onChange={(e) =>
                      setChequeDetails({ ...chequeDetails, encaissementDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || missingFile}
            title={missingFile ? "Fiche client requise pour ce mode de paiement" : undefined}
            className="w-full bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold py-3 rounded-xl transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Traitement...</span>
              </>
            ) : missingFile ? (
              <>
                <Check size={18} />
                <span>Fiche client requise</span>
              </>
            ) : (
              <>
                <Check size={18} />
                <span>Confirmer le paiement</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
