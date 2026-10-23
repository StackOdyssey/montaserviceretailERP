"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, PackageCheck, Search, CheckCircle2 } from "lucide-react";
import {
  SupplierItem,
  createSupplierReceipt,
  findSupplierDuplicates,
  getSuppliers,
  saveSupplier,
} from "@/lib/actions/suppliers";
import { getProducts, ProductItem } from "@/lib/actions/products";
import { formatMoney, toCentimes } from "@/lib/money";
import { useSettings } from "@/components/layout/SettingsProvider";
import { effectiveVatRate } from "@/lib/vat-regime";
import { unwrap } from "@/lib/action-result";

interface SupplierReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  suppliers: SupplierItem[];
  preselectedSupplierId?: number;
  /** Régime global : false = réception sans TVA (coûts TTC). Défaut true. */
  vatLiable?: boolean;
}

interface ReceiptLineState {
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitCostDh: string;
}

export function SupplierReceiptModal({
  isOpen,
  onClose,
  onSaved,
  suppliers,
  preselectedSupplierId,
  vatLiable = true,
}: SupplierReceiptModalProps) {
  const { defaultVatRate } = useSettings();
  // T2.1 — sélection recherchable, jamais d'anonyme (null = à sélectionner/créer)
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(
    preselectedSupplierId ?? suppliers[0]?.id ?? null
  );
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierResults, setSupplierResults] = useState<SupplierItem[]>([]);
  const [isSearchingSuppliers, setIsSearchingSuppliers] = useState(false);
  const [localSuppliers, setLocalSuppliers] = useState<SupplierItem[]>(suppliers);

  // T2.2 — quick-create inline
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [qcName, setQcName] = useState("");
  const [qcContact, setQcContact] = useState("");
  const [qcPhone, setQcPhone] = useState("");
  const [qcCity, setQcCity] = useState("");
  const [qcIce, setQcIce] = useState("");
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
  const [qcDuplicates, setQcDuplicates] = useState<SupplierItem[]>([]);

  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [catalog, setCatalog] = useState<ProductItem[]>([]);
  const [lines, setLines] = useState<ReceiptLineState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync externe : la liste parent peut se recharger (loadData après création).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalSuppliers(suppliers);
  }, [suppliers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (preselectedSupplierId != null) setSelectedSupplierId(preselectedSupplierId);
  }, [preselectedSupplierId, isOpen]);

  const handleSupplierSearchChange = (v: string) => {
    setSupplierSearch(v);
    if (!v.trim()) {
      setSupplierResults([]);
      setIsSearchingSuppliers(false);
    } else {
      setIsSearchingSuppliers(true);
    }
  };

  // Recherche fournisseurs debouncée (nom, contact, tél, ville)
  useEffect(() => {
    const term = supplierSearch.trim();
    if (!term) return;
    const timer = setTimeout(async () => {
      try {
        const rows = await getSuppliers(term);
        setSupplierResults(rows.slice(0, 10));
      } catch {
        setSupplierResults([]);
      } finally {
        setIsSearchingSuppliers(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [supplierSearch]);

  // Charger le catalogue pour sélection des pièces
  useEffect(() => {
    getProducts()
      .then((res) => setCatalog(res))
      .catch(() => setCatalog([]));
  }, []);

  // Initialiser avec une première ligne dès que le catalogue est chargé
  useEffect(() => {
    if (catalog.length > 0 && lines.length === 0) {
      const first = catalog[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLines([
        {
          productId: first.id,
          productName: first.name,
          sku: first.sku,
          quantity: 10,
          unitCostDh: (first.purchasePriceCents / 100).toFixed(2),
        },
      ]);
    }
  }, [catalog, lines.length, isOpen]);

  if (!isOpen) return null;

  const selectedSupplier =
    localSuppliers.find((s) => s.id === selectedSupplierId) ??
    supplierResults.find((s) => s.id === selectedSupplierId) ??
    null;

  const handleSelectSupplier = (s: SupplierItem) => {
    setSelectedSupplierId(s.id);
    if (!localSuppliers.some((x) => x.id === s.id)) {
      setLocalSuppliers((prev) => [s, ...prev]);
    }
    setSupplierResults([]);
    setSupplierSearch("");
    setError(null);
  };

  const handleQuickCreateSupplier = async () => {
    const cleanName = qcName.trim().replace(/\s+/g, " ");
    if (!cleanName) {
      setError("Le nom du fournisseur est obligatoire pour créer la fiche.");
      return;
    }
    setIsCreatingSupplier(true);
    setError(null);
    setQcDuplicates([]);
    try {
      // T2.4 — proposition anti-doublon (non bloquante) via helper dédié.
      const dups = await findSupplierDuplicates({
        name: cleanName,
        phone: qcPhone.trim() || undefined,
        ice: qcIce.trim() || undefined,
      });
      if (dups.length > 0) {
        setQcDuplicates(
          dups.slice(0, 5).map((d) => ({
            id: d.id,
            name: d.name,
            contactName: null,
            phone: d.phone,
            email: null,
            city: d.city,
            ice: d.ice,
            isActive: true,
            externalRef: null,
            notes: null,
            createdAt: new Date().toISOString(),
          }))
        );
        setError("Fournisseur peut-être déjà existant — sélectionnez-le plutôt que créer un doublon.");
        return;
      }
      const created = unwrap(await saveSupplier({
        name: cleanName,
        contactName: qcContact.trim() || undefined,
        phone: qcPhone.trim() || undefined,
        city: qcCity.trim() || undefined,
        ice: qcIce.trim() || undefined,
      }));
      setLocalSuppliers((prev) => [created, ...prev]);
      setSelectedSupplierId(created.id);
      setShowQuickCreate(false);
      setQcName("");
      setQcContact("");
      setQcPhone("");
      setQcCity("");
      setQcIce("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Création fournisseur impossible.");
    } finally {
      setIsCreatingSupplier(false);
    }
  };

  const handleAddLine = () => {
    if (catalog.length === 0) return;
    const prod = catalog[0];
    setLines((prev) => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        quantity: 10,
        unitCostDh: (prod.purchasePriceCents / 100).toFixed(2),
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductChange = (index: number, productId: number) => {
    const found = catalog.find((p) => p.id === productId);
    if (!found) return;

    setLines((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              ...l,
              productId: found.id,
              productName: found.name,
              sku: found.sku,
              unitCostDh: (found.purchasePriceCents / 100).toFixed(2),
            }
          : l
      )
    );
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, qty) } : l))
    );
  };

  const handleCostChange = (index: number, cost: string) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, unitCostDh: cost } : l))
    );
  };

  // Calcul des totaux en direct
  let totalHtCents = 0;
  for (const line of lines) {
    const costDh = parseFloat(line.unitCostDh.replace(",", ".")) || 0;
    const costCents = toCentimes(costDh);
    totalHtCents += costCents * line.quantity;
  }
  const tvaRate = effectiveVatRate(defaultVatRate, vatLiable);
  const tvaAmountCents = Math.round((totalHtCents * tvaRate) / 100);
  const totalTtcCents = totalHtCents + tvaAmountCents;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      setError("Veuillez ajouter au moins une pièce à la réception.");
      return;
    }
    // T2.2 — BR impossible sans fiche fournisseur
    if (selectedSupplierId == null) {
      setError("Sélectionnez ou créez la fiche fournisseur avant de valider la réception.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const processedLines = lines.map((l) => {
        const costDh = parseFloat(l.unitCostDh.replace(",", ".")) || 0;
        return {
          productId: l.productId,
          productName: l.productName,
          sku: l.sku,
          quantity: l.quantity,
          unitCostCents: toCentimes(costDh),
        };
      });

      unwrap(await createSupplierReceipt({
        supplierId: selectedSupplierId,
        supplierInvoiceNumber: supplierInvoiceNumber.trim() || undefined,
        lines: processedLines,
        notes: notes.trim() || undefined,
      }));

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la réception du stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Nouvel Arrivage • Bon de Réception (BR)
              </h3>
              <p className="text-xs text-gray-500">
                Alimente automatiquement le stock physique des pièces sélectionnées
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulaire défilable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Fournisseur <span className="text-[#F7162D]">*</span>
              </label>
              {selectedSupplier ? (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 dark:text-white">
                      {selectedSupplier.name}
                    </div>
                    <div className="text-gray-500">
                      {selectedSupplier.city ?? ""}{" "}
                      {(selectedSupplier.balanceDueCents ?? 0) > 0
                        ? `• Dette ${formatMoney(selectedSupplier.balanceDueCents ?? 0)}`
                        : "• Soldé"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSupplierId(null)}
                    className="text-emerald-700 underline"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={(e) => handleSupplierSearchChange(e.target.value)}
                      placeholder="Rechercher nom, contact, tél, ville…"
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
                    />
                  </div>
                  {isSearchingSuppliers && (
                    <div className="text-xs text-gray-500 mt-1">Recherche…</div>
                  )}
                  {supplierResults.length > 0 && (
                    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                      {supplierResults.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectSupplier(s)}
                          className="w-full p-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                        >
                          <div className="font-bold text-xs text-gray-900 dark:text-white">
                            {s.name}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {s.city ?? ""}{" "}
                            {(s.balanceDueCents ?? 0) > 0
                              ? `• Dette ${formatMoney(s.balanceDueCents ?? 0)}`
                              : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {supplierSearch.trim() && !isSearchingSuppliers && supplierResults.length === 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Aucun fournisseur trouvé — créez-le ci-dessous sans quitter.
                    </div>
                  )}
                  {/* Repli liste initiale */}
                  {!supplierSearch.trim() && (
                    <select
                      value={selectedSupplierId ?? ""}
                      onChange={(e) =>
                        setSelectedSupplierId(e.target.value ? Number(e.target.value) : null)
                      }
                      className="mt-2 w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
                    >
                      <option value="">— Choisir dans la liste —</option>
                      {localSuppliers.slice(0, 100).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.city ? `(${s.city})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => setShowQuickCreate((v) => !v)}
                className="mt-2 px-3 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {showQuickCreate ? "Masquer la création" : "Nouveau fournisseur ici"}
              </button>

              {showQuickCreate && (
                <div className="mt-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 space-y-2">
                  <input
                    type="text"
                    value={qcName}
                    onChange={(e) => setQcName(e.target.value)}
                    placeholder="Nom fournisseur *"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={qcContact}
                      onChange={(e) => setQcContact(e.target.value)}
                      placeholder="Contact commercial"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs"
                    />
                    <input
                      type="tel"
                      value={qcPhone}
                      onChange={(e) => setQcPhone(e.target.value)}
                      placeholder="Téléphone"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={qcCity}
                      onChange={(e) => setQcCity(e.target.value)}
                      placeholder="Ville"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      value={qcIce}
                      onChange={(e) => setQcIce(e.target.value)}
                      placeholder="ICE"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-mono"
                    />
                  </div>
                  {qcDuplicates.length > 0 && (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] space-y-1">
                      <div className="font-bold text-amber-800">Déjà existant ? Sélectionnez :</div>
                      {qcDuplicates.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            handleSelectSupplier(d);
                            setShowQuickCreate(false);
                            setQcDuplicates([]);
                          }}
                          className="w-full text-left px-2 py-1.5 bg-white border border-amber-300 rounded-lg font-bold text-amber-800"
                        >
                          {d.name} {d.city ? `(${d.city})` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleQuickCreateSupplier}
                    disabled={isCreatingSupplier}
                    className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    {isCreatingSupplier ? "Création…" : "Créer et sélectionner"}
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                N° Facture / BL Fournisseur
              </label>
              <input
                type="text"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                placeholder="Ex: FAC-DO-8892 ou BSH-2026-09"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
              />
            </div>
          </div>

          {/* Tableau des lignes reçues */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Articles Reçus en Stock ({lines.length})
              </label>
              <button
                type="button"
                onClick={handleAddLine}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter une pièce
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => {
                const cost = parseFloat(line.unitCostDh.replace(",", ".")) || 0;
                const totalLineDh = cost * line.quantity;
                return (
                  <div
                    key={index}
                    className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-start sm:items-center gap-3"
                  >
                    <div className="flex-1 w-full">
                      <select
                        value={line.productId}
                        onChange={(e) => handleProductChange(index, Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold"
                      >
                        {catalog.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} [{p.sku}]
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="w-20">
                        <label className="block text-[10px] text-gray-400 font-semibold mb-0.5">
                          Qté Reçue
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                          className="w-full px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-center"
                        />
                      </div>

                      <div className="w-28">
                        <label className="block text-[10px] text-gray-400 font-semibold mb-0.5">
                          P.U. Achat HT
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={line.unitCostDh}
                            onChange={(e) => handleCostChange(index, e.target.value)}
                            className="w-full pl-2 pr-6 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-right"
                          />
                          <span className="absolute right-1.5 top-1 text-[10px] text-gray-400">DH</span>
                        </div>
                      </div>

                      <div className="w-28 text-right hidden sm:block">
                        <label className="block text-[10px] text-gray-400 font-semibold mb-0.5">
                          Total HT
                        </label>
                        <span className="text-xs font-black text-gray-900 dark:text-white">
                          {totalLineDh.toFixed(2)} DH
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveLine(index)}
                        disabled={lines.length <= 1}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg disabled:opacity-30 transition mt-3 sm:mt-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Synthèse des montants */}
          <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>Total Réception HT :</span>
              <span className="font-bold text-gray-900 dark:text-white">{formatMoney(totalHtCents)}</span>
            </div>
            {tvaRate > 0 && (
              <div className="flex justify-between text-gray-600 dark:text-gray-300">
                <span>TVA ({tvaRate}%) :</span>
                <span className="font-bold text-gray-900 dark:text-white">{formatMoney(tvaAmountCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-blue-900 dark:text-blue-300 pt-1 border-t border-blue-200 dark:border-blue-800">
              <span>Total Facturé TTC :</span>
              <span className="text-base text-[#F7162D]">{formatMoney(totalTtcCents)}</span>
            </div>
          </div>

          {/* Remarques */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Notes de réception
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Arrivage conteneur Tanger Med, pièces contrôlées conformes"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#F7162D]"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedSupplierId == null}
              title={selectedSupplierId == null ? "Fiche fournisseur requise" : undefined}
              className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? "Validation..." : "Valider l'entrée en stock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
