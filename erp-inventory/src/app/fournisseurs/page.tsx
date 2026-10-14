"use client";

import { useEffect, useState } from "react";
import {
  Truck,
  Plus,
  PackageCheck,
  CreditCard,
  Building,
  Phone,
  Search,
  Calendar,
  AlertCircle,
  CheckCircle2,
  FileText,
  ReceiptText,
} from "lucide-react";
import { SupplierItem, getSuppliers, SupplierReceiptItem } from "@/lib/actions/suppliers";
import { getSettings } from "@/lib/actions/settings";
import { formatMoney } from "@/lib/money";
import { SupplierModal } from "@/components/suppliers/SupplierModal";
import { SupplierReceiptModal } from "@/components/suppliers/SupplierReceiptModal";
import { SupplierPaymentModal } from "@/components/suppliers/SupplierPaymentModal";
import { SupplierPriceCreditModal } from "@/components/suppliers/SupplierPriceCreditModal";

export default function FournisseursPage() {
  const [activeTab, setActiveTab] = useState<"FOURNISSEURS" | "RECEPTIONS">("FOURNISSEURS");
  const [searchQuery, setSearchQuery] = useState("");
  const [suppliersList, setSuppliersList] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Régime TVA global (réceptions sans TVA si non-assujetti).
  const [vatLiable, setVatLiable] = useState(true);

  // Modals state
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isPriceCreditModalOpen, setIsPriceCreditModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [preselectedSupplierId, setPreselectedSupplierId] = useState<number | undefined>(undefined);

  const loadData = async () => {
    setLoading(true);
    try {
      const [data, s] = await Promise.all([
        getSuppliers(searchQuery),
        getSettings().catch(() => null),
      ]);
      setSuppliersList(data);
      if (s) setVatLiable(s.vatLiable ?? true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  const totalDettes = suppliersList.reduce((sum, s) => sum + Math.max(0, s.balanceDueCents || 0), 0);
  const totalAchats = suppliersList.reduce((sum, s) => sum + (s.totalPurchasesTtcCents || 0), 0);
  const totalRegle = suppliersList.reduce((sum, s) => sum + (s.totalPaidCents || 0), 0);

  const handleOpenReceipt = (supplierId?: number) => {
    setPreselectedSupplierId(supplierId);
    setIsReceiptModalOpen(true);
  };

  const handleOpenPayment = (supplierId?: number) => {
    setPreselectedSupplierId(supplierId);
    setIsPaymentModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Truck className="w-7 h-7 text-[#F7162D]" />
            Fournisseurs & Réceptions de Stock
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestion des arrivages de pièces (Bons de Réception), suivi des dettes fournisseurs et décaissements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingSupplier(null);
              setIsSupplierModalOpen(true);
            }}
            className="px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouveau Fournisseur
          </button>
          <button
            onClick={() => handleOpenPayment()}
            className="px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            Régler un Fournisseur
          </button>
          <button
            onClick={() => handleOpenReceipt()}
            className="px-4 py-2.5 bg-[#F7162D] hover:bg-[#d81023] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2"
          >
            <PackageCheck className="w-4 h-4" />
            Nouvel Arrivage (BR)
          </button>
        </div>
      </div>

      {/* Cartes statistiques */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Dettes Fournisseurs Dues</span>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-[#F7162D] flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#F7162D]">
            {formatMoney(totalDettes)}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Soldes en attente de décaissement (Chèques / LCN)
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Achats Arrivages TTC</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {formatMoney(totalAchats)}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Volume cumulé des pièces réceptionnées
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Décaissements Versés</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {formatMoney(totalRegle)}
          </div>
          <p className="text-xs text-emerald-600 mt-1 font-medium">
            Règlements honorés à ce jour
          </p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 gap-6">
        <button
          onClick={() => setActiveTab("FOURNISSEURS")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "FOURNISSEURS"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Building className="w-4 h-4" />
          Répertoire Fournisseurs & Dettes ({suppliersList.length})
        </button>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher par nom de fournisseur, contact commercial, ville..."
          className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D] shadow-xs"
        />
      </div>

      {/* Tableau des fournisseurs */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 text-gray-500 text-xs uppercase font-bold tracking-wider">
                <th className="py-3 px-4">Fournisseur</th>
                <th className="py-3 px-4">Contact Commercial</th>
                <th className="py-3 px-4 text-right">Total Achats TTC</th>
                <th className="py-3 px-4 text-right">Total Réglé</th>
                <th className="py-3 px-4 text-right">Dette Restante</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {suppliersList.map((supplier) => {
                const hasDebt = (supplier.balanceDueCents || 0) > 0;
                return (
                  <tr key={supplier.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {supplier.name}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {supplier.city} {supplier.ice ? `• ICE: ${supplier.ice}` : ""}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300">
                      {supplier.contactName && <div className="font-semibold">{supplier.contactName}</div>}
                      {supplier.phone && (
                        <div className="flex items-center gap-1 text-gray-400 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {supplier.phone}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-medium text-gray-700 dark:text-gray-300">
                      {formatMoney(supplier.totalPurchasesTtcCents || 0)}
                    </td>

                    <td className="py-3 px-4 text-right font-medium text-emerald-600">
                      {formatMoney(supplier.totalPaidCents || 0)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-xl text-xs font-black ${
                          hasDebt
                            ? "bg-red-50 text-[#F7162D] dark:bg-red-950/40 dark:text-red-400"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        }`}
                      >
                        {formatMoney(supplier.balanceDueCents || 0)}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenReceipt(supplier.id)}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                          title="Nouvel arrivage / Bon de Réception"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          <span>Arrivage</span>
                        </button>
                        <button
                          onClick={() => handleOpenPayment(supplier.id)}
                          className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                          title="Émettre un règlement"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Régler</span>
                        </button>
                        <button
                          onClick={() => {
                            setPreselectedSupplierId(supplier.id);
                            setIsPriceCreditModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                          title="Avoir prix fournisseur (sans retour de marchandise)"
                        >
                          <ReceiptText className="w-3.5 h-3.5" />
                          <span>Avoir prix</span>
                        </button>
                        <button
                          onClick={() => {
                            setEditingSupplier(supplier);
                            setIsSupplierModalOpen(true);
                          }}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition"
                          title="Modifier les coordonnées"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <SupplierModal
        isOpen={isSupplierModalOpen}
        onClose={() => {
          setIsSupplierModalOpen(false);
          setEditingSupplier(null);
        }}
        onSaved={loadData}
        supplier={editingSupplier}
      />

      <SupplierReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        onSaved={loadData}
        suppliers={suppliersList}
        preselectedSupplierId={preselectedSupplierId}
        vatLiable={vatLiable}
      />

      <SupplierPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSaved={loadData}
        suppliers={suppliersList}
        preselectedSupplierId={preselectedSupplierId}
      />

      <SupplierPriceCreditModal
        isOpen={isPriceCreditModalOpen}
        onClose={() => setIsPriceCreditModalOpen(false)}
        onSaved={loadData}
        suppliers={suppliersList}
        preselectedSupplierId={preselectedSupplierId}
      />
    </div>
  );
}
