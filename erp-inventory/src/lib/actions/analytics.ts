"use server";

import { getSalesDocuments, SalesDocumentItem } from "./sales";
import { getProducts, ProductItem } from "./products";
import { getCustomers } from "./customers";
import { getSuppliers, SupplierItem } from "./suppliers";
import { getExpenses } from "./expenses";
import { formatMoney } from "@/lib/money";
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import {
  db,
  businessLines,
  expenseCategories,
  expenses,
  products,
  supplierReceiptLines,
  supplierReceipts,
  suppliers,
} from "@/db";

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

export interface DashboardMetrics {
  todaySalesTtcCents: number;
  todaySalesCount: number;
  monthSalesTtcCents: number;
  lastMonthSalesTtcCents: number;
  monthGrowthPercent: number;
  totalCustomerDebtCents: number; // Total créances clients
  unpaidCustomersCount: number;
  totalSupplierDebtCents: number; // Total dettes fournisseurs
  monthExpensesCents: number;
  monthGrossMarginCents: number; // Marge brute sur les ventes du mois
  monthNetProfitCents: number; // Marge brute - Dépenses
  activeProductsCount: number;
  lowStockCount: number;
  negativeStockCount: number;
  lowStockProducts: Array<{
    id: number;
    sku: string;
    name: string;
    currentStock: number;
    minStockAlert: number;
    salePriceRetailCents: number;
  }>;
  recentSales: SalesDocumentItem[];
}

export interface StockValuation {
  totalItemsCount: number; // Quantité totale de pièces physiques
  totalCatalogReferences: number; // Nombre de références au catalogue
  totalCostHtCents: number; // Valeur totale du stock au prix d'achat HT
  totalRetailHtCents: number; // Valeur marchande totale au prix de vente détail HT
  totalWholesaleHtCents: number; // Valeur au prix de vente gros HT
  latentMarginHtCents: number; // Marge brute potentielle
  latentMarginRatePercent: number;
  topValuedProducts: Array<{
    id: number;
    sku: string;
    name: string;
    currentStock: number;
    purchasePriceCents: number;
    totalStockCostCents: number;
    salePriceRetailCents: number;
  }>;
}

export interface ProfitMarginsReport {
  period: string;
  totalRevenueHtCents: number;
  totalCostOfGoodsCents: number; // Coût d'achat des pièces vendues
  grossMarginCents: number;
  grossMarginPercent: number;
  totalExpensesCents: number;
  netOperatingProfitCents: number;
  topSellingProducts: Array<{
    sku: string;
    name: string;
    quantitySold: number;
    totalRevenueHtCents: number;
    marginCents: number;
    marginPercent: number;
  }>;
}

export interface TvaAccountingExport {
  periodLabel: string;
  // Ventes (TVA Collectée)
  salesTaxableHtCents: number;
  tvaCollectedRate: number; // taux effectif (dérivé des documents)
  tvaCollectedCents: number;
  salesTotalTtcCents: number;
  salesLines: Array<{
    date: string;
    docNumber: string;
    customerName: string;
    customerIce: string | null;
    totalBrutHtCents: number;
    discountAmountCents: number;
    totalNetHtCents: number;
    tvaRate: number;
    tvaAmountCents: number;
    totalTtcCents: number;
    paymentMethod: string;
    businessLine: string;
  }>;
  // Achats (TVA Déductible)
  purchasesTaxableHtCents: number;
  tvaDeductibleRate: number; // taux effectif (dérivé des bons de réception)
  tvaDeductiblePurchasesCents: number;
  tvaDeductibleExpensesCents: number;
  totalTvaDeductibleCents: number;
  purchaseLines: Array<{
    date: string;
    receiptNumber: string;
    supplierName: string;
    supplierIce: string | null;
    invoiceNumber: string | null;
    totalHtCents: number;
    tvaRate: number;
    tvaAmountCents: number;
    totalTtcCents: number;
    businessLine: string;
  }>;
  // Bilan TVA
  netTvaDueCents: number; // Collectée - Déductible (Si positif : à payer ; si négatif : crédit)
  isCreditTva: boolean;
}

