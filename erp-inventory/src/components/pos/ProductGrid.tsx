import React from "react";
import { Image as ImageIcon } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { ProductItem } from "@/lib/actions/products";

interface ProductGridProps {
  products: ProductItem[];
  onAddToCart: (product: ProductItem) => void;
  /** Si false, les articles en rupture restent ajoutables (stock négatif toléré). Défaut : true. */
  disableOutOfStock?: boolean;
}

export function ProductGrid({ products, onAddToCart, disableOutOfStock = true }: ProductGridProps) {
  const isOut = (p: ProductItem) => disableOutOfStock && p.currentStock <= 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {products.map((product) => (
        <button
          key={product.id}
          onClick={() => onAddToCart(product)}
          disabled={isOut(product)}
          className={`bg-white rounded-xl border-2 p-3 text-left transition-all hover:shadow-md active:scale-95 ${
            isOut(product)
              ? "border-gray-200 opacity-50 cursor-not-allowed"
              : "border-gray-200 hover:border-[#F7162D] cursor-pointer"
          }`}
        >
          {/* Product Image */}
          <div className="aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
            {product.photoUrl ? (
              <img
                src={product.photoUrl}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <ImageIcon size={32} className="text-gray-400" />
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-1">
            <div className="font-mono font-bold text-xs text-gray-900">
              {product.sku}
            </div>
            <div className="text-xs text-gray-700 line-clamp-2 font-medium min-h-[2.5em]">
              {product.name}
            </div>
            {product.brand && (
              <div className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded inline-block">
                {product.brand}
              </div>
            )}

            {/* Price and Stock */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <span className="text-sm font-bold text-[#F7162D]">
                {formatMoney(product.salePriceRetailCents)}
              </span>
              <span
                className={`text-[10px] font-semibold ${
                  product.currentStock <= 0
                    ? "text-red-600"
                    : product.currentStock <= product.minStockAlert
                      ? "text-amber-600"
                      : "text-gray-600"
                }`}
              >
                {product.currentStock <= 0 ? "Rupture" : `Stock: ${product.currentStock}`}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
