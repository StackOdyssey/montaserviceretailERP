"use client";

import { useEffect, useState } from "react";
import { X, History, ArrowUp, ArrowDown } from "lucide-react";
import { ProductItem, getProductMovements, ProductMovementItem } from "@/lib/actions/products";
import { formatMoney } from "@/lib/money";

const TYPE_LABELS: Record<string, string> = {
  ACHAT_RECEPTION: "Réception FRS",
  VENTE_BL: "Vente / BL",
  AVOIR_RETOUR: "Avoir retour client",
  AJUSTEMENT_INVENTAIRE: "Ajustement",
  STOCK_INITIAL: "Stock initial",
  REBUT: "Rebut / casse",
  RETOUR_FOURNISSEUR: "Retour FRS",
  AVOIR_PRIX_FOURNISSEUR: "Avoir prix FRS",
  COMPTE_INVENTAIRE: "Inventaire",
};

interface ProductHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductItem | null;
}

export function ProductHistoryModal({ isOpen, onClose, product }: ProductHistoryModalProps) {
  const [movements, setMovements] = useState<ProductMovementItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  // Réinitialise la pagination à l'ouverture / changement de pièce (reset dérivé pendant le render).
  const [openFor, setOpenFor] = useState<number | null>(null);
  const currentFor = isOpen && product ? product.id : null;
  if (currentFor !== openFor) {
    setOpenFor(currentFor);
    setOffset(0);
  }
  const PAGE = 50;

  useEffect(() => {
    if (!isOpen || !product) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      getProductMovements(product.id, { limit: PAGE, offset })
        .then((r) => {
          if (!active) return;
          setMovements(r.movements);
          setTotal(r.total);
        })
        .catch(() => {})
        .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, product, offset]);

  if (!isOpen || !product) return null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-3xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Traçabilité — <span className="font-mono text-[#F7162D]">{product.sku}</span>
              </h3>
              <p className="text-xs text-gray-500">
                {product.name} — stock actuel : <span className="font-bold">{product.currentStock}</span>
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

        <div className="p-5">
          {loading ? (
            <p className="text-center text-sm text-gray-500 py-8">Chargement…</p>
          ) : movements.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">Aucun mouvement enregistré pour cette pièce.</p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="max-h-[55vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 uppercase font-bold">
                      <th className="py-2 px-3 text-left">Date</th>
                      <th className="py-2 px-3 text-left">Mouvement</th>
                      <th className="py-2 px-3 text-right">Qté</th>
                      <th className="py-2 px-3 text-right">Coût</th>
                      <th className="py-2 px-3 text-right">Stock avant → après</th>
                      <th className="py-2 px-3 text-left">Détail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2 px-3 whitespace-nowrap text-gray-600">
                          {new Date(m.createdAt).toLocaleDateString("fr-FR")}{" "}
                          <span className="text-gray-400">
                            {new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {TYPE_LABELS[m.movementType] ?? m.movementType}
                          </span>
                          {m.sourceDocumentType && (
                            <span className="ml-1 text-[10px] text-gray-400">({m.sourceDocumentType})</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <span className={`inline-flex items-center gap-0.5 font-bold font-mono ${m.quantity >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {m.quantity >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                            {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {m.unitCostCents != null ? formatMoney(m.unitCostCents) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {m.stockBefore} → <span className="font-bold">{m.stockAfter}</span>
                        </td>
                        <td className="py-2 px-3 text-gray-500 max-w-[180px] truncate" title={m.reason ?? ""}>
                          {m.reason ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {total > PAGE && (
            <div className="flex items-center justify-between pt-3 text-xs">
              <span className="text-gray-500">
                Page {page} sur {totalPages} — {total} mouvements
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
                  disabled={offset === 0}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 font-semibold disabled:opacity-40"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setOffset((o) => o + PAGE)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 font-semibold disabled:opacity-40"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
