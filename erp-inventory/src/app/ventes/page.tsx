"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  PlusCircle,
  Search,
  Printer,
  ReceiptText,
  RotateCcw,
  Ban,
  FileDown,
  Loader2,
} from "lucide-react";
import {
  getSalesDocuments,
  convertBlToFacture,
  createAvoir,
  cancelDocument,
  SalesDocumentItem,
} from "@/lib/actions/sales";
import { getDocumentUbl } from "@/lib/actions/dgi";
import { formatMoney } from "@/lib/money";
import { DocumentPrintView } from "@/components/sales/DocumentPrintView";
import { useSettings } from "@/components/layout/SettingsProvider";

const DOC_TYPE_LABELS: Record<string, string> = {
  BL: "Bon de Livraison",
  FACTURE: "Facture",
  AVOIR: "Avoir",
  BC: "Bon de Commande",
  DEVIS: "Devis",
};

const DOC_TYPE_BADGE: Record<string, string> = {
  BL: "bg-[#EEF2FF] text-[#4338CA]",
  FACTURE: "bg-[#ECFDF5] text-[#059669]",
  AVOIR: "bg-[#FEF2F2] text-[#F7162D]",
  BC: "bg-[#FFFBEB] text-[#D97706]",
  DEVIS: "bg-[#F3F4F6] text-[#6B7280]",
};

