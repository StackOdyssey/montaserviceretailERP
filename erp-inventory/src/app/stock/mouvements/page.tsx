"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRightLeft, ChevronLeft, Search } from "lucide-react";
import { getStockMovements, getWarehouses, type StockMovementRow, type WarehouseItem } from "@/lib/actions/warehouses";
import { formatMoney } from "@/lib/money";
import { unwrap } from "@/lib/action-result";
import { useBusinessLine } from "@/components/layout/BusinessLineProvider";

const TYPES = [
  "",
  "STOCK_INITIAL",
  "ACHAT_RECEPTION",
  "VENTE_BL",
  "AVOIR_RETOUR",
  "AJUSTEMENT_INVENTAIRE",
  "TRANSFERT",
];

const TYPE_LABELS: Record<string, string> = {
  STOCK_INITIAL: "Stock initial",
  ACHAT_RECEPTION: "Réception achat",
  VENTE_BL: "Vente BL",
  AVOIR_RETOUR: "Retour avoir",
  AJUSTEMENT_INVENTAIRE: "Ajustement inventaire",
  TRANSFERT: "Transfert",
};

export default function StockMovementsPage() {
  const { activeCode } = useBusinessLine();
  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [warehousesList, setWarehousesList] = useState<WarehouseItem[]>([]);
  const [type, setType] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    getWarehouses().then((r) => setWarehousesList(unwrap(r))).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      startTransition(async () => {
        setRows(
          unwrap(
            await getStockMovements({
              movementType: type || undefined,
              warehouseId: warehouseId ? Number(warehouseId) : undefined,
              search: search || undefined,
            })
          )
        );
      });
    }, 200);
    return () => clearTimeout(t);
  }, [type, warehouseId, search, activeCode]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 md:p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/stock" className="text-xs font-semibold text-[#6B7280] hover:text-[#111827] flex items-center gap-1">
              <ChevronLeft size={14} /> Stock
            </Link>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] mt-1 tracking-tight flex items-center gap-2">
            <ArrowRightLeft size={20} className="text-[#F7162D]" />
            Mouvements de stock
          </h1>
          <p className="text-sm text-[#4B5563] mt-0.5">Journal global entrées / sorties — {rows.length} derniers mouvements</p>
        </div>
        <button
          onClick={() => window.print()}
          className="hidden sm:flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl text-xs font-bold text-[#374151] shadow-xs print:hidden"
        >
          Imprimer
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs flex flex-col sm:flex-row gap-2 print:hidden">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (SKU, désignation)…"
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#F7162D] font-medium"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="px-3 py-2.5 text-xs font-semibold bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#F7162D]"
          aria-label="Nature de mouvement"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>{t ? TYPE_LABELS[t] ?? t : "Tous mouvements"}</option>
          ))}
        </select>
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="px-3 py-2.5 text-xs font-semibold bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#F7162D]"
          aria-label="Entrepôt"
        >
          <option value="">Tous entrepôts</option>
          {warehousesList.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Nature</th>
                <th className="py-3.5 px-4">Produit</th>
                <th className="py-3.5 px-4 text-right">Qté</th>
                <th className="py-3.5 px-4 text-right">Coût unit.</th>
                <th className="py-3.5 px-4">Entrepôt</th>
                <th className="py-3.5 px-4">Document / Motif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] text-xs">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-[#6B7280]">Aucun mouvement trouvé.</td></tr>
              )}
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-[#F8F9FA]">
                  <td className="py-2.5 px-4 whitespace-nowrap text-[#6B7280]">
                    {new Date(m.createdAt).toLocaleDateString("fr-FR")}{" "}
                    <span className="text-[10px]">{new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-semibold text-[#374151]">{TYPE_LABELS[m.movementType] ?? m.movementType}</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-mono text-[10px] text-[#9CA3AF]">{m.sku}</div>
                    <div className="font-semibold text-[#111827]">{m.productName}</div>
                  </td>
                  <td className={`py-2.5 px-4 text-right font-mono font-bold ${m.quantity < 0 ? "text-[#F7162D]" : "text-[#059669]"}`}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="py-2.5 px-4 text-right text-[#6B7280]">
                    {m.unitCostCents != null ? formatMoney(m.unitCostCents) : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-[#6B7280]">{m.warehouseName ?? "Principal"}</td>
                  <td className="py-2.5 px-4 text-[#6B7280]">
                    {m.sourceDocumentType && m.sourceDocumentId ? `${m.sourceDocumentType} #${m.sourceDocumentId}` : ""}
                    {m.reason ? <div className="text-[10px]">{m.reason}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
