"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRightLeft, ChevronDown, ChevronLeft } from "lucide-react";
import { getStockTransfers, getWarehouses, type StockTransferItem, type WarehouseItem } from "@/lib/actions/warehouses";
import { unwrap } from "@/lib/action-result";

export default function StockTransfersPage() {
  const [transfers, setTransfers] = useState<StockTransferItem[]>([]);
  const [warehousesList, setWarehousesList] = useState<WarehouseItem[]>([]);
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setTransfers(unwrap(await getStockTransfers()));
      setWarehousesList(unwrap(await getWarehouses()));
    });
  }, []);

  const filtered = transfers.filter(
    (t) =>
      (!fromFilter || t.fromWarehouseName === fromFilter) &&
      (!toFilter || t.toWarehouseName === toFilter)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 md:p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <Link href="/stock" className="text-xs font-semibold text-[#6B7280] hover:text-[#111827] flex items-center gap-1">
            <ChevronLeft size={14} /> Stock
          </Link>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] mt-1 tracking-tight flex items-center gap-2">
            <ArrowRightLeft size={20} className="text-[#7C3AED]" />
            Historique des transferts
          </h1>
          <p className="text-sm text-[#4B5563] mt-0.5">{filtered.length} transfert(s) entre entrepôts</p>
        </div>
        <button
          onClick={() => window.print()}
          className="hidden sm:flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl text-xs font-bold text-[#374151] shadow-xs print:hidden"
        >
          Imprimer
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs flex flex-col sm:flex-row gap-2 print:hidden">
        <select
          value={fromFilter}
          onChange={(e) => setFromFilter(e.target.value)}
          className="flex-1 px-3 py-2.5 text-xs font-semibold bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#7C3AED]"
          aria-label="Entrepôt source"
        >
          <option value="">Toutes sources</option>
          {warehousesList.map((w) => (
            <option key={w.id} value={w.name}>{w.name}</option>
          ))}
        </select>
        <select
          value={toFilter}
          onChange={(e) => setToFilter(e.target.value)}
          className="flex-1 px-3 py-2.5 text-xs font-semibold bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#7C3AED]"
          aria-label="Entrepôt destination"
        >
          <option value="">Toutes destinations</option>
          {warehousesList.map((w) => (
            <option key={w.id} value={w.name}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#6B7280]">Aucun transfert enregistré.</div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {filtered.map((t) => (
              <div key={t.id}>
                <button
                  onClick={() => setOpenId(openId === t.id ? null : t.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#F8F9FA] text-left transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-bold text-[#111827]">{t.transferNumber}</span>
                    <span className="text-xs text-[#6B7280] truncate">
                      {t.fromWarehouseName} → {t.toWarehouseName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-[#6B7280]">{new Date(t.createdAt).toLocaleDateString("fr-FR")}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      t.status === "VALIDE" ? "bg-[#ECFDF5] text-[#059669]" : "bg-[#FEF2F2] text-[#F7162D]"
                    }`}>
                      {t.status === "VALIDE" ? "Validé" : t.status}
                    </span>
                    <ChevronDown size={14} className={`text-[#9CA3AF] transition-transform ${openId === t.id ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {openId === t.id && (
                  <div className="px-4 pb-4 pt-1 bg-[#F8F9FA] border-t border-[#E5E7EB]">
                    {t.notes && <p className="text-[11px] text-[#6B7280] mb-2">Note : {t.notes}</p>}
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-[#E5E7EB]">
                        {t.lines.map((l) => (
                          <tr key={l.productId}>
                            <td className="py-1.5 font-mono text-[10px] text-[#9CA3AF] w-20">{l.sku}</td>
                            <td className="py-1.5 font-medium text-[#111827]">{l.productName}</td>
                            <td className="py-1.5 text-right font-bold text-[#374151] w-16">×{l.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
