"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Receipt,
  Boxes,
  AlertTriangle,
  PlusCircle,
  ArrowUpRight,
  Printer,
  Share2,
  Calendar,
  Clock,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  PackageCheck,
  Banknote,
  Percent,
  Wallet,
  Sparkles,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import { useSettings } from "@/components/layout/SettingsProvider";
import { DashboardMetrics, getDashboardMetrics } from "@/lib/actions/analytics";
import { SalesDocumentItem } from "@/lib/actions/sales";
import { DocumentPrintView } from "@/components/sales/DocumentPrintView";

export default function TableauDeBordPage() {
  const company = useSettings();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDocForPrint, setSelectedDocForPrint] = useState<SalesDocumentItem | null>(null);

  const loadData = async () => {
    try {
      const data = await getDashboardMetrics();
      setMetrics(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePrintDoc = (doc: SalesDocumentItem) => {
    setSelectedDocForPrint(doc);
  };

  const handleWhatsAppShare = (doc: SalesDocumentItem) => {
    const phone = doc.customerPhone ? doc.customerPhone.replace(/[^0-9]/g, "") : "";
    const total = formatMoney(doc.totalTtcCents);
    const message = encodeURIComponent(
      `Bonjour ${doc.customerName},\n\n` +
      `Votre Bon de Livraison N° ${doc.docNumber} est prêt chez ${company.raisonSociale}.\n` +
      `• Total TTC : ${total}\n` +
      `• Date : ${new Date(doc.docDate).toLocaleDateString("fr-FR")}\n\n` +
      `Merci pour votre fidélité !\n${company.raisonSociale} - ${company.city}`
    );

    const url = phone
      ? `https://wa.me/212${phone.startsWith("0") ? phone.slice(1) : phone}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* 1. BANNIÈRE DE BIENVENUE & ACTIONS RAPIDES COMPTOIR      */}
      {/* ======================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-5 md:p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF2F2] text-[#F7162D] border border-[#FCA5A5]/40">
              <ShieldCheck size={13} />
              SARL BM Motors • {company.vatLiable ? `Régime Fiscal TVA ${company.defaultVatRate}%` : "Ventes sans TVA"}
            </span>
            <span className="text-xs text-gray-500">Casablanca</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white mt-1.5 tracking-tight">
            Tableau de Bord
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Supervision du point de vente.
          </p>
        </div>

        {/* Boutons d'accès rapide optimisés pour smartphone & comptoir */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/pos"
            className="flex items-center gap-2 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-98"
          >
            <Sparkles size={17} />
            <span>POS</span>
          </Link>
          <Link
            href="/ventes/nouveau"
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-xs transition-all active:scale-98"
          >
            <PlusCircle size={17} />
            <span>Nouveau BL</span>
          </Link>
          <Link
            href="/reglements"
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl shadow-xs transition-all active:scale-98"
          >
            <Banknote size={17} />
            <span>Encaisser</span>
          </Link>
          <Link
            href="/fournisseurs"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-3.5 py-2.5 rounded-xl shadow-xs transition-all active:scale-98"
          >
            <PackageCheck size={17} />
            <span>Arrivage (BR)</span>
          </Link>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. CARTES D'INDICATEURS CLÉS (KPIS EN TEMPS RÉEL)       */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 : Ventes du Jour */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Ventes du Jour (TTC)
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="my-3">
            <div className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              {metrics ? formatMoney(metrics.todaySalesTtcCents) : "..."}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {metrics?.todaySalesCount || 0} Bon(s) de Livraison aujourd&apos;hui
            </div>
          </div>
          <div>
            <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              Comptoir & Livraisons
            </span>
          </div>
        </div>

        {/* KPI 2 : Chiffre d'Affaires du Mois */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              CA du Mois en Cours (TTC)
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Calendar size={20} />
            </div>
          </div>
          <div className="my-3">
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
              {metrics ? formatMoney(metrics.monthSalesTtcCents) : "..."}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Mois précédent : {metrics ? formatMoney(metrics.lastMonthSalesTtcCents) : "..."}
            </div>
          </div>
          <div>
            <span
              className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${(metrics?.monthGrowthPercent || 0) >= 0
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-red-50 text-[#F7162D]"
                }`}
            >
              {(metrics?.monthGrowthPercent || 0) >= 0 ? "+" : ""}
              {metrics?.monthGrowthPercent || 0}% vs mois dernier
            </span>
          </div>
        </div>

        {/* KPI 3 : Créances Clients */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Créances Clients (Crédits)
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Receipt size={20} />
            </div>
          </div>
          <div className="my-3">
            <div className="text-2xl font-black text-amber-600 dark:text-amber-500 tracking-tight">
              {metrics ? formatMoney(metrics.totalCustomerDebtCents) : "..."}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {metrics?.unpaidCustomersCount || 0} client(s) avec solde ouvert
            </div>
          </div>
          <div>
            <Link
              href="/reglements"
              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 hover:underline"
            >
              <span>Voir les débiteurs</span>
              <ChevronRight size={12} />
            </Link>
          </div>
        </div>

        {/* KPI 4 : Marge Brute & Résultat Net */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-gray-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Marge Brute du Mois
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <Percent size={20} />
            </div>
          </div>
          <div className="my-3">
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 tracking-tight">
              {metrics ? formatMoney(metrics.monthGrossMarginCents) : "..."}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Résultat net : {metrics ? formatMoney(metrics.monthNetProfitCents) : "..."}
            </div>
          </div>
          <div>
            <Link
              href="/comptabilite"
              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 hover:underline"
            >
              <span>Rapports de rentabilité</span>
              <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. SECTION PRINCIPALE (DERNIERS BL + ALERTES STOCK)     */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne Gauche : Derniers Bons de Livraison (2/3 de largeur) */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs p-5 md:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-[#F7162D]" />
                  Derniers Bons de Livraison (BL)
                </h2>
                <p className="text-xs text-gray-500">
                  Ventes en direct au comptoir avec détail de la remise personnalisée et TVA 10%
                </p>
              </div>
              <Link
                href="/ventes"
                className="text-xs font-bold text-[#F7162D] hover:underline flex items-center gap-1"
              >
                <span>Tout afficher</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {metrics?.recentSales && metrics.recentSales.length > 0 ? (
                metrics.recentSales.map((bl) => {
                  const isPaid = bl.status === "PAYE";
                  return (
                    <div
                      key={bl.id}
                      className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">
                            {bl.docNumber}
                          </span>
                          <span className="text-xs text-gray-400">
                            • {new Date(bl.docDate).toLocaleDateString("fr-FR")}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isPaid
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                              }`}
                          >
                            {isPaid ? "Payé" : "À Crédit / Non Soldé"}
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {bl.customerName}
                        </div>

                        {/* Ligne explicite de la Remise si applicable */}
                        {bl.discountPercent > 0 && (
                          <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-2">
                            <span>Brut HT: {formatMoney(bl.totalBrutHtCents)}</span>
                            <span>•</span>
                            <span className="bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded font-bold">
                              Remise {bl.discountPercent}% : -{formatMoney(bl.discountAmountCents)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center gap-1">
                        <div className="text-right">
                          <span className="text-sm font-black text-gray-900 dark:text-white block">
                            {formatMoney(bl.totalTtcCents)}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {bl.tvaRate > 0
                              ? `Dont TVA ${bl.tvaRate}%: ${formatMoney(bl.tvaAmountCents)}`
                              : "Sans TVA"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            onClick={() => handlePrintDoc(bl)}
                            title="Imprimer le Bon de Livraison A4"
                            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition"
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            onClick={() => handleWhatsAppShare(bl)}
                            title="Partager sur WhatsApp"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-md transition"
                          >
                            <Share2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-xs text-gray-400">
                  Aucun Bon de Livraison récent.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500">
            <span>Format officiel : <strong>A4 AirPrint & PDF</strong></span>
            <span className="text-emerald-600 font-bold">Numérotation légale continue</span>
          </div>
        </div>

        {/* Colonne Droite : Alertes de Stock Faibles & Négatifs (1/3 de largeur) */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs p-5 md:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-[#F7162D]" />
                  Alertes de Stock
                </h2>
                <p className="text-xs text-gray-500">
                  {metrics?.negativeStockCount || 0} négatif(s) • {metrics?.lowStockCount || 0} faible(s)
                </p>
              </div>
              <Link
                href="/stock"
                className="text-xs font-bold text-[#F7162D] hover:underline"
              >
                Catalogue
              </Link>
            </div>

            <div className="space-y-3">
              {metrics?.lowStockProducts && metrics.lowStockProducts.length > 0 ? (
                metrics.lowStockProducts.map((piece) => {
                  const isNegative = piece.currentStock < 0;
                  return (
                    <div
                      key={piece.id}
                      className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 hover:border-gray-200 transition-all space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-gray-900 dark:text-white">
                          {piece.sku}
                        </span>
                        {isNegative ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-[#F7162D] border border-red-300 dark:bg-red-950 dark:text-red-300 animate-pulse">
                            Stock négatif ({piece.currentStock})
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Stock faible ({piece.currentStock} restant)
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-1 font-medium">
                        {piece.name}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-200/60 dark:border-gray-700/60">
                        <span>Vente : {formatMoney(piece.salePriceRetailCents)}</span>
                        <span>Seuil alerte : {piece.minStockAlert}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-emerald-600 font-bold">
                  ✓ Tous les stocks sont au-dessus des seuils d&apos;alerte.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
            <Link
              href="/fournisseurs"
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-gray-800 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-xl transition"
            >
              <PackageCheck size={15} />
              <span>Réceptionner un réassort fournisseur</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Modal Impression Document A4 */}
      {selectedDocForPrint && (
        <DocumentPrintView
          document={selectedDocForPrint}
          onClose={() => setSelectedDocForPrint(null)}
        />
      )}
    </div>
  );
}
