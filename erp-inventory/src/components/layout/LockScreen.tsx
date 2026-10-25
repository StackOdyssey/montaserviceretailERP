"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Delete, LogIn } from "lucide-react";
import { loginWithPin } from "@/lib/actions/auth";

/**
 * Verrouillage poste (legacy lockCompte) : l'écran se verrouille sans fermer la
 * session. Le PIN déverrouille — et permet aussi un changement d'utilisateur
 * rapide au comptoir (loginWithPin pose un nouveau cookie de session).
 */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (value: string) => {
    if (value.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await loginWithPin(value);
      if (res.success) {
        router.refresh();
        onUnlock();
      } else {
        setError(res.message ?? "Code PIN incorrect.");
        setPin("");
      }
    } catch {
      setError("Erreur serveur. Réessayez.");
      setPin("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const digit = (d: string) => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 6) submit(next);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#111827]/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 select-none">
      <div className="w-16 h-16 rounded-2xl bg-[#F7162D] flex items-center justify-center mb-4 shadow-lg">
        <Lock className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-white font-bold text-lg tracking-tight">Session verrouillée</h2>
      <p className="text-gray-400 text-xs mt-1 mb-6">Entrez un code PIN pour reprendre</p>

      {/* Cellules PIN */}
      <div className="flex gap-2.5 mb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-10 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${
              pin.length > i
                ? "border-[#F7162D] bg-[#F7162D]/20 text-white"
                : "border-gray-600 bg-white/5 text-transparent"
            }`}
          >
            •
          </div>
        ))}
      </div>

      {error && <p className="text-red-400 text-xs font-semibold mb-3">{error}</p>}

      {/* Pavé numérique */}
      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
        {["1","2","3","4","5","6","7","8","9"].map((d) => (
          <button
            key={d}
            onClick={() => digit(d)}
            disabled={isSubmitting}
            className="py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-lg transition active:scale-95 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => setPin(pin.slice(0, -1))}
          disabled={isSubmitting || pin.length === 0}
          className="py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 flex items-center justify-center transition active:scale-95 disabled:opacity-50"
          aria-label="Effacer"
        >
          <Delete size={20} />
        </button>
        <button
          onClick={() => digit("0")}
          disabled={isSubmitting}
          className="py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-lg transition active:scale-95 disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={() => submit(pin)}
          disabled={isSubmitting || pin.length === 0}
          className="py-3 rounded-xl bg-[#F7162D] hover:bg-[#D90E23] text-white flex items-center justify-center transition active:scale-95 disabled:opacity-50"
          aria-label="Déverrouiller"
        >
          <LogIn size={20} />
        </button>
      </div>
      {isSubmitting && <p className="text-gray-400 text-xs mt-4">Vérification…</p>}
    </div>
  );
}
