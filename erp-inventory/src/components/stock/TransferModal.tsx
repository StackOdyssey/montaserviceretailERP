"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, X, Plus, Trash2, Truck } from "lucide-react";
import { getWarehouses, createStockTransfer, type WarehouseItem } from "@/lib/actions/warehouses";
import { getProducts, type ProductItem } from "@/lib/actions/products";
import { unwrap } from "@/lib/action-result";
import { useToast } from "@/components/ui/ToastProvider";

interface Line { productId: number; sku: string; name: string; quantity: string; available: number | null; }

/** Transfert de stock entre entrepôts (legacy `transfert`) : Principal ↔ Mobile (camionnette). */
export function TransferModal({ isOpen, onClose, onDone }: { isOpen: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<ProductItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(false);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) { setLines([]); setSearch(""); setNotes(""); setMatches([]); }
  }

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getWarehouses().then((r) => { const ws = unwrap(r);
      if (!active) return;
      setWarehouses(ws);
      const def = ws.find((w) => w.isDefault) ?? ws[0];
      setFromId(def?.id ?? null);
      setToId(ws.find((w) => w.id !== def?.id)?.id ?? null);
    }).catch(() => {});
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    const term = search.trim();
    let active = true;
    const t = setTimeout(() => {
      if (term.length < 2) { setMatches([]); return; }
      getProducts({ search: term, limit: 8 }).then((r) => { if (active) setMatches(r); }).catch(() => {});
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [search]);

  if (!isOpen) return null;

  const addLine = (p: ProductItem) => {
    if (lines.some((l) => l.productId === p.id)) return;
    setLines([...lines, { productId: p.id, sku: p.sku, name: p.name, quantity: "", available: p.currentStock }]);
    setSearch(""); setMatches([]);
  };

  const submit = async () => {
    const parsed = lines
      .map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity) || 0 }))
      .filter((l) => l.quantity > 0);
    if (!parsed.length || fromId == null || toId == null) return;
    setBusy(true);
    try {
      const res = unwrap(await createStockTransfer({ fromWarehouseId: fromId, toWarehouseId: toId, lines: parsed, notes }));
      toast.success(`Transfert ${res.transferNumber} enregistré`);
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fromName = warehouses.find((w) => w.id === fromId)?.name ?? "—";
  const toName = warehouses.find((w) => w.id === toId)?.name ?? "—";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#F7162D]" /> Transfert entre entrepôts
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Depuis</label>
              <select value={fromId ?? ""} onChange={(e) => setFromId(Number(e.target.value) || null)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold">
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <ArrowRightLeft className="w-4 h-4 text-gray-400 mb-2.5" />
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Vers</label>
              <select value={toId ?? ""} onChange={(e) => setToId(Number(e.target.value) || null)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold">
                {warehouses.map((w) => <option key={w.id} value={w.id} disabled={w.id === fromId}>{w.name}</option>)}
              </select>
            </div>
          </div>

          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Chercher une pièce (SKU, nom, OEM)…"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#F7162D]"
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 inset-x-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-auto">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => addLine(p)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex justify-between gap-2">
                      <span><b>{p.sku}</b> — {p.name}</span>
                      <span className="text-gray-400 shrink-0">stock {p.currentStock}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100">
                  <th className="py-2">Pièce</th>
                  <th className="py-2 w-20 text-center">Qté</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.productId} className="border-b border-gray-50">
                    <td className="py-2"><b>{l.sku}</b> — {l.name}
                      <div className="text-[10px] text-gray-400">stock global {l.available ?? "?"}</div>
                    </td>
                    <td className="py-2 text-center">
                      <input type="number" min={1} value={l.quantity}
                        onChange={(e) => setLines(lines.map((x) => x.productId === l.productId ? { ...x, quantity: e.target.value } : x))}
                        className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-center font-bold" />
                    </td>
                    <td className="py-2 text-center">
                      <button onClick={() => setLines(lines.filter((x) => x.productId !== l.productId))}
                        className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Note (optionnel — ex: chargement camionnette)"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs" />
        </div>

        <div className="flex justify-between items-center px-5 py-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">{fromName} → {toName}</p>
          <button onClick={submit} disabled={busy || !lines.length || fromId === toId || fromId == null || toId == null}
            className="px-5 py-2.5 bg-[#F7162D] hover:bg-[#D90E23] text-white text-xs font-bold rounded-xl transition disabled:opacity-50 flex items-center gap-2">
            <Plus size={14} /> {busy ? "Transfert…" : "Valider le transfert"}
          </button>
        </div>
      </div>
    </div>
  );
}
