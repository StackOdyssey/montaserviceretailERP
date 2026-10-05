"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart3,
  Download,
  Printer,
  FileSpreadsheet,
  Percent,
  Boxes,
  TrendingUp,
  Receipt,
  Building,
  Calendar,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  ArrowDownRight,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";
import {
  TvaAccountingExport,
  StockValuation,
  ProfitMarginsReport,
  getTvaAccountingExport,
  getStockValuation,
  getProfitMarginsReport,
} from "@/lib/actions/analytics";
import { formatMoney } from "@/lib/money";

export default function ComptabilitePage() {
  const [activeTab, setActiveTab] = useState<"TVA" | "STOCK" | "MARGES">("TVA");
  const [tvaData, setTvaData] = useState<TvaAccountingExport | null>(null);
  const [stockData, setStockData] = useState<StockValuation | null>(null);
  const [marginsData, setMarginsData] = useState<ProfitMarginsReport | null>(null);
  const [marginsPeriod, setMarginsPeriod] = useState<"THIS_MONTH" | "LAST_MONTH" | "ALL">("THIS_MONTH");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tva, stock, margins] = await Promise.all([
        getTvaAccountingExport(),
        getStockValuation(),
        getProfitMarginsReport(marginsPeriod),
      ]);
      setTvaData(tva);
      setStockData(stock);
      setMarginsData(margins);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [marginsPeriod]);

  // Export CSV normalisé pour l'expert-comptable
  const handleExportCsv = () => {
    if (!tvaData) return;

    const headers = [
      "Type Document",
      "Date",
      "N° Piece",
      "Tiers (Client / Fournisseur)",
      "ICE Tiers",
      "Total Brut HT (MAD)",
      "Remise (MAD)",
      "Total Net HT (MAD)",
      "Taux TVA",
      "Montant TVA (MAD)",
      "Total TTC (MAD)",
      "Mode Reglement",
    ];

    const salesRows = tvaData.salesLines.map((l) => [
      "VENTE_BL",
      new Date(l.date).toLocaleDateString("fr-FR"),
      l.docNumber,
      `"${l.customerName.replace(/"/g, '""')}"`,
      l.customerIce || "PARTICULIER",
      (l.totalBrutHtCents / 100).toFixed(2),
      (l.discountAmountCents / 100).toFixed(2),
      (l.totalNetHtCents / 100).toFixed(2),
      "10%",
      (l.tvaAmountCents / 100).toFixed(2),
      (l.totalTtcCents / 100).toFixed(2),
      l.paymentMethod,
    ]);

    const purchaseRows = tvaData.purchaseLines.map((p) => [
      "ACHAT_BR",
      new Date(p.date).toLocaleDateString("fr-FR"),
      p.receiptNumber,
      `"${p.supplierName.replace(/"/g, '""')}"`,
      p.supplierIce || "",
      (p.totalHtCents / 100).toFixed(2),
      "0.00",
      (p.totalHtCents / 100).toFixed(2),
      "10%",
      (p.tvaAmountCents / 100).toFixed(2),
      (p.totalTtcCents / 100).toFixed(2),
      "VIREMENT/CHEQUE",
    ]);

    const csvContent =
      "\uFEFF" +
      [
        headers.join(";"),
        ...salesRows.map((r) => r.join(";")),
        ...purchaseRows.map((r) => r.join(";")),
      ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Export_TVA_BM_Motors_${tvaData.periodLabel.replace(/\s+/g, "_")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintA4 = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* En-tête Page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-[#F7162D]" />
            Rapports, Marges & Export TVA 10%
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Déclaration périodique de TVA pour l'expert-comptable, valorisation du stock et rentabilité par pièce.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "TVA" && (
            <>
              <button
                onClick={handleExportCsv}
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Exporter CSV Comptable</span>
              </button>
              <button
                onClick={handlePrintA4}
                className="px-3.5 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Déclaration A4</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Onglets de navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 gap-6 print:hidden">
        <button
          onClick={() => setActiveTab("TVA")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "TVA"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Receipt className="w-4 h-4" />
          Déclaration TVA 10% (Comptable)
        </button>

        <button
          onClick={() => setActiveTab("STOCK")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "STOCK"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Boxes className="w-4 h-4" />
          Valorisation du Stock
        </button>

        <button
          onClick={() => setActiveTab("MARGES")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "MARGES"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Percent className="w-4 h-4" />
          Marges & Rentabilité
        </button>
      </div>

      {/* ======================================================== */}
      {/* ONGLET 1 : DÉCLARATION & ÉTAT DE TVA 10%                 */}
      {/* ======================================================== */}
      {activeTab === "TVA" && tvaData && (
        <div className="space-y-6">
          {/* Synthèse Fiscale */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                1. TVA Collectée (10%)
              </span>
              <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                {formatMoney(tvaData.tvaCollectedCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Sur CA Net HT de {formatMoney(tvaData.salesTaxableHtCents)}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                2. TVA Déductible (10%)
              </span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {formatMoney(tvaData.totalTvaDeductibleCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Achats pièces + charges d'exploitation
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                {tvaData.isCreditTva ? "3. Crédit de TVA à Reporter" : "3. TVA Nette Due (À Décaisser)"}
              </span>
              <div className={`text-2xl font-black mt-1 ${tvaData.isCreditTva ? "text-emerald-600" : "text-[#F7162D]"}`}>
                {formatMoney(tvaData.netTvaDueCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {tvaData.isCreditTva ? "Solde en faveur de la société" : "À reverser à la DGI / Trésor Public"}
              </p>
            </div>
          </div>

          {/* Formulaire A4 officiel imprimable */}
          <div className="bg-white text-gray-900 p-6 sm:p-10 rounded-2xl border border-gray-200 shadow-xs print:border-none print:shadow-none print:p-0">
            {/* En-tête fiscal marocain */}
            <div className="flex justify-between items-start border-b-2 border-gray-900 pb-5">
              <div>
                <h2 className="text-xl font-black text-[#F7162D] tracking-tight">
                  SARL BM MOTORS
                </h2>
                <p className="text-xs font-bold uppercase text-gray-700">
                  Régime de la Taxe sur la Valeur Ajoutée (TVA) à 10%
                </p>
                <p className="text-[11px] text-gray-600 mt-1">
                  <strong>ICE:</strong> 001892837000045 • <strong>IF:</strong> 40291823 • <strong>RC:</strong> 39281 • <strong>TP:</strong> 37192801
                </p>
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-gray-900 text-white font-black text-xs rounded-md uppercase tracking-wider">
                  ÉTAT RÉCAPITULATIF DE TVA
                </span>
                <p className="text-xs font-bold text-gray-800 mt-1.5">
                  Période : {tvaData.periodLabel}
                </p>
                <p className="text-[10px] text-gray-500">
                  Régime d'imposition : Encaissements / Débits
                </p>
              </div>
            </div>

            {/* Tableau 1 : Ventes du mois (TVA Collectée) */}
            <div className="my-6 space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  A. Chiffre d'Affaires & TVA Collectée (10%) sur les Ventes
                </h3>
                <span className="text-xs font-bold text-gray-600">
                  Total Net HT : {formatMoney(tvaData.salesTaxableHtCents)}
                </span>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 uppercase font-bold border-b border-gray-200">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">N° Pièce</th>
                      <th className="py-2 px-3">Client</th>
                      <th className="py-2 px-3">ICE Client</th>
                      <th className="py-2 px-3 text-right">Net HT</th>
                      <th className="py-2 px-3 text-center">Taux</th>
                      <th className="py-2 px-3 text-right">TVA 10%</th>
                      <th className="py-2 px-3 text-right">Total TTC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tvaData.salesLines.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-600">
                          {new Date(row.date).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="py-2 px-3 font-bold font-mono text-gray-900">{row.docNumber}</td>
                        <td className="py-2 px-3 font-semibold text-gray-800">{row.customerName}</td>
                        <td className="py-2 px-3 font-mono text-gray-600">
                          {row.customerIce || "Particulier"}
                        </td>
                        <td className="py-2 px-3 text-right font-medium">{formatMoney(row.totalNetHtCents)}</td>
                        <td className="py-2 px-3 text-center font-bold">10%</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900">{formatMoney(row.tvaAmountCents)}</td>
                        <td className="py-2 px-3 text-right font-black text-[#F7162D]">{formatMoney(row.totalTtcCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-black border-t-2 border-gray-300">
                      <td colSpan={4} className="py-2.5 px-3 uppercase text-right">Totaux Ventes :</td>
                      <td className="py-2.5 px-3 text-right">{formatMoney(tvaData.salesTaxableHtCents)}</td>
                      <td className="py-2.5 px-3 text-center">10%</td>
                      <td className="py-2.5 px-3 text-right text-gray-900">{formatMoney(tvaData.tvaCollectedCents)}</td>
                      <td className="py-2.5 px-3 text-right text-[#F7162D]">{formatMoney(tvaData.salesTotalTtcCents)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Tableau 2 : Achats & TVA Déductible */}
            <div className="my-6 space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  B. Achats de Pièces & TVA Déductible (10%)
                </h3>
                <span className="text-xs font-bold text-emerald-700">
                  Total Déductible : {formatMoney(tvaData.totalTvaDeductibleCents)}
                </span>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 uppercase font-bold border-b border-gray-200">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">N° Réception / Facture</th>
                      <th className="py-2 px-3">Fournisseur</th>
                      <th className="py-2 px-3">ICE Fournisseur</th>
                      <th className="py-2 px-3 text-right">Base HT</th>
                      <th className="py-2 px-3 text-center">Taux</th>
                      <th className="py-2 px-3 text-right">TVA 10%</th>
                      <th className="py-2 px-3 text-right">Total TTC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tvaData.purchaseLines.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-600">
                          {new Date(row.date).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-gray-900">
                          {row.receiptNumber} ({row.invoiceNumber})
                        </td>
                        <td className="py-2 px-3 font-semibold text-gray-800">{row.supplierName}</td>
                        <td className="py-2 px-3 font-mono text-gray-600">{row.supplierIce}</td>
                        <td className="py-2 px-3 text-right font-medium">{formatMoney(row.totalHtCents)}</td>
                        <td className="py-2 px-3 text-center font-bold">10%</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">{formatMoney(row.tvaAmountCents)}</td>
                        <td className="py-2 px-3 text-right font-black text-gray-900">{formatMoney(row.totalTtcCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cadre Bilan de Liquidation de la TVA */}
            <div className="p-4 bg-gray-50 rounded-xl border-2 border-gray-900 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <span className="text-xs font-black uppercase text-gray-700">
                  RÉSULTAT FISCAL DE LA PÉRIODE ({tvaData.periodLabel})
                </span>
                <p className="text-xs text-gray-600 mt-0.5">
                  TVA Collectée ({formatMoney(tvaData.tvaCollectedCents)}) - TVA Déductible ({formatMoney(tvaData.totalTvaDeductibleCents)})
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold text-gray-600 uppercase block">
                  {tvaData.isCreditTva ? "Crédit de TVA Récupérable" : "TVA Nette Due à Reverser"}
                </span>
                <span className={`text-2xl font-black ${tvaData.isCreditTva ? "text-emerald-700" : "text-[#F7162D]"}`}>
                  {formatMoney(tvaData.netTvaDueCents)}
                </span>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-200 text-center text-[10px] text-gray-500">
              Document comptable certifié conforme aux écritures du grand livre SARL BM Motors • Casablanca
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ONGLET 2 : VALORISATION DU STOCK ACTUEL                  */}
      {/* ======================================================== */}
      {activeTab === "STOCK" && stockData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Valeur au Coût d'Achat HT
              </span>
              <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                {formatMoney(stockData.totalCostHtCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Capital immobilisé en magasin
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Valeur Marchande (Détail TTC)
              </span>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {formatMoney(stockData.totalRetailTtcCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Potentiel de vente client particulier
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Marge Brute Latente en Stock
              </span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {formatMoney(stockData.latentMarginHtCents)}
              </div>
              <p className="text-xs text-emerald-600 mt-1 font-bold">
                Taux de marge : {stockData.latentMarginRatePercent}%
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Quantité Totale en Stock
              </span>
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
                {stockData.totalItemsCount} pièces
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Sur {stockData.totalCatalogReferences} références au catalogue
              </p>
            </div>
          </div>

          {/* Tableau des pièces à plus forte immobilisation de capital */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">
                  Articles à Forte Valeur de Stock (Top Immobilisation)
                </h3>
                <p className="text-xs text-gray-500">
                  Pièces représentant le plus gros capital immobilisé au coût d'achat
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 text-gray-500 text-xs uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">Référence SKU</th>
                    <th className="py-3 px-4">Désignation</th>
                    <th className="py-3 px-4 text-center">Stock</th>
                    <th className="py-3 px-4 text-right">P.U. Achat HT</th>
                    <th className="py-3 px-4 text-right">P.U. Vente TTC</th>
                    <th className="py-3 px-4 text-right">Capital Immobilisé HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {stockData.topValuedProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition">
                      <td className="py-3 px-4 font-mono font-bold text-gray-900 dark:text-white">
                        {p.sku}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-800 dark:text-gray-200">
                        {p.name}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          {p.currentStock}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-gray-600 dark:text-gray-300">
                        {formatMoney(p.purchasePriceCents)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-[#F7162D]">
                        {formatMoney(p.salePriceRetailCents)}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-gray-900 dark:text-white">
                        {formatMoney(p.totalStockCostCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ONGLET 3 : MARGES BRUTES & RENTABILITÉ                   */}
      {/* ======================================================== */}
      {activeTab === "MARGES" && marginsData && (
        <div className="space-y-6">
          {/* Sélecteur de période */}
          <div className="flex items-center gap-2">
            {[
              { id: "THIS_MONTH", label: "Mois en cours" },
              { id: "LAST_MONTH", label: "Mois précédent" },
              { id: "ALL", label: "Historique complet" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setMarginsPeriod(p.id as any)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition ${
                  marginsPeriod === p.id
                    ? "bg-[#F7162D] text-white shadow-xs"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Chiffre d'Affaires Net HT
              </span>
              <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                {formatMoney(marginsData.totalRevenueHtCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Ventes réelles après remises accordées
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Coût des Marchandises (COGS)
              </span>
              <div className="text-2xl font-black text-gray-700 dark:text-gray-300 mt-1">
                {formatMoney(marginsData.totalCostOfGoodsCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Prix d'achat des pièces vendues
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Marge Brute Réalisée
              </span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {formatMoney(marginsData.grossMarginCents)}
              </div>
              <p className="text-xs text-emerald-600 mt-1 font-bold">
                Taux de marge : {marginsData.grossMarginPercent}%
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Résultat Opérationnel Net
              </span>
              <div className={`text-2xl font-black mt-1 ${marginsData.netOperatingProfitCents >= 0 ? "text-purple-600 dark:text-purple-400" : "text-[#F7162D]"}`}>
                {formatMoney(marginsData.netOperatingProfitCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Après {formatMoney(marginsData.totalExpensesCents)} de charges
              </p>
            </div>
          </div>

          {/* Tableau des pièces les plus vendues et les plus rentables */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-xs">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white">
                Palmarès des Pièces les Plus Rentables
              </h3>
              <p className="text-xs text-gray-500">
                Classement par chiffre d'affaires et marge brute générée
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 text-gray-500 text-xs uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Désignation</th>
                    <th className="py-3 px-4 text-center">Qté Vendue</th>
                    <th className="py-3 px-4 text-right">CA Net HT</th>
                    <th className="py-3 px-4 text-right">Marge Brute (DH)</th>
                    <th className="py-3 px-4 text-right">Taux de Marge (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {marginsData.topSellingProducts.map((p, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition">
                      <td className="py-3 px-4 font-mono font-bold text-gray-900 dark:text-white">
                        {p.sku}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-800 dark:text-gray-200">
                        {p.name}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                          {p.quantitySold}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-white">
                        {formatMoney(p.totalRevenueHtCents)}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-emerald-600">
                        +{formatMoney(p.marginCents)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          {p.marginPercent}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
