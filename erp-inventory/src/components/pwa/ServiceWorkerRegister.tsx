"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker BM Motors enregistré avec succès :", reg.scope);
        })
        .catch((err) => {
          console.error("[PWA] Échec enregistrement Service Worker :", err);
        });
    }
  }, []);

  return null;
}
