"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Barcode,
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { getProducts, type ProductItem } from "@/lib/actions/products";
import { generateInternalBarcode, assignProductBarcode } from "@/lib/actions/barcodes";
import { unwrap } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import { BarcodeLabel } from "@/components/labels/BarcodeLabel";

interface QueueItem {
  product: ProductItem;
  qty: number;
}

/** File d&apos;impression : recherche produit → quantité d'étiquettes → aperçu → impression A4. */
export default function EtiquettesPage() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefilled = useRef(false);

  const totalLabels = queue.reduce((s, q) => s + Math.max(0, q.qty), 0);
  const missingBarcode = queue.filter((q) => !q.product.barcode).length;

  // Pré-remplissage : ?sku=XXX  ou  ?items=SKU1:QTY,SKU2:QTY (depuis /stock ou un BR)
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    const params = new URLSearchParams(window.location.search);
    const itemsParam = params.get("items");
    const skuParam = params.get("sku");
    if (!itemsParam && !skuParam) return;

    const wanted: Array<{ sku: string; qty: number }> = [];
    if (itemsParam) {
      for (const part of itemsParam.split(",")) {
        const [sku, qtyStr] = part.split(":");
        if (sku?.trim()) wanted.push({ sku: sku.trim(), qty: Math.max(1, parseInt(qtyStr || "1", 10) || 1) });
      }
    } else if (skuParam?.trim()) {
      wanted.push({ sku: skuParam.trim(), qty: 0 });
    }

    (async () => {
      for (const w of wanted) {
        try {
          const found = await getProducts({ search: w.sku, limit: 50 });
          const p = found.find((f) => f.sku === w.sku) ?? found[0];
          if (p) {
            setQueue((prev) =>
              prev.some((q) => q.product.id === p.id)
                ? prev
                : [...prev, { product: p, qty: w.qty > 0 ? w.qty : Math.max(1, p.currentStock) }]
            );
          }
        } catch {
          /* produit introuvable → ignoré */
        }
      }
    })();
  }, []);

  const runSearch = (term: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!term.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        setResults(await getProducts({ search: term.trim(), limit: 20 }));
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  const addToQueue = (p: ProductItem) => {
    setQueue((prev) => {
      const existing = prev.find((q) => q.product.id === p.id);
      if (existing) {
        return prev.map((q) => (q.product.id === p.id ? { ...q, qty: q.qty + 1 } : q));
      }
      return [...prev, { product: p, qty: Math.max(1, p.currentStock) }];
    });
  };

  const setQty = (id: number, qty: number) =>
    setQueue((prev) => prev.map((q) => (q.product.id === id ? { ...q, qty } : q)));

  const removeItem = (id: number) => setQueue((prev) => prev.filter((q) => q.product.id !== id));

  const generateForItem = async (item: QueueItem) => {
    try {
      setGeneratingFor(item.product.id);
      setErrorMessage(null);
      const { barcode } = unwrap(await generateInternalBarcode());
      unwrap(await assignProductBarcode(item.product.id, barcode));
      setQueue((prev) =>
        prev.map((q) =>
          q.product.id === item.product.id ? { ...q, product: { ...q.product, barcode } } : q
        )
      );
    } catch (err) {
      setErrorMessage((err as Error).message || "Échec de la génération du code-barres");
    } finally {
      setGeneratingFor(null);
    }
  };

  // Aperçu = étiquettes répétées (chaque produit × sa quantité)
  const sheet: Array<{ product: ProductItem; idx: number }> = [];
  for (const q of queue) {
    for (let i = 0; i < Math.max(0, q.qty); i++) sheet.push({ product: q.product, idx: i });
  }

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-[#111827] flex items-center gap-2">
            <Barcode size={22} className="text-[#F7162D]" />
            Étiquettes Code-Barres
          </h1>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Recherchez les pièces, réglez le nombre d&apos;étiquettes, puis imprimez (feuille A4, 3 × 8).
          </p>
        </div>
        <button
          onClick={() => window.print()}
          disabled={totalLabels === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-[#F7162D] hover:bg-[#D91324] rounded-xl shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Printer size={16} />
          Imprimer {totalLabels > 0 ? `${totalLabels} étiquette${totalLabels > 1 ? "s" : ""}` : ""}
        </button>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-[#F7162D] text-xs flex items-center gap-2 print:hidden">
          <AlertTriangle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {missingBarcode > 0 && (
        <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] text-xs font-semibold print:hidden">
          {missingBarcode} produit{missingBarcode > 1 ? "s" : ""} sans code-barres dans la file —
          utilisez « Générer » pour leur en attribuer un interne (20…).
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* Colonne gauche : recherche + file */}
        <div className="space-y-4 print:hidden">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4">
            <label className="block text-xs font-bold text-[#374151] mb-2">Ajouter une pièce</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  runSearch(e.target.value);
                }}
                placeholder="Nom, référence, code-barres…"
                className="w-full pl-9 pr-3 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl focus:border-[#F7162D] focus:ring-1 focus:ring-[#F7162D] outline-none"
              />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-[#F3F4F6]">
              {isSearching && (
                <div className="py-3 text-center text-xs text-[#9CA3AF]">Recherche…</div>
              )}
              {!isSearching &&
                results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToQueue(p)}
                    className="w-full text-left px-2 py-2 hover:bg-[#F8F9FA] rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-[#111827] truncate">{p.name}</div>
                      <div className="text-[10px] text-[#6B7280] font-mono">
                        {p.sku} · stock {p.currentStock} · {formatMoney(p.salePriceRetailCents)}
                      </div>
                    </div>
                    {p.barcode ? (
                      <Barcode size={14} className="text-[#059669] shrink-0" />
                    ) : (
                      <span className="text-[9px] font-bold text-[#D97706] shrink-0">SANS CB</span>
                    )}
                    <Plus size={14} className="text-[#374151] shrink-0" />
                  </button>
                ))}
              {!isSearching && search && results.length === 0 && (
                <div className="py-3 text-center text-xs text-[#9CA3AF]">Aucune pièce trouvée</div>
              )}
            </div>
          </div>

          {/* File d&apos;impression */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-[#374151]">
                File d&apos;impression ({queue.length} produit{queue.length > 1 ? "s" : ""})
              </h2>
              {queue.length > 0 && (
                <button
                  onClick={() => setQueue([])}
                  className="text-[10px] font-bold text-[#F7162D] hover:underline"
                >
                  Tout vider
                </button>
              )}
            </div>
            {queue.length === 0 && (
              <p className="text-xs text-[#9CA3AF] py-4 text-center">
                Aucune pièce — recherchez ci-dessus ou depuis une ligne du catalogue.
              </p>
            )}
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {queue.map((q) => (
                <div
                  key={q.product.id}
                  className="flex items-center gap-2 p-2 rounded-xl bg-[#F8F9FA] border border-[#E5E7EB]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#111827] truncate">
                      {q.product.name}
                    </div>
                    <div className="text-[10px] text-[#6B7280] font-mono truncate">
                      {q.product.barcode ? (
                        q.product.barcode
                      ) : (
                        <span className="text-[#D97706] font-bold">sans code-barres</span>
                      )}
                    </div>
                  </div>
                  {!q.product.barcode && (
                    <button
                      onClick={() => generateForItem(q)}
                      disabled={generatingFor === q.product.id}
                      title="Générer un code-barres interne (EAN-13 20…)"
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-white bg-[#0D9488] hover:bg-[#0F766E] rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <Wand2 size={11} />
                      {generatingFor === q.product.id ? "…" : "Générer"}
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(q.product.id, Math.max(1, q.qty - 1))}
                      className="p-1 rounded-md text-[#374151] hover:bg-[#E5E7EB]"
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={q.qty}
                      onChange={(e) => setQty(q.product.id, Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-12 text-center text-xs font-bold bg-white border border-[#E5E7EB] rounded-md py-1"
                    />
                    <button
                      onClick={() => setQty(q.product.id, q.qty + 1)}
                      className="p-1 rounded-md text-[#374151] hover:bg-[#E5E7EB]"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(q.product.id)}
                    className="p-1 text-[#9CA3AF] hover:text-[#F7162D] rounded-md"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Aperçu / feuille d'impression */}
        <div>
          <div className="text-[10px] font-bold text-[#9CA3AF] mb-1.5 print:hidden">
            APERÇU — feuille A4, {Math.ceil(totalLabels / 24) || 0} page{totalLabels > 24 ? "s" : ""}
          </div>
          <div
            id="etiquettes-sheet"
            className="label-sheet bg-white border border-[#E5E7EB] rounded-xl p-[4mm] grid gap-[4mm] print:border-0 print:p-0 print:rounded-none"
          >
            {sheet.length === 0 ? (
              <div className="col-span-3 py-16 text-center text-sm text-[#9CA3AF] print:hidden">
                Les étiquettes s&apos;affichent ici au format réel (63 × 30 mm).
              </div>
            ) : (
              sheet.map((s, i) => (
                <BarcodeLabel
                  key={`${s.product.id}-${i}`}
                  name={s.product.name}
                  barcode={s.product.barcode || ""}
                  priceCents={s.product.salePriceRetailCents}
                  shelfLocation={s.product.shelfLocation}
                  sku={s.product.sku}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
