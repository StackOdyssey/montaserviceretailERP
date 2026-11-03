"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Plus,
  Search,
  Phone,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { CustomerItem, getCustomers, getCustomerAging, type CustomerAccountStatement } from "@/lib/actions/customers";
import { getStaff, type StaffItem } from "@/lib/actions/staff";
import { formatMoney } from "@/lib/money";
import { unwrap } from "@/lib/action-result";
import { ClientDrawer } from "@/components/customers/ClientDrawer";
import { CustomerModal } from "@/components/customers/CustomerModal";
import { PaymentModal } from "@/components/customers/PaymentModal";
import { CustomerStatementModal } from "@/components/customers/CustomerStatementModal";
import { ClientImportModal } from "@/components/customers/ClientImportModal";

const PAGE_SIZE = 25;

type CustomerRow = CustomerItem & {
  totalBilledTtcCents: number;
  totalPaidCents: number;
  balanceDueCents: number;
  unpaidDocumentsCount: number;
};

const RISK_BADGES: Record<string, { label: string; cls: string }> = {
  ROI: { label: "Roi", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  DOUTEUX: { label: "Douteux", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  LITIGIEUX: { label: "Litigieux", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  ARNAQUEUR: { label: "Arnaqueur", cls: "bg-red-50 text-red-700 border-red-200" },
};

export default function ClientsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [staffFilter, setStaffFilter] = useState<number | "ALL">("ALL");
  const [withDebtOnly, setWithDebtOnly] = useState(false);
  const [customersList, setCustomersList] = useState<CustomerRow[]>([]);
  const [oldestDueDays, setOldestDueDays] = useState<Map<number, number>>(new Map());
  const [commercials, setCommercials] = useState<StaffItem[]>([]);
  const [, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [drawerCustomerId, setDrawerCustomerId] = useState<number | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [preselectedCustomerId, setPreselectedCustomerId] = useState<number | undefined>(undefined);
  const [statementCustomerId, setStatementCustomerId] = useState<number | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [drawerRefresh, setDrawerRefresh] = useState(0);

  const loadData = async () => {
    setLoading(true);
    try {
      const [data, aging] = await Promise.all([
        getCustomers(searchQuery, staffFilter === "ALL" ? undefined : { staffId: staffFilter }),
        getCustomerAging().catch(() => null),
      ]);
      setCustomersList(data as CustomerRow[]);
      if (aging) {
        setOldestDueDays(
          new Map(
            aging.rows.map((r) => [
              r.id,
              r.oldest ? Math.floor((Date.now() - new Date(r.oldest).getTime()) / 86400000) : 0,
            ])
          )
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, staffFilter]);

  useEffect(() => {
    getStaff("COMMERCIAL")
      .then((res) => setCommercials(unwrap(res)))
      .catch(() => setCommercials([]));
  }, []);

  const filtered = useMemo(
    () => (withDebtOnly ? customersList.filter((c) => c.balanceDueCents > 0) : customersList),
    [customersList, withDebtOnly]
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const totalDu = customersList.reduce((s, c) => s + Math.max(0, c.balanceDueCents), 0);
  const clientsAvecImpayes = customersList.filter((c) => c.unpaidDocumentsCount > 0).length;

  const handleEncaisser = (customerId: number) => {
    setPreselectedCustomerId(customerId);
    setIsPaymentModalOpen(true);
  };

  const handleEdit = (statement: CustomerAccountStatement) => {
    setEditingCustomer(statement.customer);
    setIsCustomerModalOpen(true);
  };

  const agingBadge = (customerId: number) => {
    const days = oldestDueDays.get(customerId);
    if (days == null || days <= 0) return null;
    const cls = days > 90 ? "bg-red-50 text-red-700 border-red-200" : days > 30 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-600 border-gray-200";
    return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cls}`}>J+{days}</span>;
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-[#F7162D]" />
            Clients
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Fiches clients, commerciaux attitrés, soldes dus et encaissements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => {
              setEditingCustomer(null);
              setIsCustomerModalOpen(true);
            }}
            className="px-4 py-2.5 bg-[#F7162D] hover:bg-[#d81023] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouveau Client
          </button>
        </div>
      </div>

      {/* Cartes statistiques */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Clients actifs</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900">{customersList.length}</div>
          <p className="text-xs text-gray-500 mt-1">{clientsAvecImpayes} avec documents impayés</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Solde total dû</span>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-[#F7162D] flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#F7162D]">{formatMoney(totalDu)}</div>
          <p className="text-xs text-gray-500 mt-1">Encaissements en attente (tous clients)</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Soldés</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {customersList.length - clientsAvecImpayes}
          </div>
          <p className="text-xs text-gray-500 mt-1">Clients sans document impayé</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Rechercher nom, téléphone, ville, ICE…"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
          />
        </div>
        <select
          value={staffFilter}
          onChange={(e) => {
            setStaffFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value));
            setPage(0);
          }}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
        >
          <option value="ALL">Tous les commerciaux</option>
          {commercials.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={withDebtOnly}
            onChange={(e) => {
              setWithDebtOnly(e.target.checked);
              setPage(0);
            }}
            className="w-4 h-4 text-[#F7162D] rounded border-gray-300"
          />
          Avec solde dû
        </label>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">Contact</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">Commercial</th>
                <th className="px-4 py-3 font-semibold text-right">Solde dû</th>
                <th className="px-4 py-3 font-semibold text-right hidden lg:table-cell">Impayés</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const risk = c.riskClass !== "NORMAL" ? RISK_BADGES[c.riskClass] : null;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setDrawerCustomerId(c.id)}
                    className="border-b border-gray-50 hover:bg-gray-50/80 cursor-pointer transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{c.name}</span>
                        {c.isProfessional && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">PRO</span>
                        )}
                        {c.isWholesale && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">GRO</span>
                        )}
                        {risk && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${risk.cls}`}>{risk.label}</span>
                        )}
                        {agingBadge(c.id)}
                      </div>
                      {c.ice && <div className="text-[11px] text-gray-400 mt-0.5">ICE {c.ice}</div>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="text-xs text-gray-600 space-y-0.5">
                        {c.phone && (
                          <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-gray-400" />{c.phone}</div>
                        )}
                        <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-gray-400" />{c.city}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-600">
                      {c.assignedStaffName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${c.balanceDueCents > 0 ? "text-[#F7162D]" : "text-gray-400"}`}>
                        {formatMoney(c.balanceDueCents)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      {c.unpaidDocumentsCount > 0 ? (
                        <span className="text-xs font-bold text-amber-600">{c.unpaidDocumentsCount} doc{c.unpaidDocumentsCount > 1 ? "s" : ""}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                    Aucun client trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/60">
            <span className="text-xs text-gray-500">
              Page {safePage + 1} / {pageCount} · {filtered.length} clients
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                className="p-2 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-white transition"
                aria-label="Page précédente"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                disabled={safePage >= pageCount - 1}
                className="p-2 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-white transition"
                aria-label="Page suivante"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer fiche */}
      {drawerCustomerId && (
        <ClientDrawer
          customerId={drawerCustomerId}
          refreshKey={drawerRefresh}
          onClose={() => setDrawerCustomerId(null)}
          onEncaisser={handleEncaisser}
          onEdit={handleEdit}
          onPrintStatement={(id) => setStatementCustomerId(id)}
        />
      )}

      {/* Modals */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSaved={() => {
          setDrawerRefresh((k) => k + 1);
          loadData();
        }}
        customers={customersList}
        preselectedCustomerId={preselectedCustomerId}
      />
      <ClientImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={loadData}
      />
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => {
          setIsCustomerModalOpen(false);
          setEditingCustomer(null);
        }}
        onSaved={() => {
          setDrawerRefresh((k) => k + 1);
          loadData();
        }}
        customer={editingCustomer}
      />
      {statementCustomerId && (
        <CustomerStatementModal
          isOpen={true}
          onClose={() => setStatementCustomerId(null)}
          customerId={statementCustomerId}
        />
      )}
    </div>
  );
}
