import React from "react";
import {
  Banknote,
  Check,
  CreditCard,
  Delete,
  Eraser,
  Gift,
  Landmark,
  ListOrdered,
  Pause,
  PenLine,
  Percent,
  ScrollText,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { TenderMethod } from "@/components/pos/SplitPaymentModal";

interface NumpadPanelProps {
  value: string;
  onValueChange: (v: string) => void;
  /** Une ligne du panier est sélectionnée → les ops de ligne sont actives. */
  hasSelection: boolean;
  cartCount: number;
  parkedCount: number;
  totals: {
    totalBrutHT: number;
    discountPercent: number;
    discountAmount: number;
    lineDiscountAmount?: number;
    totalNetHT: number;
    tvaRate: number;
    tvaAmount: number;
    totalTTC: number;
  };
  isSubmitting: boolean;
  /** DEVIS : pas de règlement — le bouton principal émet le devis directement. */
  isDevis?: boolean;
  globalDiscount: number;
  onGlobalDiscount: (p: number) => void;
  onSetQuantity: () => void;
  onForcePrice: () => void;
  onLineDiscount: () => void;
  onToggleFree: () => void;
  onRename: () => void;
  onDeleteLine: () => void;
  onPark: () => void;
  onRecall: () => void;
  onClearCart: () => void;
  onQuickCash: () => void;
  /** Paiement rapide d'une méthode : ouvre le modal avec la jambe pré-remplie au total. */
  onQuickMethod: (method: TenderMethod) => void;
  onCheckout: () => void;
}

export function NumpadPanel({
  value,
  onValueChange,
  hasSelection,
  cartCount,
  parkedCount,
  totals,
  isSubmitting,
  isDevis = false,
  globalDiscount,
  onGlobalDiscount,
  onSetQuantity,
  onForcePrice,
  onLineDiscount,
  onToggleFree,
  onRename,
  onDeleteLine,
  onPark,
  onRecall,
  onClearCart,
  onQuickCash,
  onQuickMethod,
  onCheckout,
}: NumpadPanelProps) {
  const append = (d: string) => {
    if (d === "." && value.includes(".")) return;
    const next = value === "0" && d !== "." ? d : value + d;
    if (next.replace(".", "").length > 10) return;
    onValueChange(next);
  };

  const opBtn = (
    label: string,
    Icon: React.ComponentType<{ size?: number; className?: string }>,
    onClick: () => void,
    opts: { disabled?: boolean; color?: string; title?: string } = {}
  ) => (
    <button
      onClick={onClick}
      disabled={opts.disabled}
      title={opts.title}
      className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[10px] font-bold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
        opts.color ?? "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );

  const digit = (d: string) => (
    <button
      key={d}
      onClick={() => append(d)}
      className="py-3 rounded-lg bg-white border border-gray-200 text-lg font-mono font-bold text-gray-900 hover:bg-gray-50 active:scale-95 transition-all"
    >
      {d}
    </button>
  );

  const lineDiscount = totals.lineDiscountAmount ?? 0;

  return (
    <div className="bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Totals */}
      <div className="p-3 border-b border-gray-200 space-y-1 text-xs">
        <div className="flex justify-between text-gray-700">
          <span className="font-semibold">Brut HT</span>
          <span className="font-mono font-bold text-gray-900">{formatMoney(totals.totalBrutHT + lineDiscount)}</span>
        </div>
        {lineDiscount > 0 && (
          <div className="flex justify-between text-emerald-600">
            <span>Remises lignes</span>
            <span className="font-mono">-{formatMoney(lineDiscount)}</span>
          </div>
        )}
        {totals.discountPercent > 0 && (
          <div className="flex justify-between text-emerald-600">
            <span>Remise globale ({totals.discountPercent}%)</span>
            <span className="font-mono">-{formatMoney(totals.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-700">
          <span className="font-semibold">Net HT</span>
          <span className="font-mono font-bold text-gray-900">{formatMoney(totals.totalNetHT)}</span>
        </div>
        {totals.tvaRate > 0 && (
          <div className="flex justify-between text-gray-700">
            <span className="font-semibold">TVA {totals.tvaRate}%</span>
            <span className="font-mono font-bold text-gray-900">{formatMoney(totals.tvaAmount)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-200">
          <span className="text-sm font-bold text-gray-900">TOTAL</span>
          <span className="text-2xl font-mono font-bold text-[#F7162D]">
            {formatMoney(totals.totalTTC)}
          </span>
        </div>
      </div>

      {/* Remise globale */}
      <div className="px-3 pt-2 flex items-center gap-1">
        <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
          <Percent size={11} className="text-emerald-600" /> Rem. globale
        </span>
        <div className="ml-auto flex gap-1">
          {[0, 5, 10].map((r) => (
            <button
              key={r}
              onClick={() => onGlobalDiscount(r)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                globalDiscount === r ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r}%
            </button>
          ))}
          <input
            type="text"
            inputMode="numeric"
            aria-label="Remise globale personnalisée"
            value={[0, 5, 10].includes(globalDiscount) ? "" : globalDiscount || ""}
            onChange={(e) => onGlobalDiscount(Math.min(30, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            placeholder="%"
            className="w-9 px-1 py-0.5 text-[10px] text-center bg-gray-50 border border-gray-200 rounded font-bold outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      {/* Numpad display */}
      <div className="px-3 pt-3">
        <div className="bg-gray-900 text-white font-mono text-right text-2xl px-3 py-2 rounded-lg min-h-[2.75rem]">
          {value || "0"}
        </div>
      </div>

      {/* Numpad */}
      <div className="px-3 pt-2 grid grid-cols-3 gap-1.5">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map(digit)}
        <button
          onClick={() => onValueChange("")}
          className="py-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold hover:bg-amber-200 active:scale-95 transition-all flex items-center justify-center gap-1"
        >
          <Eraser size={16} /> CE
        </button>
        {digit("0")}
        <button
          onClick={() => append(".")}
          className="py-3 rounded-lg bg-white border border-gray-200 text-lg font-mono font-bold text-gray-900 hover:bg-gray-50 active:scale-95 transition-all"
        >
          .
        </button>
        <button
          onClick={() => onValueChange(value.slice(0, -1))}
          className="py-3 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center"
        >
          <Delete size={18} />
        </button>
        {digit("00")}
        <button
          onClick={() => append(".")}
          className="py-3 rounded-lg bg-white border border-gray-200 text-xs font-bold text-gray-500"
          disabled
        >
          DH
        </button>
      </div>

      {/* Ops de ligne (legacy numpad cluster) */}
      <div className="px-3 pt-2 grid grid-cols-3 gap-1.5">
        {opBtn("Qté", ListOrdered, onSetQuantity, { disabled: !hasSelection })}
        {opBtn("R.For", Tag, onForcePrice, { disabled: !hasSelection, title: "Forcer le prix TTC de la ligne" })}
        {opBtn("Rem%", Percent, onLineDiscount, { disabled: !hasSelection, title: "Remise ligne ≤ 10%" })}
        {opBtn("Offert", Gift, onToggleFree, { disabled: !hasSelection, color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" })}
        {opBtn("Libellé", PenLine, onRename, { disabled: !hasSelection, title: "Renommer la ligne sur le ticket" })}
        {opBtn("Sup.Ligne", Trash2, onDeleteLine, { disabled: !hasSelection, color: "bg-red-100 text-red-700 hover:bg-red-200" })}
        {opBtn("Attente", Pause, onPark, { disabled: cartCount === 0, title: "Mise en attente du ticket" })}
        {opBtn(
          `Rappel${parkedCount > 0 ? ` (${parkedCount})` : ""}`,
          Undo2,
          onRecall,
          { disabled: parkedCount === 0, title: "Rappeler un ticket en attente" }
        )}
        {opBtn("Vider", Eraser, onClearCart, { disabled: cartCount === 0, title: "Annuler la vente (vide le panier)" })}
      </div>

      {/* Payment */}
      <div className="mt-auto p-3 space-y-1.5">
        {!isDevis && (
          <>
            {/* Règlement rapide par méthode (jambe unique au total — saisie des refs dans le modal) */}
            <div className="grid grid-cols-3 gap-1.5">
              {opBtn("Chèque", Landmark, () => onQuickMethod("CHEQUE"), {
                disabled: cartCount === 0 || isSubmitting,
                color: "bg-blue-100 text-blue-700 hover:bg-blue-200",
                title: "Régler le total par chèque",
              })}
              {opBtn("TPE", CreditCard, () => onQuickMethod("CARTE_BANCAIRE"), {
                disabled: cartCount === 0 || isSubmitting,
                color: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
                title: "Régler le total par carte bancaire",
              })}
              {opBtn("Effet", ScrollText, () => onQuickMethod("EFFET_LCN"), {
                disabled: cartCount === 0 || isSubmitting,
                color: "bg-violet-100 text-violet-700 hover:bg-violet-200",
                title: "Régler le total par effet / LCN",
              })}
            </div>
            <button
              onClick={onQuickCash}
              disabled={cartCount === 0 || isSubmitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all active:scale-98 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Banknote size={18} />
              Espèce {totals.totalTTC > 0 && `· ${formatMoney(totals.totalTTC)}`}
            </button>
          </>
        )}
        <button
          onClick={onCheckout}
          disabled={cartCount === 0 || isSubmitting}
          className="w-full bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold py-3 rounded-xl transition-all active:scale-98 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Check size={18} />
          )}
          {isDevis ? "Émettre le devis" : "Valider / Paiement"}
        </button>
      </div>
    </div>
  );
}
