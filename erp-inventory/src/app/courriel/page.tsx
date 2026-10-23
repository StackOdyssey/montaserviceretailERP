"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSettings } from "@/components/layout/SettingsProvider";
import {
  Mail,
  Inbox,
  Send,
  Search,
  Paperclip,
  Trash2,
  Reply,
  FileText,
  Clock,
  Plus,
  RefreshCw,
  X,
  FileDown,
} from "lucide-react";
import {
  SupplierEmailItem,
  getSupplierEmails,
  sendSupplierEmail,
  markEmailAsRead,
  deleteSupplierEmail,
} from "@/lib/actions/emails";
import { useToast } from "@/components/ui/ToastProvider";
import { unwrap } from "@/lib/action-result";

export default function CourrielPage() {
  const company = useSettings();
  const toast = useToast();
  const [emails, setEmails] = useState<SupplierEmailItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<SupplierEmailItem | null>(null);
  const [activeFolder, setActiveFolder] = useState<"ALL" | "INBOX" | "SENT">("INBOX");
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal de composition
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeSupplierId, setComposeSupplierId] = useState<number>(1);
  const [composeTo, setComposeTo] = useState("export@bashanmotor.com");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<Array<{ name: string; size: string }>>([]);
  const [isSending, setIsSending] = useState(false);

  const suppliersList = [
    { id: 1, name: "Bashan Motorcycle Industrial Co., Ltd", email: "export@bashanmotor.com" },
    { id: 2, name: "Grossiste Pièces Moto Derb Omar", email: "abdelkrim.pieces@gmail.com" },
    { id: 3, name: "Maghreb Pneus & Accessoires SARL", email: "commandes@maghrebpneus.ma" },
  ];

  const loadEmails = async () => {
    setLoading(true);
    try {
      const data = await getSupplierEmails({
        folder: activeFolder,
        supplierId: selectedSupplierFilter !== "ALL" ? Number(selectedSupplierFilter) : undefined,
        search: searchQuery,
      });
      setEmails(data);
      if (data.length > 0 && !selectedEmail) {
        setSelectedEmail(data[0]);
      } else if (selectedEmail) {
        const stillExists = data.find((e) => e.id === selectedEmail.id);
        setSelectedEmail(stillExists || data[0] || null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadEmails, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolder, selectedSupplierFilter, searchQuery]);

  const handleSelectEmail = async (email: SupplierEmailItem) => {
    setSelectedEmail(email);
    if (!email.isRead) {
      unwrap(await markEmailAsRead(email.id));
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, isRead: true } : e))
      );
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Supprimer ce courriel de la boîte ?")) {
      unwrap(await deleteSupplierEmail(id));
      if (selectedEmail?.id === id) {
        setSelectedEmail(null);
      }
      loadEmails();
    }
  };

  const applyTemplate = (templateType: "DEVIS" | "COMMANDE" | "VIREMENT") => {
    const supp = suppliersList.find((s) => s.id === composeSupplierId);
    if (!supp) return;

    if (templateType === "DEVIS") {
      setComposeSubject(`Demande de Devis & Disponibilité Pièces - ${company.raisonSociale}`);
      setComposeBody(`Salam / Bonjour ${supp.name},

Nous souhaitons vérifier la disponibilité en stock ainsi que vos meilleurs tarifs pour le réassort suivant :
- Cylindres complets avec piston & segments (Bashan 250cc) : 20 pièces
- Carburateurs PZ30 starter manuel : 30 pièces
- Plaquettes de frein avant/arrière : 50 paires

Merci de nous faire parvenir votre devis chiffré ainsi que le délai de livraison prévu.

Cordialement,
Alexis - Gérant ${company.raisonSociale}
Derb Ghallef, Casablanca`);
    } else if (templateType === "COMMANDE") {
      setComposeSubject(`Bon de Commande Pièces Moto BC-2026-${Math.floor(100 + Math.random() * 900)} - ${company.raisonSociale}`);
      setComposeBody(`Bonjour ${supp.name},

Veuillez trouver ci-joint notre Bon de Commande officiel validé pour les pièces de rechange convenues.
Merci de bien vouloir accuser réception de cette commande et nous préparer la facture proforma.

Salutations distinguées,
Alexis - ${company.raisonSociale}`);
      setComposeAttachments([{ name: "Bon_de_Commande_BC-2026.pdf", size: "215 Ko" }]);
    } else if (templateType === "VIREMENT") {
      setComposeSubject(`Avis de Règlement / Virement Bancaire - ${company.raisonSociale}`);
      setComposeBody(`Bonjour ${supp.name},

Nous vous informons avoir émis le règlement correspondant à la facture en cours :
- Montant : [Insérer montant en DH]
- Mode : Virement bancaire Attijariwafa Bank / BMCE
- Référence : SWIFT / N° Opération [Insérer référence]

Le justificatif bancaire est joint au présent courriel.

Cordialement,
Comptabilité - ${company.raisonSociale}`);
      setComposeAttachments([{ name: "Ordre_Virement_Banque.pdf", size: "180 Ko" }]);
    }
  };

  const handleSendEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo || !composeSubject || !composeBody) {
      toast.error("Veuillez renseigner tous les champs obligatoires.");
      return;
    }

    setIsSending(true);
    try {
      const supp = suppliersList.find((s) => s.id === composeSupplierId);
      const newMail = unwrap(await sendSupplierEmail({
        supplierId: composeSupplierId,
        supplierName: supp ? supp.name : "Fournisseur",
        toAddress: composeTo,
        subject: composeSubject,
        bodyText: composeBody,
        attachments: composeAttachments.map((a) => ({
          name: a.name,
          url: "#",
          size: a.size,
          mimeType: "application/pdf",
        })),
      }));

      setIsComposeOpen(false);
      setComposeSubject("");
      setComposeBody("");
      setComposeAttachments([]);
      toast.success("Courriel envoyé avec succès via Resend");
      loadEmails();
      setSelectedEmail(newMail);
    } catch (err) {
      toast.error((err as Error).message || "Erreur lors de l'envoi");
    } finally {
      setIsSending(false);
    }
  };

  const unreadCount = emails.filter((e) => e.direction === "ENTRANT" && !e.isRead).length;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Mail className="w-7 h-7 text-[#F7162D]" />
            Courriels & Échanges Fournisseurs
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Messagerie intégrée avec les fabricants (Chine) et grossistes locaux (Derb Omar). Envois via Resend & réceptions automatiques.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const supp = suppliersList[0];
              setComposeSupplierId(supp.id);
              setComposeTo(supp.email);
              setComposeSubject("");
              setComposeBody("");
              setIsComposeOpen(true);
            }}
            className="px-4 py-2.5 bg-[#F7162D] hover:bg-[#d81023] text-white text-xs font-bold shadow-xs transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouveau Courriel
          </button>
        </div>
      </div>

      {/* Barre de filtres et dossiers */}
      <div className="bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Onglets Dossiers */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveFolder("INBOX")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition ${
              activeFolder === "INBOX"
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Boîte de Réception</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 bg-[#F7162D] text-white text-[10px] font-black">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveFolder("SENT")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition ${
              activeFolder === "SENT"
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Messages Envoyés</span>
          </button>

          <button
            onClick={() => setActiveFolder("ALL")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition ${
              activeFolder === "ALL"
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Tous les Échanges</span>
          </button>
        </div>

        {/* Filtre par Fournisseur & Recherche */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <select
            value={selectedSupplierFilter}
            onChange={(e) => setSelectedSupplierFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-semibold focus:ring-2 focus:ring-[#F7162D]"
          >
            <option value="ALL">Tous les fournisseurs</option>
            {suppliersList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par objet, texte..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs focus:ring-2 focus:ring-[#F7162D]"
            />
          </div>

          <button
            onClick={loadEmails}
            title="Rafraîchir"
            className="p-2 border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interface à deux volets (Master-Detail) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[580px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
        {/* ======================================================== */}
        {/* COLONNE GAUCHE : LISTE DES DISCUSSIONS (4/12)            */}
        {/* ======================================================== */}
        <div className="lg:col-span-5 border-r border-gray-200 dark:border-gray-800 flex flex-col h-[650px] overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>{emails.length} message(s)</span>
            <span>{activeFolder === "INBOX" ? "Entrants" : activeFolder === "SENT" ? "Envoyés" : "Archive"}</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <div className="p-8 text-center text-xs text-gray-400">Chargement des courriels...</div>
            ) : emails.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                Aucun courriel trouvé pour ces critères.
              </div>
            ) : (
              emails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;

                return (
                  <div
                    key={email.id}
                    onClick={() => handleSelectEmail(email)}
                    className={`p-3.5 cursor-pointer transition flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-red-50/60 dark:bg-red-950/20 border-l-4 border-l-[#F7162D]"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    } ${!email.isRead ? "font-bold" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        {!email.isRead && (
                          <span className="w-2 h-2 bg-[#F7162D] shrink-0" title="Non lu" />
                        )}
                        <span
                          className={`text-xs truncate ${
                            isSelected ? "text-[#F7162D] font-black" : "text-gray-900 dark:text-white"
                          }`}
                        >
                          {email.supplierName}
                        </span>
                      </div>

                      <span className="text-[10px] text-gray-400 shrink-0 font-mono">
                        {new Date(email.sentAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>

                    <div className="text-xs text-gray-800 dark:text-gray-200 truncate">
                      {email.direction === "SORTANT" && (
                        <span className="text-blue-600 font-bold mr-1">À : </span>
                      )}
                      {email.subject}
                    </div>

                    <div className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                      {email.bodyText}
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[10px]">
                      <span
                        className={`px-1.5 py-0.5 font-bold uppercase tracking-wider ${
                          email.direction === "ENTRANT"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                        }`}
                      >
                        {email.direction === "ENTRANT" ? "Reçu" : "Envoyé"}
                      </span>

                      {email.hasAttachments && (
                        <span className="flex items-center gap-1 text-gray-400 font-mono">
                          <Paperclip className="w-3 h-3" />
                          {email.attachments.length} pièce(s)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* COLONNE DROITE : VOLET DE LECTURE DU COURRIEL (7/12)     */}
        {/* ======================================================== */}
        <div className="lg:col-span-7 flex flex-col h-[650px] overflow-hidden">
          {selectedEmail ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Barre d'outils de l'email */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setComposeSupplierId(selectedEmail.supplierId || 1);
                      setComposeTo(
                        selectedEmail.direction === "ENTRANT"
                          ? selectedEmail.fromAddress
                          : selectedEmail.toAddress
                      );
                      setComposeSubject(
                        selectedEmail.subject.startsWith("Re:")
                          ? selectedEmail.subject
                          : `Re: ${selectedEmail.subject}`
                      );
                      setComposeBody(
                        `\n\n--- Message d'origine ---\nDe : ${selectedEmail.fromAddress}\nDate : ${new Date(
                          selectedEmail.sentAt
                        ).toLocaleString("fr-FR")}\n\n${selectedEmail.bodyText}`
                      );
                      setIsComposeOpen(true);
                    }}
                    className="px-3 py-1.5 bg-[#F7162D] hover:bg-[#d81023] text-white text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    Répondre
                  </button>

                  <Link
                    href="/fournisseurs"
                    className="px-3 py-1.5 bg-gray-900 hover:bg-black text-white dark:bg-white dark:text-gray-900 text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Créer Bon Réception (BR)
                  </Link>
                </div>

                <button
                  onClick={() => handleDelete(selectedEmail.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 transition"
                  title="Supprimer ce courriel"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Corps de lecture */}
              <div className="flex-1 p-6 overflow-y-auto space-y-5">
                {/* En-tête de message */}
                <div className="space-y-3 pb-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-lg font-black text-gray-900 dark:text-white leading-snug">
                      {selectedEmail.subject}
                    </h2>
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        selectedEmail.direction === "ENTRANT"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {selectedEmail.direction === "ENTRANT" ? "Reçu" : "Envoyé"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white">De : </span>
                      <span className="font-mono">{selectedEmail.fromAddress}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white">À : </span>
                      <span className="font-mono">{selectedEmail.toAddress}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white">Fournisseur : </span>
                      <span>{selectedEmail.supplierName}</span>
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white">Date : </span>
                      <span>
                        {new Date(selectedEmail.sentAt).toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contenu du message */}
                <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans">
                  {selectedEmail.bodyText}
                </div>

                {/* Pièces jointes */}
                {selectedEmail.hasAttachments && selectedEmail.attachments.length > 0 && (
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Pièces jointes ({selectedEmail.attachments.length}) :
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedEmail.attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="p-3 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-5 h-5 text-[#F7162D] shrink-0" />
                            <div className="truncate">
                              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                {att.name}
                              </p>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {att.size}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => toast.info(`Téléchargement de : ${att.name}`)}
                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition"
                            title="Télécharger la pièce"
                          >
                            <FileDown className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400">
              <Mail className="w-12 h-12 text-gray-300 mb-2 stroke-1" />
              <p className="text-sm font-semibold">Sélectionnez un courriel pour lire son contenu</p>
              <p className="text-xs text-gray-400 mt-1">
                Ou cliquez sur &quot;Nouveau Courriel&quot; pour envoyer un message avec Bon de Commande.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL / TIROIR DE RÉDACTION D'UN COURRIEL                */}
      {/* ======================================================== */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 w-full max-w-2xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Barre de titre */}
            <div className="px-5 py-3.5 bg-gray-900 text-white flex items-center justify-between">
              <span className="text-sm font-bold flex items-center gap-2">
                <Send className="w-4 h-4 text-[#F7162D]" />
                Nouveau Courriel Fournisseur (Envoi via Resend)
              </span>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="text-gray-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulaire */}
            <form onSubmit={handleSendEmailSubmit} className="flex-1 flex flex-col p-5 space-y-4 overflow-y-auto">
              {/* Choix du fournisseur */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-gray-500 mb-1">
                    Fournisseur Destinataire *
                  </label>
                  <select
                    value={composeSupplierId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setComposeSupplierId(id);
                      const s = suppliersList.find((sup) => sup.id === id);
                      if (s) setComposeTo(s.email);
                    }}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold"
                  >
                    {suppliersList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-gray-500 mb-1">
                    Adresse Email (To) *
                  </label>
                  <input
                    type="email"
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-mono font-semibold"
                    required
                  />
                </div>
              </div>

              {/* Modèles de messages en 1 clic */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-2">
                  ⚡ Modèles de courriels rapides (1 clic) :
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyTemplate("DEVIS")}
                    className="px-2.5 py-1 text-[11px] font-bold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:border-[#F7162D] hover:text-[#F7162D] transition"
                  >
                    Demande de Devis & Prix
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate("COMMANDE")}
                    className="px-2.5 py-1 text-[11px] font-bold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:border-[#F7162D] hover:text-[#F7162D] transition"
                  >
                    Bon de Commande Officiel (BC)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate("VIREMENT")}
                    className="px-2.5 py-1 text-[11px] font-bold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:border-[#F7162D] hover:text-[#F7162D] transition"
                  >
                    Avis de Règlement / SWIFT
                  </button>
                </div>
              </div>

              {/* Objet */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-gray-500 mb-1">
                  Objet du Courriel *
                </label>
                <input
                  type="text"
                  placeholder="Ex : Commande de pièces Bashan 250cc - Réf BC-2026-089"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold"
                  required
                />
              </div>

              {/* Corps du message */}
              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase text-gray-500 mb-1">
                  Message *
                </label>
                <textarea
                  rows={8}
                  placeholder="Rédigez votre message ici..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs leading-relaxed font-sans"
                  required
                />
              </div>

              {/* Pièces jointes prévues */}
              {composeAttachments.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-gray-500 block">Pièce jointe :</span>
                  <div className="flex items-center gap-2">
                    {composeAttachments.map((att, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 bg-red-50 text-[#F7162D] border border-red-200 text-xs font-mono font-bold flex items-center gap-1.5"
                      >
                        <Paperclip className="w-3 h-3" />
                        {att.name} ({att.size})
                        <button
                          type="button"
                          onClick={() => setComposeAttachments([])}
                          className="hover:text-black ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions du bas */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    setComposeAttachments([
                      { name: `Bon_de_Commande_${Date.now().toString().slice(-4)}.pdf`, size: "220 Ko" },
                    ])
                  }
                  className="text-xs font-bold text-gray-600 hover:text-[#F7162D] flex items-center gap-1 transition"
                >
                  <Paperclip className="w-4 h-4" />
                  Joindre un PDF
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsComposeOpen(false)}
                    className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-bold transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSending}
                    className="px-5 py-2 bg-[#F7162D] hover:bg-[#d81023] text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSending ? "Envoi en cours..." : "Envoyer le Courriel"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
