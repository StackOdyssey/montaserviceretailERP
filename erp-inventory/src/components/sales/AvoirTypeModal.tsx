"use client";

import React, { useState } from "react";
import { X, RotateCcw, HandCoins, FileWarning, Check } from "lucide-react";

export type AvoirType = "RETOUR" | "COMMERCIAL" | "CORRECTION";

interface AvoirTypeModalProps {
  docNumber: string;
  onConfirm: (type: AvoirType) => void;
  onCancel: () => void;
}

const OPTIONS: Array<{
  type: AvoirType;
  title: string;
  desc: string;
  badge: string;
  icon: React.ReactNode;
}> = [
  {
    type: "RETOUR",
    title: "Retour marchandise",
    desc: "Stock réintégré en magasin",
    badge: "bg-emerald-100 text-emerald-700",
    icon: <RotateCcw size={22} className="text-emerald-600" />,
  },
  {
    type: "COMMERCIAL",
    title: "Geste commercial",
    desc: "Déduction financière sans reprise de stock",
    badge: "bg-blue-100 text-blue-700",
    icon: <HandCoins size={22} className="text-blue-600" />,
  },
  {
    type: "CORRECTION",
    title: "Correction facturation",
    desc: "Rectification d'erreur de saisie",
    badge: "bg-amber-100 text-amber-700",
    icon: <FileWarning size={22} className="text-amber-600" />,
  },
];

/** Choix du type d'avoir — remplace le window.prompt("1/2/3") bloqué en PWA. */
export function AvoirTypeModal({ docNumber, onConfirm, onCancel }: AvoirTypeModalProps) {
  const [selected, setSelected] = useState<AvoirType>("RETOUR");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw size={20} className="text-[#F7162D]" />
            <h2 className="font-bold text-gray-900">Avoir sur {docNumber}</h2>
          </div>
          <button
            onClick={onCancel}
            aria-label="Fermer"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-2">
          <p className="text-xs text-gray-500 mb-2">
            Un avoir total sera créé sur l&apos;ensemble des lignes du document.
          </p>
          {OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => setSelected(opt.type)}
              className={`w-full p-3 rounded-xl border-2 flex items-center gap-3 text-left transition-all ${
                selected === opt.type
                  ? "border-[#F7162D] bg-red-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              {opt.icon}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900">{opt.title}</div>
                <div className="text-xs text-gray-500">{opt.desc}</div>
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${opt.badge}`}>
                {opt.type}
              </span>
              {selected === opt.type && <Check size={18} className="text-[#F7162D] shrink-0" />}
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onConfirm(selected)}
            className="flex-[2] px-4 py-2.5 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold rounded-lg transition-colors"
          >
            Créer l&apos;avoir
          </button>
        </div>
      </div>
    </div>
  );
}
