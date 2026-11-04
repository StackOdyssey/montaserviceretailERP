"use client";

import { useEffect, useState } from "react";
import { UserCircle2, KeyRound, Receipt } from "lucide-react";
import { getMyProfile, changeMyPin, type MyProfileData } from "@/lib/actions/profile";
import { formatMoney } from "@/lib/money";
import { unwrap } from "@/lib/action-result";
import { useToast } from "@/components/ui/ToastProvider";

/** G16 — Profil employé : identité, ventes du jour, changement de PIN. */
export default function ProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<MyProfileData | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyProfile().then((r) => setProfile(unwrap(r))).catch((e) => toast.error((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangePin = async () => {
    if (newPin !== confirmPin) { toast.error("Les deux PIN ne correspondent pas"); return; }
    setSaving(true);
    try {
      unwrap(await changeMyPin({ currentPin, newPin }));
      toast.success("PIN modifié — il sera demandé à la prochaine connexion");
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white p-4 md:p-6 rounded-2xl border border-[#E5E7EB] shadow-xs flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] flex items-center justify-center shrink-0">
          <UserCircle2 size={32} className="text-[#F7162D]" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#111827] tracking-tight">
            {profile?.name ?? "…"}
          </h1>
          <p className="text-sm text-[#4B5563]">
            {profile?.isMaster ? "Compte maître (PIN administrateur)" : `Rôle : ${profile?.role === "PROPRIETAIRE" ? "Propriétaire" : "Caissier"}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mes ventes du jour */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-[#F8F9FA] border-b border-[#E5E7EB] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#111827] flex items-center gap-2">
              <Receipt size={16} className="text-[#4338CA]" /> Mes ventes du jour
            </h2>
            <span className="text-xs font-black text-[#111827]">{profile ? formatMoney(profile.todayTotalTtcCents) : "—"}</span>
          </div>
          <div className="divide-y divide-[#E5E7EB] max-h-80 overflow-y-auto">
            {profile?.todayDocs.length === 0 && (
              <div className="p-8 text-center text-xs text-[#6B7280]">Aucun document validé aujourd&apos;hui.</div>
            )}
            {profile?.todayDocs.map((d) => (
              <div key={d.docNumber} className="flex items-center justify-between px-5 py-2.5">
                <div>
                  <span className="font-mono text-xs font-bold text-[#F7162D]">{d.docNumber}</span>
                  <span className="text-[10px] text-[#9CA3AF] ml-2">{d.docType}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold">{formatMoney(d.totalTtcCents)}</div>
                  <div className="text-[10px] text-[#9CA3AF]">
                    {new Date(d.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Changer mon PIN */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden h-fit">
          <div className="px-5 py-4 bg-[#F8F9FA] border-b border-[#E5E7EB]">
            <h2 className="text-sm font-bold text-[#111827] flex items-center gap-2">
              <KeyRound size={16} className="text-[#D97706]" /> Changer mon PIN
            </h2>
          </div>
          <div className="p-5 space-y-3">
            {profile?.isMaster ? (
              <p className="text-xs text-[#6B7280]">
                Le PIN administrateur maître se change via la configuration serveur (variable d&apos;environnement), pas depuis cette page.
              </p>
            ) : (
              <>
                <input
                  type="password" inputMode="numeric" maxLength={8}
                  value={currentPin} onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="PIN actuel" aria-label="PIN actuel"
                  className="w-full px-3 py-2.5 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#F7162D] font-mono tracking-widest text-center"
                />
                <input
                  type="password" inputMode="numeric" maxLength={8}
                  value={newPin} onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Nouveau PIN (4-8 chiffres)" aria-label="Nouveau PIN"
                  className="w-full px-3 py-2.5 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#F7162D] font-mono tracking-widest text-center"
                />
                <input
                  type="password" inputMode="numeric" maxLength={8}
                  value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="Confirmer le nouveau PIN" aria-label="Confirmer le nouveau PIN"
                  className="w-full px-3 py-2.5 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#F7162D] font-mono tracking-widest text-center"
                />
                <button
                  onClick={handleChangePin}
                  disabled={saving || !currentPin || !newPin || !confirmPin}
                  className="w-full py-2.5 bg-[#F7162D] hover:bg-[#D90E23] text-white text-xs font-bold rounded-xl transition disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Modifier mon PIN"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
