import React, { useMemo, useState } from "react";
import { X, Check, Plus, Trash2, AlertTriangle, Banknote, User } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { useToast } from "@/components/ui/ToastProvider";

export type TenderMethod =
  | "ESPECES"
  | "CARTE_BANCAIRE"
  | "CHEQUE"
  | "VIREMENT"
  | "VERSEMENT"
  | "EFFET_LCN"
  | "BON_REDUCTION"
  | "AVOIR";

export interface TenderLegInput {
  method: TenderMethod;
  amountCents: number;
  cashReceivedCents?: number;
  referenceNumber?: string;
  bankName?: string;
  payeeName?: string;
  issueDate?: string;
  dueDate?: string;
}

interface Leg {
  id: number;
  method: TenderMethod;
  amount: string;
  cashReceived: string;
  referenceNumber: string;
  bankName: string;
  payeeName: string;
  issueDate: string;
  dueDate: string;
}

const METHOD_DEFS: Array<{ id: TenderMethod; label: string; hint: string }> = [
  { id: "ESPECES", label: "Espèces", hint: "cash" },
  { id: "CARTE_BANCAIRE", label: "Carte (TPE)", hint: "réf terminal" },
  { id: "CHEQUE", label: "Chèque", hint: "fiche requise" },
  { id: "VIREMENT", label: "Virement", hint: "fiche requise" },
  { id: "VERSEMENT", label: "Versement", hint: "fiche requise" },
  { id: "EFFET_LCN", label: "Effet / LCN", hint: "fiche requise" },
  { id: "BON_REDUCTION", label: "Bon réduction", hint: "n° bon" },
  { id: "AVOIR", label: "Avoir", hint: "n° avoir" },
];

/** Méthodes différées : la banque encaisse plus tard → fiche client exigée. */
const DEFERRED = new Set<TenderMethod>(["CHEQUE", "VIREMENT", "VERSEMENT", "EFFET_LCN"]);

const dhToCents = (s: string): number => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const centsToDh = (c: number): string => (c / 100).toFixed(2);

interface SplitPaymentModalProps {
  totalTtc: number;
  customerId?: number | null;
  customerName?: string;
  creditLimitCents?: number | null;
  outstandingCents?: number | null;
  docType?: "BL" | "FACTURE" | "BC" | "DEVIS";
  /** Méthode pré-remplie sur la 1ʳᵉ jambe (boutons rapides Chèque/TPE/Effet). */
  initialMethod?: TenderMethod;
  isSubmitting: boolean;
  onClose: () => void;
  onRequireCustomer?: () => void;
  /** legs = jambes réglées ; le reliquat devient crédit (fiche requise). */
  onPayment: (data: { tenders: TenderLegInput[]; creditCents: number }) => void;
}

let legSeq = 0;