/**
 * Calcule tous les indicateurs clés du tableau de bord en direct
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [sales, prods, custs, supps, expRes] = await Promise.all([
    getSalesDocuments(),
    getProducts(),
    getCustomers(),
    getSuppliers(),
    getExpenses({ period: "THIS_MONTH" }),
  ]);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

  // Ventes du jour
  const todayDocs = sales.filter(
    (d) => new Date(d.docDate).getTime() >= startOfToday && d.status !== "ANNULE"
  );
  const todaySalesTtcCents = todayDocs.reduce((sum, d) => sum + d.totalTtcCents, 0);

  // Ventes du mois en cours
  const monthDocs = sales.filter(
    (d) => new Date(d.docDate).getTime() >= startOfMonth && d.status !== "ANNULE"
  );
  const monthSalesTtcCents = monthDocs.reduce((sum, d) => sum + d.totalTtcCents, 0);

  // Ventes du mois précédent
  const lastMonthDocs = sales.filter((d) => {
    const time = new Date(d.docDate).getTime();
    return time >= startOfLastMonth && time < startOfMonth && d.status !== "ANNULE";
  });
  const lastMonthSalesTtcCents = lastMonthDocs.reduce((sum, d) => sum + d.totalTtcCents, 0);

  let monthGrowthPercent = 0;
  if (lastMonthSalesTtcCents > 0) {
    monthGrowthPercent = Math.round(
      ((monthSalesTtcCents - lastMonthSalesTtcCents) / lastMonthSalesTtcCents) * 100
    );
  } else if (monthSalesTtcCents > 0) {
    monthGrowthPercent = 100;
  }

  // Créances clients
  const totalCustomerDebtCents = custs.reduce(
    (sum, c) => sum + Math.max(0, c.balanceDueCents || 0),
    0
  );
  const unpaidCustomersCount = custs.filter((c) => (c.balanceDueCents || 0) > 0).length;

  // Dettes fournisseurs
  const totalSupplierDebtCents = supps.reduce(
    (sum, s) => sum + Math.max(0, s.balanceDueCents || 0),
    0
  );

  // Dépenses du mois
  const monthExpensesCents = expRes.stats.monthTotalCents;

  // Marge brute estimée du mois
  let monthCostOfGoodsCents = 0;
  let monthRevenueHtCents = 0;

  for (const doc of monthDocs) {
    monthRevenueHtCents += doc.totalNetHtCents;
    for (const line of doc.lines) {
      const prod = prods.find((p) => p.id === line.productId);
      const unitCost = line.unitCostCents ?? prod?.purchasePriceCents ?? 0;
      monthCostOfGoodsCents += unitCost * line.quantity;
    }
  }

  const monthGrossMarginCents = Math.max(0, monthRevenueHtCents - monthCostOfGoodsCents);
  const monthNetProfitCents = monthGrossMarginCents - monthExpensesCents;

  // Alertes de stock
  const lowStockProducts = prods
    .filter((p) => p.currentStock <= p.minStockAlert)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      currentStock: p.currentStock,
      minStockAlert: p.minStockAlert,
      salePriceRetailCents: p.salePriceRetailCents,
    }))
    .sort((a, b) => a.currentStock - b.currentStock);

  const lowStockCount = lowStockProducts.filter((p) => p.currentStock > 0).length;
  const negativeStockCount = lowStockProducts.filter((p) => p.currentStock < 0).length;

  return {
    todaySalesTtcCents,
    todaySalesCount: todayDocs.length,
    monthSalesTtcCents,
    lastMonthSalesTtcCents,
    monthGrowthPercent,
    totalCustomerDebtCents,
    unpaidCustomersCount,
    totalSupplierDebtCents,
    monthExpensesCents,
    monthGrossMarginCents,
    monthNetProfitCents,
    activeProductsCount: prods.filter((p) => p.isActive).length,
    lowStockCount,
    negativeStockCount,
    lowStockProducts: lowStockProducts.slice(0, 5),
    recentSales: sales.slice(0, 5),
  };
}

/**
 * Calcule la valorisation intégrale du stock
 */
