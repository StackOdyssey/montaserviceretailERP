export type ExpenseCategory =
  | "LOYER"
  | "ELECTRICITE_EAU"
  | "TRANSPORT"
  | "REPAS_EQUIPE"
  | "FOURNITURES"
  | "AUTRE";

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  LOYER: "Loyer & Charges",
  ELECTRICITE_EAU: "Électricité & Eau (Lydec)",
  TRANSPORT: "Carburant & Transport",
  REPAS_EQUIPE: "Repas équipe & Collation",
  FOURNITURES: "Fournitures & Entretien",
  AUTRE: "Divers & Imprévus",
};

export interface ExpenseItem {
  id: number;
  title: string;
  category: string; // nom de la catégorie (table expense_categories)
  categoryId?: number | null;
  amountCents: number; // Total TTC
  amountHtCents?: number;
  tvaRate?: number;
  tvaAmountCents?: number;
  expenseDate: string;
  receiptPhotoUrl?: string | null;
  notes?: string | null;
  createdAt: string;
}

