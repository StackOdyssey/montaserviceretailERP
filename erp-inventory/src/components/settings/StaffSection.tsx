"use client";

import { useEffect, useState } from "react";
import { UserPlus, Users, Truck } from "lucide-react";
import { getStaff, saveStaff, setStaffActive, type StaffItem } from "@/lib/actions/staff";
import { unwrap } from "@/lib/action-result";
import { useToast } from "@/components/ui/ToastProvider";

/** Commerciaux & livreurs : attribution des documents (pas de compte de connexion). */
export function StaffSection() {
  const toast = useToast();
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"COMMERCIAL" | "LIVREUR">("COMMERCIAL");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setStaff(unwrap(await getStaff()));
    } catch {
      /* non-owner: section stays empty */
    }
  };
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      unwrap(await saveStaff({ name: name.trim(), role }));
      setName("");
      await load();
      toast.success(`${role === "LIVREUR" ? "Livreur" : "Commercial"} ajouté`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (s: StaffItem) => {
    try {
      unwrap(await setStaffActive(s.id, !s.isActive));
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const commerciaux = staff.filter((s) => s.role === "COMMERCIAL");
  const livreurs = staff.filter((s) => s.role === "LIVREUR");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
          <Users className="w-4.5 h-4.5" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Commerciaux &amp; Livreurs</h3>
          <p className="text-[11px] text-gray-500">
            Attribution des documents (BL/Facture) — pas de compte de connexion nécessaire
          </p>
        </div>
      </div>

      <div
        // Pas de <form> : la section est rendue DANS le formulaire Paramètres (formulaires imbriqués
        // = HTML invalide → « Ajouter » soumettait le formulaire parent au lieu d'ajouter le staff).
        onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); handleAdd(e); } }}
        className="px-5 py-4 flex flex-wrap items-end gap-3 border-b border-gray-100"
      >
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nom</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: BRAHIM BELLA"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Rôle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
          >
            <option value="COMMERCIAL">Commercial</option>
            <option value="LIVREUR">Livreur</option>
          </select>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !name.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
        >
          <UserPlus className="w-3.5 h-3.5" />
          {saving ? "Ajout…" : "Ajouter"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2">
        {[
          { label: "Commerciaux", rows: commerciaux, icon: Users },
          { label: "Livreurs", rows: livreurs, icon: Truck },
        ].map(({ label, rows, icon: Icon }) => (
          <div key={label} className="px-5 py-4 border-b sm:border-b-0 sm:border-r last:border-r-0 border-gray-100">
            <h4 className="text-[10px] font-black uppercase text-gray-400 mb-2 flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" /> {label} ({rows.length})
            </h4>
            {rows.length === 0 && <p className="text-xs text-gray-400">Aucun</p>}
            <ul className="space-y-1.5">
              {rows.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-xs">
                  <span className={s.isActive ? "font-semibold text-gray-800" : "text-gray-400 line-through"}>
                    {s.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(s)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      s.isActive
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {s.isActive ? "Actif" : "Inactif"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