export async function getStockValuation(): Promise<StockValuation> {
  const prods = await getProducts();

  let totalItemsCount = 0;
  let totalCostHtCents = 0;
  let totalRetailHtCents = 0;
  let totalWholesaleHtCents = 0;

  const valuedProducts = prods.map((p) => {
    const stock = Math.max(0, p.currentStock);
    const cost = stock * p.purchasePriceCents;
    const retail = stock * p.salePriceRetailCents;
    const wholesale = stock * (p.salePriceWholesaleCents || p.salePriceRetailCents);

    totalItemsCount += stock;
    totalCostHtCents += cost;
    totalRetailHtCents += retail;
    totalWholesaleHtCents += wholesale;

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      currentStock: p.currentStock,
      purchasePriceCents: p.purchasePriceCents,
      totalStockCostCents: cost,
      salePriceRetailCents: p.salePriceRetailCents,
    };
  });

  const latentMarginHtCents = Math.max(0, totalRetailHtCents - totalCostHtCents);
  const latentMarginRatePercent =
    totalRetailHtCents > 0
      ? Math.round((latentMarginHtCents / totalRetailHtCents) * 100)
      : 0;

  const topValuedProducts = valuedProducts
    .sort((a, b) => b.totalStockCostCents - a.totalStockCostCents)
    .slice(0, 8);

  return {
    totalItemsCount,
    totalCatalogReferences: prods.length,
    totalCostHtCents,
    totalRetailHtCents,
    totalWholesaleHtCents,
    latentMarginHtCents,
    latentMarginRatePercent,
    topValuedProducts,
  };
}

/**
 * Calcule le rapport d'analyse des marges brutes
 */
export async function getProfitMarginsReport(period: "THIS_MONTH" | "LAST_MONTH" | "ALL" = "THIS_MONTH"): Promise<ProfitMarginsReport> {
  const expPeriod = period === "THIS_MONTH" ? "THIS_MONTH" : "ALL";
  const [sales, prods, expRes] = await Promise.all([
    getSalesDocuments(),
    getProducts(),
    getExpenses({ period: expPeriod }),
  ]);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

  const filteredSales = sales.filter((d) => {
    if (d.status === "ANNULE") return false;
    const time = new Date(d.docDate).getTime();
    if (period === "THIS_MONTH" && time < startOfMonth) return false;
    if (period === "LAST_MONTH" && (time < startOfLastMonth || time >= startOfMonth)) return false;
    return true;
  });

  let totalRevenueHtCents = 0;
  let totalCostOfGoodsCents = 0;
  const productSalesMap = new Map<string, {
    sku: string;
    name: string;
    quantity: number;
    revenueHt: number;
    costHt: number;
  }>();

  for (const doc of filteredSales) {
    totalRevenueHtCents += doc.totalNetHtCents;
    const discountRatio = doc.totalBrutHtCents > 0 ? doc.totalNetHtCents / doc.totalBrutHtCents : 1;

    for (const line of doc.lines) {
      const prod = prods.find((p) => p.id === line.productId);
      const unitCost = line.unitCostCents ?? prod?.purchasePriceCents ?? 0;
      const lineCost = unitCost * line.quantity;
      const lineRevenue = Math.round(line.totalHtCents * discountRatio);

      totalCostOfGoodsCents += lineCost;

      const existing = productSalesMap.get(line.sku) || {
        sku: line.sku,
        name: line.productName,
        quantity: 0,
        revenueHt: 0,
        costHt: 0,
      };

      existing.quantity += line.quantity;
      existing.revenueHt += lineRevenue;
      existing.costHt += lineCost;
      productSalesMap.set(line.sku, existing);
    }
  }

  const grossMarginCents = Math.max(0, totalRevenueHtCents - totalCostOfGoodsCents);
  const grossMarginPercent =
    totalRevenueHtCents > 0
      ? Math.round((grossMarginCents / totalRevenueHtCents) * 100)
      : 0;

  const totalExpensesCents = expRes.stats.monthTotalCents;
  const netOperatingProfitCents = grossMarginCents - totalExpensesCents;

  const topSellingProducts = Array.from(productSalesMap.values())
    .map((p) => {
      const margin = Math.max(0, p.revenueHt - p.costHt);
      const marginPct = p.revenueHt > 0 ? Math.round((margin / p.revenueHt) * 100) : 0;
      return {
        sku: p.sku,
        name: p.name,
        quantitySold: p.quantity,
        totalRevenueHtCents: p.revenueHt,
        marginCents: margin,
        marginPercent: marginPct,
      };
    })
    .sort((a, b) => b.totalRevenueHtCents - a.totalRevenueHtCents)
    .slice(0, 10);

  return {
    period: period === "THIS_MONTH" ? "Mois en cours" : period === "LAST_MONTH" ? "Mois précédent" : "Historique complet",
    totalRevenueHtCents,
    totalCostOfGoodsCents,
    grossMarginCents,
    grossMarginPercent,
    totalExpensesCents,
    netOperatingProfitCents,
    topSellingProducts,
  };
}

