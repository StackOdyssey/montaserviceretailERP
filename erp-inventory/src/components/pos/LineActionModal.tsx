import React, { useState } from "react";
import { X, Check, Tag, PenLine } from "lucide-react";
import { formatMoney } from "@/lib/money";

interface LineActionModalProps {
  mode: "force" | "rename";
  productName: string;
  currentTtcCents: number;
  currentLabel?: string;
  /** Pré-remplit le prix depuis le pavé numérique (flux legacy R.For). */
  initialTtc?: string;
  onClose: () => void;
  onConfirmForce: (ttcCents: number, reason: string) => void;
  onConfirmRename: (label: string) => void;
}

export function LineActionModal({
  mode,
  productName,
  currentTtcCents,
  currentLabel,
  initialTtc,
  onClose,
  onConfirmForce,
  onConfirmRename,
}: LineActionModalProps) {
  const [ttc, setTtc] = useState(initialTtc ?? "");
  const [reason, setReason] = useState("");
  const [label, setLabel] = useState(currentLabel ?? "");

  const handleConfirm = () => {
    if (mode === "force") {
      const cents = Math.round(parseFloat(ttc.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents < 0) return;
      if (!reason.trim()) return; // motif obligatoire — audit PRIX_FIXE
      onConfirmForce(cents, reason.trim());
    } else {
      if (!label.trim()) return;
      onConfirmRename(label.trim());
    }
  };

  const deltaCents =
    mode === "force" && ttc
      ? Math.round(parseFloat(ttc.replace(",", ".")) * 100) - currentTtcCents
      : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
            {mode === "force" ? <Tag size={16} className="text-amber-600" /> : <PenLine size={16} className="text-blue-600" />}
            {mode === "force" ? "Forcer le prix TTC" : "Renommer la ligne"}
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs text-gray-600 truncate font-medium">{productName}</div>

          {mode === "force" ? (
            <>
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">
                  Nouveau prix TTC (actuel : {formatMoney(currentTtcCents)})
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={ttc}
                  onChange={(e) => setTtc(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="0,00"
                  className="w-full px-3 py-2.5 text-lg font-mono font-bold bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-amber-500 text-right"
                />
              </div>
              {ttc && Number.isFinite(deltaCents) && deltaCents !== 0 && (
                <div className={`text-xs font-bold font-mono ${deltaCents < 0 ? "text-emerald-700" : "text-amber-700"}`}>
                  {deltaCents < 0 ? `Remise de ${formatMoney(-deltaCents)}` : `Supplément de ${formatMoney(deltaCents)}`}
                </div>
              )}
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Motif (obligatoire, tracé en audit)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex : négociation caisse, promo…"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-amber-500"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Libellé ticket (le produit reste inchangé en stock)</label>
              <input
                type="text"
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={productName}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleConfirm}
            disabled={mode === "force" ? !ttc || !reason.trim() : !label.trim()}
            className="w-full bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Check size={16} /> Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
