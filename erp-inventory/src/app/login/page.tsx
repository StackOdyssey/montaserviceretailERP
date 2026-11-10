"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Delete,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { loginWithPin } from "@/lib/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  // Ajout d'un chiffre au PIN tactile
  const handleKeyPress = (num: string) => {
    if (pin.length >= 8) return;
    setError(null);

    // Vibration haptique subtile pour retour tactile sur smartphone
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(25);
    }

    // Pas de validation automatique : les PIN font 4 à 8 chiffres (Valider ou Entrée).
    setPin(pin + num);
  };

  const handleDelete = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(15);
    }
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin("");
    setError(null);
  };

  const submitPin = async (pinToSubmit: string) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await loginWithPin(pinToSubmit);
      if (res.success) {
        router.push("/");
        router.refresh();
      } else {
        setShake(true);
        setError(res.message || "Code PIN incorrect.");
        setPin("");
        setTimeout(() => setShake(false), 500);
      }
    } catch {
      setError("Erreur de connexion au serveur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Écoute des touches du clavier physique (PC comptoir)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        handleKeyPress(e.key);
      } else if (e.key === "Backspace") {
        handleDelete();
      } else if (e.key === "Escape") {
        handleClear();
      } else if (e.key === "Enter" && pin.length > 0 && !isSubmitting) {
        submitPin(pin);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#111827] px-4 py-8 text-white select-none">
      {/* Carte centrale d'authentification */}
      <div className="w-full max-w-sm flex flex-col items-center space-y-6">
        {/* Logo & Identité BM Motors */}
        <div className="flex flex-col items-center text-center space-y-2">
          <Image
            src="/bm-motors-logo-wide.png"
            alt="Logo BM Motors"
            width={273}
            height={70}
            className="object-contain drop-shadow-2xl"
            priority
          />
          <h1 className="text-xl font-black tracking-tight text-white mt-2">
            SARL BM MOTORS
          </h1>
          <p className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-[#F7162D]" />
            Accès Sécurisé Gérant • Point de Vente
          </p>
        </div>

        {/* 1. Indicateur visuel des points PIN */}
        <div className={`flex flex-col items-center space-y-3 ${shake ? "animate-bounce" : ""}`}>
          <div className="flex items-center justify-center gap-4 py-2">
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => i).map((idx) => {
              const isFilled = pin.length > idx;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full transition-all duration-200 border-2 ${
                    isFilled
                      ? "bg-[#F7162D] border-[#F7162D] scale-110 shadow-[0_0_10px_rgba(247,22,45,0.6)]"
                      : "bg-gray-800/80 border-gray-600"
                  }`}
                />
              );
            })}
          </div>

          {error ? (
            <div className="flex items-center gap-1.5 text-xs text-red-400 font-semibold animate-in fade-in">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          ) : (
            <div className="text-[11px] text-gray-500 font-medium">
              Saisissez votre code PIN puis appuyez sur Valider
            </div>
          )}
        </div>

        {/* 3. Pavé Numérique Tactile (Large touch targets pour iPhone 17 Pro Max) */}
        <div className="w-full grid grid-cols-3 gap-3 pt-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeyPress(num)}
              disabled={isSubmitting}
              className="h-16 rounded-2xl bg-gray-800/90 hover:bg-gray-700 active:bg-gray-600 active:scale-95 text-2xl font-black text-white shadow-md border border-gray-700/60 transition-all flex items-center justify-center"
            >
              {num}
            </button>
          ))}

          {/* Touche Effacer */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSubmitting || pin.length === 0}
            className="h-16 rounded-2xl bg-gray-900/80 hover:bg-gray-800 active:scale-95 text-gray-400 hover:text-white border border-gray-800 transition-all flex items-center justify-center disabled:opacity-30"
            title="Effacer le dernier chiffre"
          >
            <Delete size={22} />
          </button>

          {/* Chiffre 0 */}
          <button
            type="button"
            onClick={() => handleKeyPress("0")}
            disabled={isSubmitting}
            className="h-16 rounded-2xl bg-gray-800/90 hover:bg-gray-700 active:bg-gray-600 active:scale-95 text-2xl font-black text-white shadow-md border border-gray-700/60 transition-all flex items-center justify-center"
          >
            0
          </button>

          {/* Touche Validation manuelle */}
          <button
            type="button"
            onClick={() => pin.length > 0 && submitPin(pin)}
            disabled={isSubmitting || pin.length === 0}
            className="h-16 rounded-2xl bg-emerald-600/90 hover:bg-emerald-600 active:scale-95 text-white shadow-md border border-emerald-500/60 transition-all flex items-center justify-center disabled:opacity-30"
            title="Valider le code PIN"
          >
            <CheckCircle2 size={24} />
          </button>
        </div>

        {/* Note de bas de page */}
        <div className="pt-4 text-center text-[10px] text-gray-500">
          SARL BM Motors • Session sécurisée
        </div>
      </div>
    </div>
  );
}
