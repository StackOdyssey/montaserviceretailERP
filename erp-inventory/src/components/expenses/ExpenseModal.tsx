"use client";

import { useState, useRef } from "react";
import { X, Receipt, Camera, Upload, Trash2, CheckCircle2 } from "lucide-react";
import { recordExpense } from "@/lib/actions/expenses";
import { ExpenseCategory, CATEGORY_LABELS } from "@/lib/constants/expenses";
import { toCentimes } from "@/lib/money";
import { compressImageToWebP } from "@/lib/image-compressor";

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ExpenseModal({ isOpen, onClose, onSaved }: ExpenseModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("TRANSPORT");
  const [amountDh, setAmountDh] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoInfo, setPhotoInfo] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      setError(null);
      const compressed = await compressImageToWebP(file, 1000, 1000, 0.8);
      setPhotoPreview(compressed.previewUrl);
      setPhotoInfo(`WebP optimisé (${compressed.sizeKb} Ko)`);
    } catch (err: any) {
      setError("Erreur lors de la compression de la photo du reçu.");
    } finally {
      setIsCompressing(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    setPhotoInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDh = parseFloat(amountDh.replace(",", "."));
    if (isNaN(parsedDh) || parsedDh <= 0) {
      setError("Veuillez saisir un montant valide en Dirhams.");
      return;
    }
    if (!title.trim()) {
      setError("Veuillez saisir l'intitulé de la dépense.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await recordExpense({
        title,
        category,
        amountCents: toCentimes(parsedDh),
        expenseDate: new Date(expenseDate).toISOString(),
        receiptPhotoUrl: photoPreview || undefined,
        notes: notes.trim() || undefined,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'enregistrement de la dépense.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Nouvelle Dépense de Caisse
              </h3>
              <p className="text-xs text-gray-500">
                Sortie de caisse quotidienne du magasin (carburant, repas, loyer...)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Catégorie de la dépense <span className="text-[#F7162D]">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F7162D]"
            >
              {Object.entries(CATEGORY_LABELS).map(([catKey, label]) => (
                <option key={catKey} value={catKey}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Intitulé / Motif de la dépense <span className="text-[#F7162D]">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Plein carburant triporteur livraison pièces"
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Montant décaissé (DH) <span className="text-[#F7162D]">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.10"
                  value={amountDh}
                  onChange={(e) => setAmountDh(e.target.value)}
                  placeholder="Ex: 150,00"
                  className="w-full pl-3 pr-12 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F7162D]"
                  required
                />
                <span className="absolute right-3.5 top-3 font-bold text-gray-400">DH</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Date de la dépense
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
              />
            </div>
          </div>

          {/* Photo du reçu ou ticket de caisse */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Justificatif / Reçu (Photo Smartphone)
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {photoPreview ? (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={photoPreview}
                    alt="Reçu"
                    className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-800 dark:text-gray-200">Reçu joint</div>
                    <div className="text-[11px] text-emerald-600 font-medium">{photoInfo}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing}
                className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-[#F7162D] rounded-xl flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:text-[#F7162D] transition bg-gray-50/50 dark:bg-gray-800/30"
              >
                <Camera className="w-5 h-5" />
                <span className="text-xs font-bold">
                  {isCompressing ? "Compression WebP en cours..." : "Prendre en photo le ticket / reçu"}
                </span>
                <span className="text-[10px] text-gray-400">
                  Optimisé automatiquement pour iPhone (&lt; 80 Ko)
                </span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Remarques
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Station Afriquia, ticket n° 9812..."
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition disabled:opacity-50"
            >
              {isSubmitting ? "Validation..." : "Enregistrer la dépense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
