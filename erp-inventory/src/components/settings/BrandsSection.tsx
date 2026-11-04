"use client";

import { useEffect, useState } from "react";
import { Tags, PlusCircle, CheckCircle2, XCircle } from "lucide-react";
import { getBrands, saveBrand, setBrandActive, type BrandItem } from "@/lib/actions/brands";
import { unwrap } from "@/lib/action-result";
import { useToast } from "@/components/ui/ToastProvider";

/** Marques gérées (G14) : référentiel des marques produits, alimente le ProductModal. */
export function BrandsSection() {
  const toast = useToast();
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setBrands(unwrap(await getBrands()));
    } catch {
      /* section stays empty on error */
    }
  };
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      unwrap(await saveBrand({ name: name.trim() }));
      setName("");
      await load();
      toast.success("Marque ajoutée");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (b: BrandItem) => {
    try {
      unwrap(await setBrandActive(b.id, !b.isActive));
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
        <Tags size={18} className="text-[#F7162D]" />
        <div>
          <h3 className="text-sm font-bold text-gray-900">Marques gérées</h3>
          <p className="text-[11px] text-gray-500">
            Référentiel des marques produits — suggérées dans la fiche produit et le filtre catalogue.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Nouvelle marque (ex: HONDA, YAMAHA…)"
            className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#F7162D]"
            aria-label="Nouvelle marque"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#F7162D] hover:bg-[#D90E23] text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-all"
          >
            <PlusCircle size={14} />
            Ajouter
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {brands.length === 0 && (
            <span className="text-xs text-gray-400">Aucune marque enregistrée.</span>
          )}
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => toggle(b)}
              title={b.isActive ? "Désactiver" : "Réactiver"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                b.isActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : "bg-gray-100 text-gray-400 border-gray-200 line-through hover:bg-gray-200"
              }`}
            >
              {b.isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {b.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
