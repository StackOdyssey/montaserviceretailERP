"use server";

import { db, expenses } from "@/db";
import type { ExpenseCategory, ExpenseItem } from "@/lib/constants/expenses";

export type { ExpenseCategory, ExpenseItem };


// Dépenses initiales en mémoire
let memoryExpenses: ExpenseItem[] = [
  {
    id: 1,
    title: "Loyer mensuel local commercial Derb Ghallef",
    category: "LOYER",
    amountCents: 650000, // 6 500,00 DH
    expenseDate: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    receiptPhotoUrl: null,
    notes: "Quittance de loyer mois en cours",
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 2,
    title: "Facture Lydec Électricité & Eau",
    category: "ELECTRICITE_EAU",
    amountCents: 84000, // 840,00 DH
    expenseDate: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    receiptPhotoUrl: null,
    notes: "Payé en espèces au guichet Tashilat",
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 3,
    title: "Carburant triporteur livraison pièces",
    category: "TRANSPORT",
    amountCents: 15000, // 150,00 DH
    expenseDate: new Date().toISOString(),
    receiptPhotoUrl: null,
    notes: "Station Afriquia Bd Al Qods",
    createdAt: new Date().toISOString(),
  },
  {
    id: 4,
    title: "Déjeuner équipe magasin (3 personnes)",
    category: "REPAS_EQUIPE",
    amountCents: 12000, // 120,00 DH
    expenseDate: new Date().toISOString(),
    receiptPhotoUrl: null,
    notes: "Sandwichs midi",
    createdAt: new Date().toISOString(),
  },
  {
    id: 5,
    title: "Rouleaux scotch d'emballage et cartons d'expédition",
    category: "FOURNITURES",
    amountCents: 18000, // 180,00 DH
    expenseDate: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    receiptPhotoUrl: null,
    notes: "Pour expédition colis clients province",
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
  },
];

/**
 * Récupère les dépenses avec filtres et statistiques
 */
export async function getExpenses(options?: {
  category?: string;
  period?: "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "ALL";
  search?: string;
}) {
  const search = options?.search?.toLowerCase().trim() || "";
  const category = options?.category;
  const period = options?.period || "THIS_MONTH";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - ((now.getDay() + 6) % 7) * 24 * 3600 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const filtered = memoryExpenses.filter((item) => {
    if (category && category !== "ALL" && item.category !== category) return false;
    if (search && !item.title.toLowerCase().includes(search)) return false;

    const itemTime = new Date(item.expenseDate).getTime();
    if (period === "TODAY" && itemTime < startOfToday) return false;
    if (period === "THIS_WEEK" && itemTime < startOfWeek) return false;
    if (period === "THIS_MONTH" && itemTime < startOfMonth) return false;

    return true;
  });

  // Calcul des statistiques globales
  const todayTotalCents = memoryExpenses
    .filter((e) => new Date(e.expenseDate).getTime() >= startOfToday)
    .reduce((sum, e) => sum + e.amountCents, 0);

  const monthTotalCents = memoryExpenses
    .filter((e) => new Date(e.expenseDate).getTime() >= startOfMonth)
    .reduce((sum, e) => sum + e.amountCents, 0);

  // Ventilation par catégorie sur le mois
  const categoryTotals: Record<ExpenseCategory, number> = {
    LOYER: 0,
    ELECTRICITE_EAU: 0,
    TRANSPORT: 0,
    REPAS_EQUIPE: 0,
    FOURNITURES: 0,
    AUTRE: 0,
  };

  memoryExpenses
    .filter((e) => new Date(e.expenseDate).getTime() >= startOfMonth)
    .forEach((e) => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amountCents;
    });

  return {
    expenses: filtered.sort(
      (a, b) =>
        new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()
    ),
    stats: {
      todayTotalCents,
      monthTotalCents,
      categoryTotals,
    },
  };
}

/**
 * Enregistre une dépense de caisse
 */
export async function recordExpense(data: {
  title: string;
  category: ExpenseCategory;
  amountCents: number;
  expenseDate?: string;
  receiptPhotoUrl?: string;
  notes?: string;
}): Promise<ExpenseItem> {
  if (!data.title.trim()) {
    throw new Error("L'intitulé de la dépense est obligatoire");
  }
  if (data.amountCents <= 0) {
    throw new Error("Le montant de la dépense doit être supérieur à 0");
  }

  const newExpense: ExpenseItem = {
    id: Date.now(),
    title: data.title.trim(),
    category: data.category,
    amountCents: data.amountCents,
    expenseDate: data.expenseDate || new Date().toISOString(),
    receiptPhotoUrl: data.receiptPhotoUrl || null,
    notes: data.notes || null,
    createdAt: new Date().toISOString(),
  };

  memoryExpenses.unshift(newExpense);
  return newExpense;
}

/**
 * Supprime une dépense
 */
export async function deleteExpense(id: number) {
  memoryExpenses = memoryExpenses.filter((e) => e.id !== id);
  return { success: true };
}
