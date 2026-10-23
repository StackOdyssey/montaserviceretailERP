"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Boxes,
  Search,
  PlusCircle,
  FileSpreadsheet,
  AlertTriangle,
  ArrowUpDown,
  Edit2,
  Filter,
  Check,
  RefreshCw,
  Tag,
  Package,
  ClipboardList,
} from "lucide-react";
import {
  getProducts,
  getProductsCount,
  saveProduct,
  recordStockMovement,
  importProductsBatch,
  ProductItem,
} from "@/lib/actions/products";
import { formatMoney } from "@/lib/money";
import { ProductModal } from "@/components/stock/ProductModal";
import { StockAdjustmentModal } from "@/components/stock/StockAdjustmentModal";
import { CsvModal } from "@/components/stock/CsvModal";
import { useBusinessLine } from "@/components/layout/BusinessLineProvider";
import { useSettings } from "@/components/layout/SettingsProvider";

export default function StockCataloguePage() {
  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "negative">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [isLoading, startTransition] = useTransition();

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductItem | null>(null);

  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [productToAdjust, setProductToAdjust] = useState<ProductItem | null>(null);

  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  const { activeCode, activeLine } = useBusinessLine();
  const company = useSettings();

  // Charger les pièces avec recherche instantanée
  const fetchProducts = () => {
    startTransition(async () => {
      const filters = {
        search: searchTerm,
        stockFilter,
        category: categoryFilter,
        businessLineCode: activeCode,
      };
      const data = await getProducts(filters);
      setProductsList(data);
      // Le catalogue est plafonné à 500 lignes : si on atteint le plafond on
      // récupère le total réel pour afficher un avertissement de troncature.
      setCatalogTotal(data.length >= 500 ? await getProductsCount(filters) : null);
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 150); // Débounce rapide (<200 ms)

    return () => clearTimeout(timer);
  }, [searchTerm, stockFilter, categoryFilter, activeCode]);

  // Sauvegarder un produit
  const handleSaveProduct = async (productData: any) => {
    await saveProduct(productData);
    fetchProducts();
  };

  // Ajuster un stock
  const handleAdjustStock = async (data: any) => {
    await recordStockMovement(data);
    fetchProducts();
  };

  // Importer CSV
  const handleImportCsv = async (items: any[]) => {
    await importProductsBatch(items);
    fetchProducts();
  };

  // Calcul des compteurs
  const totalCount = productsList.length;
  const lowStockCount = productsList.filter((p) => p.currentStock <= p.minStockAlert && p.currentStock >= 0).length;
  const negativeStockCount = productsList.filter((p) => p.currentStock < 0).length;

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* 1. EN-TÊTE DE PAGE ET BOUTONS D'ACTION                  */}
      {/* ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 md:p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF2F2] text-[#F7162D] border border-[#FCA5A5]/40">
              <Boxes size={14} />
              Catalogue Pièces Moto Bashan
            </span>
            <span className="text-xs text-[#6B7280]">{company.raisonSociale}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] mt-1.5 tracking-tight">
            Gestion du Stock & Catalogue
          </h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            Ligne active :{" "}
            <span className="font-semibold text-[#111827]">
              {activeLine?.displayName ?? "Pièces moto"}
            </span>{" "}
            — recherche instantanée, prix en Dirhams et suivi du stock en temps réel.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/stock/inventaire"
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl text-xs font-bold text-[#374151] shadow-xs active:scale-98 transition-all"
          >
            <ClipboardList size={16} className="text-[#4338CA]" />
            <span>Inventaire</span>
          </Link>

          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl text-xs font-bold text-[#374151] shadow-xs active:scale-98 transition-all"
          >
            <FileSpreadsheet size={16} className="text-[#2563EB]" />
            <span>Import / Export CSV</span>
          </button>

          <button
            onClick={() => {
              setProductToEdit(null);
              setIsProductModalOpen(true);
            }}
            className="flex items-center gap-2 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all active:scale-98"
          >
            <PlusCircle size={16} />
            <span>Ajouter une pièce</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. BARRE DE RECHERCHE RAPIDE & FILTRES                  */}
      {/* ======================================================== */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Champ de recherche instantanée */}
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Recherche instantanée (Réf SKU, Code OEM, Désignation, Marque, Rayon)..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] focus:ring-2 focus:ring-[#F7162D]/10 outline-none transition-all font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#6B7280] hover:text-[#111827]"
              >
                Effacer
              </button>
            )}
          </div>

          {/* Sélecteur de catégorie */}
          <div className="flex items-center gap-2 shrink-0">
            <Filter size={16} className="text-[#6B7280] hidden sm:block" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2.5 text-xs font-semibold bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] outline-none"
            >
              <option value="">Toutes catégories</option>
              <option value="Freinage">Freinage</option>
              <option value="Moteur & Carburation">Moteur & Carburation</option>
              <option value="Transmission & Câblage">Transmission & Câblage</option>
              <option value="Électricité & Allumage">Électricité & Allumage</option>
              <option value="Carrosserie & Cadre">Carrosserie & Cadre</option>
            </select>
          </div>
        </div>

        {/* Boutons d'état de stock (Tous, Faible, Négatif) */}
        <div className="flex items-center gap-2 pt-2 border-t border-[#E5E7EB] overflow-x-auto text-xs">
          <button
            onClick={() => setStockFilter("all")}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              stockFilter === "all"
                ? "bg-[#111827] text-white"
                : "bg-[#F8F9FA] text-[#4B5563] hover:bg-[#E5E7EB]"
            }`}
          >
            Tous les articles ({catalogTotal ?? totalCount})
          </button>

          <button
            onClick={() => setStockFilter("low")}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
              stockFilter === "low"
                ? "bg-[#D97706] text-white"
                : "bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]"
            }`}
          >
            <AlertTriangle size={13} />
            <span>Stock faible ({lowStockCount})</span>
          </button>

          <button
            onClick={() => setStockFilter("negative")}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
              stockFilter === "negative"
                ? "bg-[#F7162D] text-white"
                : "bg-[#FEF2F2] text-[#F7162D] border border-[#FCA5A5]"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#F7162D] animate-ping" />
            <span>Stock négatif toléré ({negativeStockCount})</span>
          </button>
        </div>
      </div>

      {catalogTotal !== null && catalogTotal > productsList.length && (
        <div className="flex items-center gap-2.5 bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] rounded-xl px-4 py-3 text-xs font-semibold">
          <AlertTriangle size={15} className="shrink-0" />
          <span>
            Affichage limité aux {productsList.length} premiers articles sur {catalogTotal} —
            affinez la recherche ou les filtres pour voir le reste du catalogue.
          </span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. TABLEAU DES ARTICLES (DESKTOP & MOBILE)               */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        {productsList.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Package size={40} className="mx-auto text-[#9CA3AF]" />
            <h3 className="font-bold text-sm text-[#111827]">Aucune pièce trouvée</h3>
            <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
              Aucun article ne correspond à votre recherche ou filtre. Essayez de modifier vos critères ou ajoutez une nouvelle pièce.
            </p>
            <button
              onClick={() => {
                setSearchTerm("");
                setStockFilter("all");
                setCategoryFilter("");
              }}
              className="text-xs font-semibold text-[#F7162D] hover:underline"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                  <th className="py-3.5 px-4">Réf SKU / OEM</th>
                  <th className="py-3.5 px-4">Désignation</th>
                  <th className="py-3.5 px-4">Marque & Rayon</th>
                  <th className="py-3.5 px-4 text-right">Prix Achat HT</th>
                  <th className="py-3.5 px-4 text-right">Prix Vente Détail</th>
                  <th className="py-3.5 px-4 text-center">Stock Actuel</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs">
                {productsList.map((p) => {
                  const isNegative = p.currentStock < 0;
                  const isLow = p.currentStock <= p.minStockAlert && !isNegative;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-[#F8F9FA] transition-colors group"
                    >
                      {/* SKU & OEM */}
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-[#111827] text-xs">
                          {p.sku}
                        </div>
                        {p.oemCode && (
                          <div className="text-[10px] text-[#6B7280]">
                            OEM: {p.oemCode}
                          </div>
                        )}
                      </td>

                      {/* Désignation & Photo */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {p.photoUrl ? (
                            <img
                              src={p.photoUrl}
                              alt={p.name}
                              className="w-9 h-9 rounded-lg object-cover border border-[#E5E7EB]"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#9CA3AF] shrink-0">
                              <Boxes size={18} />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-[#111827] line-clamp-1">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-[#6B7280]">
                              {p.categoryName || "Général"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Marque & Rayon */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#374151]">
                          {p.brand || "Bashan"}
                        </div>
                        <div className="text-[10px] text-[#6B7280]">
                          {p.shelfLocation || "Rayon non défini"}
                        </div>
                      </td>

                      {/* Prix Achat HT */}
                      <td className="py-3 px-4 text-right font-medium text-[#6B7280]">
                        {formatMoney(p.purchasePriceCents)}
                      </td>

                      {/* Prix Vente Détail TTC */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-bold text-[#111827]">
                          {formatMoney(p.salePriceRetailCents)}
                        </span>
                        {p.salePriceWholesaleCents && (
                          <div className="text-[10px] text-[#6B7280]">
                            Gros: {formatMoney(p.salePriceWholesaleCents)}
                          </div>
                        )}
                      </td>

                      {/* Stock Actuel */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg ${
                              isNegative
                                ? "bg-[#FEF2F2] text-[#F7162D] border border-[#FCA5A5]"
                                : isLow
                                ? "bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]"
                                : "bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]"
                            }`}
                          >
                            {p.currentStock}
                          </span>
                        </div>
                        {isNegative && (
                          <div className="text-[9px] font-bold text-[#F7162D] mt-0.5">
                            Stock négatif
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setProductToAdjust(p);
                              setIsAdjustmentModalOpen(true);
                            }}
                            title="Ajuster le stock"
                            className="p-1.5 text-[#374151] hover:text-[#111827] hover:bg-[#E5E7EB] rounded-lg transition-colors"
                          >
                            <ArrowUpDown size={15} />
                          </button>

                          <button
                            onClick={() => {
                              setProductToEdit(p);
                              setIsProductModalOpen(true);
                            }}
                            title="Modifier la pièce"
                            className="p-1.5 text-[#374151] hover:text-[#111827] hover:bg-[#E5E7EB] rounded-lg transition-colors"
                          >
                            <Edit2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 4. MODALS INTERACTIFS                                    */}
      {/* ======================================================== */}
      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSave={handleSaveProduct}
        productToEdit={productToEdit}
      />

      <StockAdjustmentModal
        isOpen={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
        product={productToAdjust}
        onAdjust={handleAdjustStock}
      />

      <CsvModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        products={productsList}
        onImport={handleImportCsv}
      />
    </div>
  );
}
