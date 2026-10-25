"use client";

import { useRef, useState } from "react";
import { Upload, X, FileSpreadsheet } from "lucide-react";
import { importCustomersBatch } from "@/lib/actions/customers";
import { unwrap } from "@/lib/action-result";

interface Row { name: string; phone?: string; email?: string; city?: string; address?: string; ice?: string; creditLimitDh?: number; }

const HEADERS: Record<string, keyof Row> = {
  nom: "name", name: "name", client: "name", societe: "name", raison_sociale: "name",
  tel: "phone", telephone: "phone", phone: "phone", gsm: "phone",
  email: "email", mail: "email",
  ville: "city", city: "city",
  adresse: "address", address: "address",
  ice: "ice",
  limite: "creditLimitDh", credit: "creditLimitDh", plafond: "creditLimitDh",
};

/** Import CSV de clients : nom;téléphone;ville;ice;limite (séparateur ; ou , auto). */
export function ClientImportModal({ isOpen, onClose, onImported }: { isOpen: boolean; onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const parse = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setError("Fichier vide ou sans lignes de données"); return; }
    const sep = lines[0].includes(";") ? ";" : ",";
    const heads = lines[0].toLowerCase().split(sep).map((h) => h.trim().replace(/\s+/g, "_"));
    const mapping = heads.map((h) => HEADERS[h] ?? null);
    setUnmapped(heads.filter((_, i) => !mapping[i] && i > 0));
    if (!mapping.includes("name")) { setError("Colonne 'nom' introuvable — en-têtes attendus : nom;téléphone;ville;ice"); return; }
    const out: Row[] = [];
    for (const line of lines.slice(1)) {
      const cells = line.split(sep).map((c) => c.trim());
      const row: Row = { name: "" };
      mapping.forEach((k, i) => {
        if (!k) return;
        if (k === "creditLimitDh") { const n = parseFloat(cells[i]?.replace(",", ".")); if (!isNaN(n)) row[k] = n; }
        else (row[k] as string | undefined) = cells[i] || undefined;
      });
      if (row.name) out.push(row);
    }
    setRows(out);
    setError(null);
  };

  const onFile = async (f: File) => { setResult(null); parse(await f.text()); };

  const doImport = async () => {
    setBusy(true); setError(null);
    try {
      const res = unwrap(await importCustomersBatch(rows));
      setResult(res);
      if (res.created > 0) onImported();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#F7162D]" /> Import CSV clients
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Colonnes : <code className="bg-gray-100 px-1 rounded">nom;téléphone;ville;ice;adresse;limite</code> —
            les doublons (nom/tél/ICE) sont ignorés automatiquement.
          </p>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-xs font-bold text-gray-500 hover:border-[#F7162D] hover:text-[#F7162D] transition flex items-center justify-center gap-2">
            <Upload size={14} /> Choisir un fichier CSV
          </button>
          {rows.length > 0 && !result && (
            <div className="text-xs">
              <p className="font-bold text-gray-800">{rows.length} client(s) détectés</p>
              {unmapped.length > 0 && <p className="text-amber-600">Colonnes ignorées : {unmapped.join(", ")}</p>}
              <div className="mt-2 max-h-32 overflow-auto border border-gray-100 rounded-lg">
                {rows.slice(0, 8).map((r, i) => (
                  <div key={i} className="px-2.5 py-1.5 border-b border-gray-50 flex justify-between">
                    <span className="font-semibold truncate">{r.name}</span>
                    <span className="text-gray-400">{r.phone ?? ""} {r.city ? `· ${r.city}` : ""}</span>
                  </div>
                ))}
                {rows.length > 8 && <p className="px-2.5 py-1.5 text-gray-400">… et {rows.length - 8} autres</p>}
              </div>
            </div>
          )}
          {result && (
            <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="font-bold text-emerald-800">{result.created} créés · {result.skipped} ignorés (doublons)</p>
              {result.errors.slice(0, 5).map((e, i) => <p key={i} className="text-red-600 mt-1">{e}</p>)}
            </div>
          )}
          {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Fermer</button>
          {rows.length > 0 && !result && (
            <button onClick={doImport} disabled={busy}
              className="px-4 py-2 bg-[#F7162D] hover:bg-[#D90E23] text-white text-xs font-bold rounded-xl transition disabled:opacity-50">
              {busy ? "Import…" : `Importer ${rows.length} clients`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
