"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Receipt,
  Search,
  Plus,
  FileSpreadsheet,
  Clock,
  AlertTriangle,
  Building,
  Phone,
  FileText,
  Banknote,
} from "lucide-react";
import {
  CustomerItem,
  getCustomers,
  getChequesEffetsSchedule,
  ChequeEffetAlert,
  updatePaymentStatus,
} from "@/lib/actions/customers";
import { formatMoney } from "@/lib/money";
import { nextStatuses, paymentStatusLabel, isTerminalStatus } from "@/lib/payments";
import { PaymentModal } from "@/components/customers/PaymentModal";
import { CustomerModal } from "@/components/customers/CustomerModal";
import { ClientImportModal } from "@/components/customers/ClientImportModal";
import { CustomerStatementModal } from "@/components/customers/CustomerStatementModal";
import { useToast } from "@/components/ui/ToastProvider";
import { unwrap } from "@/lib/action-result";

export default function ReglementsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"SOLDE_CLIENTS" | "ECHEANCIER" | "HISTORIQUE">("SOLDE_CLIENTS");
  const [searchQuery, setSearchQuery] = useState("");
  const [customersList, setCustomersList] = useState<Awaited<ReturnType<typeof getCustomers>>>([]);
  const [chequesSchedule, setChequesSchedule] = useState<ChequeEffetAlert[]>([]);
  const [, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [statementCustomerId, setStatementCustomerId] = useState<number | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [preselectedCustomerId, setPreselectedCustomerId] = useState<number | undefined>(undefined);

  const loadData = async () => {
    setLoading(true);
    try {
      const [custs, schedule] = await Promise.all([
        getCustomers(searchQuery),
        getChequesEffetsSchedule(),
      ]);
      setCustomersList(custs);
      setChequesSchedule(schedule);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Totaux statistiques
  const totalCreances = customersList.reduce((sum, c) => sum + Math.max(0, c.balanceDueCents || 0), 0);
  const totalChequesEnAttente = chequesSchedule
    .filter((c) => !isTerminalStatus(c.status))
    .reduce((sum, c) => sum + c.amountCents, 0);
  const clientsAvecImpayesCount = customersList.filter((c) => (c.balanceDueCents || 0) > 0).length;

  const handleUpdateChequeStatus = async (paymentId: number, newStatus: string) => {
    startTransition(async () => {
      try {
        unwrap(await updatePaymentStatus(paymentId, newStatus));
        loadData();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  const handleOpenPayment = (customerId?: number) => {
    setPreselectedCustomerId(customerId);
    setIsPaymentModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* En-tête Page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Receipt className="w-7 h-7 text-[#F7162D]" />
            Règlements & Crédits Clients
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Suivi des soldes débiteurs, grand livre des BL, encaissements et échéancier des chèques & effets LCN.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingCustomer(null);
              setIsCustomerModalOpen(true);
            }}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouveau Client
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl transition flex items-center gap-2"
            title="Importer une liste de clients depuis un fichier CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => handleOpenPayment()}
            className="px-4 py-2.5 bg-[#F7162D] hover:bg-[#d81023] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2"
          >
            <Banknote className="w-4 h-4" />
            Nouvel Encaissement
          </button>
        </div>
      </div>

      {/* Cartes d'indicateurs de trésorerie */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Créances Clients Totales</span>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-[#F7162D] flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#F7162D]">
            {formatMoney(totalCreances)}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Réparti sur {clientsAvecImpayesCount} client(s) avec solde ouvert
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Chèques & Effets en portefeuille</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-500">
            {formatMoney(totalChequesEnAttente)}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {chequesSchedule.filter((c) => c.status === "EN_ATTENTE").length} chèque(s) et effet(s) en attente d&apos;encaissement
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Nombre de Clients Actifs</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {customersList.length} Clients
          </div>
          <p className="text-xs text-emerald-600 mt-1 font-medium">
            Comptoir et grossistes Bashan
          </p>
        </div>
      </div>

      {/* Onglets de navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 gap-6">
        <button
          onClick={() => setActiveTab("SOLDE_CLIENTS")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "SOLDE_CLIENTS"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Building className="w-4 h-4" />
          Clients & Soldes Débiteurs ({customersList.length})
        </button>

        <button
          onClick={() => setActiveTab("ECHEANCIER")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "ECHEANCIER"
              ? "border-[#F7162D] text-[#F7162D]"
              : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <Clock className="w-4 h-4" />
          Échéancier Chèques & Effets ({chequesSchedule.filter((c) => c.status === "EN_ATTENTE").length})
        </button>
      </div>

      {/* Onglet 1: Soldes Clients */}
      {activeTab === "SOLDE_CLIENTS" && (
        <div className="space-y-4">
          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par nom de client, téléphone, ville, ICE..."
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D] shadow-xs"
            />
          </div>

          {/* Liste des clients */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 text-gray-500 text-xs uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4 text-right">Total Facturé</th>
                    <th className="py-3 px-4 text-right">Total Réglé</th>
                    <th className="py-3 px-4 text-right">Solde Dû</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {customersList.map((customer) => {
                    const hasDebt = (customer.balanceDueCents || 0) > 0;
                    return (
                      <tr key={customer.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-gray-900 dark:text-white">
                            {customer.name}
                          </div>
                          <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                            {customer.isWholesale ? (
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 rounded text-[10px] font-semibold">
                                Grossiste
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-semibold">
                                Détail
                              </span>
                            )}
                            {customer.ice && <span>ICE: {customer.ice}</span>}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300">
                          {customer.phone && (
                            <div className="flex items-center gap-1.5 font-medium">
                              <Phone className="w-3.5 h-3.5 text-gray-400" />
                              {customer.phone}
                            </div>
                          )}
                          <div className="text-gray-400 mt-0.5">{customer.city}</div>
                        </td>

                        <td className="py-3 px-4 text-right font-medium text-gray-700 dark:text-gray-300">
                          {formatMoney(customer.totalBilledTtcCents || 0)}
                        </td>

                        <td className="py-3 px-4 text-right font-medium text-emerald-600">
                          {formatMoney(customer.totalPaidCents || 0)}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-xl text-xs font-black ${
                              hasDebt
                                ? "bg-red-50 text-[#F7162D] dark:bg-red-950/40 dark:text-red-400"
                                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            }`}
                          >
                            {formatMoney(customer.balanceDueCents || 0)}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenPayment(customer.id)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                              title="Enregistrer un encaissement"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                              <span>Encaisser</span>
                            </button>
                            <button
                              onClick={() => setStatementCustomerId(customer.id)}
                              className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition flex items-center gap-1"
                              title="Voir le relevé de compte A4"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Relevé</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Onglet 2: Échéancier Chèques & Effets LCN */}
      {activeTab === "ECHEANCIER" && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300">
              <strong>Gestion du portefeuille d&apos;effets & chèques :</strong> Suivez les dates d&apos;échéance des chèques et traites (LCN) remis par vos clients. Déposez-les en banque à date et validez leur encaissement en un clic.
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 text-gray-500 text-xs uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">Échéance</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">N° Pièce / Réf</th>
                    <th className="py-3 px-4">Banque</th>
                    <th className="py-3 px-4 text-right">Montant</th>
                    <th className="py-3 px-4 text-center">Statut</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {chequesSchedule.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400">
                        Aucun chèque ou effet de commerce en attente dans le portefeuille.
                      </td>
                    </tr>
                  ) : (
                    chequesSchedule.map((item) => {
                      const isPending = !isTerminalStatus(item.status);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition">
                          <td className="py-3 px-4">
                            <div className="font-bold text-gray-900 dark:text-white">
                              {new Date(item.dueDate).toLocaleDateString("fr-FR")}
                            </div>
                            {isPending && (
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mt-0.5 ${
                                  item.urgency === "RETARD"
                                    ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                    : item.urgency === "AUJOURDHUI"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse"
                                    : item.urgency === "PROCHE"
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
                                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                }`}
                              >
                                {item.urgency === "RETARD"
                                  ? `En retard (${Math.abs(item.daysRemaining)}j)`
                                  : item.urgency === "AUJOURDHUI"
                                  ? "Échéance aujourd'hui !"
                                  : item.urgency === "PROCHE"
                                  ? `Sous ${item.daysRemaining} jours`
                                  : `Dans ${item.daysRemaining} jours`}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 font-semibold text-gray-800 dark:text-gray-200">
                            {item.customerName}
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md text-xs font-bold">
                              {item.paymentMethod === "EFFET_LCN" ? "Effet LCN" : "Chèque"}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono text-xs font-bold text-gray-700 dark:text-gray-300">
                            {item.referenceNumber}
                          </td>

                          <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-400">
                            {item.bankName}
                          </td>

                          <td className="py-3 px-4 text-right font-black text-gray-900 dark:text-white">
                            {formatMoney(item.amountCents)}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.status === "ENCAISSE" || item.status === "PAYE"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isTerminalStatus(item.status)
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {paymentStatusLabel(item.status)}
                            </span>
                            {item.depositDate && (
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                Déposé le {new Date(item.depositDate).toLocaleDateString("fr-FR")}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">
                            {nextStatuses(item.paymentMethod, item.status).length > 0 ? (
                              <select
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) handleUpdateChequeStatus(item.id, e.target.value);
                                }}
                                title="Changer le statut"
                                className="px-2 py-1 text-[11px] font-semibold border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none focus:border-[#F7162D]"
                              >
                                <option value="">Changer…</option>
                                {nextStatuses(item.paymentMethod, item.status).map((s) => (
                                  <option key={s} value={s}>
                                    {paymentStatusLabel(s)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[10px] text-gray-400">Clôturé</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSaved={loadData}
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
        onSaved={loadData}
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
