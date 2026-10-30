"use client";

import React, { useState } from "react";
import { X, Minus, Plus, Check, Image as ImageIcon } from "lucide-react";
import { ProductItem } from "@/lib/actions/products";
import { formatMoney } from "@/lib/money";

interface ProductQuickAddModalProps {
  product: ProductItem;
  onClose: () => void;
  onConfirm: (product: ProductItem, quantity: number) => void;
}

/**
 * Saisie rapide au comptoir : toucher une carte produit ouvre ce popup
 * (photo, prix catalogue, stock), le caissier saisit la quantité puis Valide.
 * Plus besoin de descendre au panier pour ajuster chaque ligne.
 */
const MAX_QTY = 1_000_000; // aligné sur la validation serveur (action-validation qty)

export function ProductQuickAddModal({ product, onClose, onConfirm }: ProductQuickAddModalProps) {
  // Saisie brute : on ne borne que quand le caissier quitte le champ ou valide,
  // sinon vider le champ retombe instantanément sur 1 pendant la frappe.
  const [rawQty, setRawQty] = useState("1");

  // Remise à 1 quand le produit affiché change (ajustement pendant le rendu,
  // pattern officiel React — pas d'effet pour resynchroniser un état sur une prop).
  const [prevProductId, setPrevProductId] = useState(product.id);
  if (prevProductId !== product.id) {
    setPrevProductId(product.id);
    setRawQty("1");
  }

  const parsed = parseInt(rawQty, 10);
  const quantity = Number.isNaN(parsed) ? 0 : Math.floor(parsed);
  const clamp = (n: number) => (Number.isNaN(n) ? 1 : Math.min(MAX_QTY, Math.max(1, Math.floor(n))));
  const commitQty = () => setRawQty(String(clamp(parsed || 1)));
  const overStock = product.currentStock >= 0 && quantity > product.currentStock;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="min-w-0">
            <div className="font-mono font-bold text-sm text-gray-900">{product.sku}</div>
            <div className="text-xs text-gray-600 truncate">{product.name}</div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
            {product.photoUrl ? (
              <img src={product.photoUrl} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={40} className="text-gray-400" />
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Prix : <strong className="text-[#F7162D]">{formatMoney(product.salePriceRetailCents)}</strong>
            </span>
            <span className="text-gray-600">
              Stock : <strong>{product.currentStock}</strong>
            </span>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5">Quantité</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRawQty(String(clamp(quantity - 1)))}
                className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 flex items-center justify-center active:scale-95"
              >
                <Minus size={18} />
              </button>
              <input
                type="number"
                min={1}
                max={MAX_QTY}
                inputMode="numeric"
                value={rawQty}
                onChange={(e) => setRawQty(e.target.value)}
                onBlur={commitQty}
                aria-label="Quantité"
                className="flex-1 h-12 text-center text-xl font-black border border-gray-200 rounded-xl outline-none focus:border-[#F7162D]"
              />
              <button
                type="button"
                onClick={() => setRawQty(String(clamp(quantity + 1)))}
                className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 flex items-center justify-center active:scale-95"
              >
                <Plus size={18} />
              </button>
            </div>
            {overStock && (
              <p className="mt-1.5 text-[11px] font-semibold text-amber-600">
                Quantité supérieure au stock disponible ({product.currentStock})
              </p>
            )}
          </div>

          <div className="flex justify-between items-center text-sm bg-gray-50 rounded-xl px-3 py-2.5">
            <span className="text-gray-600 font-semibold">Sous-total</span>
            <span className="font-mono font-black text-[#F7162D]">
              {formatMoney(product.salePriceRetailCents * quantity)}
            </span>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onConfirm(product, clamp(parsed || 1))}
            className="flex-[2] px-4 py-3 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 active:scale-98"
          >
            <Check size={18} />
            <span>Valider × {quantity || 1}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
