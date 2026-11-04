"use client";

import React, { useEffect, useState, useTransition } from "react";
import { ClipboardList, PlusCircle, Check, X, RefreshCw, AlertTriangle } from "lucide-react";
import {
  cancelStockCount,
  createStockCount,
  getStockCount,
  getStockCounts,
  setStockCountLine,
  validateStockCount,
  type StockCountLineDTO,
  type StockCountSummary,
} from "@/lib/actions/stock-counts";
import { useBusinessLine } from "@/components/layout/BusinessLineProvider";
import { formatMoney } from "@/lib/money";
import { unwrap } from "@/lib/action-result";

export default function InventoryPage() {
  const { activeCode, activeLine } = useBusinessLine();
  const [counts, setCounts] = useState<StockCountSummary[]>([]);
  const [selected, setSelected] = useState<{ header: StockCountSummary; lines: StockCountLineDTO[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const refresh = (openId?: number) => {
    startTransition(async () => {
      const list = await getStockCounts(activeCode);
      setCounts(list);
      if (openId) setSelected(await getStockCount(openId));
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      refresh();
      setSelected(null);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCode]);

  const handleCreate = () => {
    setMessage(null);
    startTransition(async () => {
      const { id } = unwrap(await createStockCount(activeCode));
      refresh(id);
    });
  };

  const openCount = (id: number) => {
    setMessage(null);
    startTransition(async () => {
      setSelected(await getStockCount(id));
    });
  };

  const updateCounted = (lineId: number, counted: number) => {
    setSelected((prev) =>
      prev
        ? {
            ...prev,
            lines: prev.lines.map((l) =>
              l.lineId === lineId
                ? { ...l, countedQty: counted, varianceQty: counted - l.expectedQty }
                : l
            ),
          }
        : prev
    );
  };

  const persistLine = (lineId: number, counted: number) => {
    startTransition(async () => {
      unwrap(await setStockCountLine(lineId, counted));
    });
  };

  const handleValidate = () => {
    if (!selected) return;
    startTransition(async () => {
      for (const l of selected.lines) {
        unwrap(await setStockCountLine(l.lineId, l.countedQty));
      }
      const { adjusted } = unwrap(await validateStockCount(selected.header.id));
      setMessage(`Inventaire validé — ${adjusted} ajustement(s) posté(s).`);
      refresh(selected.header.id);
    });
  };

  const handleCancel = () => {
    if (!selected) return;
    startTransition(async () => {
      unwrap(await cancelStockCount(selected.header.id));
      setMessage("Inventaire annulé.");
      refresh(selected.header.id);
    });
  };

  const isDraft = selected?.header.status === "DRAFT";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 md:p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE]/50">
            <ClipboardList size={14} />
            Inventaire — {activeLine?.displayName ?? activeCode}
          </span>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] mt-1.5 tracking-tight">
            Comptage & Ajustement de Stock
          </h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            Fige le stock théorique, saisit les quantités comptées, puis valide pour poster les ajustements (CMUP).
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={isPending}
          className="flex items-center gap-2 bg-[#F7162D] hover:bg-[#D90E23] disabled:opacity-60 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all active:scale-98"
        >
          <PlusCircle size={16} />
          <span>Nouvel inventaire</span>
        </button>
      </div>

      {message && (
        <div className="text-xs font-semibold text-[#065F46] bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl px-4 py-3">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des inventaires */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
            <span className="text-xs font-bold text-[#111827] uppercase tracking-wide">Inventaires récents</span>
            <button onClick={() => refresh()} className="text-[#6B7280] hover:text-[#111827]" title="Rafraîchir">
              <RefreshCw size={14} />
            </button>
          </div>
          {counts.length === 0 ? (
            <div className="p-6 text-xs text-[#6B7280]">Aucun inventaire pour cette ligne.</div>
          ) : (
            <ul className="divide-y divide-[#E5E7EB]">
              {counts.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => openCount(c.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-[#F8F9FA] transition-colors ${
                      selected?.header.id === c.id ? "bg-[#FEF2F2]" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[#111827]">{c.code}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          c.status === "VALIDATED"
                            ? "bg-[#ECFDF5] text-[#059669]"
                            : c.status === "CANCELLED"
                            ? "bg-[#F3F4F6] text-[#6B7280]"
                            : "bg-[#FFFBEB] text-[#D97706]"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6B7280] mt-0.5">
                      {c.totalLines} article(s) • {c.varianceLines} écart(s)
                    </div>
                    <div className="text-[10px] mt-0.5">
                      <span className="text-[#9CA3AF]" title="Valeur sélection / inventaire">
                        {formatMoney(c.selectionValueCents)} / {formatMoney(c.countedValueCents)}
                      </span>
                      <span className={`ml-1 font-bold ${c.varianceValueCents !== 0 ? "text-[#F7162D]" : "text-[#059669]"}`}>
                        Écart {formatMoney(c.varianceValueCents)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Détail de l'inventaire */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          {!selected ? (
            <div className="p-12 text-center text-xs text-[#6B7280]">
              Sélectionnez un inventaire ou créez-en un nouveau.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-bold text-[#111827]">{selected.header.code}</span>
                  <span className="ml-2 text-[11px] text-[#6B7280]">{selected.header.businessLineCode}</span>
                </div>
                {isDraft && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCancel}
                      disabled={isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#374151] bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-lg disabled:opacity-60"
                    >
                      <X size={14} /> Annuler
                    </button>
                    <button
                      onClick={handleValidate}
                      disabled={isPending}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#059669] hover:bg-[#047857] rounded-lg disabled:opacity-60"
                    >
                      <Check size={14} /> Valider l&apos;inventaire
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#F8F9FA]">
                    <tr className="border-b border-[#E5E7EB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Désignation</th>
                      <th className="py-2.5 px-3 text-center">Théorique</th>
                      <th className="py-2.5 px-3 text-center">Compté</th>
                      <th className="py-2.5 px-3 text-center">Écart</th>
                      <th className="py-2.5 px-3 text-right">Valeur écart</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB] text-xs">
                    {selected.lines.map((l) => {
                      const v = l.countedQty - l.expectedQty;
                      return (
                        <tr key={l.lineId} className="hover:bg-[#F8F9FA]">
                          <td className="py-2 px-3 font-mono font-bold text-[#111827]">{l.sku}</td>
                          <td className="py-2 px-3 text-[#374151] line-clamp-1">{l.name}</td>
                          <td className="py-2 px-3 text-center font-mono text-[#6B7280]">{l.expectedQty}</td>
                          <td className="py-2 px-3 text-center">
                            <input id="countedQty" name="countedQty" aria-label="Quantité comptée"
                              type="number"
                              value={l.countedQty}
                              disabled={!isDraft}
                              onChange={(e) => updateCounted(l.lineId, Number(e.target.value))}
                              onBlur={(e) => isDraft && persistLine(l.lineId, Number(e.target.value))}
                              className="w-20 px-2 py-1 text-center font-mono text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none disabled:bg-[#F8F9FA]"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`font-mono font-bold ${
                                v === 0 ? "text-[#6B7280]" : v > 0 ? "text-[#059669]" : "text-[#F7162D]"
                              }`}
                            >
                              {v > 0 ? `+${v}` : v}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-[#6B7280]">
                            {formatMoney(v * l.unitCostCents)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selected.lines.some((l) => l.countedQty - l.expectedQty !== 0) && isDraft && (
                <div className="px-4 py-2 border-t border-[#E5E7EB] flex items-center gap-2 text-[11px] text-[#D97706]">
                  <AlertTriangle size={13} />
                  Écarts détectés — la validation postera les ajustements correspondants.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
