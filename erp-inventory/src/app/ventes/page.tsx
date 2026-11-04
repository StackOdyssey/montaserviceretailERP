"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
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
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react";
import {
  getSalesDocuments,
  getSalesDocumentsCount,
  type SalesDocumentItem,
} from "@/lib/actions/sales";
import {
  convertBlToFacture,
  createAvoir,
  cancelDocument,
  createBonPreparation,
  updatePrepStatus,
} from "@/lib/actions/sales-documents";
import { getDocumentUbl } from "@/lib/actions/dgi";
import { PREP_STATUS_LABELS, PREP_TRANSITIONS } from "@/lib/prep";
import { unwrap } from "@/lib/action-result";
import { getDocumentCommercials } from "@/lib/actions/sales";
import { formatMoney } from "@/lib/money";
import { DocumentPrintView } from "@/components/sales/DocumentPrintView";
import { AvoirTypeModal, type AvoirType } from "@/components/sales/AvoirTypeModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSettings } from "@/components/layout/SettingsProvider";
import { useToast } from "@/components/ui/ToastProvider";

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

const PAGE_SIZE = 25;

export default function VentesListPage() {
  const company = useSettings();
  const toast = useToast();
  const [documents, setDocuments] = useState<SalesDocumentItem[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [commercialFilter, setCommercialFilter] = useState("");
  const [commerciaux, setCommerciaux] = useState<string[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<SalesDocumentItem | null>(null);
  const [avoirTargetDoc, setAvoirTargetDoc] = useState<SalesDocumentItem | null>(null);
  const [convertTargetDoc, setConvertTargetDoc] = useState<SalesDocumentItem | null>(null);
  const [cancelTargetDoc, setCancelTargetDoc] = useState<SalesDocumentItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isLoading, startTransition] = useTransition();
  const filtersKeyRef = useRef("");

  const loadDocuments = (targetPage: number) => {
    startTransition(async () => {
      const base = {
        search: searchTerm,
        status: statusFilter,
        docType: typeFilter === "ALL" ? undefined : (typeFilter as SalesDocumentItem["docType"]),
        commercial: commercialFilter || undefined,
      };
      const [data, total] = await Promise.all([
        getSalesDocuments({ ...base, limit: PAGE_SIZE, offset: (targetPage - 1) * PAGE_SIZE }),
        getSalesDocumentsCount(base),
      ]);
      const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
      // Après annulation/filtrage, ne pas rester bloqué sur une page vide.
      if (targetPage > lastPage) {
        setPage(lastPage); // re-déclenche l'effet de chargement
        return;
      }
      setDocuments(data);
      setTotalDocs(total);
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const key = JSON.stringify([searchTerm, statusFilter, typeFilter, commercialFilter]);
      if (filtersKeyRef.current !== key) {
        filtersKeyRef.current = key;
        // Filtres modifiés : repartir en page 1 (re-déclenche l'effet via `page`).
        if (page !== 1) {
          setPage(1);
          return;
        }
      }
      loadDocuments(page);
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, typeFilter, commercialFilter, page]);

  useEffect(() => {
    getDocumentCommercials()
      .then(setCommerciaux)
      .catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalDocs / PAGE_SIZE));

  const runAction = (doc: SalesDocumentItem, fn: () => Promise<unknown>) => {
    setBusyId(doc.id);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusyId(null);
        loadDocuments(page);
      }
    });
  };

  const handleConvert = (doc: SalesDocumentItem) => setConvertTargetDoc(doc);

  const handleAvoir = (doc: SalesDocumentItem) => setAvoirTargetDoc(doc);

  const handleCancel = (doc: SalesDocumentItem) => setCancelTargetDoc(doc);

  const handleCreateBp = (doc: SalesDocumentItem) => {
    runAction(doc, async () => unwrap(await createBonPreparation(doc.id)));
  };

  const handlePrepStatus = (doc: SalesDocumentItem, status: string) => {
    runAction(doc, async () =>
      unwrap(await updatePrepStatus(doc.id, status as "A_PREPARER" | "EN_PREPARATION" | "PREPARE" | "LIVRE" | "NON_LIVRE"))
    );
  };

  const handleUbl = (doc: SalesDocumentItem) => {
    runAction(doc, async () => {
      const { filename, xml } = unwrap(await getDocumentUbl(doc.id));
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
          {commerciaux.length > 0 && (
            <select
              value={commercialFilter}
              onChange={(e) => setCommercialFilter(e.target.value)}
              className="ml-auto px-3 py-1.5 text-xs font-semibold bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg outline-none focus:border-[#4338CA]"
              aria-label="Filtrer par commercial"
            >
              <option value="">Tous commerciaux</option>
              {commerciaux.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
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

                    <td className="py-3.5 px-4 font-semibold text-[#111827]">
                      {doc.customerName}
                      {doc.commercialName && (
                        <div className="text-[10px] font-normal text-[#6B7280]">Com: {doc.commercialName}</div>
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
                            : doc.status === "ANNULE"
                              ? "bg-[#F3F4F6] text-[#6B7280]"
                              : "bg-[#FFFBEB] text-[#D97706]"
                        }`}
                      >
                        {doc.status === "PAYE" ? "Payé" : doc.status === "ANNULE" ? "Annulé" : "Ouvert"}
                      </span>
                      {doc.prepStatus && (
                        <div className={`mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          doc.prepStatus === "LIVRE" ? "bg-emerald-100 text-emerald-800"
                          : doc.prepStatus === "NON_LIVRE" ? "bg-red-100 text-red-800"
                          : "bg-indigo-100 text-indigo-800"}`}>
                          {PREP_STATUS_LABELS[doc.prepStatus] ?? doc.prepStatus}
                        </div>
                      )}
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

                            {["BC", "BL", "DEVIS"].includes(doc.docType) && doc.status !== "ANNULE" && !doc.prepStatus && (
                              <button
                                onClick={() => handleCreateBp(doc)}
                                title="Créer un bon de préparation"
                                className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
                              >
                                <Package size={14} />
                              </button>
                            )}
                            {doc.prepStatus && PREP_TRANSITIONS[doc.prepStatus]?.length > 0 && (
                              <select
                                value=""
                                onChange={(e) => e.target.value && handlePrepStatus(doc, e.target.value)}
                                className="px-1.5 py-1.5 text-[10px] font-bold border border-indigo-200 rounded-lg bg-indigo-50 text-indigo-700 outline-none"
                                title="État préparation"
                              >
                                <option value="">{PREP_STATUS_LABELS[doc.prepStatus]}</option>
                                {PREP_TRANSITIONS[doc.prepStatus].map((s) => (
                                  <option key={s} value={s}>{PREP_STATUS_LABELS[s]}</option>
                                ))}
                              </select>
                            )}

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

        {totalDocs > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#E5E7EB] text-xs">
            <span className="text-[#6B7280] font-medium">
              Page {page} sur {totalPages} — {totalDocs} document{totalDocs > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold bg-[#F8F9FA] border border-[#E5E7EB] text-[#374151] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={14} />
                Précédent
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold bg-[#F8F9FA] border border-[#E5E7EB] text-[#374151] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Suivant
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedDoc && <DocumentPrintView document={selectedDoc} onClose={() => setSelectedDoc(null)} />}

      {avoirTargetDoc && (
        <AvoirTypeModal
          docNumber={avoirTargetDoc.docNumber}
          onCancel={() => setAvoirTargetDoc(null)}
          onConfirm={(avType: AvoirType) => {
            const doc = avoirTargetDoc;
            setAvoirTargetDoc(null);
            runAction(doc, async () =>
              unwrap(await createAvoir({
                sourceDocumentId: doc.id,
                returns: doc.lines.map((l) => ({ lineId: l.id, quantity: l.quantity })),
                avType,
              }))
            );
          }}
        />
      )}

      {convertTargetDoc && (
        <ConfirmDialog
          title="Convertir en facture"
          message={`Convertir le ${convertTargetDoc.docNumber} en facture ?`}
          confirmLabel="Convertir"
          onCancel={() => setConvertTargetDoc(null)}
          onConfirm={() => {
            const doc = convertTargetDoc;
            setConvertTargetDoc(null);
            runAction(doc, async () => unwrap(await convertBlToFacture([doc.id])));
          }}
        />
      )}

      {cancelTargetDoc && (
        <ConfirmDialog
          title="Annuler le document"
          message={`Annuler le ${cancelTargetDoc.docNumber} ? L'opération est irréversible.`}
          confirmLabel="Annuler le document"
          danger
          onCancel={() => setCancelTargetDoc(null)}
          onConfirm={() => {
            const doc = cancelTargetDoc;
            setCancelTargetDoc(null);
            runAction(doc, async () => unwrap(await cancelDocument(doc.id, "Annulation manuelle")));
          }}
        />
      )}
    </div>
  );
}
