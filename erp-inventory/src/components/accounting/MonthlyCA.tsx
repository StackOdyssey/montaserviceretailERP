"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Users, Trophy } from "lucide-react";
import { getMonthlyRevenue, type MonthlyRevenueData } from "@/lib/actions/accounting";
import { formatMoney } from "@/lib/money";
import { unwrap } from "@/lib/action-result";

const MOIS = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

/** G15 — Chiffre d'affaires mensuel : 12 derniers mois vs N-1, par commercial, top clients. */
export function MonthlyCA() {
  const [data, setData] = useState<MonthlyRevenueData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMonthlyRevenue()
      .then((r) => setData(unwrap(r)))
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <div className="p-10 text-center text-xs text-red-500">{err}</div>;
  if (!data) return <div className="p-10 text-center text-xs text-gray-400">Chargement…</div>;

  const maxMonth = Math.max(...data.months.map((m) => Math.abs(m.totalTtcCents)), 1);
  const yearTotal = data.months.reduce((s, m) => s + m.totalTtcCents, 0);
  const priorTotal = data.months.reduce((s, m) => s + m.priorYearCents, 0);

  return (
    <div className="space-y-6">
      {/* Récap annuel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-[11px] font-bold text-gray-400 uppercase">CA 12 derniers mois</div>
          <div className="text-2xl font-black text-[#111827] mt-1">{formatMoney(yearTotal)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-[11px] font-bold text-gray-400 uppercase">Même période N-1</div>
          <div className="text-2xl font-black text-gray-400 mt-1">{formatMoney(priorTotal)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-[11px] font-bold text-gray-400 uppercase">Évolution</div>
          <div className={`text-2xl font-black mt-1 ${yearTotal >= priorTotal ? "text-[#059669]" : "text-[#F7162D]"}`}>
            {priorTotal > 0 ? `${yearTotal >= priorTotal ? "+" : ""}${Math.round(((yearTotal - priorTotal) / priorTotal) * 100)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Tableau mensuel */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp size={16} className="text-[#F7162D]" />
          <h3 className="text-sm font-bold text-gray-900">CA TTC par mois</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase font-bold text-gray-400 border-b border-gray-50">
              <th className="py-2.5 px-4">Mois</th>
              <th className="py-2.5 px-4 text-right">CA TTC</th>
              <th className="py-2.5 px-4 text-right">N-1</th>
              <th className="py-2.5 px-4 text-right">Δ</th>
              <th className="py-2.5 px-4 w-1/3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.months.map((m) => {
              const [y, mo] = m.ym.split("-").map(Number);
              const delta = m.priorYearCents > 0 ? Math.round(((m.totalTtcCents - m.priorYearCents) / m.priorYearCents) * 100) : null;
              return (
                <tr key={m.ym} className="hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-semibold text-[#111827]">{MOIS[mo]} {y}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold">{formatMoney(m.totalTtcCents)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-gray-400">{formatMoney(m.priorYearCents)}</td>
                  <td className={`py-2.5 px-4 text-right font-bold ${delta == null ? "text-gray-300" : delta >= 0 ? "text-[#059669]" : "text-[#F7162D]"}`}>
                    {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta}%`}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-[#F7162D] rounded-full" style={{ width: `${Math.min(100, (Math.abs(m.totalTtcCents) / maxMonth) * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Par commercial */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <Users size={16} className="text-[#4338CA]" />
            <h3 className="text-sm font-bold text-gray-900">CA par commercial (12 mois)</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.byCommercial.length === 0 && (
              <div className="p-6 text-center text-xs text-gray-400">Aucun commercial attribué sur la période.</div>
            )}
            {data.byCommercial.map((c) => (
              <div key={c.name} className="flex items-center justify-between px-5 py-3">
                <span className="text-xs font-semibold text-[#111827]">{c.name}</span>
                <span className="text-xs font-mono font-bold">{formatMoney(c.totalTtcCents)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top clients */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <Trophy size={16} className="text-[#D97706]" />
            <h3 className="text-sm font-bold text-gray-900">Top 10 clients (12 mois)</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.topClients.length === 0 && (
              <div className="p-6 text-center text-xs text-gray-400">Aucune vente sur la période.</div>
            )}
            {data.topClients.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between px-5 py-3">
                <span className="text-xs font-semibold text-[#111827]">
                  <span className="text-[10px] text-gray-400 mr-2">#{i + 1}</span>{c.name}
                </span>
                <span className="text-xs font-mono font-bold">{formatMoney(c.totalTtcCents)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
