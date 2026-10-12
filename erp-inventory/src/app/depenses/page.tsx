"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Plus,
  Calendar,
  Receipt,
  Search,
  Filter,
  Trash2,
  Image,
  X,
  TrendingDown,
  Layers,
} from "lucide-react";
import {
  getExpenses,
  deleteExpense,
} from "@/lib/actions/expenses";
import { ExpenseItem } from "@/lib/constants/expenses";
import { useParameters } from "@/components/layout/SettingsProvider";

import { formatMoney } from "@/lib/money";
import { ExpenseModal } from "@/components/expenses/ExpenseModal";

export default function DepensesPage() {
  const { expenseCategories } = useParameters();
  const [expensesList, setExpensesList] = useState<ExpenseItem[]>([]);
  const [stats, setStats] = useState({
    todayTotalCents: 0,
    monthTotalCents: 0,
    categoryTotals: {} as Record<string, number>,
  });
  const [period, setPeriod] = useState<"TODAY" | "THIS_WEEK" | "THIS_MONTH" | "ALL">("THIS_MONTH");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getExpenses({
        category: selectedCategory,
        period,
        search: searchQuery,
      });
      setExpensesList(res.expenses);
      setStats(res.stats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, selectedCategory, searchQuery]);

  const handleDelete = async (id: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette dépense de caisse ?")) {
      await deleteExpense(id);
      loadData();
    }
  };

  const categoryColors = [
    "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  ];
  const getCategoryBadgeClass = (cat: string) => {
    const idx = expenseCategories.findIndex((c) => c.name === cat);
    return categoryColors[(idx >= 0 ? idx : 0) % categoryColors.length];
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Receipt className="w-7 h-7 text-[#F7162D]" />
            Dépenses Quotidiennes de Caisse
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Suivi des décaissements et petites charges magasin (Loyer, Transport, Repas, Électricité, Fournitures).
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nouvelle Dépense
        </button>
      </div>

      {/* Cartes d'indicateurs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Dépenses du Jour</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600">
            {formatMoney(stats.todayTotalCents)}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Sorties de caisse enregistrées aujourd'hui
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Dépenses du Mois</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {formatMoney(stats.monthTotalCents)}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Charges cumulées du mois en cours
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Opérations Filtrées</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {expensesList.length} Dépenses
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Total affiché : {formatMoney(expensesList.reduce((sum, e) => sum + e.amountCents, 0))}
          </p>
        </div>
      </div>

      {/* Barre de filtres */}
      <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "TODAY", label: "Aujourd'hui" },
            { id: "THIS_WEEK", label: "Cette semaine" },
            { id: "THIS_MONTH", label: "Ce mois" },
            { id: "ALL", label: "Tout l'historique" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPeriod(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition shrink-0 ${
                period === tab.id
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#F7162D]"
          >
            <option value="ALL">Toutes les catégories</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tableau des dépenses */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 text-gray-500 text-xs uppercase font-bold tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4">Intitulé / Motif</th>
                <th className="py-3 px-4 text-center">Justificatif</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {expensesList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    Aucune dépense enregistrée pour la période sélectionnée.
                  </td>
                </tr>
              ) : (
                expensesList.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition">
                    <td className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300">
                      {new Date(item.expenseDate).toLocaleDateString("fr-FR")}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${getCategoryBadgeClass(
                          item.category
                        )}`}
                      >
                        {item.category}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {item.title}
                      </div>
                      {item.notes && (
                        <div className="text-xs text-gray-400 mt-0.5">{item.notes}</div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      {item.receiptPhotoUrl ? (
                        <button
                          onClick={() => setPreviewPhotoUrl(item.receiptPhotoUrl!)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-emerald-600 transition"
                          title="Voir la photo du reçu"
                        >
                          <Image className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-black text-rose-600 dark:text-rose-400 text-base">
                      -{formatMoney(item.amountCents)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg transition"
                        title="Supprimer la dépense"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal d'ajout de dépense */}
      <ExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={loadData}
      />

      {/* Modal aperçu photo ticket */}
      {previewPhotoUrl && (
        <div
          onClick={() => setPreviewPhotoUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 cursor-pointer"
        >
          <div className="relative max-w-lg w-full bg-white dark:bg-gray-900 rounded-2xl overflow-hidden p-2 shadow-2xl">
            <button
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute top-4 right-4 p-2 bg-black/60 text-white rounded-full hover:bg-black transition"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewPhotoUrl}
              alt="Reçu de caisse"
              className="w-full max-h-[80vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
