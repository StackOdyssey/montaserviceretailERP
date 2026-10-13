"use client";

import { useEffect, useState } from "react";
import { X, Printer, Share2, Phone, Building, CheckCircle2, Clock, AlertTriangle, FileText } from "lucide-react";
import { CustomerAccountStatement, getCustomerStatement } from "@/lib/actions/customers";
import { formatMoney } from "@/lib/money";
import { paymentStatusLabel, isTerminalStatus } from "@/lib/payments";

interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: number;
}

export function CustomerStatementModal({
  isOpen,
  onClose,
  customerId,
}: CustomerStatementModalProps) {
  const [statement, setStatement] = useState<CustomerAccountStatement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !customerId) return;
    setLoading(true);
    getCustomerStatement(customerId).then((data) => {
      setStatement(data);
      setLoading(false);
    });
  }, [isOpen, customerId]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    if (!statement) return;
    const phone = statement.customer.phone?.replace(/[^0-9]/g, "") || "";
    const balance = formatMoney(statement.balanceDueCents);

    const message = encodeURIComponent(
      `Bonjour ${statement.customer.name},\n\n` +
      `Voici votre relevé de situation de compte chez SARL BM Motors :\n` +
      `• Total facturé : ${formatMoney(statement.totalBilledTtcCents)}\n` +
      `• Total règlements reçus : ${formatMoney(statement.totalPaidCents)}\n` +
      `• Solde restant dû : ${balance}\n\n` +
      `Merci pour votre confiance.\nSARL BM Motors - Casablanca`
    );

    const url = phone ? `https://wa.me/212${phone.startsWith("0") ? phone.slice(1) : phone}?text=${message}` : `https://wa.me/?text=${message}`;
    window.open(url, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Control Bar (Hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-800 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F7162D]/10 flex items-center justify-center text-[#F7162D]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Relevé de Compte Client (A4)
              </h3>
              <p className="text-xs text-gray-500">
                {statement?.customer.name || "Chargement..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-xs"
            >
              <Printer className="w-4 h-4 text-white" />
              <span>Imprimer A4</span>
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-xs"
            >
              <Share2 className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Statement Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 print:p-0 print:space-y-4">
          {loading || !statement ? (
            <div className="py-20 text-center text-gray-500">
              Chargement du grand livre client...
            </div>
          ) : (
            <div className="max-w-[210mm] mx-auto bg-white p-6 sm:p-10 text-gray-900 rounded-xl print:shadow-none print:border-none print:m-0 print:p-4">
              {/* En-tête A4 normalisé marocain */}
              <div className="flex justify-between items-start border-b-2 border-gray-900 pb-5">
                <div>
                  <h1 className="text-2xl font-black text-[#F7162D] tracking-tight">
                    SARL BM MOTORS
                  </h1>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-700">
                    Pièces Détachées Motos
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Casablanca • Tél: 05 22 00 00 00 • Email: contact@bmmotors.ma
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    <strong>ICE:</strong> 001892837000045 • <strong>IF:</strong> 40291823 • <strong>RC:</strong> 39281 • <strong>TP:</strong> 37192801
                  </p>
                </div>

                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-gray-100 text-gray-900 font-extrabold text-sm rounded-md uppercase tracking-wider">
                    RELEVÉ DE COMPTE
                  </span>
                  <p className="text-xs text-gray-500 mt-2">
                    Date d'édition : {new Date().toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>

              {/* Bloc Fiche Client & Synthèse Solde */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    COMPTE CLIENT
                  </span>
                  <h2 className="text-lg font-bold text-gray-900 mt-0.5">
                    {statement.customer.name}
                  </h2>
                  {statement.customer.ice && (
                    <p className="text-xs text-gray-600 mt-1">
                      <strong>ICE :</strong> {statement.customer.ice}
                    </p>
                  )}
                  {statement.customer.phone && (
                    <p className="text-xs text-gray-600">
                      <strong>Tél :</strong> {statement.customer.phone}
                    </p>
                  )}
                  <p className="text-xs text-gray-600">
                    <strong>Ville :</strong> {statement.customer.city}
                  </p>
                </div>

                <div className="flex flex-col justify-center sm:items-end sm:text-right border-t sm:border-t-0 sm:border-l border-gray-200 sm:pl-6 pt-3 sm:pt-0">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    SOLDE RESTANT DÛ (NET À PAYER)
                  </span>
                  <span className={`text-2xl font-black mt-1 ${statement.balanceDueCents > 0 ? "text-[#F7162D]" : "text-emerald-600"}`}>
                    {formatMoney(statement.balanceDueCents)}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {statement.unpaidDocumentsCount} document(s) avec solde ouvert
                  </p>
                </div>
              </div>

              {/* Synthèse Chiffrée */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-center">
                  <div className="text-[10px] font-bold text-gray-500 uppercase">Total Facturé TTC</div>
                  <div className="text-sm font-bold text-gray-900 mt-0.5">
                    {formatMoney(statement.totalBilledTtcCents)}
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">Total Règlements Reçus</div>
                  <div className="text-sm font-bold text-emerald-700 mt-0.5">
                    {formatMoney(statement.totalPaidCents)}
                  </div>
                </div>
                <div className="p-3 bg-red-50 rounded-lg border border-red-100 text-center">
                  <div className="text-[10px] font-bold text-[#F7162D] uppercase">Reste Débiteur Dû</div>
                  <div className="text-sm font-black text-[#F7162D] mt-0.5">
                    {formatMoney(statement.balanceDueCents)}
                  </div>
                </div>
              </div>

              {/* Historique des Bons de Livraison */}
              <div className="space-y-2 mb-6">
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  1. Factures & Bons de Livraison (BL)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-gray-600 uppercase border-y border-gray-200">
                        <th className="py-2 px-3">N° Document</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3 text-right">Total TTC</th>
                        <th className="py-2 px-3 text-right">Réglé</th>
                        <th className="py-2 px-3 text-right">Reste Dû</th>
                        <th className="py-2 px-3 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {statement.documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-gray-50">
                          <td className="py-2 px-3 font-bold text-gray-900">{doc.docNumber}</td>
                          <td className="py-2 px-3 text-gray-600">
                            {new Date(doc.docDate).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">{formatMoney(doc.totalTtcCents)}</td>
                          <td className="py-2 px-3 text-right text-emerald-600 font-medium">
                            {formatMoney(doc.paidAmountCents)}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-[#F7162D]">
                            {formatMoney(doc.remainingDueCents)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                doc.status === "PAYE"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {doc.status === "PAYE" ? "Payé" : "Non Soldé"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Historique des Règlements Reçus */}
              <div className="space-y-2 mb-6">
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  2. Règlements reçus (Espèces, Chèques, Effets LCN, Virements)
                </h3>
                {statement.payments.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">Aucun règlement enregistré pour le moment.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-100 text-gray-600 uppercase border-y border-gray-200">
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Mode</th>
                          <th className="py-2 px-3">Réf / Pièce</th>
                          <th className="py-2 px-3">Échéance</th>
                          <th className="py-2 px-3">Banque</th>
                          <th className="py-2 px-3 text-right">Montant</th>
                          <th className="py-2 px-3 text-center">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {statement.payments.map((pmt) => (
                          <tr key={pmt.id} className="hover:bg-gray-50">
                            <td className="py-2 px-3 text-gray-600">
                              {new Date(pmt.paymentDate).toLocaleDateString("fr-FR")}
                            </td>
                            <td className="py-2 px-3 font-semibold text-gray-900">
                              {pmt.paymentMethod === "EFFET_LCN" ? "Effet LCN" : pmt.paymentMethod}
                            </td>
                            <td className="py-2 px-3 text-gray-600 font-mono">
                              {pmt.referenceNumber || "—"}
                            </td>
                            <td className="py-2 px-3 text-gray-600">
                              {pmt.chequeDueDate
                                ? new Date(pmt.chequeDueDate).toLocaleDateString("fr-FR")
                                : "—"}
                            </td>
                            <td className="py-2 px-3 text-gray-600">{pmt.bankName || "—"}</td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-600">
                              {formatMoney(pmt.amountCents)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  pmt.status === "ENCAISSE" || pmt.status === "PAYE"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isTerminalStatus(pmt.status)
                                    ? "bg-red-100 text-red-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {paymentStatusLabel(pmt.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pied de page du relevé */}
              <div className="pt-6 border-t border-gray-200 text-center text-[10px] text-gray-500">
                <p>Document généré électroniquement par le système de gestion SARL BM Motors.</p>
                <p className="mt-0.5 font-medium">Pour toute réclamation, veuillez contacter le service comptabilité au 05 22 00 00 00.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
