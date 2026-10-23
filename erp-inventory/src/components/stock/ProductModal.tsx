"use client";

import React, { useState, useEffect } from "react";
import { X, Camera, Check, AlertCircle } from "lucide-react";
import { ProductItem, saveProduct } from "@/lib/actions/products";
import { compressImageToWebP } from "@/lib/image-compressor";
import { getPhotoUploadUrl } from "@/lib/actions/media";
import { toCentimes, toDirhams } from "@/lib/money";
import { useSettings } from "@/components/layout/SettingsProvider";

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Parameters<typeof saveProduct>[0]) => Promise<void>;
  productToEdit?: ProductItem | null;
}

export function ProductModal({
  isOpen,
  onClose,
  onSave,
  productToEdit,
}: ProductModalProps) {
  const company = useSettings();
  const [sku, setSku] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("Bashan");
  const [categoryName, setCategoryName] = useState("Freinage");
  const [purchasePriceDH, setPurchasePriceDH] = useState("");
  const [salePriceRetailDH, setSalePriceRetailDH] = useState("");
  const [salePriceWholesaleDH, setSalePriceWholesaleDH] = useState("");
  const [currentStock, setCurrentStock] = useState("0");
  const [minStockAlert, setMinStockAlert] = useState("2");
  const [shelfLocation, setShelfLocation] = useState("");
  const [barcode, setBarcode] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [isCompressing, setIsCompressing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (productToEdit) {
        setSku(productToEdit.sku);
        setOemCode(productToEdit.oemCode || "");
        setName(productToEdit.name);
        setBrand(productToEdit.brand || "Bashan");
        setCategoryName(productToEdit.categoryName || "Général");
        setPurchasePriceDH(toDirhams(productToEdit.purchasePriceCents).toString());
        setSalePriceRetailDH(toDirhams(productToEdit.salePriceRetailCents).toString());
        setSalePriceWholesaleDH(
          productToEdit.salePriceWholesaleCents
            ? toDirhams(productToEdit.salePriceWholesaleCents).toString()
            : ""
        );
        setCurrentStock(productToEdit.currentStock.toString());
        setMinStockAlert(productToEdit.minStockAlert.toString());
        setShelfLocation(productToEdit.shelfLocation || "");
        setBarcode(productToEdit.barcode || "");
        setPhotoUrl(productToEdit.photoUrl);
      } else {
        // Réinitialisation pour nouveau produit
        setSku(`BASH-${Math.floor(100 + Math.random() * 900)}`);
        setOemCode("");
        setName("");
        setBrand("Bashan");
        setCategoryName("Freinage");
        setPurchasePriceDH("");
        setSalePriceRetailDH("");
        setSalePriceWholesaleDH("");
        setCurrentStock("0");
        setMinStockAlert("2");
        setShelfLocation("");
        setBarcode("");
        setPhotoUrl(null);
        setCompressionInfo(null);
      }
      setErrorMessage(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [productToEdit, isOpen]);

  if (!isOpen) return null;

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      setIsCompressing(true);
      setErrorMessage(null);
      setCompressionInfo(null);

      // 1. Compression WebP côté client
      const result = await compressImageToWebP(file, 1000, 1000, 0.8);
      setCompressionInfo(
        `Image WebP optimisée : ${result.sizeKb} Ko (${result.width}x${result.height}px)`
      );

      // 2. Dépôt direct vers Cloudflare R2 via URL présignée
      //    (les octets ne passent pas par Cloud Run)
      setIsCompressing(false);
      setIsUploading(true);
      const contentType = result.file.type || "image/webp";
      const { uploadUrl, publicUrl } = await getPhotoUploadUrl({
        contentType,
        sizeBytes: result.file.size,
      });
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: result.file,
      });
      if (!put.ok) throw new Error(`téléversement refusé (${put.status})`);

      // 3. On enregistre l'URL publique R2 (jamais de base64 en base)
      setPhotoUrl(publicUrl);
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `Échec de la photo : ${err.message}`
          : "Échec du téléversement de la photo"
      );
    } finally {
      setIsCompressing(false);
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim()) {
      setErrorMessage("La référence SKU et la désignation sont obligatoires");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);

      const purchaseDH = parseFloat(purchasePriceDH) || 0;
      const saleRetailDH = parseFloat(salePriceRetailDH) || 0;
      const saleWholesaleDH = parseFloat(salePriceWholesaleDH) || 0;

      await onSave({
        id: productToEdit?.id,
        sku: sku.trim().toUpperCase(),
        oemCode: oemCode.trim() || undefined,
        name: name.trim(),
        brand: brand.trim() || "Bashan",
        categoryName,
        purchasePriceCents: toCentimes(purchaseDH),
        salePriceRetailCents: toCentimes(saleRetailDH),
        salePriceWholesaleCents: saleWholesaleDH > 0 ? toCentimes(saleWholesaleDH) : undefined,
        tvaRate: company.defaultVatRate,
        minStockAlert: parseInt(minStockAlert, 10) || 2,
        currentStock: parseInt(currentStock, 10) || 0,
        shelfLocation: shelfLocation.trim() || undefined,
        barcode: barcode.trim() || undefined,
        photoUrl: photoUrl ?? undefined,
      });

      onClose();
    } catch (err) {
      setErrorMessage((err as Error).message || "Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-[#E5E7EB] my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-[#F8F9FA]">
          <div>
            <h2 className="text-lg font-bold text-[#111827]">
              {productToEdit ? "Modifier la Pièce Moto" : "Ajouter une Nouvelle Pièce Moto"}
            </h2>
            <p className="text-xs text-[#6B7280]">
              Enregistrement dans le catalogue avec prix en Dirhams (MAD) et TVA {company.defaultVatRate}%
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-[#E5E7EB]/60"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message d'erreur */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-[#F7162D] text-xs flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Ligne 1 : Référence SKU & Code OEM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Référence SKU * (Interne)
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="ex: BASH-014"
                className="w-full px-3 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] focus:ring-1 focus:ring-[#F7162D] outline-none font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Code Constructeur / OEM
              </label>
              <input
                type="text"
                value={oemCode}
                onChange={(e) => setOemCode(e.target.value)}
                placeholder="ex: 16001-BSH-001"
                className="w-full px-3 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] focus:ring-1 focus:ring-[#F7162D] outline-none font-mono"
              />
            </div>
          </div>

          {/* Ligne 2 : Désignation complète */}
          <div>
            <label className="block text-xs font-bold text-[#374151] mb-1">
              Désignation de la pièce *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Plaquettes de frein avant Bashan 200 / 250cc"
              className="w-full px-3 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] focus:ring-1 focus:ring-[#F7162D] outline-none font-medium"
            />
          </div>

          {/* Ligne 3 : Marque & Catégorie */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Marque / Compatibilité
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="ex: Bashan, Yamaha, MBK, Honda"
                className="w-full px-3 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] focus:ring-1 focus:ring-[#F7162D] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Catégorie
              </label>
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] focus:ring-1 focus:ring-[#F7162D] outline-none"
              >
                <option value="Freinage">Freinage</option>
                <option value="Moteur & Carburation">Moteur & Carburation</option>
                <option value="Transmission & Câblage">Transmission & Câblage</option>
                <option value="Électricité & Allumage">Électricité & Allumage</option>
                <option value="Carrosserie & Cadre">Carrosserie & Cadre</option>
                <option value="Pneumatiques & Roues">Pneumatiques & Roues</option>
                <option value="Huiles & Consommables">Huiles & Consommables</option>
                <option value="Accessoires">Accessoires</option>
              </select>
            </div>
          </div>

          {/* Ligne 4 : Prix en Dirhams */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-[#F8F9FA] border border-[#E5E7EB]">
            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Prix Achat HT (DH)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={purchasePriceDH}
                  onChange={(e) => setPurchasePriceDH(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-3 pr-8 py-2 text-sm bg-white border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none font-bold"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6B7280]">
                  DH
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Prix Vente Détail (DH) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  required
                  value={salePriceRetailDH}
                  onChange={(e) => setSalePriceRetailDH(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-3 pr-8 py-2 text-sm bg-white border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none font-bold text-[#F7162D]"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6B7280]">
                  DH
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Prix Vente Gros (DH)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  value={salePriceWholesaleDH}
                  onChange={(e) => setSalePriceWholesaleDH(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-3 pr-8 py-2 text-sm bg-white border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none font-bold"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6B7280]">
                  DH
                </span>
              </div>
            </div>
          </div>

          {/* Ligne 5 : Stock actuel (tolère le négatif) & Alerte seuil mini */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Stock actuel (tolère négatif)
              </label>
              <input
                type="number"
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] outline-none font-bold"
              />
              <span className="text-[10px] text-[#6B7280] mt-0.5 block">
                Permet de saisir un stock négatif
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Seuil Alerte Stock Faible
              </label>
              <input
                type="number"
                value={minStockAlert}
                onChange={(e) => setMinStockAlert(e.target.value)}
                placeholder="2"
                className="w-full px-3 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] outline-none font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#374151] mb-1">
                Emplacement / Rayon
              </label>
              <input
                type="text"
                value={shelfLocation}
                onChange={(e) => setShelfLocation(e.target.value)}
                placeholder="ex: Rayon A-02"
                className="w-full px-3 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] outline-none font-medium"
              />
            </div>
          </div>

          {/* Ligne 6 : Photo avec compression WebP client */}
          <div>
            <label className="block text-xs font-bold text-[#374151] mb-1">
              Photo de la pièce (WebP &lt; 80 Ko, stockée sur Cloudflare R2)
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl text-xs font-bold text-[#374151] cursor-pointer shadow-xs active:scale-98 transition-all">
                <Camera size={16} className="text-[#F7162D]" />
                <span>Prendre photo / Téléverser</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleImageCapture}
                />
              </label>

              {isCompressing && (
                <span className="text-xs text-[#D97706] font-medium animate-pulse">
                  Compression en cours...
                </span>
              )}

              {isUploading && (
                <span className="text-xs text-[#D97706] font-medium animate-pulse">
                  Téléversement...
                </span>
              )}

              {compressionInfo && (
                <span className="text-xs text-[#059669] font-medium flex items-center gap-1">
                  <Check size={14} />
                  {compressionInfo}
                </span>
              )}
            </div>

            {photoUrl && (
              <div className="mt-3 relative w-24 h-24 rounded-xl border border-[#E5E7EB] overflow-hidden bg-[#F8F9FA]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Aperçu" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full hover:bg-black"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Pied du formulaire */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#6B7280] hover:text-[#111827] rounded-xl hover:bg-[#F3F4F6] transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving || isCompressing || isUploading}
              className="flex items-center gap-2 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50"
            >
              <Check size={16} />
              <span>{isSaving ? "Enregistrement..." : "Enregistrer la pièce"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
