"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Building, Phone, Mail, MapPin, FileText } from "lucide-react";
import { CustomerItem, saveCustomer } from "@/lib/actions/customers";
import { getStaff, type StaffItem } from "@/lib/actions/staff";
import { useParameters } from "@/components/layout/SettingsProvider";
import { toCentimes } from "@/lib/money";
import { unwrap } from "@/lib/action-result";

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  customer?: CustomerItem | null;
}

export function CustomerModal({ isOpen, onClose, onSaved, customer }: CustomerModalProps) {
  const [name, setName] = useState(customer?.name || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [email, setEmail] = useState(customer?.email || "");
  const [city, setCity] = useState(customer?.city || "Casablanca");
  const [address, setAddress] = useState(customer?.address || "");
  const [ice, setIce] = useState(customer?.ice || "");
  const [identityNumber, setIdentityNumber] = useState(customer?.identityNumber || "");
  const [isWholesale, setIsWholesale] = useState(customer?.isWholesale ?? false);
  const [notes, setNotes] = useState(customer?.notes || "");
  const { priceLevels } = useParameters();
  const [isProfessional, setIsProfessional] = useState(customer?.isProfessional ?? false);
  const [priceLevelId, setPriceLevelId] = useState<number | null>(customer?.defaultPriceLevelId ?? null);
  const [creditLimitDh, setCreditLimitDh] = useState(
    customer?.creditLimitCents != null ? String(customer.creditLimitCents / 100) : ""
  );
  const [paymentTerms, setPaymentTerms] = useState(customer?.paymentTerms || "");
  const [paymentTermDays, setPaymentTermDays] = useState(
    customer?.paymentTermDays != null ? String(customer.paymentTermDays) : ""
  );
  const [riskClass, setRiskClass] = useState<string>(customer?.riskClass || "NORMAL");
  const [assignedStaffId, setAssignedStaffId] = useState<number | null>(customer?.assignedStaffId ?? null);
  const [commercials, setCommercials] = useState<StaffItem[]>([]);
  const [representative, setRepresentative] = useState(customer?.representative || "");
  const [externalRef] = useState(customer?.externalRef || "");
  const [force, setForce] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ré-initialise les champs à chaque ouverture (le composant reste monté :
  // sans reset, une édition après une création garde les valeurs précédentes).
  useEffect(() => {
    if (!isOpen) return;
    setName(customer?.name || "");
    setPhone(customer?.phone || "");
    setEmail(customer?.email || "");
    setCity(customer?.city || "Casablanca");
    setAddress(customer?.address || "");
    setIce(customer?.ice || "");
    setIdentityNumber(customer?.identityNumber || "");
    setIsWholesale(customer?.isWholesale ?? false);
    setNotes(customer?.notes || "");
    setIsProfessional(customer?.isProfessional ?? false);
    setPriceLevelId(customer?.defaultPriceLevelId ?? null);
    setCreditLimitDh(customer?.creditLimitCents != null ? String(customer.creditLimitCents / 100) : "");
    setPaymentTerms(customer?.paymentTerms || "");
    setPaymentTermDays(customer?.paymentTermDays != null ? String(customer.paymentTermDays) : "");
    setRiskClass(customer?.riskClass || "NORMAL");
    setAssignedStaffId(customer?.assignedStaffId ?? null);
    setRepresentative(customer?.representative || "");
    setForce(false);
    setError(null);
    getStaff("COMMERCIAL")
      .then((res) => setCommercials(unwrap(res)))
      .catch(() => setCommercials([]));
  }, [isOpen, customer]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Veuillez saisir le nom du client ou la raison sociale.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const parsedLimit = creditLimitDh.trim() ? parseFloat(creditLimitDh.replace(",", ".")) : NaN;
      unwrap(await saveCustomer({
        id: customer?.id,
        name,
        phone,
        email,
        city,
        address,
        ice,
        identityNumber,
        isWholesale,
        isProfessional,
        defaultPriceLevelId: priceLevelId,
        creditLimitCents: Number.isFinite(parsedLimit) ? toCentimes(parsedLimit) : null,
        paymentTerms,
        paymentTermDays: paymentTermDays.trim() ? parseInt(paymentTermDays, 10) : null,
        riskClass,
        assignedStaffId,
        representative,
        externalRef,
        notes,
        force,
      }));
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message || "Erreur lors de l'enregistrement");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F7162D]/10 flex items-center justify-center text-[#F7162D]">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                {customer ? "Modifier le client" : "Nouveau client"}
              </h3>
              <p className="text-xs text-gray-500">
                {customer ? `Identifiant N° #${customer.id}` : "Création d'une nouvelle fiche client"}
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

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}
          {error && /Doublon/i.test(error) && (
            <label className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="w-4 h-4" />
              Enregistrer malgré le doublon détecté
            </label>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Nom / Raison Sociale <span className="text-[#F7162D]">*</span>
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Garage Moto Hassan ou M. Karim Tazi"
                className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Téléphone (WhatsApp)
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0661234567"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Email (Envoi Resend)
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@domaine.ma"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Ville
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Casablanca"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                ICE (15 chiffres)
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={ice}
                  onChange={(e) => setIce(e.target.value)}
                  placeholder="001892837000045"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Pièce d&apos;identité (CIN / passeport) — optionnel
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={identityNumber}
                  onChange={(e) => setIdentityNumber(e.target.value)}
                  placeholder="Facultatif — ne bloque pas l'enregistrement"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Adresse physique
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex: Bd Chefchaouni, Quartier Industriel"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
            />
          </div>

          {/* Type client : Grossiste / Professionnel */}
          <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isWholesale}
                onChange={(e) => setIsWholesale(e.target.checked)}
                className="w-4 h-4 text-[#F7162D] rounded border-gray-300 focus:ring-[#F7162D]"
              />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Client Grossiste (Tarification de gros)
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isProfessional}
                onChange={(e) => setIsProfessional(e.target.checked)}
                className="w-4 h-4 text-[#F7162D] rounded border-gray-300 focus:ring-[#F7162D]"
              />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Client Professionnel (ICE obligatoire — B2B)
              </span>
            </label>
            <p className="text-[11px] text-gray-500">
              Particulier : seuls le nom et le téléphone sont nécessaires (aucun numéro de pièce d&apos;identité n&apos;est
              demandé — décision CNDP en attente, Q14).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Niveau de prix par défaut
              </label>
              <select
                value={priceLevelId ?? ""}
                onChange={(e) => setPriceLevelId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
              >
                <option value="">Non défini</option>
                {priceLevels.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Plafond de crédit (DH)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={creditLimitDh}
                onChange={(e) => setCreditLimitDh(e.target.value)}
                placeholder="Laisser vide = pas de limite"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Conditions de règlement
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Ex: Chèque à 30 jours"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Représentant
              </label>
              <input
                type="text"
                value={representative}
                onChange={(e) => setRepresentative(e.target.value)}
                placeholder="Représentant du client"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Commercial attitré
              </label>
              <select
                value={assignedStaffId ?? ""}
                onChange={(e) => setAssignedStaffId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
              >
                <option value="">Aucun</option>
                {commercials.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Échéance (jours)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={paymentTermDays}
                onChange={(e) => setPaymentTermDays(e.target.value)}
                placeholder="Ex: 30"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                Classification
              </label>
              <select
                value={riskClass}
                onChange={(e) => setRiskClass(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
              >
                <option value="NORMAL">Normal</option>
                <option value="ROI">Client roi</option>
                <option value="DOUTEUX">Douteux</option>
                <option value="LITIGIEUX">Litigieux</option>
                <option value="ARNAQUEUR">Arnaqueur</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Notes & Modalités de paiement
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Chèques acceptés à 30 jours, plafond crédit 10 000 DH..."
              rows={2}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#F7162D]"
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
              disabled={isSubmitting}
              className="px-6 py-2.5 text-sm font-bold text-white bg-[#F7162D] hover:bg-[#d81023] rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? "Enregistrement..." : customer ? "Mettre à jour" : "Créer le client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
