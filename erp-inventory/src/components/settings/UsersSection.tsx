"use client";

import { useEffect, useState } from "react";
import { UserPlus, ShieldCheck, UserX, UserCheck, KeyRound } from "lucide-react";
import { getUsers, saveUser, setUserActive, type UserItem } from "@/lib/actions/users";

/**
 * Gestion des utilisateurs caisse (gérant uniquement, section Sécurité).
 * Chaque utilisateur a son propre PIN — toutes ses actions sont attribuées
 * nommément dans le journal des opérations.
 */
export function UsersSection() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"GERANT" | "CAISSIER">("CAISSIER");
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [resetPin, setResetPin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setUsers(await getUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveUser({ displayName: name.trim(), pin: pin.trim(), role });
      setName("");
      setPin("");
      setRole("CAISSIER");
      setNotice("Utilisateur créé.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la création.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPin = async (u: UserItem) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveUser({ id: u.id, displayName: u.displayName, pin: resetPin.trim(), role: u.role });
      setResetFor(null);
      setResetPin("");
      setNotice(`PIN réinitialisé pour ${u.displayName}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la réinitialisation.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (u: UserItem) => {
    setError(null);
    setNotice(null);
    try {
      await setUserActive(u.id, !u.isActive);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du changement d'état.");
    }
  };

  return (
    <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#F7162D]" />
            Utilisateurs caisse (PIN individuels)
          </span>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Chaque employé a son propre code : toutes ses actions (ventes, encaissements, ajustements)
            sont signées à son nom dans le journal. Le rôle <span className="font-bold">Caissier</span> ne
            peut ni modifier les paramètres, ni annuler des documents, ni gérer les utilisateurs.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      {/* Liste */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <p className="text-xs text-gray-400 p-4">Chargement…</p>
        ) : users.length === 0 ? (
          <p className="text-xs text-gray-400 p-4">
            Aucun utilisateur nommé — seule la clé maîtresse ADMIN_PIN est active. Créez les comptes
            des employés ci-dessous.
          </p>
        ) : (
          users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${u.isActive ? "bg-emerald-500" : "bg-gray-300"}`}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-gray-900 dark:text-white block truncate">
                  {u.displayName}
                </span>
                <span className="text-[11px] text-gray-400">
                  {u.role === "GERANT" ? "Gérant — tous droits" : "Caissier — opérations quotidiennes"}
                </span>
              </div>
              {resetFor === u.id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="Nouveau PIN"
                    value={resetPin}
                    onChange={(e) => setResetPin(e.target.value)}
                    className="w-28 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg font-mono"
                  />
                  <button
                    type="button"
                    disabled={saving || !/^\d{4,8}$/.test(resetPin.trim())}
                    onClick={() => handleResetPin(u)}
                    className="px-2.5 py-1.5 text-[11px] font-bold text-white bg-[#111827] rounded-lg disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetFor(null);
                      setResetPin("");
                    }}
                    className="px-2 py-1.5 text-[11px] font-bold text-gray-500"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setResetFor(u.id)}
                    className="p-1.5 text-gray-400 hover:text-[#111827] rounded-lg"
                    title="Réinitialiser le PIN"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(u)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${
                      u.isActive
                        ? "text-red-600 bg-red-50 hover:bg-red-100"
                        : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    }`}
                  >
                    {u.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    {u.isActive ? "Désactiver" : "Réactiver"}
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Création */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_auto] gap-2.5 items-end">
        <div>
          <label className="text-[11px] font-bold text-gray-500 block mb-1">Nom affiché</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Youssef, Fatima…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-[#F8F9FA]"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 block mb-1">PIN (4-8 chiffres)</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-[#F8F9FA] font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 block mb-1">Rôle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "GERANT" | "CAISSIER")}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-[#F8F9FA] font-semibold"
          >
            <option value="CAISSIER">Caissier</option>
            <option value="GERANT">Gérant</option>
          </select>
        </div>
        <button
          type="button"
          disabled={saving || !name.trim() || !/^\d{4,8}$/.test(pin.trim())}
          onClick={handleCreate}
          className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#F7162D] hover:bg-[#d81023] rounded-xl shadow-xs disabled:opacity-40 transition"
        >
          <UserPlus className="w-4 h-4" />
          Créer
        </button>
      </div>
    </div>
  );
}
