"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollText, Search, RefreshCw, LogIn, LogOut, Printer } from "lucide-react";
import {
  getOperationsLog,
  getOperationsLogActions,
  type OperationsLogEntry,
} from "@/lib/actions/operations-log";

const TIME_ZONE = "Africa/Casablanca";

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("fr-FR", {
    timeZone: TIME_ZONE,
  });
  const key = dayKey(iso);
  const long = d.toLocaleDateString("fr-FR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (key === today) return `Aujourd'hui — ${long}`;
  if (key === yesterday) return `Hier — ${long}`;
  return long.charAt(0).toUpperCase() + long.slice(1);
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badgeColor(action: string): string {
  if (action === "CONNEXION" || action === "DECONNEXION")
    return "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300";
  if (action.startsWith("ANNULATION") || action.startsWith("SUPPRESSION") || action === "INVENTAIRE_ANNULE")
    return "bg-red-100 text-[#F7162D] dark:bg-red-950/50 dark:text-red-300";
  if (
    action.startsWith("VALIDATION") ||
    action.startsWith("REGLEMENT") ||
    action.startsWith("RECEPTION") ||
    action.startsWith("ENCAISSEMENT") ||
    action.startsWith("DEPENSE")
  )
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (action.startsWith("CREATION") || action.startsWith("FUSION") || action.startsWith("CONVERSION") || action.startsWith("AVOIR"))
    return "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300";
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

export default function OperationsLogPage() {
  const [entries, setEntries] = useState<OperationsLogEntry[]>([]);
  const [actions, setActions] = useState<Array<{ action: string; label: string; count: number }>>([]);
  const [actionFilter, setActionFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, acts] = await Promise.all([
        getOperationsLog({
          action: actionFilter,
          search: appliedSearch || undefined,
          limit: 300,
        }),
        getOperationsLogActions(),
      ]);
      setEntries(rows);
      setActions(acts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, appliedSearch]);

  // Chargement initial depuis le serveur (synchronisation externe).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Regroupement par journée (début/fin de fil = bandeau rouge).
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; items: OperationsLogEntry[] }> = [];
    for (const e of entries) {
      const key = dayKey(e.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.items.push(e);
      } else {
        out.push({ key, label: dayLabel(e.createdAt), items: [e] });
      }
    }
    return out;
  }, [entries]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-7 h-7 text-[#F7162D]" />
            Journal des Opérations
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Historique de tout ce qui se passe dans le compte : connexions, créations,
            suppressions, ventes, annulations, règlements. Chaque journée est encadrée
            en rouge, de la première à la dernière opération.
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl transition flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
        <button
          onClick={() => window.print()}
          className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl transition flex items-center gap-2 print:hidden"
        >
          <Printer className="w-4 h-4" />
          Imprimer
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAppliedSearch(search)}
            placeholder="Rechercher (N° document, nom, montant…)"
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D] shadow-xs"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
        >
          <option value="ALL">Toutes les opérations</option>
          {actions.map((a) => (
            <option key={a.action} value={a.action}>
              {a.label} ({a.count})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-2xl text-sm border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-sm text-gray-500 py-10">Chargement du journal…</div>
      ) : groups.length === 0 ? (
        <div className="text-center text-sm text-gray-500 py-10">
          Aucune opération enregistrée pour ces critères.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              {/* Marqueur de journée : début de fil */}
              <div className="bg-[#F7162D] text-white rounded-2xl px-4 py-2.5 flex items-center justify-between shadow-md">
                <span className="font-black text-sm tracking-tight">{g.label}</span>
                <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-xl">
                  {g.items.length} opération{g.items.length > 1 ? "s" : ""}
                </span>
              </div>

              <ol className="mt-2 divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                {g.items.map((e) => (
                  <li key={e.id} className="px-4 py-3 flex items-start gap-3">
                    <span className="font-mono font-bold text-xs text-gray-500 dark:text-gray-400 w-12 shrink-0 pt-0.5">
                      {timeLabel(e.createdAt)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.action === "CONNEXION" ? (
                          <LogIn className="w-3.5 h-3.5 text-violet-600" />
                        ) : e.action === "DECONNEXION" ? (
                          <LogOut className="w-3.5 h-3.5 text-violet-600" />
                        ) : null}
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${badgeColor(e.action)}`}
                        >
                          {e.label}
                        </span>
                        <span className="text-[11px] text-gray-400 font-mono">#{e.id}</span>
                      </div>
                      {e.details && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 break-words">
                          {e.details}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {/* Marqueur de journée : fin de fil */}
              <div className="mt-1 border-t-2 border-[#F7162D]/60 rounded-b-2xl" />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
