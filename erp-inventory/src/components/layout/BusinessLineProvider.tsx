"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export interface BusinessLine {
  id: number;
  code: string;
  displayName: string;
}

interface BusinessLineCtx {
  lines: BusinessLine[];
  activeCode: string;
  activeLine: BusinessLine | null;
  setActiveCode: (code: string) => void;
}

const STORAGE_KEY = "bm_active_business_line";
const Ctx = createContext<BusinessLineCtx | null>(null);

export function BusinessLineProvider({
  lines = [],
  children,
}: {
  lines?: BusinessLine[];
  children: React.ReactNode;
}) {
  const defaultCode = lines[0]?.code ?? "PIECES";
  const [activeCode, setActiveCodeState] = useState(defaultCode);

  // Restaure la ligne mémorisée (préférence locale ; par utilisateur plus tard).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && lines.some((l) => l.code === saved)) {
      setActiveCodeState(saved);
    }
  }, [lines]);

  const setActiveCode = (code: string) => {
    setActiveCodeState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // stockage indisponible : ignorer
    }
  };

  const activeLine = lines.find((l) => l.code === activeCode) ?? null;

  return (
    <Ctx.Provider value={{ lines, activeCode, activeLine, setActiveCode }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBusinessLine(): BusinessLineCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBusinessLine doit être utilisé dans BusinessLineProvider");
  return ctx;
}

export function BusinessLineSelect() {
  const { lines, activeCode, setActiveCode } = useBusinessLine();
  return (
    <div className="flex items-center gap-2">
      <span className="hidden lg:block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">
        Ligne
      </span>
      <select
        value={activeCode}
        onChange={(e) => setActiveCode(e.target.value)}
        aria-label="Ligne métier active"
        className="px-3 py-1.5 text-xs font-bold bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none"
      >
        {lines.map((l) => (
          <option key={l.code} value={l.code}>
            {l.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
