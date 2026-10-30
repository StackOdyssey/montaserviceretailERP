"use client";

import React, { useState } from "react";
import { User, X, Search, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  getCustomers,
  saveCustomer,
  findCustomerDuplicates,
} from "@/lib/actions/customers";
import { useCustomerSearch, type CustomerMatch } from "@/lib/hooks/useCustomerSearch";
import { formatMoney } from "@/lib/money";
import { unwrap } from "@/lib/action-result";

type SearchRow = CustomerMatch;

interface CustomerSelectProps {
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerIce: string;
  customerIsProfessional?: boolean;
  onClose: () => void;
  onSave: (data: {
    id: number | null;
    name: string;
    phone: string;
    city: string;
    ice: string;
    creditLimitCents: number | null;
    isProfessional: boolean;
  }) => void;
}

function normalizePhone(v: string): string {
  return v.trim().replace(/[\s.-]+/g, " ").replace(/^(\+212|00212)/, "0");
}

export function CustomerSelect({
  customerId,
  customerName,
  customerPhone,
  customerCity,
  customerIce,
  customerIsProfessional = false,
  onClose,
  onSave,
}: CustomerSelectProps) {
  const [id, setId] = useState<number | null>(customerId);
  const [name, setName] = useState(customerName);
  const [phone, setPhone] = useState(customerPhone);
  const [city, setCity] = useState(customerCity);
  const [ice, setIce] = useState(customerIce);
  const [isProfessional, setIsProfessional] = useState(customerIsProfessional);
  const [creditLimitCents, setCreditLimitCents] = useState<number | null>(null);

  // T1.1 — recherche debouncée (hook partagé avec /ventes/nouveau)
  const [searchTerm, setSearchTerm] = useState("");
  const {
    matches: searchResults,
    hasSearched,
    isSearching,
    error: searchError,
    clear: clearSearch,
  } = useCustomerSearch(searchTerm, { limit: 10, minLength: 1, debounceMs: 200 });

  const handleSearchChange = (v: string) => {
    setSearchTerm(v);
    if (!v.trim()) clearSearch();
  };

  // T1.2 — quick-create inline
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<
    Array<{ id: number; name: string; phone: string | null; ice: string | null }>
  >([]);
  const [createdOk, setCreatedOk] = useState<string | null>(null);

  const handleSelectCustomer = (customer: SearchRow) => {
    setId(customer.id);
    setName(customer.name);
    setPhone(customer.phone || "");
    setCity(customer.city || "Casablanca");
    setIce(customer.ice || "");
    setIsProfessional(customer.isProfessional ?? false);
    setCreditLimitCents(customer.creditLimitCents ?? null);
    setDuplicates([]);
    setCreateError(null);
    setCreatedOk(null);
    setSearchTerm("");
    clearSearch();
    // Sélection directe : pas besoin de redescendre sur « Confirmer le client ».
    onSave({
      id: customer.id,
      name: customer.name,
      phone: customer.phone || "",
      city: customer.city || "Casablanca",
      ice: customer.ice || "",
      creditLimitCents: customer.creditLimitCents ?? null,
      isProfessional: customer.isProfessional ?? false,
    });
  };

  const handleQuickCreate = async () => {
    const cleanName = name.trim().replace(/\s+/g, " ");
    const cleanPhone = normalizePhone(phone);
    const cleanCity = city.trim() || "Casablanca";
    const cleanIce = ice.trim();

    if (!cleanName) {
      setCreateError("Le nom du client est obligatoire.");
      return;
    }
    if (!cleanPhone) {
      setCreateError("Le téléphone est obligatoire pour créer une fiche (anti-doublon).");
      return;
    }
    if (isProfessional && !/^\d{15}$/.test(cleanIce)) {
      setCreateError("ICE à 15 chiffres requis pour un client professionnel.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    setDuplicates([]);
    setCreatedOk(null);
    try {
      const created = unwrap(await saveCustomer({
        name: cleanName,
        phone: cleanPhone,
        city: cleanCity,
        ice: cleanIce || undefined,
        isProfessional,
      }));
      setId(created.id);
      setName(created.name);
      setPhone(created.phone || cleanPhone);
      setCity(created.city || cleanCity);
      setIce(created.ice || "");
      setIsProfessional(created.isProfessional ?? isProfessional);
      setCreditLimitCents(created.creditLimitCents ?? null);
      setCreatedOk(`Fiche #${created.id} créée — client sélectionné.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Création impossible";
      setCreateError(msg);
      if (msg.includes("Doublon potentiel")) {
        try {
          const dups = await findCustomerDuplicates({
            name: cleanName,
            phone: cleanPhone,
            ice: cleanIce || undefined,
          });
          setDuplicates(dups.slice(0, 5));
        } catch {
          // ignore, message principal suffit
        }
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = () => {
    onSave({
      id,
      name: name.trim() || "Client Comptoir Particulier",
      phone: phone.trim(),
      city: city.trim() || "Casablanca",
      ice: ice.trim(),
      creditLimitCents,
      isProfessional,
    });
  };

  const showEmptyState = hasSearched && !isSearching && searchResults.length === 0 && searchTerm.trim();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={20} className="text-[#F7162D]" />
            <h2 className="font-bold text-gray-900">Client</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {id != null && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>
                Fiche sélectionnée : <strong>{name}</strong> (#{id})
                {isProfessional ? " — Professionnel" : " — Particulier"}
              </span>
              <button
                onClick={() => {
                  setId(null);
                  setCreditLimitCents(null);
                }}
                className="ml-auto text-emerald-700 underline"
              >
                Retirer
              </button>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700">
              Rechercher un client existant (nom, tél, ville, ICE)
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input id="searchTerm" name="searchTerm" aria-label="Rechercher un client existant"
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Ex : Bennani, 06…, Casablanca, ICE…"
                className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D]"
              />
            </div>

            {isSearching && <div className="text-xs text-gray-500 px-1">Recherche…</div>}
            {searchError && <div className="text-xs text-red-600 px-1">{searchError}</div>}

            {searchResults.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                {searchResults.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    className="w-full p-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-semibold text-sm text-gray-900">
                      {customer.name}
                      <span className="ml-2 text-[10px] font-bold text-gray-400">#{customer.id}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {customer.phone && <span>Tél: {customer.phone}</span>}
                      {customer.city && <span> • {customer.city}</span>}
                      {customer.ice && <span> • ICE: {customer.ice}</span>}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Solde dû :{" "}
                      <strong>
                        {formatMoney(
                          (customer as SearchRow & { balanceDueCents?: number }).balanceDueCents ?? 0
                        )}
                      </strong>
                      {customer.creditLimitCents != null && (
                        <span> • Plafond : {formatMoney(customer.creditLimitCents)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showEmptyState && (
              <div className="text-xs text-gray-500 px-1">
                Aucun client trouvé pour « {searchTerm.trim()} ». Créez-le ci-dessous sans quitter la caisse.
              </div>
            )}
          </div>

          <div className="space-y-3 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700">
                Fiche client (sélectionnée ou à créer)
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input id="isProfessional" name="isProfessional" aria-label="Client professionnel"
                  type="checkbox"
                  checked={isProfessional}
                  onChange={(e) => setIsProfessional(e.target.checked)}
                  className="accent-[#F7162D]"
                />
                Professionnel (ICE requis)
              </label>
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block">Nom du client *</label>
              <input id="name" name="name" aria-label="Nom du client"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Client Comptoir Particulier"
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Téléphone * (création)</label>
                <input id="phone" name="phone" aria-label="Téléphone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="06…"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D]"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Ville</label>
                <input id="city" name="city" aria-label="Ville"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Casablanca"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block">
                ICE {isProfessional ? "*" : "(si professionnel)"}
              </label>
              <input id="ice" name="ice" aria-label="ICE (15 chiffres)"
                type="text"
                value={ice}
                onChange={(e) => setIce(e.target.value)}
                placeholder="15 chiffres"
                inputMode="numeric"
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D] font-mono"
              />
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                <div className="text-xs text-red-700">{createError}</div>
              </div>
            )}
            {createdOk && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                {createdOk}
              </div>
            )}

            {duplicates.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
                <div className="text-xs font-bold text-amber-800">
                  Client peut-être déjà existant — sélectionnez plutôt que créer un doublon :
                </div>
                {duplicates.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 text-gray-700">
                      <strong>{d.name}</strong> (#{d.id}){d.phone ? ` • ${d.phone}` : ""}
                    </span>
                    <button
                      onClick={async () => {
                        const rows = await getCustomers(d.name);
                        const full = rows.find((r) => r.id === d.id);
                        if (full) handleSelectCustomer(full);
                      }}
                      className="px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg font-bold text-amber-800 hover:bg-amber-100"
                    >
                      Sélectionner
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleQuickCreate}
              disabled={isCreating}
              className="w-full px-4 py-2.5 bg-gray-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              {isCreating ? "Création…" : id == null ? "Créer la fiche sans quitter la caisse" : "Recréer / mettre à jour via fiche"}
            </button>
            <p className="text-[11px] text-gray-500">
              Sans fiche : vente au comptoir en espèces uniquement. FACTURE, crédit et chèque exigent une fiche.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 bg-[#F7162D] hover:bg-[#D90E23] text-white font-semibold rounded-lg transition-colors"
          >
            {id == null ? "Utiliser sans fiche (comptoir)" : "Confirmer le client"}
          </button>
        </div>
      </div>
    </div>
  );
}
