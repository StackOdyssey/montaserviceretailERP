"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ToastApi {
  show: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// Hors provider (page /login montée sans AppShell) : dégrade en alert()
// pour ne jamais faire disparaître un message d'erreur.
const fallbackApi: ToastApi = {
  show: (_kind, message) => window.alert(message),
  success: (message) => window.alert(message),
  error: (message) => window.alert(message),
  info: (message) => window.alert(message),
};

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? fallbackApi;
}

const KIND_STYLES: Record<ToastKind, { container: string; icon: React.ElementType }> = {
  success: {
    container: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  error: {
    container: "bg-red-50 text-red-800 border-red-200",
    icon: AlertTriangle,
  },
  info: {
    container: "bg-blue-50 text-blue-800 border-blue-200",
    icon: Info,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show("success", m),
      error: (m) => show("error", m),
      info: (m) => show("info", m),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-16 md:top-20 right-4 z-[80] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => {
          const style = KIND_STYLES[toast.kind];
          const Icon = style.icon;
          return (
            <button
              key={toast.id}
              type="button"
              onClick={() => dismiss(toast.id)}
              className={cn(
                "pointer-events-auto flex items-start gap-2 border px-3.5 py-2.5 text-left text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2",
                style.container
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{toast.message}</span>
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
