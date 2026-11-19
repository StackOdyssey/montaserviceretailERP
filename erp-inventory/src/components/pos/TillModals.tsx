"use client";

import React, { useEffect, useState } from "react";
import { X, Lock, Coins, AlertTriangle, CheckCircle2, Printer, HandCoins, Users } from "lucide-react";
import { getCustomers, getCustomerAging, recordCustomerPayment } from "@/lib/actions/customers";
import {
  closeTillDay,
  getTillStats,
  openTillDay,
  recordTillExpense,
  type TillDayItem,
  type TillStats,
} from "@/lib/actions/till";
import { TILL_DECLARED_METHODS } from "@/lib/till-constants";
import { unwrap } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import { useParameters } from "@/components/layout/SettingsProvider";

const METHOD_LABELS: Record<string, string> = {
  ESPECES: "Espèces",
  CARTE_BANCAIRE: "Carte / TPE",
  CHEQUE: "Chèque",
  EFFET_LCN: "Effet / LCN",
  VIREMENT: "Virement",
  VERSEMENT: "Versement",
  BON_REDUCTION: "Bon réduction",
  AVOIR: "Avoir",
  A_CREDIT: "Crédit",
};

/** Coupures marocaines — 10 lignes (legacy #ModalFondCaisse, mais persisté). */
const DENOMINATIONS: Array<{ key: string; label: string; cents: number }> = [
  { key: "b200", label: "200 DH", cents: 20000 },
  { key: "b100", label: "100 DH", cents: 10000 },
  { key: "b50", label: "50 DH", cents: 5000 },
  { key: "b20", label: "20 DH", cents: 2000 },
  { key: "c10", label: "10 DH", cents: 1000 },
  { key: "c5", label: "5 DH", cents: 500 },
  { key: "c2", label: "2 DH", cents: 200 },
  { key: "c1", label: "1 DH", cents: 100 },
  { key: "c05", label: "0,50 DH", cents: 50 },
  { key: "c025", label: "0,25 DH", cents: 25 },
];

function centsFromDhInput(v: string): number {
  return Math.max(0, Math.round(parseFloat(v.replace(",", ".")) * 100) || 0);
}

