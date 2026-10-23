"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Percent,
  User,
  Boxes,
  ArrowLeft,
  AlertCircle,
  FileCheck,
  LayoutGrid,
  ChevronDown,
} from "lucide-react";
import { getProducts, ProductItem } from "@/lib/actions/products";
import { useCustomerSearch, type CustomerMatch } from "@/lib/hooks/useCustomerSearch";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { createSalesDocument, SalesLineInput, SalesDocumentItem } from "@/lib/actions/sales";
import { formatMoney, calculateDocumentTotals } from "@/lib/money";
import { useSettings, useParameters } from "@/components/layout/SettingsProvider";
import { useBusinessLine } from "@/components/layout/BusinessLineProvider";
import { DocumentPrintView } from "@/components/sales/DocumentPrintView";

interface CartLine extends SalesLineInput {
  currentStock: number;
}

const DOC_TYPES: Array<{ id: "BL" | "FACTURE" | "BC" | "DEVIS"; label: string }> = [
  { id: "BL", label: "Bon de Livraison" },
  { id: "FACTURE", label: "Facture" },
  { id: "BC", label: "Bon de Commande" },
  { id: "DEVIS", label: "Devis" },
];

const DOC_TITLES: Record<string, string> = {
  BL: "Nouveau Bon de Livraison (BL)",
  FACTURE: "Nouvelle Facture",
  BC: "Nouveau Bon de Commande (BC)",
  DEVIS: "Nouveau Devis",
};

