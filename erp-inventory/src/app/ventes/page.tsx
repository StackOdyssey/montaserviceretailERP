"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  PlusCircle,
  Search,
  Printer,
  Share2,
  Filter,
  CheckCircle2,
  Clock,
  ChevronRight,
  FileText,
} from "lucide-react";
import { getSalesDocuments, SalesDocumentItem } from "@/lib/actions/sales";
import { formatMoney } from "@/lib/money";
import { DocumentPrintView } from "@/components/sales/DocumentPrintView";

export default function VentesListPage() {
  const [documents, setDocuments] = useState<SalesDocumentItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedDoc, setSelectedDoc] = useState<SalesDocumentItem | null>(null);
  const [isLoading, startTransition] = useTransition();

  const loadDocuments = () => {
    startTransition(async () => {
      const data = await getSalesDocuments({
        search: searchTerm,
        status: statusFilter,
      });
      setDocuments(data);
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDocuments();
    }, 150);

    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter]);

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* 1. EN-TÊTE                                               */}
      {/* ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 md:p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF2F2] text-[#F7162D] border border-[#FCA5A5]/40">
              <ShoppingCart size={14} />
              Ventes & Bons de Livraison
            </span>
            <span className="text-xs text-[#6B7280]">SARL BM Motors</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] mt-1.5 tracking-tight">
            Historique des Bons de Livraison (BL)
          </h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            Consultation, réimpression A4 et partage direct sur WhatsApp.
          </p>
        </div>

        <Link
          href="/ventes/nouveau"
          className="flex items-center gap-2 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all active:scale-98"
        >
          <PlusCircle size={16} />
          <span>Nouveau Bon de Livraison</span>
        </Link>
      </div>

      {/* ======================================================== */}
      {/* 2. RECHERCHE ET FILTRES                                  */}
      {/* ======================================================== */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par N° BL (ex: BL-2026-0128) ou nom du client..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#F7162D] font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 text-xs font-semibold">
          {[
            { id: "ALL", label: "Tous" },
            { id: "PAYE", label: "Payés" },
            { id: "VALIDE", label: "À Crédit" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-2 rounded-xl transition-all ${
                statusFilter === f.id
                  ? "bg-[#111827] text-white"
                  : "bg-[#F8F9FA] text-[#4B5563] hover:bg-[#E5E7EB]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. TABLEAU DES BONS DE LIVRAISON                         */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        {documents.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#6B7280]">
            Aucun Bon de Livraison trouvé.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                  <th className="py-3.5 px-4">N° Document</th>
                  <th className="py-3.5 px-4">Date & Heure</th>
                  <th className="py-3.5 px-4">Client</th>
                  <th className="py-3.5 px-4 text-right">Total Brut HT</th>
                  <th className="py-3.5 px-4 text-center">Remise Accordée</th>
                  <th className="py-3.5 px-4 text-right">Total TTC</th>
                  <th className="py-3.5 px-4 text-center">Statut</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs">
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-[#F8F9FA] transition-colors cursor-pointer group"
                    onClick={() => setSelectedDoc(doc)}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-[#F7162D]">
                      {doc.docNumber}
                    </td>

                    <td className="py-3.5 px-4 text-[#6B7280]">
                      <div>{new Date(doc.docDate).toLocaleDateString("fr-FR")}</div>
                      <div className="text-[10px]">
                        {new Date(doc.docDate).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-[#111827]">
                      {doc.customerName}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono text-[#4B5563]">
                      {formatMoney(doc.totalBrutHtCents)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {doc.discountPercent > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF5] text-[#059669]">
                          -{doc.discountPercent}% (-{formatMoney(doc.discountAmountCents)})
                        </span>
                      ) : (
                        <span className="text-[#9CA3AF]">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-[#111827]">
                      {formatMoney(doc.totalTtcCents)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          doc.status === "PAYE"
                            ? "bg-[#ECFDF5] text-[#059669]"
                            : "bg-[#FFFBEB] text-[#D97706]"
                        }`}
                      >
                        {doc.status === "PAYE" ? "Payé" : "À Crédit"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedDoc(doc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#111827] text-xs font-semibold rounded-lg transition-colors ml-auto"
                      >
                        <Printer size={14} className="text-[#F7162D]" />
                        <span>Imprimer A4</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 4. MODAL D'IMPRESSION A4 ET DE PARTAGE                   */}
      {/* ======================================================== */}
      {selectedDoc && (
        <DocumentPrintView
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </div>
  );
}
