import React, { useState } from "react";
import { X, Printer, Check } from "lucide-react";
import { SalesDocumentItem } from "@/lib/actions/sales";
import { formatMoney } from "@/lib/money";
import { DocumentPrintView } from "@/components/sales/DocumentPrintView";

interface InvoiceModalProps {
  document: SalesDocumentItem;
  onClose: () => void;
}

export function InvoiceModal({ document, onClose }: InvoiceModalProps) {
  const [showPrintView, setShowPrintView] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check size={20} className="text-emerald-600" />
              <h2 className="font-bold text-gray-900">Document créé avec succès</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Document Info */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-emerald-700 font-mono">
                  {document.docNumber}
                </span>
                <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                  {document.docType}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                {new Date(document.docDate).toLocaleDateString("fr-FR")}
              </div>
            </div>

            {/* Customer Info */}
            <div className="space-y-1">
              <div className="font-semibold text-gray-900">{document.customerName}</div>
              {document.customerPhone && (
                <div className="text-sm text-gray-600">Tél: {document.customerPhone}</div>
              )}
              {document.customerCity && (
                <div className="text-sm text-gray-600">{document.customerCity}</div>
              )}
            </div>

            {/* Items */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-2 px-3 text-left font-semibold text-gray-700">Article</th>
                    <th className="py-2 px-3 text-center font-semibold text-gray-700">Qté</th>
                    <th className="py-2 px-3 text-right font-semibold text-gray-700">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {document.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2 px-3">
                        <div className="font-mono text-xs text-gray-500">{line.sku}</div>
                        <div className="font-medium text-gray-900">{line.productName}</div>
                      </td>
                      <td className="py-2 px-3 text-center">{line.quantity}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {formatMoney(line.totalHtCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="space-y-1.5 text-sm bg-gray-50 rounded-xl p-4">
              <div className="flex justify-between text-gray-600">
                <span>Total Brut HT</span>
                <span className="font-mono">{formatMoney(document.totalBrutHtCents)}</span>
              </div>
              {document.discountPercent > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Remise ({document.discountPercent}%)</span>
                  <span className="font-mono">-{formatMoney(document.discountAmountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>Total Net HT</span>
                <span className="font-mono">{formatMoney(document.totalNetHtCents)}</span>
              </div>
              {document.tvaRate > 0 ? (
                <div className="flex justify-between text-gray-600">
                  <span>TVA ({document.tvaRate}%)</span>
                  <span className="font-mono">{formatMoney(document.tvaAmountCents)}</span>
                </div>
              ) : (
                (document.docType === "FACTURE" || document.docType === "AVOIR") && (
                  <div className="text-xs italic text-gray-500">TVA non applicable</div>
                )
              )}
              <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>Total TTC</span>
                <span className="font-mono text-[#F7162D]">
                  {formatMoney(document.totalTtcCents)}
                </span>
              </div>
            </div>

            {/* Payment Info */}
            {document.paymentMethod && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="text-xs font-semibold text-blue-700 mb-1">
                  Mode de paiement
                </div>
                <div className="text-sm font-medium text-blue-900">
                  {document.paymentMethod === "ESPECES" && "Espèces"}
                  {document.paymentMethod === "CHEQUE" && "Chèque"}
                  {document.paymentMethod === "A_CREDIT" && "Crédit client"}
                </div>
                {document.notes && document.paymentMethod === "CHEQUE" && (
                  <div className="text-xs text-blue-700 mt-1">{document.notes}</div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 flex gap-2">
            <button
              onClick={() => setShowPrintView(true)}
              className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Printer size={16} />
              <span>Imprimer</span>
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-[#F7162D] hover:bg-[#D90E23] text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Check size={16} />
              <span>Terminé</span>
            </button>
          </div>
        </div>
      </div>

      {showPrintView && (
        <DocumentPrintView document={document} onClose={() => setShowPrintView(false)} />
      )}
    </>
  );
}
