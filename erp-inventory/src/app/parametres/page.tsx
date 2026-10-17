"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Percent,
  CreditCard,
  Hash,
  Database,
  Save,
  CheckCircle2,
  Lock,
  RefreshCw,
  Smartphone,
  Server,
  Cloud,
  HelpCircle,
} from "lucide-react";
import { getSettings, saveSettings, getVatRates, saveVatRate } from "@/lib/actions/settings";
import { OPEN_QUESTIONS } from "@/lib/open-questions";
import { revokeAllSessions } from "@/lib/actions/auth";
import { clearAppCaches } from "@/components/pwa/clear-app-caches";

export default function ParametresPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "SOCIETE" | "FISCAL" | "BANQUE" | "SECURITE" | "NUMEROTATION" | "CLOUD" | "DECISIONS"
  >("SOCIETE");

  const [savedNotification, setSavedNotification] = useState(false);

  // Formulaire d'information société
  const [companyInfo, setCompanyInfo] = useState({
    name: "SARL BM Motors",
    tradeName: "BM Motors - Pièces Motos Bashan",
    legalForm: "SARL (Société à Responsabilité Limitée)",
    capital: "100 000 DH",
    ice: "001892345000088", // 15 chiffres
    identifiantFiscal: "45210982",
    registreCommerce: "348912 Casablanca",
    taxeProfessionnelle: "38902145",
    cnss: "7654321",
    address: "Rue Al Fourat, Quartier Derb Ghallef, Casablanca",
    city: "Casablanca",
    phone: "05 22 20 40 60",
    mobileWhatsApp: "06 61 12 34 56",
    email: "contact@bmmotors.ma",
  });

  // Paramètres fiscaux
  const [fiscalSettings, setFiscalSettings] = useState({
    defaultTvaRate: 20,
    // Interrupteur global : décoché = ventes sans TVA (ni calculée ni affichée).
    vatLiable: true,
    currency: "MAD",
    enableNegativeStock: true,
    displayDiscountUnderBrut: true,
    defaultPaymentDueDays: 30,
    invoiceFooterNote:
      "Marchandise vendue agréée conforme aux normes constructeur Bashan. En cas de litige, seul le Tribunal de Commerce de Casablanca est compétent.",
  });

  // Coordonnées bancaires
  const [bankSettings, setBankSettings] = useState({
    bank1Name: "Attijariwafa Bank",
    bank1Agency: "Agence Derb Ghallef Casablanca",
    bank1Rib: "007 780 0001234567890123 45",
    bank2Name: "Bank of Africa (BMCE)",
    bank2Agency: "Agence Bd Al Qods Ain Chock",
    bank2Rib: "011 780 0009876543210987 89",
  });

  const [vatRates, setVatRates] = useState<Array<{ id: number; ratePercent: number; label: string }>>([]);
  const [newVatRate, setNewVatRate] = useState("");
  const [newVatLabel, setNewVatLabel] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [s, rates] = await Promise.all([getSettings(), getVatRates()]);
        setVatRates(rates.map((r) => ({ id: r.id, ratePercent: r.ratePercent, label: r.label })));
        if (!s) return;
        setCompanyInfo((c) => ({
          ...c,
          name: s.raisonSociale || c.name,
          tradeName: s.tradeName || c.tradeName,
          legalForm: s.legalForm || c.legalForm,
          capital: s.capitalCents ? `${(s.capitalCents / 100).toLocaleString("fr-FR")} DH` : c.capital,
          ice: s.ice || c.ice,
          identifiantFiscal: s.identifiantFiscal || c.identifiantFiscal,
          registreCommerce: s.registreCommerce || c.registreCommerce,
          taxeProfessionnelle: s.taxeProfessionnelle || c.taxeProfessionnelle,
          cnss: s.cnss || c.cnss,
          address: s.address || c.address,
          city: s.city || c.city,
          phone: s.phone || c.phone,
          mobileWhatsApp: s.mobileWhatsapp || c.mobileWhatsApp,
          email: s.email || c.email,
        }));
        const rate = rates.find((r) => r.id === s.defaultVatRateId)?.ratePercent;
        setFiscalSettings((f) => ({
          ...f,
          defaultTvaRate: rate ?? f.defaultTvaRate,
          vatLiable: s.vatLiable ?? f.vatLiable,
          currency: s.currency || f.currency,
          enableNegativeStock: s.negativeStockAllowed,
          displayDiscountUnderBrut: s.displayDiscountUnderBrut,
          defaultPaymentDueDays: s.defaultPaymentDueDays,
          invoiceFooterNote: s.footerText || f.invoiceFooterNote,
        }));
        setBankSettings((b) => ({
          ...b,
          bank1Name: s.bankName || b.bank1Name,
          bank1Agency: s.bankAgency || b.bank1Agency,
          bank1Rib: s.bankRib || b.bank1Rib,
          bank2Name: s.bank2Name || b.bank2Name,
          bank2Agency: s.bank2Agency || b.bank2Agency,
          bank2Rib: s.bank2Rib || b.bank2Rib,
        }));
      } catch {
        // base non joignable : conserver les valeurs par défaut du formulaire
      }
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const capitalCents = Number(companyInfo.capital.replace(/[^\d]/g, "")) * 100;
    const vatId = vatRates.find((r) => r.ratePercent === fiscalSettings.defaultTvaRate)?.id ?? null;
    try {
      await saveSettings({
        raisonSociale: companyInfo.name,
        tradeName: companyInfo.tradeName,
        legalForm: companyInfo.legalForm,
        capitalCents,
        ice: companyInfo.ice,
        identifiantFiscal: companyInfo.identifiantFiscal,
        registreCommerce: companyInfo.registreCommerce,
        taxeProfessionnelle: companyInfo.taxeProfessionnelle,
        cnss: companyInfo.cnss,
        address: companyInfo.address,
        city: companyInfo.city,
        phone: companyInfo.phone,
        mobileWhatsapp: companyInfo.mobileWhatsApp,
        email: companyInfo.email,
        footerText: fiscalSettings.invoiceFooterNote,
        defaultVatRateId: vatId,
        vatLiable: fiscalSettings.vatLiable,
        currency: fiscalSettings.currency,
        negativeStockAllowed: fiscalSettings.enableNegativeStock,
        defaultPaymentDueDays: fiscalSettings.defaultPaymentDueDays,
        displayDiscountUnderBrut: fiscalSettings.displayDiscountUnderBrut,
        bankName: bankSettings.bank1Name,
        bankAgency: bankSettings.bank1Agency,
        bankRib: bankSettings.bank1Rib,
        bank2Name: bankSettings.bank2Name,
        bank2Agency: bankSettings.bank2Agency,
        bank2Rib: bankSettings.bank2Rib,
      });
      setSavedNotification(true);
      setTimeout(() => setSavedNotification(false), 3000);
      // Revalide le layout serveur (paramètres société) pour que la caisse
      // et les autres pages prennent le nouveau régime TVA sans F5.
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleAddVatRate = async () => {
    const rate = parseFloat(newVatRate.replace(",", "."));
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      alert("Taux de TVA invalide (0–100).");
      return;
    }
    try {
      const saved = await saveVatRate({ ratePercent: rate, label: newVatLabel });
      const rates = await getVatRates();
      setVatRates(rates.map((r) => ({ id: r.id, ratePercent: r.ratePercent, label: r.label })));
      setFiscalSettings((f) => ({ ...f, defaultTvaRate: saved.ratePercent }));
      setNewVatRate("");
      setNewVatLabel("");
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-7 h-7 text-[#F7162D]" />
            Paramètres de la Société & Système
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Identifiants légaux marocains (ICE, IF, RC), taux de TVA paramétrable, coordonnées bancaires et sécurité d'accès.
          </p>
        </div>

        {savedNotification && (
          <div className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Modifications enregistrées avec succès
          </div>
        )}
      </div>

      {/* Navigation par Onglets */}
      <div className="bg-white dark:bg-gray-900 p-1.5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs flex items-center gap-1 overflow-x-auto">
        {[
          { id: "SOCIETE", label: "Identité SARL", icon: Building2 },
          { id: "FISCAL", label: "TVA & Facturation", icon: Percent },
          { id: "BANQUE", label: "Banques & RIB", icon: CreditCard },
          { id: "SECURITE", label: "Code PIN & Accès", icon: Lock },
          { id: "NUMEROTATION", label: "Numérotation BL", icon: Hash },
          { id: "CLOUD", label: "Infrastructure Cloud", icon: Server },
          { id: "DECISIONS", label: "Décisions & Questions", icon: HelpCircle },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-[#F7162D] text-white shadow-xs"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Contenu de l'onglet actif */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* ========================================================================= */}
        {/* 1. IDENTITE SARL & MENTIONS LEGALES                                       */}
        {/* ========================================================================= */}
        {activeTab === "SOCIETE" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-xs space-y-6">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#F7162D]" />
                Raison Sociale & Identifiants Officiels Marocains
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Ces mentions figurent obligatoirement sur tous vos Bons de Livraison, Factures et Devis imprimés.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Raison Sociale Légale *
                </label>
                <input
                  type="text"
                  value={companyInfo.name}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F7162D]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Nom Commercial / Enseigne
                </label>
                <input
                  type="text"
                  value={companyInfo.tradeName}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, tradeName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Numéro ICE (15 chiffres) *
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={companyInfo.ice}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, ice: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-mono font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F7162D]"
                  placeholder="001892345000088"
                  required
                />
                <p className="text-[11px] text-gray-400 mt-1">Identifiant Commun de l'Entreprise obligatoire au Maroc</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Identifiant Fiscal (IF) *
                </label>
                <input
                  type="text"
                  value={companyInfo.identifiantFiscal}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, identifiantFiscal: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-mono font-semibold focus:ring-2 focus:ring-[#F7162D]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Registre de Commerce (RC) *
                </label>
                <input
                  type="text"
                  value={companyInfo.registreCommerce}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, registreCommerce: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F7162D]"
                  placeholder="348912 Casablanca"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Taxe Professionnelle (Patente)
                </label>
                <input
                  type="text"
                  value={companyInfo.taxeProfessionnelle}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, taxeProfessionnelle: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-mono font-semibold focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Numéro d'affiliation CNSS
                </label>
                <input
                  type="text"
                  value={companyInfo.cnss}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, cnss: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-mono font-semibold focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Forme Juridique & Capital
                </label>
                <input
                  type="text"
                  value={`${companyInfo.legalForm} au capital de ${companyInfo.capital}`}
                  disabled
                  className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-500 cursor-not-allowed"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Adresse du Siège & Magasin
                </label>
                <input
                  type="text"
                  value={companyInfo.address}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Téléphone Magasin
                </label>
                <input
                  type="text"
                  value={companyInfo.phone}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  WhatsApp Commercial (Envoi PDF Direct)
                </label>
                <input
                  type="text"
                  value={companyInfo.mobileWhatsApp}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, mobileWhatsApp: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. FISCALITE & TVA                                                        */}
        {/* ========================================================================= */}
        {activeTab === "FISCAL" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-xs space-y-6">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Percent className="w-5 h-5 text-[#F7162D]" />
                Régime Fiscal & Règles de Facturation
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Conformité aux règles comptables marocaines pour le commerce de pièces de rechange motos.
              </p>
            </div>

            {/* Interrupteur global de régime TVA */}
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex items-start gap-3">
              <input
                id="vat-liable-toggle"
                type="checkbox"
                checked={fiscalSettings.vatLiable}
                onChange={(e) => setFiscalSettings({ ...fiscalSettings, vatLiable: e.target.checked })}
                className="mt-1 w-5 h-5 accent-[#F7162D]"
              />
              <div>
                <label htmlFor="vat-liable-toggle" className="text-sm font-bold text-gray-900 dark:text-white">
                  Entreprise assujettie à la TVA
                </label>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Coché : TVA calculée et affichée au taux par défaut. Décoché : ventes sans TVA —
                  ni calculée ni affichée (total = net), mention « TVA non applicable » sur les
                  factures. Effet immédiat sur les nouveaux documents, historique inchangé.
                  Basculement tracé dans le Journal des Opérations.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Taux de TVA par Défaut
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={fiscalSettings.defaultTvaRate}
                    onChange={(e) => setFiscalSettings({ ...fiscalSettings, defaultTvaRate: Number(e.target.value) })}
                    className="w-40 px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F7162D]"
                  >
                    {vatRates.length === 0 && (
                      <option value={fiscalSettings.defaultTvaRate}>{fiscalSettings.defaultTvaRate}%</option>
                    )}
                    {vatRates.map((r) => (
                      <option key={r.id} value={r.ratePercent}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm font-bold text-[#F7162D]">% applicable</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={newVatRate}
                    onChange={(e) => setNewVatRate(e.target.value)}
                    placeholder="Taux"
                    className="w-20 px-2.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={newVatLabel}
                    onChange={(e) => setNewVatLabel(e.target.value)}
                    placeholder="Libellé (ex: TVA 20%)"
                    className="flex-1 px-2.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleAddVatRate}
                    className="px-3 py-2 bg-[#F7162D] hover:bg-[#d81023] text-white text-xs font-bold rounded-lg transition"
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Devise d'Émission
                </label>
                <input
                  type="text"
                  value="MAD (Dirham Marocain)"
                  disabled
                  className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-500 cursor-not-allowed"
                />
              </div>

              <div className="md:col-span-2 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 font-bold shrink-0">
                    ℹ️
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Règle de Calcul de la Remise Commerciale (%)
                    </h3>
                    <p className="text-xs text-amber-800 dark:text-amber-300/80 mt-1 leading-relaxed">
                      Conformément à la convention de SARL BM Motors, la remise (%) est déduite directement du <strong>Total Brut HT</strong> pour obtenir le <strong>Total Net HT</strong>, sur lequel s'applique ensuite la TVA de {fiscalSettings.defaultTvaRate}%.
                    </p>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1.5">
                  Mention Légale de Bas de Page (Factures & BL)
                </label>
                <textarea
                  rows={3}
                  value={fiscalSettings.invoiceFooterNote}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, invoiceFooterNote: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#F7162D]"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. COORDONNEES BANCAIRES                                                  */}
        {/* ========================================================================= */}
        {activeTab === "BANQUE" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-xs space-y-6">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#F7162D]" />
                Comptes Bancaires & RIB de la Société
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Ces coordonnées figurent sur les Devis et Factures pour les règlements par Virement ou Effet LCN.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Compte 1 */}
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                <span className="text-xs font-bold text-[#F7162D] uppercase tracking-wider">
                  Compte Principal (Attijariwafa)
                </span>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Banque & Agence</label>
                  <input
                    type="text"
                    value={bankSettings.bank1Name}
                    onChange={(e) => setBankSettings({ ...bankSettings, bank1Name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Relevé d'Identité Bancaire (RIB - 24 chiffres)</label>
                  <input
                    type="text"
                    value={bankSettings.bank1Rib}
                    onChange={(e) => setBankSettings({ ...bankSettings, bank1Rib: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-mono font-bold text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Compte 2 */}
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  Compte Secondaire (BMCE / BOA)
                </span>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Banque & Agence</label>
                  <input
                    type="text"
                    value={bankSettings.bank2Name}
                    onChange={(e) => setBankSettings({ ...bankSettings, bank2Name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Relevé d'Identité Bancaire (RIB - 24 chiffres)</label>
                  <input
                    type="text"
                    value={bankSettings.bank2Rib}
                    onChange={(e) => setBankSettings({ ...bankSettings, bank2Rib: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-mono font-bold text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. SECURITE & CODE PIN                                                    */}
        {/* ========================================================================= */}
        {activeTab === "SECURITE" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-xs space-y-6">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#F7162D]" />
                Sécurité Monoutilisateur & Code PIN
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Protection par code PIN tactile à 4 chiffres. Le second facteur est assuré par Cloudflare Access devant l'application.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Code PIN géré par l'environnement */}
              <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider block">
                  Code PIN comptoir
                </span>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Le code PIN est défini par la variable d'environnement <span className="font-mono font-bold">ADMIN_PIN</span> (Secret Manager en production).
                  Aucun PIN n'est affiché ni modifiable depuis cette page : toute rotation se fait côté hébergement, sans valeur codée en dur.
                </p>
              </div>

              {/* Second facteur */}
              <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 space-y-3">
                <span className="text-sm font-bold text-emerald-900 dark:text-emerald-200 block">
                  Second facteur : Cloudflare Access
                </span>
                <p className="text-xs text-emerald-800 dark:text-emerald-300/80 leading-relaxed">
                  L'accès applicatif est filtré en amont par Cloudflare Access (Zero Trust). Il n'y a pas de déverrouillage biométrique applicatif :
                  la biométrie éventuelle de l'appareil reste du ressort du système, pas d'une session émise par l'ERP.
                </p>
              </div>
            </div>

            {/* Révocation globale des sessions */}
            <div className="p-5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-sm font-bold text-gray-900 dark:text-white block">Déconnecter tous les appareils</span>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Invalide immédiatement toutes les sessions ouvertes (téléphone perdu, poste partagé), y compris celle-ci.
                  Après 5 codes PIN erronés en 15 minutes, la connexion est suspendue automatiquement.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Déconnecter tous les appareils, y compris celui-ci ?")) return;
                  await revokeAllSessions();
                  await clearAppCaches();
                  window.location.href = "/login";
                }}
                className="shrink-0 px-4 py-2 text-xs font-bold text-white bg-[#F7162D] hover:bg-[#d81023] rounded-xl shadow-xs transition"
              >
                Déconnecter tous les appareils
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. NUMEROTATION DES DOCUMENTS                                             */}
        {/* ========================================================================= */}
        {activeTab === "NUMEROTATION" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-xs space-y-6">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Hash className="w-5 h-5 text-[#F7162D]" />
                Séquences & Numérotation Automatique
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Format légal séquentiel sans rupture des pièces commerciales.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Bons de Livraison (BL)
                </span>
                <div className="text-lg font-mono font-black text-gray-900 dark:text-white">
                  BL-2026-XXXX
                </div>
                <p className="text-xs text-gray-400 mt-1">Exemple : BL-2026-0043</p>
              </div>

              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Factures Normalisées
                </span>
                <div className="text-lg font-mono font-black text-gray-900 dark:text-white">
                  FAC-2026-XXXX
                </div>
                <p className="text-xs text-gray-400 mt-1">Exemple : FAC-2026-0012</p>
              </div>

              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Bons de Réception (BR)
                </span>
                <div className="text-lg font-mono font-black text-gray-900 dark:text-white">
                  BR-2026-XXXX
                </div>
                <p className="text-xs text-gray-400 mt-1">Exemple : BR-2026-0042</p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 6. INFRASTRUCTURE & BACKUP CLOUD                                          */}
        {/* ========================================================================= */}
        {activeTab === "CLOUD" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-xs space-y-6">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-[#F7162D]" />
                Infrastructure & Sauvegardes Nocturnes (0,00 €/an)
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                État de l'hébergement serveur, de la base de données et des sauvegardes automatiques.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Cloud className="w-6 h-6 text-blue-500" />
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white">Google Cloud Run</h3>
                    <p className="text-[11px] text-gray-500">Conteneur Docker Serverless (europe-west1)</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                  En ligne
                </span>
              </div>

              <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-6 h-6 text-emerald-500" />
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white">Neon PostgreSQL</h3>
                    <p className="text-[11px] text-gray-500">Base relationnelle avec PITR & SSL</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                  Connecté
                </span>
              </div>

              <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-6 h-6 text-purple-500" />
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white">Sauvegarde Quotidienne GitHub</h3>
                    <p className="text-[11px] text-gray-500">Cron 02h00 UTC vers Cloudflare R2</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 text-xs font-bold">
                  Actif (02:00)
                </span>
              </div>

              <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-6 h-6 text-orange-500" />
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white">Application PWA / Offline</h3>
                    <p className="text-[11px] text-gray-500">Service Worker pour iPhone & Comptoir</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 text-xs font-bold">
                  Installée
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 7. DECISIONS & QUESTIONS OUVERTES (câblage des points en attente)         */}
        {/* ========================================================================= */}
        {activeTab === "DECISIONS" && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-xs">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#F7162D]" />
                Décisions & Questions ouvertes
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Points en attente de décision (comptable / propriétaire). Le système applique déjà un comportement sûr
                par défaut. Aucune de ces décisions ne doit être prise par un développeur.
              </p>
            </div>

            {OPEN_QUESTIONS.map((q) => (
              <div
                key={q.code}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{q.title}</h3>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      q.status === "BLOQUE"
                        ? "bg-[#FEF2F2] text-[#F7162D]"
                        : q.status === "REPONDU"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {q.status === "BLOQUE" ? "Bloquant" : q.status === "REPONDU" ? "Répondu" : "À décider"}
                  </span>
                </div>
                <p className="mt-2 text-[11px] font-mono text-gray-400">{q.code}</p>
                {q.answer && (
                  <p className="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">
                    Réponse : {q.answer}
                  </p>
                )}
                <dl className="mt-3 space-y-2 text-xs">
                  <div>
                    <dt className="font-bold text-gray-700 dark:text-gray-300">Contexte</dt>
                    <dd className="text-gray-500">{q.contexte}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-gray-700 dark:text-gray-300">Impact</dt>
                    <dd className="text-gray-500">{q.impact}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-gray-700 dark:text-gray-300">Décision requise</dt>
                    <dd className="text-gray-500">{q.decisionRequise}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-emerald-700 dark:text-emerald-400">Défaut appliqué (sûr)</dt>
                    <dd className="text-gray-500">{q.defautActuel}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-gray-700 dark:text-gray-300">Câblage (code)</dt>
                    <dd className="text-gray-500 font-mono text-[11px]">{q.cablage}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}

        {/* Bouton d'enregistrement global */}
        {activeTab !== "DECISIONS" && (
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 bg-[#F7162D] hover:bg-[#d81023] text-white text-sm font-bold rounded-xl shadow-md transition flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Enregistrer les Paramètres
          </button>
        </div>
        )}
      </form>
    </div>
  );
}
