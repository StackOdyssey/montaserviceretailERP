import React from "react";
import { Trash2, AlertTriangle, Gift, PenLine, Tag, ShoppingCart } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { SalesLineInput } from "@/lib/actions/sales";

export interface PosCartLine extends SalesLineInput {
  currentStock: number;
  /** Prix catalogue HT posé à l'ajout — restauration après OFFERT. Client-only, strip avant submit. */
  catalogPriceHTCents?: number;
  /** Motif saisi au comptoir pour un prix forcé (agrégé en overrideReason). */
  forceReason?: string;
}

interface CartTableProps {
  cart: PosCartLine[];
  selectedProductId: number | null;
  tvaRate: number;
  onSelect: (productId: number | null) => void;
  onRemoveLine: (productId: number) => void;
  onUpdateQuantity: (productId: number, delta: number) => void;
}

/** TTC d'une ligne = prix TTC unitaire (ou HT dérivé) × qté, remise ligne appliquée. */
function lineTtcCents(l: PosCartLine, tvaRate: number): number {
  if (l.isFree) return 0;
  const ttc = l.unitPriceTtcCents ?? Math.round(l.unitPriceHTCents * (1 + tvaRate / 100));
  const gross = ttc * l.quantity;
  const ld = Math.min(100, Math.max(0, l.discountPercent ?? 0));
  return ld > 0 ? Math.round(gross * (1 - ld / 100)) : gross;
}

function unitTtcCents(l: PosCartLine, tvaRate: number): number {
  if (l.isFree) return 0;
  return l.unitPriceTtcCents ?? Math.round(l.unitPriceHTCents * (1 + tvaRate / 100));
}

export function CartTable({
  cart,
  selectedProductId,
  tvaRate,
  onSelect,
  onRemoveLine,
  onUpdateQuantity,
}: CartTableProps) {
  if (cart.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2 py-6">
        <ShoppingCart size={28} className="text-gray-300" />
        <span className="text-sm">Panier vide — scannez ou touchez un article</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-gray-100 text-gray-600 uppercase tracking-wide text-[10px]">
          <tr>
            <th className="px-2 py-2">Réf</th>
            <th className="px-2 py-2">Désignation</th>
            <th className="px-2 py-2 text-center">Qté</th>
            <th className="px-2 py-2 text-right">PU TTC</th>
            <th className="px-2 py-2 text-center">Rem%</th>
            <th className="px-2 py-2 text-right">Total TTC</th>
            <th className="px-1 py-2" />
          </tr>
        </thead>
        <tbody>
          {cart.map((item) => {
            const selected = item.productId === selectedProductId;
            const displayName = item.customLabel?.trim() || item.productName;
            return (
              <tr
                key={item.productId}
                onClick={() => onSelect(selected ? null : item.productId)}
                className={`border-b cursor-pointer transition-colors ${
                  selected
                    ? "bg-red-50 outline outline-2 -outline-offset-2 outline-[#F7162D]/60"
                    : "hover:bg-gray-50"
                }`}
              >
                <td className="px-2 py-2 font-mono font-bold text-gray-900 whitespace-nowrap">
                  {item.sku}
                </td>
                <td className="px-2 py-2 max-w-[180px]">
                  <div className="truncate font-medium text-gray-800">{displayName}</div>
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {item.isFree && (
                      <span className="inline-flex items-center gap-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded">
                        <Gift size={10} /> OFFERT
                      </span>
                    )}
                    {item.priceForced && !item.isFree && (
                      <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded">
                        <Tag size={10} /> R.FOR
                      </span>
                    )}
                    {item.customLabel && (
                      <span className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded">
                        <PenLine size={10} /> LIBELLÉ
                      </span>
                    )}
                    {item.quantity > item.currentStock && (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 text-[9px] font-bold">
                        <AlertTriangle size={10} /> stock {item.currentStock}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onUpdateQuantity(item.productId, -1); }}
                      className="w-6 h-6 rounded bg-white border border-gray-200 font-bold hover:bg-gray-100"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-mono font-bold text-sm">{item.quantity}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onUpdateQuantity(item.productId, 1); }}
                      className="w-6 h-6 rounded bg-white border border-gray-200 font-bold hover:bg-gray-100"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="px-2 py-2 text-right font-mono text-gray-700 whitespace-nowrap">
                  {formatMoney(unitTtcCents(item, tvaRate))}
                </td>
                <td className="px-2 py-2 text-center font-mono text-emerald-700">
                  {item.discountPercent ? `−${item.discountPercent}%` : "—"}
                </td>
                <td className="px-2 py-2 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                  {formatMoney(lineTtcCents(item, tvaRate))}
                </td>
                <td className="px-1 py-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveLine(item.productId); }}
                    className="p-1 text-gray-400 hover:text-red-600"
                    aria-label="Supprimer la ligne"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
