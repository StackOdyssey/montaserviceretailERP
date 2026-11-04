"use client";

import { useEffect, useState } from "react";
import { Warehouse, PlusCircle, Star, Pencil } from "lucide-react";
import { getWarehouses, saveWarehouse, type WarehouseItem } from "@/lib/actions/warehouses";
import { unwrap } from "@/lib/action-result";
import { useToast } from "@/components/ui/ToastProvider";

/** Entrepôts gérés (G18) : ajout / renommage — le stock par entrepôt suit `product_stock`. */
export function WarehousesSection() {
  const toast = useToast();
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setWarehouses(unwrap(await getWarehouses()));
    } catch {
      /* section stays empty on error */
    }
  };
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      unwrap(await saveWarehouse({ id: editingId ?? undefined, name: name.trim() }));
      setName("");
      setEditingId(null);
      await load();
      toast.success(editingId ? "Entrepôt renommé" : "Entrepôt ajouté");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
        <Warehouse size={18} className="text-[#7C3AED]" />
        <div>
          <h3 className="text-sm font-bold text-gray-900">Entrepôts</h3>
          <p className="text-[11px] text-gray-500">
            Lieux de stockage (Principal, Mobile, camion de livraison…) — utilisés par le filtre stock et les transferts.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder={editingId ? "Renommer l'entrepôt…" : "Nouvel entrepôt (ex: Camion 2, Boutique annex…)"}
            className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#7C3AED]"
            aria-label="Nom d'entrepôt"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-all"
          >
            <PlusCircle size={14} />
            {editingId ? "Renommer" : "Ajouter"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setName(""); }}
              className="px-3 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
            >
              Annuler
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {warehouses.length === 0 && (
            <span className="text-xs text-gray-400">Aucun entrepôt enregistré.</span>
          )}
          {warehouses.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => { setEditingId(w.id); setName(w.name); }}
              title="Renommer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 transition-all"
            >
              {w.isDefault ? <Star size={12} className="fill-current" /> : <Pencil size={12} />}
              {w.name}
              {w.isDefault && <span className="text-[9px] font-semibold opacity-70">(défaut)</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