export function SplitPaymentModal({
  totalTtc,
  customerId = null,
  customerName,
  creditLimitCents,
  outstandingCents,
  docType = "BL",
  initialMethod = "ESPECES",
  isSubmitting,
  onClose,
  onRequireCustomer,
  onPayment,
}: SplitPaymentModalProps) {
  const toast = useToast();
  const [legs, setLegs] = useState<Leg[]>(() =>
    totalTtc > 0
      ? [{ id: ++legSeq, method: initialMethod, amount: centsToDh(totalTtc), cashReceived: "", referenceNumber: "", bankName: "", payeeName: "", issueDate: "", dueDate: "" }]
      : []
  );

  const paidCents = useMemo(() => legs.reduce((s, l) => s + dhToCents(l.amount), 0), [legs]);
  const remainingCents = Math.max(0, totalTtc - paidCents);
  const overCents = paidCents - totalTtc;
  const hasDeferred = legs.some((l) => DEFERRED.has(l.method));
  const needsCustomer = hasDeferred || remainingCents > 0 || docType === "FACTURE";
  const missingCustomer = needsCustomer && customerId == null;

  const creditLimitExceeded =
    remainingCents > 0 &&
    creditLimitCents != null &&
    (outstandingCents ?? 0) + remainingCents > creditLimitCents;

  const updateLeg = (id: number, patch: Partial<Leg>) =>
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const addLeg = (method: TenderMethod) => {
    setLegs((prev) => [
      ...prev,
      { id: ++legSeq, method, amount: remainingCents > 0 ? centsToDh(remainingCents) : "", cashReceived: "", referenceNumber: "", bankName: "", payeeName: "", issueDate: "", dueDate: "" },
    ]);
  };

  const removeLeg = (id: number) => setLegs((prev) => prev.filter((l) => l.id !== id));

  const handleSubmit = () => {
    if (legs.length === 0) {
      // Vente à crédit intégral ou ticket 100% offert (total 0).
      if (remainingCents > 0 && customerId == null) return;
      onPayment({ tenders: [], creditCents: remainingCents });
      return;
    }
    for (const l of legs) {
      const amount = dhToCents(l.amount);
      if (amount <= 0) {
        toast.error(`Montant manquant — ${METHOD_DEFS.find((m) => m.id === l.method)?.label}`);
        return;
      }
      if (l.method === "ESPECES" && l.cashReceived && dhToCents(l.cashReceived) < amount) {
        toast.error("Montant remis inférieur à la part espèces");
        return;
      }
      if (l.method === "CHEQUE" && (!l.referenceNumber.trim() || !l.bankName.trim())) {
        toast.error("Chèque : numéro et banque requis");
        return;
      }
      if (l.method === "EFFET_LCN" && !l.referenceNumber.trim()) {
        toast.error("Effet / LCN : numéro requis");
        return;
      }
    }
    if (overCents > 0) {
      toast.error("Le total des règlements dépasse le total à payer");
      return;
    }
    onPayment({
      tenders: legs.map((l) => ({
        method: l.method,
        amountCents: dhToCents(l.amount),
        cashReceivedCents: l.method === "ESPECES" && l.cashReceived ? dhToCents(l.cashReceived) : undefined,
        referenceNumber: l.referenceNumber.trim() || undefined,
        bankName: l.bankName.trim() || undefined,
        payeeName: l.payeeName.trim() || undefined,
        issueDate: l.issueDate || undefined,
        dueDate: l.dueDate || undefined,
      })),
      creditCents: remainingCents,
    });
  };

  const inputCls =
    "w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-[#F7162D] font-mono";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Banknote size={20} className="text-[#F7162D]" /> Règlement
          </h2>
          <button onClick={onClose} disabled={isSubmitting} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Totals strip */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 rounded-xl py-2">
              <div className="text-[10px] text-gray-500">Total à payer</div>
              <div className="font-mono font-bold text-lg text-gray-900">{formatMoney(totalTtc)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl py-2">
              <div className="text-[10px] text-gray-500">Réglé</div>
              <div className="font-mono font-bold text-lg text-emerald-600">{formatMoney(Math.min(paidCents, totalTtc))}</div>
            </div>
            <div className={`rounded-xl py-2 ${remainingCents > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
              <div className="text-[10px] text-gray-500">{remainingCents > 0 ? "Reliquat → crédit" : "Restant"}</div>
              <div className={`font-mono font-bold text-lg ${remainingCents > 0 ? "text-amber-700" : "text-gray-400"}`}>
                {formatMoney(remainingCents)}
              </div>
            </div>
          </div>

          {/* Legs */}
          <div className="space-y-2">
            {legs.map((leg, idx) => (
              <div key={leg.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-900 flex-1">
                    {idx + 1}. {METHOD_DEFS.find((m) => m.id === leg.method)?.label}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Montant jambe ${idx + 1}`}
                    value={leg.amount}
                    onChange={(e) => updateLeg(leg.id, { amount: e.target.value.replace(/[^\d.,]/g, "") })}
                    placeholder="0,00"
                    className={`${inputCls} !w-28 text-right font-bold`}
                  />
                  <span className="text-xs text-gray-500">DH</span>
                  <button onClick={() => removeLeg(leg.id)} className="p-1 text-gray-400 hover:text-red-600" aria-label="Retirer">
                    <Trash2 size={14} />
                  </button>
                </div>

                {leg.method === "ESPECES" && (
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500 block">Montant remis</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Montant remis jambe ${idx + 1}`}
                        value={leg.cashReceived}
                        onChange={(e) => updateLeg(leg.id, { cashReceived: e.target.value.replace(/[^\d.,]/g, "") })}
                        placeholder="0,00"
                        className={inputCls}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-gray-500">Monnaie à rendre</div>
                      <div className="font-mono font-bold text-emerald-700">
                        {leg.cashReceived
                          ? formatMoney(Math.max(0, dhToCents(leg.cashReceived) - dhToCents(leg.amount)))
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}

                {leg.method === "CHEQUE" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" aria-label="N° chèque" value={leg.referenceNumber} onChange={(e) => updateLeg(leg.id, { referenceNumber: e.target.value })} placeholder="N° chèque *" className={inputCls} />
                    <input type="text" aria-label="Banque" value={leg.bankName} onChange={(e) => updateLeg(leg.id, { bankName: e.target.value })} placeholder="Banque *" className={inputCls} />
                    <input type="text" aria-label="Payable à" value={leg.payeeName} onChange={(e) => updateLeg(leg.id, { payeeName: e.target.value })} placeholder="Payable à" className={inputCls} />
                    <div className="grid grid-cols-2 gap-1">
                      <input type="date" aria-label="Date émission" value={leg.issueDate} onChange={(e) => updateLeg(leg.id, { issueDate: e.target.value })} className={inputCls} />
                      <input type="date" aria-label="Date encaissement" value={leg.dueDate} onChange={(e) => updateLeg(leg.id, { dueDate: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                )}

                {leg.method === "EFFET_LCN" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" aria-label="N° effet" value={leg.referenceNumber} onChange={(e) => updateLeg(leg.id, { referenceNumber: e.target.value })} placeholder="N° effet / LCN *" className={inputCls} />
                    <div>
                      <label className="text-[10px] text-gray-500 block">Échéance</label>
                      <input type="date" aria-label="Date échéance effet" value={leg.dueDate} onChange={(e) => updateLeg(leg.id, { dueDate: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                )}

                {["CARTE_BANCAIRE", "VIREMENT", "VERSEMENT"].includes(leg.method) && (
                  <input type="text" aria-label="Référence" value={leg.referenceNumber} onChange={(e) => updateLeg(leg.id, { referenceNumber: e.target.value })} placeholder={leg.method === "CARTE_BANCAIRE" ? "Réf. TPE (optionnel)" : "Référence"} className={inputCls} />
                )}

                {["BON_REDUCTION", "AVOIR"].includes(leg.method) && (
                  <input type="text" aria-label="N° document" value={leg.referenceNumber} onChange={(e) => updateLeg(leg.id, { referenceNumber: e.target.value })} placeholder={leg.method === "AVOIR" ? "N° avoir" : "N° bon de réduction"} className={inputCls} />
                )}
              </div>
            ))}
          </div>

          {/* Add-leg buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {METHOD_DEFS.map((m) => (
              <button
                key={m.id}
                onClick={() => addLeg(m.id)}
                className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-700 transition-all active:scale-95"
              >
                <Plus size={12} />
                {m.label}
              </button>
            ))}
          </div>

          {/* Warnings */}
          {overCents > 0 && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
              <AlertTriangle size={16} /> Dépassement de {formatMoney(overCents)} — réduisez une jambe.
            </div>
          )}

          {missingCustomer && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
              <div className="font-bold flex items-center gap-1"><User size={13} /> Fiche client requise</div>
              <div className="mt-0.5">
                {remainingCents > 0 && "Un reliquat non réglé devient du crédit — "}
                {hasDeferred && "chèque/virement/effet exige une fiche — "}
                {docType === "FACTURE" && "FACTURE exige toujours une fiche. "}
                {customerId == null ? "Pas de vente comptoir possible." : ""}
              </div>
              {onRequireCustomer && (
                <button onClick={onRequireCustomer} className="mt-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg">
                  Créer / sélectionner le client
                </button>
              )}
            </div>
          )}

          {creditLimitExceeded && !missingCustomer && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800">
                <div className="font-bold">Plafond de crédit dépassé</div>
                <div className="mt-0.5">
                  Solde {formatMoney(outstandingCents ?? 0)} + reliquat {formatMoney(remainingCents)} &gt; plafond {formatMoney(creditLimitCents ?? 0)}. Vous pouvez continuer malgré tout.
                </div>
              </div>
            </div>
          )}

          {remainingCents > 0 && customerId != null && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <span className="font-bold">Crédit :</span> {formatMoney(remainingCents)} sera ajouté au solde de {customerName ?? "ce client"}.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || overCents > 0 || missingCustomer}
            className="w-full bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check size={18} />
            )}
            {isSubmitting
              ? "Traitement..."
              : missingCustomer
                ? "Fiche client requise"
                : remainingCents > 0
                  ? `Valider — dont ${formatMoney(remainingCents)} à crédit`
                  : "Confirmer le paiement"}
          </button>
        </div>
      </div>
    </div>
  );
}
