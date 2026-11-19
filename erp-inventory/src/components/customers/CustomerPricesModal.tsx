"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Search, Trash2, Save } from "lucide-react";
import { getProducts, type ProductItem } from "@/lib/actions/products";
import {
  deleteCustomerPriceOverride,
  getCustomerPriceOverrides,
  saveCustomerPriceOverride,
  type CustomerPriceOverrideItem,
} from "@/lib/actions/pricing";
import { unwrap } from "@/lib/action-result";
import { formatMoney, toCentimes } from "@/lib/money";

interface CustomerPricesModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: number;
  customerName: string;
}

interface RowState {
  price: string; // saisie en DH ("" = pas de tarif fixé)
  designation: string;
}

/** M1 — tarifs & désignations spécifiques par client (équivalent clientproduits). */
export function CustomerPricesModal({ isOpen, onClose, customerId, customerName }: CustomerPricesModalProps) {
  const [rows, setRows] = useState<CustomerPriceOverrideItem[]>([]);
  const [pending, setPending] = useState<ProductItem[]>([]); // ajoutés, pas encore enregistrés
  const [drafts, setDrafts] = useState<Record<number, RowState>>({});
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<ProductItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const items = unwrap(await getCustomerPriceOverrides(customerId));
    setRows(items);
    setDrafts(
      Object.fromEntries(
        items.map((r) => [
          r.productId,
          {
            price: r.priceHtCents != null ? (r.priceHtCents / 100).toString() : "",
            designation: r.customDesignation ?? "",
          },
        ])
      )
    );
  }, [customerId]);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [isOpen, load]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!isOpen || search.trim().length < 2) {
        setMatches([]);
        return;
      }
      try {
        const res = await getProducts({ search: search.trim() });
        setMatches(
          res
            .filter((p) => !rows.some((r) => r.productId === p.id) && !pending.some((x) => x.id === p.id))
            .slice(0, 6)
        );
      } catch {
        setMatches([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [search, isOpen, rows, pending]);

  if (!isOpen) return null;

  const saveRow = async (productId: number) => {
    const d = drafts[productId] ?? { price: "", designation: "" };
    const parsed = parseFloat(d.price.replace(",", "."));
    const price = d.price.trim() === "" || isNaN(parsed) ? null : toCentimes(parsed);
    setBusy(true);
    setError(null);
    try {
      const res = unwrap(
        await saveCustomerPriceOverride({
          customerId,
          productId,
          priceHtCents: price,
          customDesignation: d.designation.trim() || null,
        })
      );
      if (res.deleted) {
        setRows((r) => r.filter((x) => x.productId !== productId));
      } else {
        setPending((p) => p.filter((x) => x.id !== productId));
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const addProduct = (p: ProductItem) => {
    setSearch("");
    setMatches([]);
    setPending((prev) => [...prev, p]);
  };

  const discardPending = (productId: number) => setPending((p) => p.filter((x) => x.id !== productId));

  const removeRow = async (row: CustomerPriceOverrideItem) => {
    setBusy(true);
    setError(null);
    try {
      unwrap(await deleteCustomerPriceOverride(row.id));
      setRows((r) => r.filter((x) => x.id !== row.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">Tarifs client</h2>
            <p className="text-xs text-gray-500 truncate">{customerName} — prix et désignations spécifiques</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ajouter un produit — réf, code-barres ou nom…"
              className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#F7162D]"
            />
          </div>
          {matches.length > 0 && (
            <div className="mt-1 border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {matches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void addProduct(p)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="font-mono font-bold text-xs text-gray-900">{p.sku}</span>{" "}
                    <span className="text-gray-700">{p.name}</span>
                  </span>
                  <span className="text-xs font-bold text-[#F7162D] shrink-0">{formatMoney(p.salePriceRetailCents)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 && pending.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">
              Aucun tarif spécifique — ce client paie le prix catalogue / niveau.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Produit</th>
                  <th className="text-left px-3 py-2 w-24">Catalogue</th>
                  <th className="text-left px-3 py-2 w-28">Prix client DH</th>
                  <th className="text-left px-3 py-2">Désignation</th>
                  <th className="px-3 py-2 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map((p) => {
                  const d = drafts[p.id] ?? { price: "", designation: "" };
                  return (
                    <tr key={`p-${p.id}`} className="bg-amber-50/60">
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs font-bold text-gray-900">{p.sku}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[180px]">{p.name}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{formatMoney(p.salePriceRetailCents)}</td>
                      <td className="px-3 py-2">
                        <input
                          value={d.price}
                          onChange={(e) => setDrafts((dr) => ({ ...dr, [p.id]: { ...d, price: e.target.value } }))}
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`Prix client ${p.sku}`}
                          className="w-full h-9 px-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-900 outline-none focus:border-[#F7162D]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={d.designation}
                          onChange={(e) => setDrafts((dr) => ({ ...dr, [p.id]: { ...d, designation: e.target.value } }))}
                          placeholder={p.name}
                          aria-label={`Désignation ${p.sku}`}
                          className="w-full h-9 px-2 border border-gray-300 rounded-lg text-sm text-gray-800 outline-none focus:border-[#F7162D]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() => void saveRow(p.id)}
                            disabled={busy}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-40"
                            aria-label="Enregistrer"
                          >
                            <Save size={15} />
                          </button>
                          <button
                            onClick={() => discardPending(p.id)}
                            className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"
                            aria-label="Retirer"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.map((r) => {
                  const d = drafts[r.productId] ?? { price: "", designation: "" };
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs font-bold text-gray-900">{r.sku}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[180px]">{r.productName}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{formatMoney(r.catalogPriceHtCents)}</td>
                      <td className="px-3 py-2">
                        <input
                          value={d.price}
                          onChange={(e) => setDrafts((dr) => ({ ...dr, [r.productId]: { ...d, price: e.target.value } }))}
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`Prix client ${r.sku}`}
                          className="w-full h-9 px-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-900 outline-none focus:border-[#F7162D]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={d.designation}
                          onChange={(e) => setDrafts((dr) => ({ ...dr, [r.productId]: { ...d, designation: e.target.value } }))}
                          placeholder={r.productName}
                          aria-label={`Désignation ${r.sku}`}
                          className="w-full h-9 px-2 border border-gray-300 rounded-lg text-sm text-gray-800 outline-none focus:border-[#F7162D]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() => void saveRow(r.productId)}
                            disabled={busy}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-40"
                            aria-label="Enregistrer"
                          >
                            <Save size={15} />
                          </button>
                          <button
                            onClick={() => void removeRow(r)}
                            disabled={busy}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-40"
                            aria-label="Supprimer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {error && <p className="px-4 py-2 text-xs font-semibold text-red-600 border-t border-red-100 bg-red-50">{error}</p>}
      </div>
    </div>
  );
}
