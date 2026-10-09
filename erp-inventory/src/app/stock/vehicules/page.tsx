"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Car, PlusCircle, Trash2, RefreshCw } from "lucide-react";
import {
  createStockUnit,
  deleteStockUnit,
  getSerializedProducts,
  getStockUnits,
  updateStockUnit,
  type SerializedProductDTO,
  type StockUnitDTO,
  type UnitStatus,
} from "@/lib/actions/stock-units";
import { saveProduct } from "@/lib/actions/products";
import { useBusinessLine } from "@/components/layout/BusinessLineProvider";
import { formatMoney } from "@/lib/money";

const STATUSES: UnitStatus[] = ["IN_STOCK", "RESERVED", "SOLD", "RETURNED"];
const STATUS_LABEL: Record<string, string> = {
  IN_STOCK: "En stock",
  RESERVED: "Réservé",
  SOLD: "Vendu",
  RETURNED: "Retourné",
};

export default function VehiclesPage() {
  const { activeCode, setActiveCode, lines } = useBusinessLine();
  const vehiclesLine = lines.find((l) => l.code === "VEHICULES");
  const [products, setProducts] = useState<SerializedProductDTO[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [units, setUnits] = useState<StockUnitDTO[]>([]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [newProduct, setNewProduct] = useState({ sku: "", name: "", brand: "", salePriceDH: "" });
  const [newUnit, setNewUnit] = useState({ serialNo: "", engineNo: "", colour: "", modelYear: "", unitCostDH: "" });

  const loadProducts = (openId?: number) => {
    startTransition(async () => {
      const list = await getSerializedProducts("VEHICULES");
      setProducts(list);
      const id = openId ?? selectedId ?? list[0]?.id ?? null;
      setSelectedId(id);
      setUnits(id ? await getStockUnits({ productId: id }) : []);
    });
  };

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectProduct = (id: number) => {
    setSelectedId(id);
    startTransition(async () => {
      setUnits(await getStockUnits({ productId: id }));
    });
  };

  const handleCreateProduct = () => {
    if (!newProduct.sku.trim() || !newProduct.name.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const p = await saveProduct({
        sku: newProduct.sku,
        name: newProduct.name,
        brand: newProduct.brand || undefined,
        purchasePriceCents: 0,
        salePriceRetailCents: Math.round((Number(newProduct.salePriceDH) || 0) * 100),
        minStockAlert: 0,
        currentStock: 0,
        businessLineCode: "VEHICULES",
        isSerialized: true,
      });
      setNewProduct({ sku: "", name: "", brand: "", salePriceDH: "" });
      setMessage(`Véhicule "${p.name}" créé.`);
      loadProducts(p.id);
    });
  };

  const handleAddUnit = () => {
    if (!selectedId || !newUnit.serialNo.trim()) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await createStockUnit({
          productId: selectedId,
          serialNo: newUnit.serialNo,
          engineNo: newUnit.engineNo || undefined,
          colour: newUnit.colour || undefined,
          modelYear: newUnit.modelYear ? Number(newUnit.modelYear) : undefined,
          unitCostCents: Math.round((Number(newUnit.unitCostDH) || 0) * 100),
        });
        setNewUnit({ serialNo: "", engineNo: "", colour: "", modelYear: "", unitCostDH: "" });
        loadProducts(selectedId);
      } catch (e) {
        setMessage((e as Error).message);
      }
    });
  };

  const changeStatus = (id: number, status: UnitStatus) => {
    startTransition(async () => {
      await updateStockUnit({ id, status });
      loadProducts();
    });
  };

  const removeUnit = (id: number) => {
    startTransition(async () => {
      await deleteStockUnit(id);
      loadProducts();
    });
  };

  const selected = products.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 md:p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE]/50">
          <Car size={14} /> Quads & Buggy — unités sérialisées
        </span>
        <h1 className="text-xl md:text-2xl font-bold text-[#111827] mt-1.5 tracking-tight">
          Véhicules & Numéros de Châssis
        </h1>
        <p className="text-sm text-[#4B5563] mt-0.5">
          Chaque véhicule est une unité sérialisée (châssis/VIN). Le stock du modèle = nombre d&apos;unités en stock.
        </p>
        {activeCode !== "VEHICULES" && (
          <button
            onClick={() => setActiveCode("VEHICULES")}
            className="mt-3 text-xs font-bold text-white bg-[#4338CA] hover:bg-[#3730A3] px-3.5 py-2 rounded-xl"
          >
            Basculer sur {vehiclesLine?.displayName ?? "Quads & Buggy"}
          </button>
        )}
      </div>

      {message && (
        <div className="text-xs font-semibold text-[#065F46] bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl px-4 py-3">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Modèles sérialisés + création */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-[#111827]">Modèles</span>
              <button onClick={() => loadProducts()} className="text-[#6B7280] hover:text-[#111827]" title="Rafraîchir">
                <RefreshCw size={14} />
              </button>
            </div>
            {products.length === 0 ? (
              <div className="p-6 text-xs text-[#6B7280]">Aucun modèle sérialisé. Créez-en un ci-dessous.</div>
            ) : (
              <ul className="divide-y divide-[#E5E7EB]">
                {products.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => selectProduct(p.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-[#F8F9FA] ${selectedId === p.id ? "bg-[#F5F3FF]" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[#111827]">{p.sku}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669]">
                          {p.currentStock} en stock
                        </span>
                      </div>
                      <div className="text-[11px] text-[#374151] line-clamp-1 mt-0.5">{p.name}</div>
                      <div className="text-[11px] text-[#6B7280]">{formatMoney(p.salePriceHtCents)} HT</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs p-4 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[#111827]">Nouveau modèle</span>
            <input value={newProduct.sku} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} placeholder="Réf SKU" className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none" />
            <input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Désignation (ex: Quad Bashan 250cc)" className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none" />
            <div className="flex gap-2">
              <input value={newProduct.brand} onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })} placeholder="Marque" className="w-1/2 px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none" />
              <input value={newProduct.salePriceDH} onChange={(e) => setNewProduct({ ...newProduct, salePriceDH: e.target.value })} placeholder="Prix HT (DH)" type="number" className="w-1/2 px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none" />
            </div>
            <button onClick={handleCreateProduct} disabled={isPending} className="w-full flex items-center justify-center gap-2 bg-[#F7162D] hover:bg-[#D90E23] disabled:opacity-60 text-white text-xs font-bold px-4 py-2.5 rounded-xl">
              <PlusCircle size={15} /> Créer le modèle
            </button>
          </div>
        </div>

        {/* Unités du modèle sélectionné */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          {!selected ? (
            <div className="p-12 text-center text-xs text-[#6B7280]">Sélectionnez un modèle.</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-[#E5E7EB]">
                <span className="font-mono text-sm font-bold text-[#111827]">{selected.sku}</span>
                <span className="ml-2 text-xs text-[#6B7280]">{selected.name}</span>
              </div>

              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#F8F9FA]">
                    <tr className="border-b border-[#E5E7EB] text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Châssis / VIN</th>
                      <th className="py-2.5 px-3">Moteur</th>
                      <th className="py-2.5 px-3">Couleur</th>
                      <th className="py-2.5 px-3 text-center">Année</th>
                      <th className="py-2.5 px-3 text-right">Coût</th>
                      <th className="py-2.5 px-3 text-center">Statut</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB] text-xs">
                    {units.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 px-3 text-center text-[#6B7280]">Aucune unité pour ce modèle.</td>
                      </tr>
                    ) : (
                      units.map((u) => (
                        <tr key={u.id} className="hover:bg-[#F8F9FA]">
                          <td className="py-2 px-3 font-mono font-bold text-[#111827]">{u.serialNo}</td>
                          <td className="py-2 px-3 text-[#374151]">{u.engineNo || "—"}</td>
                          <td className="py-2 px-3 text-[#374151]">{u.colour || "—"}</td>
                          <td className="py-2 px-3 text-center text-[#6B7280]">{u.modelYear ?? "—"}</td>
                          <td className="py-2 px-3 text-right text-[#6B7280]">{formatMoney(u.unitCostCents)}</td>
                          <td className="py-2 px-3 text-center">
                            <select
                              value={u.status}
                              onChange={(e) => changeStatus(u.id, e.target.value as UnitStatus)}
                              className="px-2 py-1 text-[11px] font-semibold border border-[#E5E7EB] rounded-lg outline-none"
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button onClick={() => removeUnit(u.id)} title="Supprimer" className="p-1.5 text-[#F7162D] hover:bg-[#FEF2F2] rounded-lg">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-[#E5E7EB] space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-[#111827]">Ajouter une unité</span>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <input value={newUnit.serialNo} onChange={(e) => setNewUnit({ ...newUnit, serialNo: e.target.value })} placeholder="Châssis / VIN *" className="col-span-2 md:col-span-1 px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none" />
                  <input value={newUnit.engineNo} onChange={(e) => setNewUnit({ ...newUnit, engineNo: e.target.value })} placeholder="N° moteur" className="px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none" />
                  <input value={newUnit.colour} onChange={(e) => setNewUnit({ ...newUnit, colour: e.target.value })} placeholder="Couleur" className="px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none" />
                  <input value={newUnit.modelYear} onChange={(e) => setNewUnit({ ...newUnit, modelYear: e.target.value })} placeholder="Année" type="number" className="px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none" />
                  <input value={newUnit.unitCostDH} onChange={(e) => setNewUnit({ ...newUnit, unitCostDH: e.target.value })} placeholder="Coût HT (DH)" type="number" className="px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:border-[#F7162D] outline-none" />
                </div>
                <button onClick={handleAddUnit} disabled={isPending} className="flex items-center gap-2 bg-[#059669] hover:bg-[#047857] disabled:opacity-60 text-white text-xs font-bold px-4 py-2.5 rounded-xl">
                  <PlusCircle size={15} /> Enregistrer l&apos;unité
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
