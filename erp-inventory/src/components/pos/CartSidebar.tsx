import React from "react";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Percent,
  User,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import { POS_DOC_TYPES, type PosDocType } from "@/components/pos/docTypes";

interface CartLine {
  productId: number;
  productName: string;
  sku: string;
  oemCode?: string | null;
  unitPriceHTCents: number;
  quantity: number;
  currentStock: number;
}

interface CartSidebarProps {
  cart: CartLine[];
  docType: PosDocType;
  onDocTypeChange: (type: PosDocType) => void;
  discountPercent: number;
  onDiscountChange: (percent: number) => void;
  totals: {
    totalBrutHT: number;
    discountPercent: number;
    discountAmount: number;
    totalNetHT: number;
    tvaRate: number;
    tvaAmount: number;
    totalTTC: number;
  };
  onUpdateQuantity: (productId: number, delta: number) => void;
  onRemoveLine: (productId: number) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  onCustomerSelect: () => void;
  customerName: string;
}

const DOC_TYPES = POS_DOC_TYPES;

export function CartSidebar({
  cart,
  docType,
  onDocTypeChange,
  discountPercent,
  onDiscountChange,
  totals,
  onUpdateQuantity,
  onRemoveLine,
  onClearCart,
  onCheckout,
  onCustomerSelect,
  customerName,
}: CartSidebarProps) {
  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} className="text-[#F7162D]" />
            <span className="font-bold text-gray-900">Panier</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {cart.length}
            </span>
          </div>
          {cart.length > 0 && (
            <button
              onClick={onClearCart}
              className="text-xs text-gray-500 hover:text-red-600"
            >
              Vider
            </button>
          )}
        </div>

        {/* Document Type Selector */}
        <div className="flex gap-1">
          {DOC_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => onDocTypeChange(t.id)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                docType === t.id
                  ? "bg-[#F7162D] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Info */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onCustomerSelect}
          className="w-full flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <User size={16} className="text-gray-500" />
          <div className="flex-1 text-left">
            <div className="text-xs font-semibold text-gray-900 truncate">
              {customerName}
            </div>
            <div className="text-[10px] text-gray-500">Modifier</div>
          </div>
        </button>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            <ShoppingCart size={32} className="mx-auto mb-2 text-gray-300" />
            Panier vide
          </div>
        ) : (
          cart.map((item) => (
            <div
              key={item.productId}
              className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-xs text-gray-900">
                  {item.sku}
                </div>
                <div className="text-xs text-gray-700 truncate">
                  {item.productName}
                </div>
                <div className="text-[10px] text-gray-500">
                  {formatMoney(item.unitPriceHTCents)}
                </div>
                {item.quantity > item.currentStock && (
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 mt-0.5">
                    <AlertTriangle size={11} />
                    <span>
                      Stock insuffisant ({item.currentStock} dispo)
                    </span>
                  </div>
                )}
              </div>

              {/* Quantity Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onUpdateQuantity(item.productId, -1)}
                  className="w-7 h-7 rounded bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 active:scale-95"
                >
                  <Minus size={12} />
                </button>
                <span className="w-8 text-center font-mono font-bold text-sm">
                  {item.quantity}
                </span>
                <button
                  onClick={() => onUpdateQuantity(item.productId, 1)}
                  className="w-7 h-7 rounded bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 active:scale-95"
                >
                  <Plus size={12} />
                </button>
              </div>

              {/* Line Total */}
              <div className="text-right min-w-[60px]">
                <div className="font-mono font-bold text-sm text-gray-900">
                  {formatMoney(item.unitPriceHTCents * item.quantity)}
                </div>
                <button
                  onClick={() => onRemoveLine(item.productId)}
                  className="text-gray-400 hover:text-red-600 mt-1"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Discount Section */}
      {cart.length > 0 && (
        <div className="p-4 border-t border-gray-200 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <Percent size={14} className="text-emerald-600" />
              Remise
            </label>
            <span className="text-xs font-mono font-bold text-emerald-600">
              {discountPercent}%
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[0, 5, 10, 15].map((rate) => (
              <button
                key={rate}
                onClick={() => onDiscountChange(rate)}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                  discountPercent === rate
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {rate}%
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Autre:</span>
            <input
              type="number"
              min="0"
              max="100"
              value={discountPercent || ""}
              onChange={(e) =>
                onDiscountChange(
                  Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0))
                )
              }
              placeholder="0"
              className="w-16 px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg font-bold outline-none focus:border-emerald-600"
            />
          </div>
        </div>
      )}

      {/* Totals and Checkout */}
      {cart.length > 0 && (
        <div className="p-4 border-t border-gray-200 space-y-3 bg-gray-50">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Total Brut HT</span>
              <span className="font-mono">{formatMoney(totals.totalBrutHT)}</span>
            </div>
            {discountPercent > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Remise ({discountPercent}%)</span>
                <span className="font-mono">-{formatMoney(totals.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Total Net HT</span>
              <span className="font-mono">{formatMoney(totals.totalNetHT)}</span>
            </div>
            {totals.tvaRate > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>TVA ({totals.tvaRate}%)</span>
                <span className="font-mono">{formatMoney(totals.tvaAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total TTC</span>
              <span className="font-mono text-[#F7162D]">
                {formatMoney(totals.totalTTC)}
              </span>
            </div>
          </div>

          <button
            onClick={onCheckout}
            className="w-full bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold py-3 rounded-xl transition-all active:scale-98 flex items-center justify-center gap-2"
          >
            <CreditCard size={18} />
            <span>Valider</span>
          </button>
        </div>
      )}
    </div>
  );
}
