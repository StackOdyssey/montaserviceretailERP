"use client";

import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Remplace window.confirm : fonctionne en PWA/kiosque où les dialogs natifs
 *  sont bloqués ou inesthétiques. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmer",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className={danger ? "text-[#F7162D]" : "text-amber-500"} />
            <h2 className="font-bold text-gray-900">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            aria-label="Fermer"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 text-sm text-gray-700">{message}</div>
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-white font-bold rounded-lg transition-colors ${
              danger ? "bg-[#F7162D] hover:bg-[#D90E23]" : "bg-gray-900 hover:bg-black"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