// ---------------------------------------------------------------------------
// C1+C2 — Ouverture de journée (bloquant tant que la caisse n'est pas ouverte)
// ---------------------------------------------------------------------------
export function TillGateModal({ businessLineCode, onOpened }: { businessLineCode: string; onOpened: (j: TillDayItem) => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [manual, setManual] = useState("");
  const [mode, setMode] = useState<"count" | "manual">("count");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counted = DENOMINATIONS.reduce((s, d) => s + (counts[d.key] ?? 0) * d.cents, 0);
  const floatCents = mode === "count" ? counted : centsFromDhInput(manual);

  const submit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      const denominations = mode === "count" ? Object.fromEntries(DENOMINATIONS.map((d) => [d.key, counts[d.key] ?? 0])) : undefined;
      const j = unwrap(await openTillDay({ businessLineCode, floatCents, denominations }));
      onOpened(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'ouverture");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Lock size={18} className="text-[#F7162D]" /> Ouverture de journée
          </h2>
          <div className="text-xs text-gray-500 mt-0.5">Comptez le fond de caisse pour démarrer les ventes.</div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          <div className="flex gap-1.5">
            {(["count", "manual"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${mode === m ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
              >
                {m === "count" ? "Comptage par coupure" : "Montant direct"}
              </button>
            ))}
          </div>
          {mode === "count" ? (
            <div className="space-y-1">
              {DENOMINATIONS.map((d) => (
                <div key={d.key} className="flex items-center gap-3">
                  <span className="w-16 text-xs font-mono font-bold text-gray-700">{d.label}</span>
                  <span className="text-gray-400">×</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={counts[d.key] || ""}
                    onChange={(e) => setCounts((p) => ({ ...p, [d.key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-center font-mono text-sm focus:border-[#F7162D] outline-none"
                    aria-label={`Nombre de ${d.label}`}
                  />
                  <span className="ml-auto text-xs font-mono text-gray-500">
                    {formatMoney((counts[d.key] ?? 0) * d.cents)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-gray-600">Fond de caisse (DH)</label>
              <input
                type="text"
                inputMode="decimal"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg font-mono text-lg text-center focus:border-[#F7162D] outline-none"
              />
            </div>
          )}
          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
        </div>
        <div className="p-4 border-t border-gray-200 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 font-semibold">Fond de caisse</span>
            <span className="font-mono font-bold text-lg">{formatMoney(floatCents)}</span>
          </div>
          <button
            onClick={() => void submit()}
            disabled={isSubmitting}
            className="w-full bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Coins size={18} />}
            Ouvrir la journée
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C4 — Dépense caisse
// ---------------------------------------------------------------------------
export function TillExpenseModal({ journeeId, onClose, onSaved }: { journeeId: number; onClose: () => void; onSaved?: () => void }) {
  const { expenseCategories } = useParameters();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(expenseCategories[0]?.id ?? null);
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      const cat = expenseCategories.find((c) => c.id === categoryId);
      unwrap(
        await recordTillExpense({
          journeeId,
          title,
          categoryId,
          category: cat?.name ?? "AUTRE",
          amountCents: centsFromDhInput(amount),
        })
      );
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la dépense");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Dépense caisse</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg" aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600">Motif</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Transport, café, timbres…"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-[#F7162D] outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Catégorie</label>
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#F7162D] outline-none"
            >
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Montant (DH)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-lg text-center focus:border-[#F7162D] outline-none"
            />
          </div>
          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
          <button
            onClick={() => void submit()}
            disabled={isSubmitting || !title.trim() || centsFromDhInput(amount) <= 0}
            className="w-full bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
          >
            {isSubmitting ? "Enregistrement…" : "Enregistrer la dépense"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C3 — Clôture de journée : théorique vs déclaré par mode + écart
// ---------------------------------------------------------------------------
export function CloseDayModal({ journee, businessLineCode, onClose, onClosed }: {
  journee: TillDayItem;
  businessLineCode: string;
  onClose: () => void;
  onClosed: (j: TillDayItem) => void;
}) {
  const [stats, setStats] = useState<TillStats | null>(null);
  const [declared, setDeclared] = useState<Record<string, string>>({});
  const [observation, setObservation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<TillDayItem | null>(null);

  useEffect(() => {
    let active = true;
    getTillStats(businessLineCode)
      .then((r) => { if (active) setStats(r.ok ? r.value : null); })
      .catch(() => {});
    return () => { active = false; };
  }, [businessLineCode]);

  const theoretical = (m: string) => {
    const s = stats?.byMethod.find((x) => x.method === m);
    return m === "ESPECES" ? stats?.cashDrawerCents ?? 0 : s?.totalCents ?? 0;
  };
  const varianceFor = (m: string) => centsFromDhInput(declared[m] ?? "") - theoretical(m);
  const totalVariance = TILL_DECLARED_METHODS.reduce((s, m) => s + varianceFor(m), 0);

  const submit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      const j = unwrap(
        await closeTillDay({
          journeeId: journee.id,
          declared: Object.fromEntries(TILL_DECLARED_METHODS.map((m) => [m, centsFromDhInput(declared[m] ?? "")])),
          observation: observation.trim() || undefined,
        })
      );
      setDone(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la clôture");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (done) {
    const theor = done.theoreticalTenders ?? {};
    const decl = done.declaredTenders ?? {};
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
        <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6 space-y-3">
          <div className="text-center">
            <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
            <div className="font-bold text-lg text-gray-900 mt-1">Journée clôturée</div>
            <div className="text-xs text-gray-500">Caisse #{done.id} — ouverte {new Date(done.openedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
          <div className="text-xs space-y-1">
            {Object.keys({ ...theor, ...decl }).map((m) => (
              <div key={m} className="flex justify-between border-b border-gray-100 py-1">
                <span>{METHOD_LABELS[m] ?? m}</span>
                <span className="font-mono">
                  {formatMoney(theor[m] ?? 0)} → <b>{formatMoney(decl[m] ?? 0)}</b>
                  <span className={decl[m] - theor[m] === 0 ? "text-emerald-600" : "text-red-600"}>
                    {" "}({(decl[m] ?? 0) - (theor[m] ?? 0) >= 0 ? "+" : ""}{formatMoney((decl[m] ?? 0) - (theor[m] ?? 0))})
                  </span>
                </span>
              </div>
            ))}
          </div>
          {done.observation && <div className="text-xs text-gray-500 italic">« {done.observation} »</div>}
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
              <Printer size={16} /> Imprimer
            </button>
            <button onClick={() => onClosed(done)} className="flex-1 py-2.5 bg-[#F7162D] hover:bg-[#D90E23] text-white rounded-xl font-bold text-sm">
              Terminer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-gray-900">Clôture de journée — caisse #{journee.id}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg" aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {stats === null ? (
            <div className="p-6 text-center text-sm text-gray-400">Chargement des totaux…</div>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-200">
                    <th className="text-left py-1.5">Mode</th>
                    <th className="text-right py-1.5">Théorique</th>
                    <th className="text-right py-1.5 w-28">Déclaré</th>
                    <th className="text-right py-1.5 w-20">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {TILL_DECLARED_METHODS.map((m) => {
                    const v = varianceFor(m);
                    return (
                      <tr key={m} className="border-b border-gray-100">
                        <td className="py-1.5 font-semibold">{METHOD_LABELS[m]}</td>
                        <td className="py-1.5 text-right font-mono">{formatMoney(theoretical(m))}</td>
                        <td className="py-1.5">
                          <input
                            value={declared[m] ?? ""}
                            onChange={(e) => setDeclared((p) => ({ ...p, [m]: e.target.value }))}
                            inputMode="decimal"
                            placeholder="0,00"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-right font-mono text-xs focus:border-[#F7162D] outline-none"
                            aria-label={`Déclaré ${METHOD_LABELS[m]}`}
                          />
                        </td>
                        <td className={`py-1.5 text-right font-mono font-bold ${v === 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {v > 0 ? "+" : ""}{formatMoney(v)}
                        </td>
                      </tr>
                    );
                  })}
                  {stats.byMethod.filter((s) => !(TILL_DECLARED_METHODS as readonly string[]).includes(s.method)).map((s) => (
                    <tr key={s.method} className="border-b border-gray-100 text-gray-500">
                      <td className="py-1.5">{METHOD_LABELS[s.method] ?? s.method}</td>
                      <td className="py-1.5 text-right font-mono">{formatMoney(s.totalCents)}</td>
                      <td className="py-1.5 text-center text-[10px]" colSpan={2}>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {stats.plafondCents != null && stats.cashDrawerCents > stats.plafondCents && (
                <div className="border border-red-200 bg-red-50 rounded-xl p-3 text-xs font-bold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Plafond de caisse dépassé — tiroir {formatMoney(stats.cashDrawerCents)} / plafond {formatMoney(stats.plafondCents)}. Versement conseillé.
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
                <div className="flex justify-between"><span>Fond de caisse</span><span className="font-mono">{formatMoney(journee.floatCents)}</span></div>
                <div className="flex justify-between"><span>CA net (hors retours)</span><span className="font-mono">{formatMoney(stats.salesNetCents)}</span></div>
                <div className="flex justify-between"><span>Dépenses caisse</span><span className="font-mono">-{formatMoney(stats.expensesCents)}</span></div>
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-gray-200">
                  <span>Écart total</span>
                  <span className={totalVariance === 0 ? "text-emerald-600" : "text-red-600"}>{totalVariance > 0 ? "+" : ""}{formatMoney(totalVariance)}</span>
                </div>
              </div>

              {stats.unpaidSales.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                  <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle size={13} /> Ventes non réglées ({stats.unpaidSales.length})
                  </div>
                  {stats.unpaidSales.map((u) => (
                    <div key={u.docNumber} className="flex justify-between text-[11px] text-amber-900">
                      <span className="font-mono">{u.docNumber} · {u.customerName}</span>
                      <span className="font-mono">reste {formatMoney(u.remainingCents)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600">Observation</label>
                <textarea
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  rows={2}
                  placeholder="Écart justifié, remarques…"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-[#F7162D] outline-none"
                />
              </div>
              {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
            </>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 shrink-0">
          <button
            onClick={() => void submit()}
            disabled={isSubmitting || stats === null}
            className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {isSubmitting ? "Clôture…" : `Clôturer la journée${totalVariance !== 0 ? ` (écart ${formatMoney(totalVariance)})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C8 — Stats live de la journée (panneau caisse)
// ---------------------------------------------------------------------------
export function TillStatsModal({ businessLineCode, onClose }: { businessLineCode: string; onClose: () => void }) {
  const [stats, setStats] = useState<TillStats | null>(null);

  useEffect(() => {
    let active = true;
    getTillStats(businessLineCode)
      .then((r) => { if (active) setStats(r.ok ? r.value : null); })
      .catch(() => {});
    return () => { active = false; };
  }, [businessLineCode]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-gray-900">Journée en cours</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg" aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {stats === null ? (
            <div className="p-6 text-center text-sm text-gray-400">Chargement…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">CA net</div>
                  <div className="font-mono font-bold text-lg text-emerald-800">{formatMoney(stats.salesNetCents)}</div>
                  <div className="text-[10px] text-emerald-600">{stats.ticketCount} ticket(s)</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-blue-700 uppercase">Espèces en tiroir</div>
                  <div className="font-mono font-bold text-lg text-blue-800">{formatMoney(stats.cashDrawerCents)}</div>
                  <div className="text-[10px] text-blue-600">fond {formatMoney(stats.journee.floatCents)}</div>
                </div>
              </div>
              {stats.plafondCents != null && stats.cashDrawerCents > stats.plafondCents && (
                <div className="border border-red-200 bg-red-50 rounded-xl p-3 text-xs font-bold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Plafond de caisse dépassé — tiroir {formatMoney(stats.cashDrawerCents)} / plafond {formatMoney(stats.plafondCents)}. Versement conseillé.
                </div>
              )}
              <div className="text-xs space-y-1">
                <div className="font-bold text-gray-700">Encaissé par mode</div>
                {stats.byMethod.length === 0 && <div className="text-gray-400">Aucun encaissement.</div>}
                {stats.byMethod.map((m) => (
                  <div key={m.method} className="flex justify-between">
                    <span>{METHOD_LABELS[m.method] ?? m.method}{m.settlementsCents > 0 && <span className="text-[10px] text-gray-400"> (dont règlt {formatMoney(m.settlementsCents)})</span>}</span>
                    <span className="font-mono">{formatMoney(m.totalCents)}</span>
                  </div>
                ))}
              </div>
              {(stats.returnsCents > 0 || stats.expenseRows.length > 0) && (
                <div className="text-xs space-y-1 border-t border-gray-100 pt-2">
                  {stats.returnsCents > 0 && (
                    <div className="flex justify-between text-amber-700"><span>Retours (avoirs)</span><span className="font-mono">-{formatMoney(stats.returnsCents)}</span></div>
                  )}
                  {stats.expenseRows.map((e) => (
                    <div key={e.id} className="flex justify-between text-red-600"><span className="truncate mr-2">Dépense : {e.title}</span><span className="font-mono">-{formatMoney(e.amountCents)}</span></div>
                  ))}
                </div>
              )}
              {stats.unpaidSales.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                  <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle size={13} /> Ventes non réglées ({stats.unpaidSales.length})
                  </div>
                  {stats.unpaidSales.map((u) => (
                    <div key={u.docNumber} className="flex justify-between text-[11px] text-amber-900">
                      <span className="font-mono">{u.docNumber} · {u.customerName}</span>
                      <span className="font-mono">{formatMoney(u.remainingCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C5 — Règlement de créance client au comptoir (ventilation FIFO auto serveur)
// ---------------------------------------------------------------------------
const SETTLE_METHODS = ["ESPECES", "CHEQUE", "EFFET_LCN", "VIREMENT", "CARTE_BANCAIRE", "VERSEMENT"] as const;

export function TillSettlementModal({ onClose, onSettled }: { onClose: () => void; onSettled?: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; phone: string | null }>>([]);
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof SETTLE_METHODS)[number]>("ESPECES");
  const [reference, setReference] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      getCustomers(query || undefined, {})
        .then((rows) => {
          const list = Array.isArray(rows) ? rows : [];
          setResults(list.slice(0, 8).map((c) => ({ id: c.id, name: c.name, phone: c.phone })));
        })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const submit = async () => {
    if (!selected) return;
    try {
      setIsSubmitting(true);
      setError(null);
      unwrap(
        await recordCustomerPayment({
          customerId: selected.id,
          amountCents: centsFromDhInput(amount),
          paymentMethod: method,
          referenceNumber: reference.trim() || undefined,
          chequeDueDate: dueDate || undefined,
          notes: "Règlement comptoir (POS)",
        })
      );
      setDone(`Règlement de ${formatMoney(centsFromDhInput(amount))} enregistré pour ${selected.name} — ventilé sur ses documents impayés.`);
      onSettled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du règlement");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><HandCoins size={17} /> Règlement client</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg" aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          {done ? (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{done}</div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-600">Client</label>
                {selected ? (
                  <div className="mt-1 flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-sm font-semibold">{selected.name}</span>
                    <button onClick={() => setSelected(null)} className="text-[10px] text-gray-400 hover:text-red-600">changer</button>
                  </div>
                ) : (
                  <>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Rechercher un client…"
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-[#F7162D] outline-none"
                    />
                    <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                      {results.map((c) => (
                        <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100">
                          {c.name} <span className="text-[10px] text-gray-400">{c.phone}</span>
                        </button>
                      ))}
                      {results.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">Aucun client.</div>}
                    </div>
                  </>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Montant (DH)</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-lg text-center focus:border-[#F7162D] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Mode</label>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {SETTLE_METHODS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`py-1.5 rounded-lg text-[11px] font-bold ${method === m ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
                    >
                      {METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
              {(method === "CHEQUE" || method === "EFFET_LCN" || method === "VIREMENT" || method === "CARTE_BANCAIRE") && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={method === "CHEQUE" ? "N° chèque" : "Référence"}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:border-[#F7162D] outline-none"
                  />
                  {(method === "CHEQUE" || method === "EFFET_LCN") && (
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-xs focus:border-[#F7162D] outline-none"
                      aria-label="Échéance"
                    />
                  )}
                </div>
              )}
              {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
              <button
                onClick={() => void submit()}
                disabled={isSubmitting || !selected || centsFromDhInput(amount) <= 0}
                className="w-full bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
              >
                {isSubmitting ? "Enregistrement…" : "Enregistrer le règlement"}
              </button>
            </>
          )}
          {done && (
            <button onClick={onClose} className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-sm">Fermer</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C6 — Situation clients (encours par ancienneté)
// ---------------------------------------------------------------------------
export function TillSituationModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getCustomerAging>> | null>(null);

  useEffect(() => {
    let active = true;
    getCustomerAging()
      .then((r) => { if (active) setRows(r); })
      .catch(() => { if (active) setRows({ rows: [], totals: { notDue: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0 } }); });
    return () => { active = false; };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Users size={17} /> Situation clients</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg" aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {rows === null ? (
            <div className="p-6 text-center text-sm text-gray-400">Chargement…</div>
          ) : rows.rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">Aucun encours client.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Client</th>
                  <th className="text-right px-2 py-2">Docs</th>
                  <th className="text-right px-2 py-2">0-30j</th>
                  <th className="text-right px-2 py-2">31-60</th>
                  <th className="text-right px-2 py-2">60+</th>
                  <th className="text-right px-3 py-2">Total dû</th>
                </tr>
              </thead>
              <tbody>
                {rows.rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-semibold max-w-36 truncate">{r.name}</td>
                    <td className="px-2 py-2 text-right font-mono text-gray-500">{r.documentsCount}</td>
                    <td className="px-2 py-2 text-right font-mono">{r.buckets.b0_30 ? formatMoney(r.buckets.b0_30) : "—"}</td>
                    <td className="px-2 py-2 text-right font-mono">{r.buckets.b31_60 ? formatMoney(r.buckets.b31_60) : "—"}</td>
                    <td className="px-2 py-2 text-right font-mono text-red-600">{r.buckets.b61_90 + r.buckets.b90_plus ? formatMoney(r.buckets.b61_90 + r.buckets.b90_plus) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{formatMoney(r.buckets.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {rows && rows.rows.length > 0 && (
          <div className="p-3 border-t border-gray-200 flex justify-between text-xs shrink-0">
            <span className="text-gray-500">Encours total</span>
            <span className="font-mono font-bold">{formatMoney(rows.totals.total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
