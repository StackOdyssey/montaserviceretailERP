"use client";

import React, { useState } from "react";
import { X, Upload, Download, FileSpreadsheet, Check, AlertCircle } from "lucide-react";
import { ProductItem, importProductsBatch } from "@/lib/actions/products";
import { toDirhams } from "@/lib/money";

type CsvImportItems = Parameters<typeof importProductsBatch>[0];

interface CsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  onImport: (items: CsvImportItems) => Promise<void>;
}

export function CsvModal({ isOpen, onClose, products, onImport }: CsvModalProps) {
  const [, setCsvText] = useState("");
  const [parsedPreview, setParsedPreview] = useState<CsvImportItems>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Télécharger le catalogue actuel en CSV compatible Excel
  const handleExport = () => {
    const headers = [
      "SKU",
      "Code_OEM",
      "Designation",
      "Marque",
      "Categorie",
      "Prix_Achat_HT_DH",
      "Prix_Vente_Detail_DH",
      "Stock_Actuel",
      "Seuil_Mini",
      "Emplacement",
    ];

    const rows = products.map((p) => [
      `"${p.sku}"`,
      `"${p.oemCode || ""}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.brand || ""}"`,
      `"${p.categoryName || ""}"`,
      toDirhams(p.purchasePriceCents).toFixed(2),
      toDirhams(p.salePriceRetailCents).toFixed(2),
      p.currentStock,
      p.minStockAlert,
      `"${p.shelfLocation || ""}"`,
    ]);

    const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `catalogue_bmmotors_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Traiter un fichier CSV déposé ou collé
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      parseCsv(text);
    };
    reader.readAsText(file);
  };

  const parseCsv = (text: string) => {
    try {
      setErrorMessage(null);
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        setErrorMessage("Le fichier CSV doit contenir au moins une ligne d'en-tête et une ligne de données");
        return;
      }

      // Détection automatique du délimiteur (; ou ,)
      const delimiter = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, "").toLowerCase());

      const skuIdx = headers.findIndex((h) => h.includes("sku") || h.includes("ref"));
      const nameIdx = headers.findIndex((h) => h.includes("desig") || h.includes("nom") || h.includes("name"));
      const oemIdx = headers.findIndex((h) => h.includes("oem") || h.includes("code"));
      const brandIdx = headers.findIndex((h) => h.includes("marque") || h.includes("brand"));
      const purchaseIdx = headers.findIndex((h) => h.includes("achat") || h.includes("cout"));
      const saleIdx = headers.findIndex((h) => h.includes("vente") || h.includes("prix") || h.includes("detail"));
      const stockIdx = headers.findIndex((h) => h.includes("stock") || h.includes("qte"));
      const shelfIdx = headers.findIndex((h) => h.includes("rayon") || h.includes("empl"));

      const items: CsvImportItems = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
        if (!cols[skuIdx] || !cols[nameIdx]) continue;

        items.push({
          sku: cols[skuIdx],
          name: cols[nameIdx],
          oemCode: oemIdx !== -1 ? cols[oemIdx] : undefined,
          brand: brandIdx !== -1 ? cols[brandIdx] : "Bashan",
          purchasePriceDH: purchaseIdx !== -1 ? parseFloat(cols[purchaseIdx].replace(",", ".")) || 0 : 0,
          salePriceRetailDH: saleIdx !== -1 ? parseFloat(cols[saleIdx].replace(",", ".")) || 0 : 0,
          stock: stockIdx !== -1 ? parseInt(cols[stockIdx], 10) || 0 : 0,
          shelfLocation: shelfIdx !== -1 ? cols[shelfIdx] : undefined,
        });
      }

      setParsedPreview(items);
      setStatusMessage(`${items.length} pièces détectées prêtes pour l'import`);
    } catch {
      setErrorMessage("Erreur lors de l'analyse du fichier CSV");
    }
  };

  const handleConfirmImport = async () => {
    if (parsedPreview.length === 0) return;

    try {
      setIsImporting(true);
      await onImport(parsedPreview);
      onClose();
    } catch {
      setErrorMessage("Échec de l'importation");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-[#E5E7EB] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-[#F8F9FA]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111827]">
                Importation & Exportation CSV / Excel
              </h2>
              <p className="text-xs text-[#6B7280]">
                Gestion en masse des pièces et stocks du magasin
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#6B7280] hover:text-[#111827] rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Section 1 : Exportation */}
          <div className="p-4 rounded-xl bg-[#F8F9FA] border border-[#E5E7EB] flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-[#111827] block">
                Exporter le Catalogue Actuel ({products.length} articles)
              </span>
              <p className="text-xs text-[#6B7280]">
                Génère un fichier CSV (.csv) directement ouvrable dans Microsoft Excel
              </p>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl text-xs font-bold text-[#374151] shadow-xs active:scale-98 transition-all shrink-0"
            >
              <Download size={15} className="text-[#059669]" />
              <span>Télécharger CSV</span>
            </button>
          </div>

          {/* Section 2 : Importation */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-[#111827] block">
              Importer des pièces depuis un fichier CSV
            </span>

            <label className="border-2 border-dashed border-[#D1D5DB] hover:border-[#F7162D] rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-[#F8F9FA]">
              <Upload size={24} className="text-[#F7162D]" />
              <span className="text-xs font-bold text-[#111827]">
                Choisir un fichier CSV ou le glisser ici
              </span>
              <span className="text-[11px] text-[#6B7280]">
                Séparateurs supportés : point-virgule (;) ou virgule (,)
              </span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
            </label>

            {statusMessage && (
              <div className="p-3 rounded-xl bg-[#ECFDF5] text-[#059669] text-xs font-medium flex items-center gap-2">
                <Check size={16} />
                <span>{statusMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded-xl bg-[#FEF2F2] text-[#F7162D] text-xs font-medium flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Aperçu des 3 premières lignes */}
            {parsedPreview.length > 0 && (
              <div className="border border-[#E5E7EB] rounded-xl overflow-hidden text-xs">
                <div className="bg-[#F8F9FA] px-3 py-2 font-bold text-[#374151] border-b border-[#E5E7EB]">
                  Aperçu ({parsedPreview.length} articles détectés) :
                </div>
                <div className="divide-y divide-[#E5E7EB] max-h-36 overflow-y-auto">
                  {parsedPreview.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#111827]">{item.sku}</span>
                        <span className="text-[#4B5563] truncate max-w-xs">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[#6B7280]">
                        <span>Prix: {item.salePriceRetailDH} DH</span>
                        <span className="font-bold text-[#111827]">Stock: {item.stock}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#6B7280] hover:text-[#111827]"
            >
              Fermer
            </button>
            {parsedPreview.length > 0 && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="flex items-center gap-2 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50"
              >
                <Check size={16} />
                <span>{isImporting ? "Importation..." : `Valider l'import (${parsedPreview.length} pièces)`}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
