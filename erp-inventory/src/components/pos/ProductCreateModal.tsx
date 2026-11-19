"use client";

import React, { useState } from "react";
import { X, Plus, AlertTriangle, PackagePlus } from "lucide-react";
import { saveProduct, type CategoryItem, type ProductItem } from "@/lib/actions/products";
import { unwrap } from "@/lib/action-result";
import { toCentimes } from "@/lib/money";

interface ProductCreateModalProps {
  categories: CategoryItem[];
  businessLineCode?: string;
  initialRef?: string;
  onClose: () => void;
  onCreated: (product: ProductItem) => void;
}

/**
 * Ajout rapide d'un produit depuis le comptoir (legacy `produitAddPosix`) :
 * fiche minimale (réf, désignation, prix, stock) — la pièce devient vendable
 * immédiatement sans passer par le catalogue admin.
 */
export function ProductCreateModal({
  categories,
  businessLineCode,
  initialRef = "",
  onClose,
  onCreated,
}: ProductCreateModalProps) {
  const [sku, setSku] = useState(initialRef);
  const [name, setName] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [stock, setStock] = useState("1");
  const [barcode, setBarcode] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [brand, setBrand] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseDh = (v: string): number | null => {
    const n = parseFloat(v.replace(",", "."));
    return v.trim() === "" || Number.isNaN(n) || n < 0 ? null : toCentimes(n);
  };

  const handleSave = async () => {
    const cleanSku = sku.trim();
    const cleanName = name.trim();
    const saleCents = parseDh(salePrice);
    if (!cleanSku) return setError("La référence est obligatoire.");
    if (!cleanName) return setError("La désignation est obligatoire.");
    if (saleCents == null) return setError("Prix de vente invalide (ex : 35 ou 35,50).");

    const stockN = stock.trim() === "" ? 0 : Math.floor(Number(stock));
    if (Number.isNaN(stockN)) return setError("Stock initial invalide.");

    setIsSaving(true);
    setError(null);
    try {
      const product = unwrap(
        await saveProduct({
          sku: cleanSku,
          name: cleanName,
          salePriceRetailCents: saleCents,
          purchasePriceCents: parseDh(purchasePrice) ?? 0,
          currentStock: stockN,
          minStockAlert: 0,
          barcode: barcode.trim() || undefined,
          categoryName: categoryName.trim() || undefined,
          brand: brand.trim() || undefined,
          businessLineCode,
        })
      );
      onCreated(product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible");
    } finally {
      setIsSaving(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D]";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackagePlus size={20} className="text-[#F7162D]" />
            <h2 className="font-bold text-gray-900">Nouveau produit</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Référence *</label>
              <input
                autoFocus
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex : 1500"
                aria-label="Référence produit"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Code-barres</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="EAN…"
                aria-label="Code-barres"
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600 mb-1 block">Désignation *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : plaquette frein arrière"
              aria-label="Désignation produit"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Prix vente (DH) *</label>
              <input
                type="text"
                inputMode="decimal"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0,00"
                aria-label="Prix de vente en DH"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Prix d&apos;achat (DH)</label>
              <input
                type="text"
                inputMode="decimal"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0,00"
                aria-label="Prix d'achat en DH"
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Stock initial</label>
              <input
                type="number"
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                aria-label="Stock initial"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Marque</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Bashan…"
                aria-label="Marque"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600 mb-1 block">Catégorie</label>
            <input
              type="text"
              list="pos-product-categories"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Freinage… (nouvelle si inconnue)"
              aria-label="Catégorie"
              className={inputCls}
            />
            <datalist id="pos-product-categories">
              {categories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
              <div className="text-xs text-red-700">{error}</div>
            </div>
          )}

          <p className="text-[11px] text-gray-500">
            Stock à 0 : la pièce est créée au catalogue mais invisible en caisse jusqu&apos;à réapprovisionnement.
          </p>
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-[2] px-4 py-2.5 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            {isSaving ? "Création…" : "Créer et ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
