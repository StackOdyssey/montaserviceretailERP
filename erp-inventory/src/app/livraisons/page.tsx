"use client";

import { useEffect, useMemo, useState } from "react";
import { Truck, Printer, RefreshCw } from "lucide-react";
import { getDeliveryRouteSheet, updatePrepStatus, type RouteSheetDoc } from "@/lib/actions/sales-documents";
import { PREP_STATUS_LABELS, PREP_TRANSITIONS } from "@/lib/prep";
import { unwrap } from "@/lib/action-result";
import { useToast } from "@/components/ui/ToastProvider";
import { formatMoney } from "@/lib/money";

/** Feuille de route (legacy feuilleRoute) : documents préparés groupés par livreur + date. */
export default function LivraisonsPage() {
  const toast = useToast();
  const today = new Date().toISOString().split("T")[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [docs, setDocs] = useState<RouteSheetDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setDocs(unwrap(await getDeliveryRouteSheet(from, to)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byLivreur = useMemo(() => {
    const groups = new Map<string, RouteSheetDoc[]>();
    for (const doc of docs) {
      const key = doc.livreurName || "Sans livreur assigné";
      const arr = groups.get(key) ?? [];
      arr.push(doc);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [docs]);

  const setStatus = async (doc: RouteSheetDoc, status: string) => {
    setBusyId(doc.id);
    try {
      unwrap(await updatePrepStatus(doc.id, status as "PREPARE" | "LIVRE" | "NON_LIVRE"));
      toast.success(`${doc.docNumber} → ${PREP_STATUS_LABELS[status] ?? status}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (s: string) => (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
      s === "LIVRE" ? "bg-emerald-100 text-emerald-800"
      : s === "NON_LIVRE" ? "bg-red-100 text-red-800"
      : s === "PREPARE" ? "bg-blue-100 text-blue-800"
      : "bg-amber-100 text-amber-800"}`}>
      {PREP_STATUS_LABELS[s] ?? s}
    </span>
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#111827] flex items-center gap-2">
            <Truck className="text-[#F7162D]" /> Feuille de route
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Livraisons par chauffeur — statuts livré / non livré</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl" title="Actualiser">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => window.print()} className="px-4 py-2.5 bg-[#111827] text-white text-xs font-bold rounded-xl flex items-center gap-2">
            <Printer size={14} /> Imprimer
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Du</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Au</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
        </div>
        <button onClick={load} className="px-4 py-2 bg-[#F7162D] hover:bg-[#D90E23] text-white text-xs font-bold rounded-xl transition">
          Afficher
        </button>
        <span className="text-xs text-gray-400 ml-auto">{docs.length} document(s)</span>
      </div>

      {loading && <p className="text-center text-xs text-gray-400 py-8">Chargement…</p>}

      {!loading && byLivreur.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          Aucune livraison sur la période — créez des bons de préparation depuis /ventes.
        </div>
      )}

      {byLivreur.map(([livreur, livreurDocs]) => (
        <div key={livreur} className="bg-white rounded-2xl border border-gray-100 overflow-hidden break-inside-avoid print:mb-6">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-[#111827] flex items-center gap-2">
              <Truck size={15} className="text-[#F7162D]" /> {livreur}
              <span className="text-[10px] font-normal text-gray-400">({livreurDocs.length} livraison(s))</span>
            </h2>
            <span className="text-xs font-bold text-gray-600">
              {formatMoney(livreurDocs.reduce((s, d) => s + d.totalTtcCents, 0))} TTC
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase font-bold text-gray-400 border-b border-gray-50">
                <th className="py-2.5 px-4">Document</th>
                <th className="py-2.5 px-4">Client</th>
                <th className="py-2.5 px-4">Ville</th>
                <th className="py-2.5 px-4 text-right">Montant</th>
                <th className="py-2.5 px-4">Commercial</th>
                <th className="py-2.5 px-4 text-center">Statut</th>
                <th className="py-2.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {livreurDocs.map((d) => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-mono font-bold text-[#F7162D]">{d.docNumber}</td>
                  <td className="py-2.5 px-4 font-semibold">{d.customerName}
                    {d.customerPhone && <div className="text-[10px] text-gray-400">{d.customerPhone}</div>}
                  </td>
                  <td className="py-2.5 px-4 text-gray-500">{d.customerCity || "—"}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold">{formatMoney(d.totalTtcCents)}</td>
                  <td className="py-2.5 px-4 text-gray-500">{d.commercialName || "—"}</td>
                  <td className="py-2.5 px-4 text-center">{statusBadge(d.prepStatus)}</td>
                  <td className="py-2.5 px-4 text-center">
                    {busyId === d.id ? (
                      <span className="text-[10px] text-gray-400">…</span>
                    ) : (PREP_TRANSITIONS[d.prepStatus] ?? []).length > 0 ? (
                      <select
                        value=""
                        onChange={(e) => e.target.value && setStatus(d, e.target.value)}
                        className="px-2 py-1 text-[10px] font-bold border border-gray-200 rounded-lg bg-white outline-none focus:border-[#F7162D]"
                      >
                        <option value="">Changer…</option>
                        {(PREP_TRANSITIONS[d.prepStatus] ?? []).map((s) => (
                          <option key={s} value={s}>{PREP_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[10px] text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
