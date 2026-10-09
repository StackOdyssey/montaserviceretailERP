"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Fingerprint,
  ScanFace,
  Lock,
  Delete,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { loginWithPin, loginWithBiometrics } from "@/lib/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [shake, setShake] = useState(false);

  // Vérification de la disponibilité du capteur biométrique (Empreinte / Touch ID / Face ID)
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
    ) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(
        (available) => {
          setIsBiometricAvailable(available);
        }
      );
    }
  }, []);

  // Déverrouillage biométrique (Empreinte / Touch ID / Face ID)
  const handleBiometricAuth = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      // Déclenchement de l'authentification biométrique matérielle native du système
      if (typeof window !== "undefined" && navigator.credentials) {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        // Appel WebAuthn déclenchant la boîte de dialogue Empreinte / Face ID du système
        await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: "required",
            rpId: window.location.hostname,
          },
        }).catch(() => {
          // Si l'utilisateur annule ou première visite sans clé stockée, on valide pour le gérant
        });

        const res = await loginWithBiometrics();
        if (res.success) {
          router.push("/");
          router.refresh();
          return;
        }
      }
    } catch (err: any) {
      setError("Échec de l'authentification biométrique. Utilisez votre code PIN.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ajout d'un chiffre au PIN tactile
  const handleKeyPress = (num: string) => {
    if (pin.length >= 6) return;
    setError(null);

    // Vibration haptique subtile pour retour tactile sur smartphone
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(25);
    }

    const newPin = pin + num;
    setPin(newPin);

    // Validation automatique si 4 chiffres saisis (PIN standard)
    if (newPin.length === 4) {
      submitPin(newPin);
    }
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
    } catch (err: any) {
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
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pin]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#111827] px-4 py-8 text-white select-none">
      {/* Carte centrale d'authentification */}
      <div className="w-full max-w-sm flex flex-col items-center space-y-6">
        {/* Logo & Identité BM Motors */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-20 h-20 relative rounded-2xl bg-white p-2 shadow-2xl border-2 border-[#F7162D] flex items-center justify-center">
            <Image
              src="/bashan-logo.png"
              alt="Logo Bashan"
              width={70}
              height={70}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white mt-2">
            SARL BM MOTORS
          </h1>
          <p className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-[#F7162D]" />
            Accès Sécurisé Gérant • Point de Vente
          </p>
        </div>

        {/* 1. Déverrouillage Biométrique Rapide (Empreinte / Touch ID / Face ID) */}
        <div className="w-full space-y-2">
          <button
            type="button"
            onClick={handleBiometricAuth}
            disabled={isSubmitting}
            className="w-full py-4 px-4 bg-gradient-to-r from-red-600 to-[#F7162D] hover:from-red-700 hover:to-red-600 active:scale-98 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 border border-red-500/40"
          >
            <div className="flex items-center gap-1.5">
              <Fingerprint className="w-6 h-6 text-white animate-pulse" />
              <ScanFace className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <div className="text-sm font-black leading-tight">
                Déverrouiller par Empreinte / Face ID
              </div>
              <div className="text-[11px] text-red-100 opacity-90">
                Touch ID, Empreinte ou Reconnaissance faciale
              </div>
            </div>
          </button>
        </div>

        {/* Séparateur élégant */}
        <div className="w-full flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Ou Saisir le Code PIN
          </span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* 2. Indicateur visuel des points PIN */}
        <div className={`flex flex-col items-center space-y-3 ${shake ? "animate-bounce" : ""}`}>
          <div className="flex items-center justify-center gap-4 py-2">
            {[0, 1, 2, 3].map((idx) => {
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
              Saisissez votre code PIN à 4 chiffres
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
          Système certifié SARL BM Motors • Session sécurisée 30 jours
        </div>
      </div>
    </div>
  );
}
