"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart3,
  Printer,
  FileSpreadsheet,
  Percent,
  Boxes,
  Receipt,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  TrendingUp,
} from "lucide-react";
import {
  TvaAccountingExport,
  StockValuation,
  ProfitMarginsReport,
  getTvaAccountingExport,
  getStockValuation,
  getProfitMarginsReport,
} from "@/lib/actions/analytics";
import {
  getAccountingPeriods,
  setPeriodStatus as setPeriodStatusAction,
  getAccountingCsv,
  getDailySheet,
  getValidationIssues,
  type DailySheetData,
  type ValidationIssue,
  type PeriodStatus,
} from "@/lib/actions/accounting";
import { getCustomerAging, type PartyAgingRow, type AgingBuckets } from "@/lib/actions/customers";
import { getSupplierAging } from "@/lib/actions/suppliers";
import { formatMoney } from "@/lib/money";
import { unwrap } from "@/lib/action-result";
import { useSettings } from "@/components/layout/SettingsProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { MonthlyCA } from "@/components/accounting/MonthlyCA";

export default function ComptabilitePage() {
  const company = useSettings();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"TVA" | "STOCK" | "MARGES" | "AGING" | "VALIDATION" | "JOURNEE" | "CA">("TVA");
  const [tvaData, setTvaData] = useState<TvaAccountingExport | null>(null);
  const [stockData, setStockData] = useState<StockValuation | null>(null);
  const [marginsData, setMarginsData] = useState<ProfitMarginsReport | null>(null);
  const [marginsPeriod, setMarginsPeriod] = useState<"THIS_MONTH" | "LAST_MONTH" | "ALL">("THIS_MONTH");
  const [, setLoading] = useState(true);
  const now = new Date();
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1); // 1..12
  const [periodStatus, setPeriodStatusState] = useState<PeriodStatus>("OPEN");
  const [isLocking, setIsLocking] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [customerAging, setCustomerAging] = useState<{ rows: PartyAgingRow[]; totals: AgingBuckets } | null>(null);
  const [supplierAging, setSupplierAging] = useState<{ rows: PartyAgingRow[]; totals: AgingBuckets } | null>(null);
  // Feuille de journée — plage de dates (par défaut : aujourd'hui).
  const [sheetFrom, setSheetFrom] = useState(() => now.toISOString().slice(0, 10));
  const [sheetTo, setSheetTo] = useState(() => now.toISOString().slice(0, 10));
  const [dailySheet, setDailySheet] = useState<DailySheetData | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  const loadDailySheet = async () => {
    setSheetLoading(true);
    try {
      setDailySheet(await getDailySheet(sheetFrom, sheetTo));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSheetLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [tva, stock, margins, periods, custAging, supAging, issues] = await Promise.all([
        getTvaAccountingExport({ year: periodYear, month: periodMonth - 1 }),
        getStockValuation(),
        getProfitMarginsReport(marginsPeriod),
        getAccountingPeriods(periodYear),
        getCustomerAging(),
        getSupplierAging(),
        getValidationIssues({ year: periodYear, month: periodMonth }),
      ]);
      setTvaData(tva);
      setStockData(stock);
      setMarginsData(margins);
      setPeriodStatusState(periods.find((x) => x.month === periodMonth)?.status ?? "OPEN");
      setCustomerAging(custAging);
      setSupplierAging(supAging);
      setValidationIssues(issues);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marginsPeriod, periodYear, periodMonth]);

  const changeStatus = async (status: PeriodStatus) => {
    setIsLocking(true);
    try {
      unwrap(await setPeriodStatusAction(periodYear, periodMonth, status));
      setPeriodStatusState(status);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsLocking(false);
    }
  };
  const STATUS_LABELS: Record<PeriodStatus, string> = {
    OPEN: "Ouverte",
    REVIEWED: "Revue",
    EXPORTED: "Exportée",
    LOCKED: "Clôturée",
  };

  // Export CSV comptable (généré côté serveur, autoritatif)
  const handleExportCsv = async () => {
    try {
      const { filename, csv } = await getAccountingCsv({ year: periodYear, month: periodMonth });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      toast.error((e as Error).message);
    }
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
            Rapports, Marges & Déclaration TVA
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Déclaration périodique de TVA pour l&apos;expert-comptable, valorisation du stock et rentabilité par pièce.
          </p>
          {!company.vatLiable && (
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mt-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
              Régime non-assujetti : les nouvelles ventes sont sans TVA (ni calculée ni affichée).
              Les montants de TVA ci-dessous reflètent l&apos;historique (documents antérieurs au basculement).
            </p>
          )}
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

      {/* Barre de période comptable (clôture / réouverture) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs print:hidden">
        <div className="flex items-center gap-2 text-xs font-bold">
          <Calendar className="w-4 h-4 text-[#F7162D]" />
          <span className="text-gray-500">Période :</span>
          <select
            value={periodMonth}
            onChange={(e) => setPeriodMonth(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:border-[#F7162D]"
          >
            {["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"].map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={periodYear}
            onChange={(e) => setPeriodYear(Number(e.target.value))}
            className="w-24 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:border-[#F7162D]"
          />
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              periodStatus === "LOCKED" ? "bg-red-50 text-[#F7162D]" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {STATUS_LABELS[periodStatus]}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold">
          {periodStatus === "LOCKED" ? <Lock className="w-4 h-4 text-[#F7162D]" /> : <Unlock className="w-4 h-4 text-emerald-600" />}
          <span className="text-gray-500 hidden sm:inline">Statut :</span>
          <select
            value={periodStatus}
            disabled={isLocking}
            onChange={(e) => changeStatus(e.target.value as PeriodStatus)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:border-[#F7162D] disabled:opacity-60"
          >
            <option value="OPEN">Ouverte (brouillon)</option>
            <option value="REVIEWED">Revue</option>
            <option value="EXPORTED">Exportée</option>
            <option value="LOCKED">Clôturée (verrouillée)</option>
          </select>
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
          Déclaration TVA (Comptable)
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

        <button
          onClick={() => setActiveTab("AGING")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "AGING"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Calendar className="w-4 h-4" />
          Balance Âgée
        </button>

        <button
          onClick={() => setActiveTab("VALIDATION")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "VALIDATION"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Contrôle &amp; Validation
          {validationIssues.some((i) => i.severity === "ERROR") && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-[#FEF2F2] text-[#F7162D]">
              {validationIssues.filter((i) => i.severity === "ERROR").reduce((s, i) => s + i.count, 0)}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab("JOURNEE");
            if (!dailySheet) loadDailySheet();
          }}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "JOURNEE"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Feuille de journée
        </button>

        <button
          onClick={() => setActiveTab("CA")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "CA"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          CA mensuel
        </button>
      </div>

      {/* ======================================================== */}
      {/* ONGLET 1 : DÉCLARATION & ÉTAT DE TVA 20%                 */}
      {/* ======================================================== */}
      {activeTab === "TVA" && tvaData && (
        <div className="space-y-6">
          {/* Synthèse Fiscale */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                1. TVA Collectée
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
                2. TVA Déductible
              </span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {formatMoney(tvaData.totalTvaDeductibleCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Achats pièces + charges d&apos;exploitation
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
                  {company.raisonSociale || "—"}
                </h2>
                <p className="text-xs font-bold uppercase text-gray-700">
                  Régime de la Taxe sur la Valeur Ajoutée (TVA)
                </p>
                <p className="text-[11px] text-gray-600 mt-1">
                  {company.ice && (<><strong>ICE:</strong> {company.ice}</>)}
                  {company.identifiantFiscal && (<> • <strong>IF:</strong> {company.identifiantFiscal}</>)}
                  {company.registreCommerce && (<> • <strong>RC:</strong> {company.registreCommerce}</>)}
                  {company.taxeProfessionnelle && (<> • <strong>TP:</strong> {company.taxeProfessionnelle}</>)}
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
                  Régime d&apos;imposition : Encaissements / Débits
                </p>
              </div>
            </div>

            {/* Tableau 1 : Ventes du mois (TVA Collectée) */}
            <div className="my-6 space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  A. Chiffre d&apos;Affaires & TVA Collectée sur les Ventes
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
                      <th className="py-2 px-3 text-right">TVA</th>
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
                        <td className="py-2 px-3 text-center font-bold">{row.tvaRate}%</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900">{formatMoney(row.tvaAmountCents)}</td>
                        <td className="py-2 px-3 text-right font-black text-[#F7162D]">{formatMoney(row.totalTtcCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-black border-t-2 border-gray-300">
                      <td colSpan={4} className="py-2.5 px-3 uppercase text-right">Totaux Ventes :</td>
                      <td className="py-2.5 px-3 text-right">{formatMoney(tvaData.salesTaxableHtCents)}</td>
                      <td className="py-2.5 px-3 text-center">{tvaData.tvaCollectedRate}%</td>
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
                  B. Achats de Pièces & TVA Déductible
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
                      <th className="py-2 px-3 text-right">TVA</th>
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
                        <td className="py-2 px-3 text-center font-bold">{row.tvaRate}%</td>
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
              Document comptable certifié conforme aux écritures du grand livre {company.raisonSociale}{company.city ? ` • ${company.city}` : ""}
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
                Valeur au Coût d&apos;Achat HT
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
                Valeur Marchande (Détail HT)
              </span>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {formatMoney(stockData.totalRetailHtCents)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Potentiel de vente au prix HT
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
                  Pièces représentant le plus gros capital immobilisé au coût d&apos;achat
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
                    <th className="py-3 px-4 text-right">P.U. Vente HT</th>
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
                onClick={() => setMarginsPeriod(p.id as "THIS_MONTH" | "LAST_MONTH" | "ALL")}
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
                Chiffre d&apos;Affaires Net HT
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
                Prix d&apos;achat des pièces vendues
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
                Classement par chiffre d&apos;affaires et marge brute générée
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

      {/* ======================================================== */}
      {/* ONGLET 4 : BALANCE ÂGÉE (CRÉANCES / DETTES)              */}
      {/* ======================================================== */}
      {activeTab === "AGING" && (
        <div className="space-y-6">
          {[
            { title: "Créances Clients (à encaisser)", data: customerAging },
            { title: "Dettes Fournisseurs (à payer)", data: supplierAging },
          ].map((block, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-xs"
            >
              <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-gray-900 dark:text-white">{block.title}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 uppercase font-bold tracking-wider">
                      <th className="py-2.5 px-4">Tiers</th>
                      <th className="py-2.5 px-3 text-right">Non échu</th>
                      <th className="py-2.5 px-3 text-right">Retard 0-30 j</th>
                      <th className="py-2.5 px-3 text-right">31-60 j</th>
                      <th className="py-2.5 px-3 text-right">61-90 j</th>
                      <th className="py-2.5 px-3 text-right">90+ j</th>
                      <th className="py-2.5 px-3 text-right">Total dû</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {(block.data?.rows ?? []).map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                        <td className="py-2.5 px-4 font-semibold text-gray-800 dark:text-gray-200">{r.name}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#059669]">{formatMoney(r.buckets.notDue)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatMoney(r.buckets.b0_30)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatMoney(r.buckets.b31_60)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatMoney(r.buckets.b61_90)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#F7162D]">{formatMoney(r.buckets.b90_plus)}</td>
                        <td className="py-2.5 px-3 text-right font-black">{formatMoney(r.buckets.total)}</td>
                      </tr>
                    ))}
                    {(block.data?.rows ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 px-4 text-center text-gray-400">
                          Aucun encours.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {block.data && block.data.rows.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 font-black border-t-2 border-gray-300">
                        <td className="py-2.5 px-4 uppercase text-right">Totaux :</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatMoney(block.data.totals.notDue)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatMoney(block.data.totals.b0_30)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatMoney(block.data.totals.b31_60)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatMoney(block.data.totals.b61_90)}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatMoney(block.data.totals.b90_plus)}</td>
                        <td className="py-2.5 px-3 text-right">{formatMoney(block.data.totals.total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================================================== */}
      {/* ONGLET 5 : CONTRÔLE & VALIDATION AVANT CLÔTURE           */}
      {/* ======================================================== */}
      {activeTab === "VALIDATION" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-xs">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#F7162D]" />
              Contrôle de cohérence avant clôture
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Période {String(periodMonth).padStart(2, "0")}/{periodYear}. Corrigez les anomalies bloquantes avant de
              clôturer la période.
            </p>
          </div>

          {validationIssues.length === 0 ? (
            <div className="p-6 rounded-2xl bg-emerald-50 text-emerald-700 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Aucune anomalie détectée pour cette période.
            </div>
          ) : (
            validationIssues.map((iss) => (
              <div key={iss.type} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 shadow-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <AlertCircle className={`w-4 h-4 ${iss.severity === "ERROR" ? "text-[#F7162D]" : "text-amber-600"}`} />
                    {iss.label}
                  </span>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      iss.severity === "ERROR" ? "bg-[#FEF2F2] text-[#F7162D]" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {iss.severity === "ERROR" ? "Bloquant" : "Avertissement"} • {iss.count}
                  </span>
                </div>
                {iss.samples.length > 0 && (
                  <ul className="mt-2 text-xs text-gray-500 list-disc list-inside space-y-0.5">
                    {iss.samples.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* ONGLET 6 : FEUILLE DE JOURNÉE                            */}
      {/* ======================================================== */}
      {activeTab === "JOURNEE" && (
        <div className="space-y-5">
          {/* Sélecteur de plage */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-wrap items-end gap-3 print:hidden">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Depuis</label>
              <input
                type="date"
                value={sheetFrom}
                onChange={(e) => setSheetFrom(e.target.value)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Jusqu&apos;à</label>
              <input
                type="date"
                value={sheetTo}
                onChange={(e) => setSheetTo(e.target.value)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm"
              />
            </div>
            <button
              onClick={loadDailySheet}
              disabled={sheetLoading}
              className="px-5 py-2 bg-[#F7162D] hover:bg-[#D90E23] text-white text-sm font-bold rounded-xl transition disabled:opacity-50"
            >
              {sheetLoading ? "Chargement…" : "Afficher"}
            </button>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-xl transition flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> Imprimer
            </button>
          </div>

          {dailySheet && (
            <>
              {/* Cartes synthèse */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Ventes (TTC)</p>
                  <p className="text-xl font-black text-gray-900 dark:text-white">
                    {formatMoney(dailySheet.sales.reduce((s, x) => s + x.totalTtcCents, 0))}
                  </p>
                  <p className="text-[11px] text-gray-400">{dailySheet.sales.reduce((s, x) => s + x.count, 0)} documents</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Encaissé clients</p>
                  <p className="text-xl font-black text-emerald-600">
                    {formatMoney(dailySheet.encaissements.reduce((s, x) => s + x.amountCents, 0))}
                  </p>
                  <p className="text-[11px] text-gray-400">{dailySheet.encaissements.reduce((s, x) => s + x.count, 0)} règlements</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Décaissé (FRS + dépenses)</p>
                  <p className="text-xl font-black text-red-600">
                    {formatMoney(dailySheet.decaissements.reduce((s, x) => s + x.amountCents, 0) + dailySheet.expensesCents)}
                  </p>
                  <p className="text-[11px] text-gray-400">{dailySheet.expenseCount} dépense(s)</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Caisse espèces nette</p>
                  <p className={`text-xl font-black ${dailySheet.cashEspeceNetCents >= 0 ? "text-[#2563EB]" : "text-[#F7162D]"}`}>
                    {formatMoney(dailySheet.cashEspeceNetCents)}
                  </p>
                  <p className="text-[11px] text-gray-400">espèces in − FRS espèces − dépenses</p>
                </div>
              </div>

              {/* Détail ventes par type */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <h4 className="px-4 py-3 text-xs font-black uppercase text-gray-500 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                    Ventes par type de document
                  </h4>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {dailySheet.sales.length === 0 && (
                        <tr><td className="py-4 px-4 text-center text-gray-400">Aucune vente sur la période</td></tr>
                      )}
                      {dailySheet.sales.map((s) => (
                        <tr key={s.docType}>
                          <td className="py-2.5 px-4 font-bold text-gray-800 dark:text-gray-200">{s.docType}</td>
                          <td className="py-2.5 px-4 text-right text-gray-500">{s.count} doc(s)</td>
                          <td className="py-2.5 px-4 text-right text-gray-500">HT {formatMoney(s.totalHtCents)}</td>
                          <td className="py-2.5 px-4 text-right font-bold">{formatMoney(s.totalTtcCents)}</td>
                        </tr>
                      ))}
                      {dailySheet.cancelledDocs > 0 && (
                        <tr>
                          <td colSpan={4} className="py-2 px-4 text-[11px] text-amber-600">
                            ⚠ {dailySheet.cancelledDocs} document(s) annulé(s) sur la période
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <h4 className="px-4 py-3 text-xs font-black uppercase text-gray-500 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                      Encaissements clients par mode
                    </h4>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {dailySheet.encaissements.length === 0 && (
                          <tr><td className="py-4 px-4 text-center text-gray-400">Aucun encaissement</td></tr>
                        )}
                        {dailySheet.encaissements.map((e) => (
                          <tr key={e.method}>
                            <td className="py-2.5 px-4 font-bold text-gray-800 dark:text-gray-200">{e.method}</td>
                            <td className="py-2.5 px-4 text-right text-gray-500">{e.count}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-emerald-600">{formatMoney(e.amountCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <h4 className="px-4 py-3 text-xs font-black uppercase text-gray-500 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                      Décaissements fournisseurs & dépenses
                    </h4>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {dailySheet.decaissements.map((e) => (
                          <tr key={e.method}>
                            <td className="py-2.5 px-4 font-bold text-gray-800 dark:text-gray-200">FRS {e.method}</td>
                            <td className="py-2.5 px-4 text-right text-gray-500">{e.count}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-red-600">{formatMoney(e.amountCents)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="py-2.5 px-4 font-bold text-gray-800 dark:text-gray-200">Dépenses caisse</td>
                          <td className="py-2.5 px-4 text-right text-gray-500">{dailySheet.expenseCount}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-red-600">{formatMoney(dailySheet.expensesCents)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* ONGLET 7 : CA MENSUEL (G15)                              */}
      {/* ======================================================== */}
      {activeTab === "CA" && <MonthlyCA />}
    </div>
  );
}