export default function NouveauBonDeLivraisonPage() {
  const router = useRouter();
  const company = useSettings();
  const { paymentMethods } = useParameters();
  const { activeCode: businessLineCode } = useBusinessLine();

  // Liste des articles du panier
  const [cart, setCart] = useState<CartLine[]>([]);
  const [docType, setDocType] = useState<"BL" | "FACTURE" | "BC" | "DEVIS">("BL");

  // Informations client
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("Client Comptoir Particulier");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCity, setCustomerCity] = useState("Casablanca");
  const [customerIce, setCustomerIce] = useState("");
  const [isClientDetailsOpen, setIsClientDetailsOpen] = useState(false);

  // Recherche d'articles
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ProductItem[]>([]);
  const [, startSearch] = useTransition();

  // Suggestions client (recherche tolérante : ben/bennani → EL BANNANI)
  const {
    matches: customerMatches,
    hasSearched: hasCustomerSearched,
    suppress: suppressCustomerSearch,
    clear: clearCustomerMatches,
  } = useCustomerSearch(customerName, { ignoreTerm: "Client Comptoir Particulier" });

  // Remise personnalisée en %
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  // Mode de règlement
  const [paymentMethod, setPaymentMethod] = useState<
    "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "A_CREDIT"
  >("ESPECES");

  // Clé d'idempotence par panier : un retry/double-clic renvoie le doc créé
  // au lieu d'un doublon. Régénérée après chaque validation réussie.
  const idempotencyKeyRef = React.useRef<string | null>(null);
  useEffect(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
  }, []);

  // Notes
  const [notes] = useState("");

  // État de validation
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdDocument, setCreatedDocument] = useState<SalesDocumentItem | null>(null);

  // Recherche instantanée
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
      }
      startSearch(async () => {
        const results = await getProducts({ search: searchTerm, businessLineCode });
        setSearchResults(results.slice(0, 8)); // Top 8 résultats
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [searchTerm, businessLineCode]);

  const handleSelectCustomerMatch = (c: CustomerMatch) => {
    suppressCustomerSearch();
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone || "");
    setCustomerCity(c.city || "Casablanca");
    setCustomerIce(c.ice || "");
  };

  // Catalogue visuel avec photos (toucher une carte ajoute la pièce)
  const [catalogItems, setCatalogItems] = useState<ProductItem[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [catalogShown, setCatalogShown] = useState(24);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = await getProducts({ businessLineCode });
        if (!cancelled) setCatalogItems(results);
      } catch {
        // catalogue indisponible : la recherche textuelle reste utilisable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessLineCode]);

  // Ajouter un article au panier
  const addToCart = (product: ProductItem) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.productId === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prevCart,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          oemCode: product.oemCode,
          unitPriceHTCents: product.salePriceRetailCents, // prix de vente HT (la TVA est calculée par document)
          quantity: 1,
          currentStock: product.currentStock,
        },
      ];
    });
  };

  const handleAddToCart = (product: ProductItem) => {
    addToCart(product);
    setSearchTerm("");
    setSearchResults([]);
  };

  // Modifier la quantité
  const updateQuantity = (productId: number, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartLine[]
    );
  };

  // Supprimer un article
  const removeLine = (productId: number) => {
    setCart((prevCart) => prevCart.filter((item) => item.productId !== productId));
  };

  // Calcul dynamique des totaux (taux central : 0 si régime non-assujetti)
  const totals = calculateDocumentTotals(
    cart.map((c) => ({
      unitPriceHT: c.unitPriceHTCents,
      quantity: c.quantity,
    })),
    discountPercent,
    company.vatLiable ? company.defaultVatRate : 0
  );

  // Validation du BL
  const handleValidateBL = async () => {
    if (cart.length === 0) {
      setErrorMessage("Veuillez ajouter au moins une pièce au Bon de Livraison");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const doc = await createSalesDocument({
        docType,
        customerId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerCity: customerCity.trim() || undefined,
        customerIce: customerIce.trim() || undefined,
        lines: cart,
        discountPercent,
        paymentMethod,
        paidAmountCents: paymentMethod === "A_CREDIT" ? 0 : totals.totalTTC,
        notes: notes.trim() || undefined,
        businessLineCode,
        idempotencyKey: idempotencyKeyRef.current ?? undefined,
      });

      setCreatedDocument(doc);
      setCart([]);
      idempotencyKeyRef.current = crypto.randomUUID();
    } catch (err) {
      setErrorMessage((err as Error).message || "Erreur lors de la validation du BL");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="-mx-4 md:mx-0 space-y-3 md:space-y-5 pb-8">
      {/* ======================================================== */}
      {/* 1. EN-TÊTE DE LA CAISSE COMPTOIR                        */}
      {/* ======================================================== */}
      <div className="flex flex-col gap-3 bg-white p-4 md:p-5 rounded-none md:rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => router.push("/ventes")}
            aria-label="Retour aux ventes"
            className="p-2 text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-xl transition-colors shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-base md:text-xl font-bold text-[#111827] tracking-tight">
              {DOC_TITLES[docType]}
            </h1>
            <p className="text-xs text-[#6B7280]">
              Saisie rapide au comptoir{company.vatLiable ? ` • TVA ${company.defaultVatRate}%` : " • sans TVA"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 text-xs font-bold">
          {DOC_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setDocType(t.id)}
              className={`px-3 py-2 rounded-xl transition-all ${
                docType === t.id ? "bg-[#111827] text-white" : "bg-[#F8F9FA] text-[#4B5563] hover:bg-[#E5E7EB]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] text-[#F7162D] text-xs font-medium flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. ZONE DE SAISIE COMPTOIR (GRILLE 2 COLONNES)          */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* COLONNE GAUCHE (7/12) : RECHERCHE PIÈCES & CLIENT */}
        <div className="lg:col-span-7 space-y-4">
          {/* Bloc 1 : Client */}
          <div className="bg-white p-4 rounded-none md:rounded-2xl border border-[#E5E7EB] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#111827] flex items-center gap-1.5">
                <User size={15} className="text-[#F7162D]" />
                <span>Client Destinataire</span>
              </label>

              <button
                type="button"
                onClick={() => setIsClientDetailsOpen(!isClientDetailsOpen)}
                className="text-xs font-semibold text-[#F7162D] hover:underline"
              >
                {isClientDetailsOpen ? "Masquer détails" : "+ Tél / ICE / Ville"}
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setCustomerId(null);
                }}
                onBlur={() => setTimeout(() => clearCustomerMatches(), 150)}
                placeholder="Nom du client ou garage..."
                autoComplete="off"
                className="w-full px-3.5 py-2 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl font-semibold text-[#111827] outline-none focus:border-[#F7162D]"
              />
              {customerMatches.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 border border-[#E5E7EB] rounded-xl overflow-hidden bg-white shadow-lg max-h-56 overflow-y-auto">
                  {customerMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectCustomerMatch(c)}
                      className="w-full p-2.5 text-left hover:bg-[#FEF2F2]/60 border-b border-[#F3F4F6] last:border-b-0"
                    >
                      <div className="text-xs font-bold text-[#111827]">{c.name}</div>
                      <div className="text-[11px] text-[#6B7280] mt-0.5">
                        {c.phone && <span>{c.phone}</span>}
                        {c.city && <span> • {c.city}</span>}
                        {c.ice && <span> • ICE {c.ice}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {hasCustomerSearched && customerMatches.length === 0 && customerName.trim().length >= 2 && (
                <div className="text-[11px] text-[#6B7280] px-1 pt-1">
                  Nouveau client — complétez Tél / Ville ci-dessous.
                </div>
              )}
            </div>

            {isClientDetailsOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#E5E7EB]">
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Tél (WhatsApp)..."
                  className="px-3 py-1.5 text-xs bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg outline-none"
                />
                <input
                  type="text"
                  value={customerCity}
                  onChange={(e) => setCustomerCity(e.target.value)}
                  placeholder="Ville (Casablanca)..."
                  className="px-3 py-1.5 text-xs bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg outline-none"
                />
                <input
                  type="text"
                  value={customerIce}
                  onChange={(e) => setCustomerIce(e.target.value)}
                  placeholder="ICE Client (optionnel)..."
                  className="px-3 py-1.5 text-xs bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg outline-none font-mono"
                />
              </div>
            )}
          </div>

          {/* Bloc 2 : Recherche rapide des pièces */}
          <div className="bg-white p-4 rounded-none md:rounded-2xl border border-[#E5E7EB] shadow-xs space-y-3">
            <label className="text-xs font-bold text-[#111827] flex items-center gap-1.5">
              <Boxes size={15} className="text-[#F7162D]" />
              <span>Ajouter une Pièce au Comptoir</span>
            </label>

            <div className="relative">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Scanner ou taper Réf SKU, OEM, Nom (ex: BASH, frein, NGK)..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#F8F9FA] border border-[#E5E7EB] rounded-xl outline-none focus:border-[#F7162D] focus:ring-2 focus:ring-[#F7162D]/10 font-medium"
              />
            </div>

            {/* Résultats de recherche instantanée */}
            {searchResults.length > 0 && (
              <div className="border border-[#E5E7EB] rounded-xl overflow-hidden divide-y divide-[#E5E7EB] max-h-64 overflow-y-auto bg-white shadow-lg">
                {searchResults.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => handleAddToCart(product)}
                    className="p-3 hover:bg-[#FEF2F2]/60 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-[#111827]">
                          {product.sku}
                        </span>
                        {product.brand && (
                          <span className="text-[10px] bg-[#F3F4F6] text-[#4B5563] px-1.5 py-0.2 rounded font-semibold">
                            {product.brand}
                          </span>
                        )}
                        {product.currentStock < 0 && (
                          <span className="text-[9px] bg-[#FEF2F2] text-[#F7162D] px-1.5 py-0.2 rounded font-bold">
                            Stock négatif ({product.currentStock})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#374151] font-medium line-clamp-1 mt-0.5">
                        {product.name}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-[#F7162D] block">
                        {formatMoney(product.salePriceRetailCents)}
                      </span>
                      <span className="text-[10px] text-[#6B7280]">
                        Stock: {product.currentStock}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bloc 2b : Catalogue visuel avec photos (comme la version PC) */}
          <div className="bg-white p-4 rounded-none md:rounded-2xl border border-[#E5E7EB] shadow-xs space-y-3">
            <button
              type="button"
              onClick={() => setCatalogOpen(!catalogOpen)}
              className="w-full flex items-center justify-between"
            >
              <label className="text-xs font-bold text-[#111827] flex items-center gap-1.5">
                <LayoutGrid size={15} className="text-[#F7162D]" />
                <span>
                  {searchTerm.trim()
                    ? `Catalogue — résultats visuels (${searchResults.length}${searchResults.length >= 500 ? "+" : ""})`
                    : `Catalogue visuel (${catalogItems.length}${catalogItems.length >= 500 ? "+" : ""} pièces)`}
                </span>
              </label>
              <ChevronDown
                size={16}
                className={`text-[#6B7280] transition-transform ${catalogOpen ? "rotate-180" : ""}`}
              />
            </button>

            {catalogOpen && (
              <>
                <ProductGrid
                  products={
                    searchTerm.trim()
                      ? searchResults.slice(0, 12)
                      : catalogItems.slice(0, catalogShown)
                  }
                  onAddToCart={addToCart}
                  disableOutOfStock={false}
                />
                {!searchTerm.trim() && catalogShown < catalogItems.length && (
                  <button
                    type="button"
                    onClick={() => setCatalogShown((n) => n + 48)}
                    className="w-full py-2.5 text-xs font-bold text-[#F7162D] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-xl transition-colors"
                  >
                    Afficher plus ({catalogItems.length - catalogShown} restantes)
                  </button>
                )}
                <p className="text-[11px] text-[#6B7280]">
                  Touchez une carte pour ajouter la pièce. La recherche ci-dessus filtre aussi ce catalogue.
                  {catalogItems.length >= 500 && (
                    <span className="block text-[#B45309] font-semibold mt-0.5">
                      Catalogue plafonné à 500 pièces — utilisez la recherche pour trouver les autres.
                    </span>
                  )}
                </p>
              </>
            )}
          </div>

          {/* Bloc 3 : Articles ajoutés au panier */}
          <div className="bg-white p-4 rounded-none md:rounded-2xl border border-[#E5E7EB] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#111827]">
                Lignes du Bon de Livraison ({cart.length})
              </span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs text-[#6B7280] hover:text-[#F7162D]"
                >
                  Vider le panier
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6B7280]">
                Aucun article ajouté. Utilisez la recherche ci-dessus pour ajouter des pièces.
              </div>
            ) : (
              <div className="divide-y divide-[#E5E7EB]">
                {cart.map((item) => (
                  <div key={item.productId} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-[#111827]">
                          {item.sku}
                        </span>
                        {item.currentStock < 0 && (
                          <span className="text-[9px] font-bold text-[#F7162D]">
                            (Stock négatif toléré)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#374151] truncate mt-0.5">
                        {item.productName}
                      </p>
                      <span className="text-[11px] text-[#6B7280]">
                        P.U. HT: {formatMoney(item.unitPriceHTCents)}
                      </span>
                    </div>

                    {/* Stepper de quantité tactile pour iPhone 17 Pro Max */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, -1)}
                        className="w-7 h-7 rounded-lg bg-[#F3F4F6] text-[#374151] flex items-center justify-center hover:bg-[#E5E7EB] active:scale-90"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-8 text-center font-mono font-bold text-xs">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, 1)}
                        className="w-7 h-7 rounded-lg bg-[#F3F4F6] text-[#374151] flex items-center justify-center hover:bg-[#E5E7EB] active:scale-90"
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    {/* Total ligne et suppression */}
                    <div className="text-right shrink-0 min-w-[70px]">
                      <span className="font-mono font-bold text-xs text-[#111827] block">
                        {formatMoney(item.unitPriceHTCents * item.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(item.productId)}
                        className="text-[#9CA3AF] hover:text-[#F7162D] mt-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* COLONNE DROITE (5/12) : REMISE %, TOTAUX COMPTOIR & VALIDATION */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-none md:rounded-2xl border border-[#E5E7EB] shadow-xs space-y-4 sticky top-20">
            <h2 className="text-sm font-bold text-[#111827] border-b border-[#E5E7EB] pb-3">
              Récapitulatif & Remise Commerciale
            </h2>

            {/* SÉLECTEUR DE REMISE PERSONNALISÉE EN % */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#374151] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Percent size={14} className="text-[#059669]" />
                  <span>Remise accordée sur le BL (%)</span>
                </span>
                <span className="text-xs font-mono font-bold text-[#059669]">
                  {discountPercent}%
                </span>
              </label>

              {/* Boutons rapides + Saisie manuelle */}
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 5, 10, 15].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setDiscountPercent(rate)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                      discountPercent === rate
                        ? "bg-[#059669] text-white"
                        : "bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]"
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>

              {/* Saisie personnalisée */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-[#6B7280]">Autre % :</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPercent || ""}
                  onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  placeholder="ex: 8"
                  className="w-20 px-2 py-1 text-xs bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg font-bold outline-none focus:border-[#059669]"
                />
              </div>
            </div>

            {/* DÉTAIL DES TOTAUX CONFORME À LA DEMANDE UTILISATEUR */}
            <div className="space-y-2 p-4 rounded-xl bg-[#F8F9FA] border border-[#E5E7EB] text-xs">
              {/* 1. TOTAL BRUT HT */}
              <div className="flex justify-between text-[#374151]">
                <span className="font-semibold">TOTAL BRUT HT :</span>
                <span className="font-mono font-bold text-[#111827]">
                  {formatMoney(totals.totalBrutHT)}
                </span>
              </div>

              {/* 2. REMISE MENTIONNÉE EXPLICITEMENT SOUS LE TOTAL BRUT HT */}
              {totals.discountPercent > 0 ? (
                <div className="flex justify-between text-[#059669] font-bold py-1 border-y border-[#E5E7EB] bg-[#ECFDF5]/80 rounded-lg px-2">
                  <span>Remise accordée ({totals.discountPercent}%) :</span>
                  <span className="font-mono">
                    -{formatMoney(totals.discountAmount)}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-[#9CA3AF]">
                  <span>Remise (0%) :</span>
                  <span className="font-mono">0,00 DH</span>
                </div>
              )}

              {/* 3. TOTAL NET HT */}
              <div className="flex justify-between font-bold text-[#111827] pt-0.5">
                <span>TOTAL NET HT :</span>
                <span className="font-mono">
                  {formatMoney(totals.totalNetHT)}
                </span>
              </div>

              {/* 4. TVA (masquée si régime non-assujetti) */}
              {totals.tvaRate > 0 && (
                <div className="flex justify-between text-[#4B5563]">
                  <span>TVA ({company.defaultVatRate}%) :</span>
                  <span className="font-mono font-bold text-[#111827]">
                    {formatMoney(totals.tvaAmount)}
                  </span>
                </div>
              )}

              {/* 5. TOTAL TTC */}
              <div className="flex justify-between items-center text-base font-black text-white bg-[#F7162D] p-3 rounded-xl mt-2 shadow-xs">
                <span>TOTAL TTC :</span>
                <span className="font-mono tracking-tight">
                  {formatMoney(totals.totalTTC)}
                </span>
              </div>
            </div>

            {/* MODE DE RÈGLEMENT */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#374151] block">
                Mode d&apos;encaissement
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                {[
                  ...paymentMethods.map((p) => ({ id: p.code, label: p.label })),
                  { id: "A_CREDIT", label: "À Crédit (En compte)" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as typeof paymentMethod)}
                    className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                      paymentMethod === m.id
                        ? "border-[#111827] bg-[#111827] text-white"
                        : "border-[#E5E7EB] text-[#4B5563] hover:bg-[#F3F4F6]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* GRAND BOUTON DE VALIDATION (POUCE SUR IPHONE) */}
            <button
              type="button"
              onClick={handleValidateBL}
              disabled={isSubmitting || cart.length === 0}
              className="w-full py-3.5 bg-[#F7162D] hover:bg-[#D90E23] text-white font-bold text-sm rounded-xl shadow-md transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FileCheck size={18} />
              <span>
                {isSubmitting
                  ? "Validation en cours..."
                  : `Valider (${formatMoney(totals.totalTTC)})`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. MODAL D'IMPRESSION A4 APRÈS VALIDATION                */}
      {/* ======================================================== */}
      {createdDocument && (
        <DocumentPrintView
          document={createdDocument}
          onClose={() => {
            setCreatedDocument(null);
            router.push("/ventes");
          }}
        />
      )}
    </div>
  );
}