/**
 * Génère le récapitulatif officiel de TVA à 20% pour l'expert-comptable
 */
export async function getTvaAccountingExport(options?: {
  month?: number; // 0-11
  year?: number;
}): Promise<TvaAccountingExport> {
  const sales = await getSalesDocuments();

  const now = new Date();
  const year = options?.year || now.getFullYear();
  const month = options?.month !== undefined ? options.month : now.getMonth();

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];
  const periodLabel = `${monthNames[month]} ${year}`;

  const startOfMonth = new Date(year, month, 1).getTime();
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).getTime();

  // Filtrer les ventes du mois
  const monthSales = sales.filter((d) => {
    if (d.status === "ANNULE") return false;
    const time = new Date(d.docDate).getTime();
    return time >= startOfMonth && time <= endOfMonth;
  });

  const d = requireDb();
  const blRows = await d.select({ id: businessLines.id, code: businessLines.code }).from(businessLines);
  const blMap = new Map(blRows.map((b) => [b.id, b.code]));

  let salesTaxableHtCents = 0;
  let tvaCollectedCents = 0;
  let salesTotalTtcCents = 0;

  const salesLines = monthSales.map((doc) => {
    salesTaxableHtCents += doc.totalNetHtCents;
    tvaCollectedCents += doc.tvaAmountCents;
    salesTotalTtcCents += doc.totalTtcCents;

    return {
      date: doc.docDate,
      docNumber: doc.docNumber,
      customerName: doc.customerName,
      customerIce: doc.customerIce || null,
      totalBrutHtCents: doc.totalBrutHtCents,
      discountAmountCents: doc.discountAmountCents,
      totalNetHtCents: doc.totalNetHtCents,
      tvaRate: doc.tvaRate,
      tvaAmountCents: doc.tvaAmountCents,
      totalTtcCents: doc.totalTtcCents,
      paymentMethod: doc.paymentMethod || "ESPECES",
      businessLine: blMap.get(doc.businessLineId ?? 0) ?? "",
    };
  });

  // Achats et TVA déductible réels (bons de réception du mois)
  const receiptRows = await d
    .select({
      id: supplierReceipts.id,
      receiptNumber: supplierReceipts.receiptNumber,
      receiptDate: supplierReceipts.receiptDate,
      invoiceNumber: supplierReceipts.supplierInvoiceNumber,
      totalHtCents: supplierReceipts.totalHtCents,
      tvaRate: supplierReceipts.tvaRate,
      tvaAmountCents: supplierReceipts.tvaAmountCents,
      totalTtcCents: supplierReceipts.totalTtcCents,
      supplierName: suppliers.name,
      supplierIce: suppliers.ice,
    })
    .from(supplierReceipts)
    .innerJoin(suppliers, eq(supplierReceipts.supplierId, suppliers.id))
    .where(
      and(
        ne(supplierReceipts.status, "ANNULE"),
        gte(supplierReceipts.receiptDate, new Date(startOfMonth)),
        lte(supplierReceipts.receiptDate, new Date(endOfMonth))
      )
    );

  const purchasesTaxableHtCents = receiptRows.reduce((s, r) => s + r.totalHtCents, 0);
  const tvaDeductiblePurchasesCents = receiptRows.reduce((s, r) => s + r.tvaAmountCents, 0);
  const expTvaRows = await d
    .select({ n: sql<string>`coalesce(sum(${expenses.tvaAmountCents}),0)::bigint` })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(
      and(
        gte(expenses.expenseDate, new Date(startOfMonth)),
        lte(expenses.expenseDate, new Date(endOfMonth)),
        eq(expenseCategories.vatDeductibleDefault, true)
      )
    );
  const tvaDeductibleExpensesCents = Number(expTvaRows[0]?.n ?? 0);
  const totalTvaDeductibleCents = tvaDeductiblePurchasesCents + tvaDeductibleExpensesCents;

  // Ligne métier d'un bon de réception : déduite de la ligne métier du 1er produit reçu.
  const receiptIds = receiptRows.map((r) => r.id);
  const receiptLineBl = new Map<number, string>();
  if (receiptIds.length > 0) {
    const lineRows = await d
      .select({ receiptId: supplierReceiptLines.receiptId, code: businessLines.code })
      .from(supplierReceiptLines)
      .innerJoin(products, eq(supplierReceiptLines.productId, products.id))
      .innerJoin(businessLines, eq(products.businessLineId, businessLines.id))
      .where(inArray(supplierReceiptLines.receiptId, receiptIds));
    for (const r of lineRows) {
      if (!receiptLineBl.has(r.receiptId)) receiptLineBl.set(r.receiptId, r.code);
    }
  }

  const purchaseLines = receiptRows.map((r) => ({
    date: (r.receiptDate ?? new Date()).toISOString(),
    receiptNumber: r.receiptNumber,
    supplierName: r.supplierName,
    supplierIce: r.supplierIce ?? null,
    invoiceNumber: r.invoiceNumber,
    totalHtCents: r.totalHtCents,
    tvaRate: r.tvaRate ?? 20,
    tvaAmountCents: r.tvaAmountCents,
    totalTtcCents: r.totalTtcCents,
    businessLine: receiptLineBl.get(r.id) ?? "",
  }));

  const netTvaDueCents = tvaCollectedCents - totalTvaDeductibleCents;
  const isCreditTva = netTvaDueCents < 0;

  const salesRate = salesTaxableHtCents > 0 ? Math.round((tvaCollectedCents / salesTaxableHtCents) * 100) : 20;
  const purchaseRate =
    purchasesTaxableHtCents > 0 ? Math.round((tvaDeductiblePurchasesCents / purchasesTaxableHtCents) * 100) : 20;

  return {
    periodLabel,
    salesTaxableHtCents,
    tvaCollectedRate: salesRate,
    tvaCollectedCents,
    salesTotalTtcCents,
    salesLines,
    purchasesTaxableHtCents,
    tvaDeductibleRate: purchaseRate,
    tvaDeductiblePurchasesCents,
    tvaDeductibleExpensesCents,
    totalTvaDeductibleCents,
    purchaseLines,
    netTvaDueCents: Math.abs(netTvaDueCents),
    isCreditTva,
  };
}
