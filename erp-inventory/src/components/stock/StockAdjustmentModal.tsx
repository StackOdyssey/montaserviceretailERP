"use client";

import React, { useState } from "react";
import { X, ArrowUpDown, Plus, Minus, AlertCircle, Check } from "lucide-react";
import { ProductItem } from "@/lib/actions/products";

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductItem | null;
  onAdjust: (data: {
    productId: number;
    movementType: "ACHAT_RECEPTION" | "VENTE_BL" | "AVOIR_RETOUR" | "AJUSTEMENT_INVENTAIRE";
    quantity: number;
    reason: string;
  }) => Promise<void>;
}

export function StockAdjustmentModal({
  isOpen,
  onClose,
  product,
  onAdjust,
}: StockAdjustmentModalProps) {
  const [operationType, setOperationType] = useState<"ADD" | "SUBTRACT" | "SET">("ADD");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !product) return null;

  const currentStock = product.currentStock;
  const parsedQty = parseInt(quantity, 10) || 0;

  // Calcul du nouveau stock prévu
  let projectedStock = currentStock;
  if (operationType === "ADD") {
    projectedStock = currentStock + parsedQty;
  } else if (operationType === "SUBTRACT") {
    projectedStock = currentStock - parsedQty;
  } else if (operationType === "SET") {
    projectedStock = parsedQty;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMessage("Le motif de l'ajustement est obligatoire pour l'audit comptable");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      let delta = 0;
      if (operationType === "ADD") {
        delta = parsedQty;
      } else if (operationType === "SUBTRACT") {
        delta = -parsedQty;
      } else if (operationType === "SET") {
        delta = parsedQty - currentStock;
      }

      await onAdjust({
        productId: product.id,
        movementType: "AJUSTEMENT_INVENTAIRE",
        quantity: delta,
        reason: reason.trim(),
      });

      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Erreur lors de l'ajustement");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#E5E7EB] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] bg-[#F8F9FA]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] text-[#F7162D] flex items-center justify-center">
              <ArrowUpDown size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111827]">
                Ajustement de Stock
              </h2>
              <span className="text-xs font-mono font-bold text-[#F7162D]">
                {product.sku}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Fiche pièce rapide */}
          <div className="p-3 bg-[#F8F9FA] rounded-xl border border-[#E5E7EB] text-xs space-y-1">
            <p className="font-semibold text-[#111827]">{product.name}</p>
            <div className="flex items-center justify-between pt-1 text-[#6B7280]">
              <span>Stock actuel en magasin :</span>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded-md ${
                  currentStock < 0
                    ? "bg-[#FEF2F2] text-[#F7162D]"
                    : currentStock <= product.minStockAlert
                    ? "bg-[#FFFBEB] text-[#D97706]"
                    : "bg-[#ECFDF5] text-[#059669]"
                }`}
              >
                {currentStock} pièces
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-[#F7162D] text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type d'opération */}
            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1.5">
                Type de mouvement
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setOperationType("ADD")}
                  className={`py-2 px-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    operationType === "ADD"
                      ? "border-[#059669] bg-[#ECFDF5] text-[#059669]"
                      : "border-[#E5E7EB] text-[#4B5563] hover:bg-[#F3F4F6]"
                  }`}
                >
                  <Plus size={16} />
                  <span>Entrée (+)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOperationType("SUBTRACT")}
                  className={`py-2 px-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    operationType === "SUBTRACT"
                      ? "border-[#F7162D] bg-[#FEF2F2] text-[#F7162D]"
                      : "border-[#E5E7EB] text-[#4B5563] hover:bg-[#F3F4F6]"
                  }`}
                >
                  <Minus size={16} />
                  <span>Sortie (-)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOperationType("SET")}
                  className={`py-2 px-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    operationType === "SET"
                      ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                      : "border-[#E5E7EB] text-[#4B5563] hover:bg-[#F3F4F6]"
                  }`}
                >
                  <ArrowUpDown size={16} />
                  <span>Inventaire (=)</span>
                </button>
              </div>
            </div>

            {/* Quantité */}
            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                {operationType === "SET" ? "Nouveau stock réel compté" : "Quantité à appliquer"}
              </label>
              <input
                type="number"
                min={operationType === "SET" ? undefined : "1"}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 text-base font-bold bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] outline-none"
              />
            </div>

            {/* Prévisualisation nouveau stock */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8F9FA] border border-[#E5E7EB] text-xs">
              <span className="text-[#6B7280]">Nouveau stock après validation :</span>
              <span
                className={`font-bold font-mono text-sm ${
                  projectedStock < 0
                    ? "text-[#F7162D]"
                    : projectedStock <= product.minStockAlert
                    ? "text-[#D97706]"
                    : "text-[#059669]"
                }`}
              >
                {projectedStock} pièces
              </span>
            </div>

            {/* Motif obligatoire */}
            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Motif obligatoire (Audit) *
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="ex: Arrivage sans BL, Casse atelier, Inventaire..."
                className="w-full px-3 py-2 text-xs bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] outline-none"
              />
            </div>

            {/* Boutons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-semibold text-[#6B7280] hover:text-[#111827]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50"
              >
                <Check size={16} />
                <span>{isSubmitting ? "Enregistrement..." : "Valider le mouvement"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