export default function VentesListPage() {
  const company = useSettings();
  const [documents, setDocuments] = useState<SalesDocumentItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selectedDoc, setSelectedDoc] = useState<SalesDocumentItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isLoading, startTransition] = useTransition();

  const loadDocuments = () => {
    startTransition(async () => {
      const data = await getSalesDocuments({
        search: searchTerm,
        status: statusFilter,
        docType: typeFilter === "ALL" ? undefined : (typeFilter as SalesDocumentItem["docType"]),
      });
      setDocuments(data);
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => loadDocuments(), 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, typeFilter]);

  const runAction = (doc: SalesDocumentItem, fn: () => Promise<unknown>) => {
    setBusyId(doc.id);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setBusyId(null);
        loadDocuments();
      }
    });
  };

  const handleConvert = (doc: SalesDocumentItem) => {
    if (!confirm(`Convertir le ${doc.docNumber} en facture ?`)) return;
    runAction(doc, () => convertBlToFacture([doc.id]));
  };

  const handleAvoir = (doc: SalesDocumentItem) => {
    const choice = window.prompt(
      `Type d'avoir pour ${doc.docNumber} :\n1 = Retour (marchandise reprise en stock)\n2 = Commercial (geste, sans reprise)\n3 = Correction (erreur de facturation)`,
      "1"
    );
    if (choice === null) return;
    const avType: "RETOUR" | "COMMERCIAL" | "CORRECTION" =
      choice.trim() === "2" ? "COMMERCIAL" : choice.trim() === "3" ? "CORRECTION" : "RETOUR";
    const label =
      avType === "RETOUR" ? "retour, stock réintégré" : avType === "COMMERCIAL" ? "geste commercial" : "correction";
    if (!confirm(`Créer un avoir total (${label}) sur ${doc.docNumber} ?`)) return;
    runAction(doc, () =>
      createAvoir({
        sourceDocumentId: doc.id,
        returns: doc.lines.map((l) => ({ lineId: l.id, quantity: l.quantity })),
        avType,
      })
    );
  };

  const handleCancel = (doc: SalesDocumentItem) => {
    if (!confirm(`Annuler le ${doc.docNumber} ? L'opération est irréversible.`)) return;
    runAction(doc, () => cancelDocument(doc.id, "Annulation manuelle"));
  };

  const handleUbl = (doc: SalesDocumentItem) => {
    runAction(doc, async () => {
      const { filename, xml } = await getDocumentUbl(doc.id);
      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 md:p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF2F2] text-[#F7162D] border border-[#FCA5A5]/40">
              <ShoppingCart size={14} />
              Ventes & Documents commerciaux
            </span>
            <span className="text-xs text-[#6B7280]">{company.raisonSociale}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] mt-1.5 tracking-tight">
            Historique des documents
          </h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            Devis, bons de commande, BL, factures et avoirs — impression A4 et actions.
          </p>
        </div>

        <Link
          href="/ventes/nouveau"
          className="flex items-center gap-2 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all active:scale-98"
        >
          <PlusCircle size={16} />
          <span>Nouveau document</span>
        </Link>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-xs space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par N° (ex: BL-2026-00001) ou nom du client..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#F7162D] font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {[
            { id: "ALL", label: "Tous" },
            { id: "BL", label: "BL" },
            { id: "FACTURE", label: "Factures" },
            { id: "AVOIR", label: "Avoirs" },
            { id: "BC", label: "BC" },
            { id: "DEVIS", label: "Devis" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                typeFilter === f.id ? "bg-[#4338CA] text-white" : "bg-[#F8F9FA] text-[#4B5563] hover:bg-[#E5E7EB]"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="mx-1 text-[#E5E7EB]">|</span>
          {[
            { id: "ALL", label: "Tous statuts" },
            { id: "PAYE", label: "Payés" },
            { id: "VALIDE", label: "Ouverts" },
            { id: "ANNULE", label: "Annulés" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === f.id ? "bg-[#111827] text-white" : "bg-[#F8F9FA] text-[#4B5563] hover:bg-[#E5E7EB]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        {documents.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#6B7280]">
            {isLoading ? "Chargement..." : "Aucun document trouvé."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                  <th className="py-3.5 px-4">N° / Type</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Client</th>
                  <th className="py-3.5 px-4 text-right">Total TTC</th>
                  <th className="py-3.5 px-4 text-center">Statut</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[#F8F9FA] transition-colors group">
                    <td className="py-3.5 px-4">
                      <button onClick={() => setSelectedDoc(doc)} className="font-mono font-bold text-[#F7162D] hover:underline text-left">
                        {doc.docNumber}
                      </button>
                      <span className={`block w-fit mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${DOC_TYPE_BADGE[doc.docType] ?? ""}`}>
                        {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-[#6B7280]">
                      {new Date(doc.docDate).toLocaleDateString("fr-FR")}
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-[#111827]">{doc.customerName}</td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-[#111827]">
                      {formatMoney(doc.totalTtcCents)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          doc.status === "PAYE"
                            ? "bg-[#ECFDF5] text-[#059669]"
                            : doc.status === "ANNULE"
                              ? "bg-[#F3F4F6] text-[#6B7280]"
                              : "bg-[#FFFBEB] text-[#D97706]"
                        }`}
                      >
                        {doc.status === "PAYE" ? "Payé" : doc.status === "ANNULE" ? "Annulé" : "Ouvert"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {busyId === doc.id ? (
                          <Loader2 size={16} className="animate-spin text-[#6B7280]" />
                        ) : (
                          <>
                            <button
                              onClick={() => setSelectedDoc(doc)}
                              title="Imprimer A4"
                              className="p-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#111827] rounded-lg transition-colors"
                            >
                              <Printer size={14} className="text-[#F7162D]" />
                            </button>

                            {doc.docType === "BL" && doc.status !== "ANNULE" && (
                              <button
                                onClick={() => handleConvert(doc)}
                                title="Convertir en facture"
                                className="p-2 bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#059669] rounded-lg transition-colors"
                              >
                                <ReceiptText size={14} />
                              </button>
                            )}

                            {(doc.docType === "FACTURE" || doc.docType === "BL") && doc.status !== "ANNULE" && (
                              <button
                                onClick={() => handleAvoir(doc)}
                                title="Créer un avoir"
                                className="p-2 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#D97706] rounded-lg transition-colors"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}

                            {doc.status !== "ANNULE" && (
                              <button
                                onClick={() => handleUbl(doc)}
                                title="Exporter UBL 2.1 (XML)"
                                className="p-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] rounded-lg transition-colors"
                              >
                                <FileDown size={14} />
                              </button>
                            )}

                            {doc.status !== "ANNULE" && (
                              <button
                                onClick={() => handleCancel(doc)}
                                title="Annuler"
                                className="p-2 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#F7162D] rounded-lg transition-colors"
                              >
                                <Ban size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedDoc && <DocumentPrintView document={selectedDoc} onClose={() => setSelectedDoc(null)} />}
    </div>
  );
}
