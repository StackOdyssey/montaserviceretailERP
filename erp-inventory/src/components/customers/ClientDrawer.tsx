"use client";

import { useEffect, useState } from "react";
import { X, Phone, MapPin, FileText, User, HandCoins, Printer, Pencil, CalendarClock } from "lucide-react";
import { CustomerAccountStatement, getCustomerStatement } from "@/lib/actions/customers";
import { formatMoney } from "@/lib/money";
import { paymentStatusLabel, isTerminalStatus, paymentMethodLabel } from "@/lib/payments";

interface ClientDrawerProps {
  customerId: number | null;
  refreshKey?: number;
  onClose: () => void;
  onEncaisser: (customerId: number) => void;
  onEdit: (statement: CustomerAccountStatement) => void;
  onPrintStatement: (customerId: number) => void;
}

const RISK_LABELS: Record<string, { label: string; cls: string }> = {
  ROI: { label: "Client roi", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  DOUTEUX: { label: "Douteux", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  LITIGIEUX: { label: "Litigieux", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  ARNAQUEUR: { label: "Arnaqueur", cls: "bg-red-50 text-red-700 border-red-200" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  DEVIS: "Devis",
  BC: "Bon de commande",
  BL: "BL",
  FACTURE: "Facture",
  AVOIR: "Avoir",
};

export function ClientDrawer({ customerId, refreshKey = 0, onClose, onEncaisser, onEdit, onPrintStatement }: ClientDrawerProps) {
  const [statement, setStatement] = useState<CustomerAccountStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"DOCS" | "PAYMENTS" | "LEDGER">("DOCS");

  const [prevCustomerId, setPrevCustomerId] = useState(customerId);
  if (customerId !== prevCustomerId) {
    setPrevCustomerId(customerId);
    setTab("DOCS");
    setStatement(null);
    if (customerId) setLoading(true);
  }
  const [prevRefreshKey, setPrevRefreshKey] = useState(refreshKey);
  if (refreshKey !== prevRefreshKey) {
    setPrevRefreshKey(refreshKey);
    if (customerId) setLoading(true);
  }

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    getCustomerStatement(customerId)
      .then((s) => { if (active) setStatement(s); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customerId, refreshKey]);

  if (!customerId) return null;

  const c = statement?.customer;
  const risk = c?.riskClass && c.riskClass !== "NORMAL" ? RISK_LABELS[c.riskClass] : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-xs" onClick={onClose}>
      <div
        className="w-full sm:max-w-xl h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 truncate">{c?.name ?? "…"}</h2>
              {c?.isProfessional && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">PRO</span>
              )}
              {c?.isWholesale && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">GROSSISTE</span>
              )}
              {risk && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${risk.cls}`}>{risk.label}</span>
              )}
            </div>
            <div className="mt-1.5 space-y-0.5 text-xs text-gray-500">
              {c?.phone && (
                <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{c.phone}</div>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <MapPin className="w-3.5 h-3.5" />{c?.city}{c?.address ? ` — ${c.address}` : ""}
                {c?.ice && <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" />ICE {c.ice}</span>}
              </div>
              {(c?.assignedStaffName || c?.paymentTermDays != null) && (
                <div className="flex items-center gap-3 flex-wrap">
                  {c?.assignedStaffName && (
                    <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{c.assignedStaffName}</span>
                  )}
                  {c?.paymentTermDays != null && (
                    <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />Échéance {c.paymentTermDays} j</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 bg-white">
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-semibold text-gray-400 uppercase">Facturé</div>
            <div className="text-sm font-bold text-gray-900">{statement ? formatMoney(statement.totalBilledTtcCents) : "—"}</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-semibold text-gray-400 uppercase">Réglé</div>
            <div className="text-sm font-bold text-emerald-700">{statement ? formatMoney(statement.totalPaidCents) : "—"}</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-semibold text-gray-400 uppercase">Solde dû</div>
            <div className={`text-sm font-bold ${statement && statement.balanceDueCents > 0 ? "text-[#F7162D]" : "text-gray-900"}`}>
              {statement ? formatMoney(statement.balanceDueCents) : "—"}
            </div>
          </div>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-gray-100 bg-white px-4 gap-1">
          {(
            [
              ["DOCS", `Documents (${statement?.documents.length ?? 0})`],
              ["PAYMENTS", `Règlements (${statement?.payments.length ?? 0})`],
              ["LEDGER", "Relevé"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-2.5 text-xs font-bold border-b-2 transition ${
                tab === id ? "border-[#F7162D] text-[#F7162D]" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-center text-sm text-gray-400 py-10">Chargement…</div>}
          {!loading && statement && tab === "DOCS" && (
            <ul className="space-y-2">
              {statement.documents.length === 0 && <li className="text-sm text-gray-400 text-center py-8">Aucun document.</li>}
              {statement.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {doc.docNumber} <span className="text-[10px] font-normal text-gray-400">{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {new Date(doc.docDate).toLocaleDateString("fr-FR")} · {doc.status}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-gray-900">{formatMoney(doc.totalTtcCents)}</div>
                    {doc.remainingDueCents > 0 && (
                      <div className="text-[11px] font-semibold text-[#F7162D]">reste {formatMoney(doc.remainingDueCents)}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && statement && tab === "PAYMENTS" && (
            <ul className="space-y-2">
              {statement.payments.length === 0 && <li className="text-sm text-gray-400 text-center py-8">Aucun règlement.</li>}
              {statement.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {paymentMethodLabel(p.paymentMethod)}{p.referenceNumber ? ` · ${p.referenceNumber}` : ""}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {new Date(p.paymentDate).toLocaleDateString("fr-FR")}
                      {p.documentNumber ? ` · ${p.documentNumber}` : ""} · {paymentStatusLabel(p.status)}
                    </div>
                  </div>
                  <div className={`text-sm font-bold shrink-0 ${isTerminalStatus(p.status) ? "text-gray-900" : "text-amber-600"}`}>
                    {formatMoney(p.amountCents)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && statement && tab === "LEDGER" && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 font-semibold">Libellé</th>
                  <th className="py-2 font-semibold text-right">Débit</th>
                  <th className="py-2 font-semibold text-right">Crédit</th>
                  <th className="py-2 font-semibold text-right">Solde</th>
                </tr>
              </thead>
              <tbody>
                {statement.ledger.map((e, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 text-gray-500 whitespace-nowrap">{new Date(e.date).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2 text-gray-700 truncate max-w-[140px]">{e.label}</td>
                    <td className="py-2 text-right">{e.debitCents ? formatMoney(e.debitCents) : ""}</td>
                    <td className="py-2 text-right text-emerald-700">{e.creditCents ? formatMoney(e.creditCents) : ""}</td>
                    <td className="py-2 text-right font-semibold">{formatMoney(e.balanceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-100 bg-white flex gap-2">
          <button
            onClick={() => onEncaisser(customerId)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-[#F7162D] hover:bg-[#d81023] rounded-xl transition"
          >
            <HandCoins className="w-4 h-4" /> Encaisser
          </button>
          <button
            onClick={() => onPrintStatement(customerId)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
          >
            <Printer className="w-4 h-4" /> Relevé A4
          </button>
          <button
            onClick={() => statement && onEdit(statement)}
            disabled={!statement}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition disabled:opacity-50"
          >
            <Pencil className="w-4 h-4" /> Modifier
          </button>
        </div>
      </div>
    </div>
  );
}
