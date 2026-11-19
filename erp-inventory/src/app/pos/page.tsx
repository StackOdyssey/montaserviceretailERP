"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Search, ArrowLeft, ReceiptText, FileText, ClipboardList, User, Clock, Ticket, UserCheck, Trash2, Landmark, BarChart3, Banknote, HandCoins, Users, Lock, ChevronDown, PackagePlus } from "lucide-react";
import { getProducts, getCategories, ProductItem, CategoryItem } from "@/lib/actions/products";
import { createSalesDocument, SalesDocumentItem, TenderInput } from "@/lib/actions/sales";
import { getCustomerStatement } from "@/lib/actions/customers";
import { getStaff, type StaffItem } from "@/lib/actions/staff";
import { calculateDocumentTotals, formatMoney } from "@/lib/money";
import { useSettings } from "@/components/layout/SettingsProvider";
import { useBusinessLine } from "@/components/layout/BusinessLineProvider";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { CartTable, PosCartLine } from "@/components/pos/CartTable";
import { NumpadPanel } from "@/components/pos/NumpadPanel";
import { SplitPaymentModal, TenderLegInput, TenderMethod } from "@/components/pos/SplitPaymentModal";
import { LineActionModal } from "@/components/pos/LineActionModal";
import { CustomerSelect } from "@/components/pos/CustomerSelect";
import { InvoiceModal } from "@/components/pos/InvoiceModal";
import { TicketsModal } from "@/components/pos/TicketsModal";
import {
  dropParkedCart,
  listParkedCarts,
  parkPosCart,
  recallParkedCart,
  type ParkedCartItem,
} from "@/lib/actions/parked-carts";
import { POS_DOC_TYPES, type PosDocType } from "@/components/pos/docTypes";
import { ProductQuickAddModal } from "@/components/pos/ProductQuickAddModal";
import { ProductCreateModal } from "@/components/pos/ProductCreateModal";
import { getOpenTillDay, getTillStats, type TillDayItem } from "@/lib/actions/till";
import { getCustomerPricing } from "@/lib/actions/pricing";
import {
  TillGateModal,
  TillStatsModal,
  TillExpenseModal,
  TillSettlementModal,
  TillSituationModal,
  CloseDayModal,
} from "@/components/pos/TillModals";

const DOC_TYPE_ICONS = {
  BL: ReceiptText,
  FACTURE: FileText,
  BC: ClipboardList,
  DEVIS: FileText,
} as const;

const LINE_DISCOUNT_CAP = 10; // aligné sur LINE_DISCOUNT_CAP_PERCENT serveur

/** Payload client du ticket garé — sérialisé en jsonb côté serveur. */
interface ParkPayload {
  cart: PosCartLine[];
  discountPercent: number;
  customer: {
    id: number | null;
    name: string;
    phone: string;
    city: string;
    ice: string;
    isProfessional: boolean;
  };
}

export default function POSPage() {
  const company = useSettings();
  const { activeCode: businessLineCode } = useBusinessLine();
  const tvaRate = company.vatLiable ? company.defaultVatRate : 0;

  // Cart state
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [docType, setDocType] = useState<PosDocType>("BL");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [numpadValue, setNumpadValue] = useState("");
  const [parkedCarts, setParkedCarts] = useState<ParkedCartItem[]>([]);
  const [isRecallOpen, setIsRecallOpen] = useState(false);
  const [lineAction, setLineAction] = useState<{ mode: "force" | "rename"; productId: number } | null>(null);

  // Customer state
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("Client Comptoir Particulier");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCity, setCustomerCity] = useState("Casablanca");
  const [customerIce, setCustomerIce] = useState("");
  const [customerIsProfessional, setCustomerIsProfessional] = useState(false);
  const [customerCreditLimitCents, setCustomerCreditLimitCents] = useState<number | null>(null);
  const [customerOutstandingCents, setCustomerOutstandingCents] = useState<number | null>(null);
  // M1 — tarifs/désignations spécifiques du client sélectionné (productId → résolu).
  const [priceOverrides, setPriceOverrides] = useState<Record<number, { priceHtCents: number; designation: string | null }>>({});
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // Vendeur / commercial (legacy employe_comsecteurid) — sticky pour la session caisse.
  const [commercialId, setCommercialId] = useState<number | null>(null);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);

  // Product search state
  const [searchTerm, setSearchTerm] = useState("");

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [mobileTab, setMobileTab] = useState<"catalog" | "cart">("catalog");
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isTicketsModalOpen, setIsTicketsModalOpen] = useState(false);

  // Caisse (Phase 2) — journée ouverte obligatoire pour vendre au comptoir.
  const [journee, setJournee] = useState<TillDayItem | null>(null);
  const [journeeChecked, setJourneeChecked] = useState(false);
  const [caisseOpen, setCaisseOpen] = useState(false);
  const [tillModal, setTillModal] = useState<null | "stats" | "expense" | "settlement" | "situation" | "close">(null);
  const [payInitialMethod, setPayInitialMethod] = useState<TenderMethod>("ESPECES");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const returnToPaymentRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdDocument, setCreatedDocument] = useState<SalesDocumentItem | null>(null);

  useEffect(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
  }, []);

  const loadParkedCarts = useCallback(async () => {
    try {
      const res = await listParkedCarts(businessLineCode);
      if (res.ok) setParkedCarts(res.value);
    } catch {
      // liste en attente indisponible — non bloquant pour la vente
    }
  }, [businessLineCode]);

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getCategories());
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const results = await getProducts({
        search: searchTerm,
        businessLineCode,
      });
      setProducts(results);
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [searchTerm, businessLineCode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCategories();
    loadParkedCarts();
    getStaff("COMMERCIAL")
      .then((r) => {
        if (r.ok) setStaffList(r.value.filter((s) => s.isActive));
      })
      .catch(() => {});
  }, [loadCategories, loadParkedCarts]);

  useEffect(() => {
    const timer = setTimeout(loadProducts, 200);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  // C1 — détecte une journée déjà ouverte à l'arrivée sur le POS (multi-poste :
  // une caisse ouverte sur un autre poste bloque l'ouverture ici aussi).
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJourneeChecked(false);
    getOpenTillDay(businessLineCode)
      .then((r) => {
        if (!active) return;
        if (r.ok) setJournee(r.value);
        setJourneeChecked(true);
      })
      .catch(() => {
        if (active) setJourneeChecked(true);
      });
    return () => {
      active = false;
    };
  }, [businessLineCode]);

  // M1 — charge les tarifs du client sélectionné (clientproduits + price_level).
  useEffect(() => {
    let active = true;
    if (!customerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPriceOverrides({});
      return;
    }
    const ids = [...new Set([...products.map((p) => p.id), ...cart.map((l) => l.productId)])];
    getCustomerPricing(customerId, ids)
      .then((r) => {
        if (active && r.ok) setPriceOverrides(r.value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // cart est relu au changement client/catalogue — pas une dépendance volontaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, products]);

  // M1 — repricer les lignes « auto » au changement de tarif client. Les prix
  // forcés/offerts ou retouchés manuellement sont préservés.
  const prevOverridesRef = useRef<Record<number, { priceHtCents: number; designation: string | null }>>({});
  useEffect(() => {
    const prev = prevOverridesRef.current;
    prevOverridesRef.current = priceOverrides;
    setCart((prevCart) =>
      prevCart.map((l) => {
        if (l.isFree || l.priceForced) return l;
        const autoPrice = prev[l.productId]?.priceHtCents ?? l.catalogPriceHTCents ?? l.unitPriceHTCents;
        if (l.unitPriceHTCents !== autoPrice) return l;
        const next = priceOverrides[l.productId];
        const nextPrice = next?.priceHtCents ?? l.catalogPriceHTCents ?? l.unitPriceHTCents;
        const prevDesignation = prev[l.productId]?.designation;
        const customLabel =
          prevDesignation && l.customLabel === prevDesignation ? next?.designation ?? undefined : l.customLabel;
        if (nextPrice === l.unitPriceHTCents && customLabel === l.customLabel) return l;
        return { ...l, unitPriceHTCents: nextPrice, customLabel };
      })
    );
  }, [priceOverrides]);

  const [quickAddProduct, setQuickAddProduct] = useState<ProductItem | null>(null);
  const [isProductCreateOpen, setIsProductCreateOpen] = useState(false);

  const addToCart = useCallback((product: ProductItem, quantity: number) => {
    setCart((prevCart) => {
      const stock = Math.max(0, product.currentStock);
      const existing = prevCart.find((item) => item.productId === product.id);
      if (existing) {
        const merged = Math.min(existing.quantity + quantity, stock);
        if (merged === existing.quantity) return prevCart;
        return prevCart.map((item) =>
          item.productId === product.id ? { ...item, quantity: merged } : item
        );
      }
      const qty = Math.min(quantity, stock);
      if (qty <= 0) return prevCart;
      const ov = priceOverrides[product.id];
      return [
        ...prevCart,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          oemCode: product.oemCode,
          unitPriceHTCents: ov?.priceHtCents ?? product.salePriceRetailCents,
          catalogPriceHTCents: product.salePriceRetailCents,
          customLabel: ov?.designation ?? undefined,
          quantity: qty,
          currentStock: product.currentStock,
        },
      ];
    });
  }, [priceOverrides]);

  const handleQuickAddConfirm = (product: ProductItem, quantity: number) => {
    addToCart(product, quantity);
    setSelectedProductId(product.id);
    setQuickAddProduct(null);
    setMobileTab("cart");
  };

  // R2 — scan-first : Entrée sur un code exact (barcode EAN13 ou réf/SKU) ajoute
  // directement qté 1 sans passer par le popup. Sinon → le filtre catalogue.
  const handleScanEnter = async () => {
    const term = searchTerm.trim();
    if (!term) return;
    const candidates = await getProducts({ search: term, businessLineCode });
    const isEan = /^\d{13}$/.test(term);
    const hit =
      (isEan
        ? candidates.find((p) => p.barcode === term)
        : candidates.find((p) => p.sku === term)) ??
      candidates.find((p) => p.sku === term || p.barcode === term) ??
      (candidates.length === 1 ? candidates[0] : undefined);
    if (hit && hit.currentStock > 0) {
      const inCart = cart.find((l) => l.productId === hit.id)?.quantity ?? 0;
      if (inCart >= hit.currentStock) {
        setErrorMessage(`${hit.name} — stock max atteint (${hit.currentStock})`);
        setSearchTerm("");
        return;
      }
      addToCart(hit, 1);
      setSelectedProductId(hit.id);
      setSearchTerm("");
      setMobileTab("cart");
    }
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) =>
          item.productId === productId
            ? item.quantity + delta > 0
              ? { ...item, quantity: Math.min(item.quantity + delta, Math.max(1, item.currentStock)) }
              : null
            : item
        )
        .filter(Boolean) as PosCartLine[]
    );
  };

  const patchLine = (productId: number, patch: Partial<PosCartLine>) =>
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));

  const removeLine = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    if (selectedProductId === productId) setSelectedProductId(null);
  };

  const clearCart = () => {
    setCart([]);
    setSelectedProductId(null);
    setNumpadValue("");
  };

  // --- Ops numpad sur la ligne sélectionnée ---
  const selectedLine = cart.find((l) => l.productId === selectedProductId) ?? null;

  const handleSetQuantity = () => {
    const qty = parseInt(numpadValue, 10);
    if (!selectedLine || !Number.isFinite(qty) || qty <= 0) return;
    const capped = Math.min(qty, Math.max(1, selectedLine.currentStock));
    if (capped !== qty) setErrorMessage(`Quantité ramenée au stock disponible (${selectedLine.currentStock})`);
    patchLine(selectedLine.productId, { quantity: capped });
    setNumpadValue("");
  };

  const handleLineDiscount = () => {
    const pct = parseFloat(numpadValue.replace(",", "."));
    if (!selectedLine || !Number.isFinite(pct)) return;
    if (pct > LINE_DISCOUNT_CAP) {
      setErrorMessage(`Remise ligne plafonnée à ${LINE_DISCOUNT_CAP}%`);
      return;
    }
    patchLine(selectedLine.productId, { discountPercent: pct > 0 ? pct : undefined });
    setNumpadValue("");
  };

  const handleToggleFree = () => {
    if (!selectedLine) return;
    if (selectedLine.isFree) {
      // Restaure le prix catalogue posé à l'ajout — jamais un prix négocié.
      patchLine(selectedLine.productId, {
        isFree: false,
        priceForced: false,
        forceReason: undefined,
        unitPriceHTCents: selectedLine.catalogPriceHTCents ?? selectedLine.unitPriceHTCents,
        unitPriceTtcCents: undefined,
      });
    } else {
      patchLine(selectedLine.productId, {
        isFree: true,
        priceForced: false,
        discountPercent: undefined,
        unitPriceHTCents: 0,
        unitPriceTtcCents: 0,
      });
    }
    setNumpadValue("");
  };

  const handleConfirmForce = (ttcCents: number, reason: string) => {
    if (!lineAction) return;
    const line = cart.find((l) => l.productId === lineAction.productId);
    if (!line) return;
    if (ttcCents === 0) {
      // R.For à 0 = offert déguisé → bascule sur le chemin OFFERT.
      patchLine(line.productId, {
        isFree: true,
        priceForced: false,
        discountPercent: undefined,
        unitPriceHTCents: 0,
        unitPriceTtcCents: 0,
        forceReason: reason,
      });
    } else {
      patchLine(line.productId, {
        isFree: false,
        priceForced: true,
        unitPriceTtcCents: ttcCents,
        unitPriceHTCents: Math.round(ttcCents / (1 + tvaRate / 100)),
        forceReason: reason,
      });
    }
    setLineAction(null);
    setNumpadValue("");
  };

  const handleConfirmRename = (label: string) => {
    if (!lineAction) return;
    patchLine(lineAction.productId, { customLabel: label });
    setLineAction(null);
  };

  // --- Mise en attente / rappel — serveur (partagé entre postes, R10/R11) ---
  const parkCart = async () => {
    if (cart.length === 0) return;
    const payload: ParkPayload = {
      cart,
      discountPercent,
      customer: {
        id: customerId,
        name: customerName,
        phone: customerPhone,
        city: customerCity,
        ice: customerIce,
        isProfessional: customerIsProfessional,
      },
    };
    const res = await parkPosCart({
      docType,
      businessLineCode,
      customerId,
      customerName,
      commercialId,
      payload,
    });
    if (!res.ok) {
      setErrorMessage(res.error);
      return;
    }
    clearCart();
    setDiscountPercent(0);
    await loadParkedCarts();
  };

  const recallCart = async (id: number) => {
    const res = await recallParkedCart(id);
    if (!res.ok) {
      setErrorMessage(res.error);
      await loadParkedCarts(); // déjà rappelé ailleurs → liste fraîche
      return;
    }
    const payload = res.value.payload as ParkPayload;
    setCart(payload.cart);
    setDocType(res.value.docType as PosDocType);
    setDiscountPercent(payload.discountPercent);
    setCustomerId(payload.customer?.id ?? res.value.customerId);
    setCustomerName(payload.customer?.name ?? res.value.customerName ?? "Client Comptoir Particulier");
    setCustomerPhone(payload.customer?.phone ?? "");
    setCustomerCity(payload.customer?.city ?? "Casablanca");
    setCustomerIce(payload.customer?.ice ?? "");
    setCustomerIsProfessional(payload.customer?.isProfessional ?? false);
    if (res.value.commercialId) setCommercialId(res.value.commercialId);
    setParkedCarts((prev) => prev.filter((x) => x.id !== id));
    setIsRecallOpen(false);
    setMobileTab("cart");
  };

  const dropParked = async (id: number) => {
    const res = await dropParkedCart(id);
    if (!res.ok) {
      setErrorMessage(res.error);
      return;
    }
    setParkedCarts((prev) => prev.filter((x) => x.id !== id));
  };

  // Le comptoir ne voit que le vendable — ruptures masquées
  // (le scan refuse aussi le stock ≤ 0 dans handleScanEnter).
  const sellableProducts = products.filter((p) => p.currentStock > 0);

  const totals = calculateDocumentTotals(
    cart.map((c) => ({
      unitPriceHT: c.unitPriceHTCents,
      quantity: c.quantity,
      discountPercent: c.discountPercent,
    })),
    discountPercent,
    tvaRate
  );

  const handleCheckout = () => {
    if (cart.length === 0) {
      setErrorMessage("Veuillez ajouter au moins un article");
      return;
    }
    if (docType === "FACTURE" && customerId == null) {
      setErrorMessage("FACTURE : sélectionnez ou créez la fiche client avant de valider.");
      setIsCustomerModalOpen(true);
      return;
    }
    setErrorMessage(null);
    // DEVIS : pas de règlement — émission directe (devis non payé, hors stock).
    if (docType === "DEVIS") {
      void handlePayment({ tenders: [], creditCents: 0 });
      return;
    }
    setPayInitialMethod("ESPECES");
    setIsPaymentModalOpen(true);
  };

  /** Règlement rapide par méthode : le modal s'ouvre avec la jambe au total. */
  const handleQuickMethod = (method: TenderMethod) => {
    if (cart.length === 0) return;
    if (docType === "FACTURE" && customerId == null) {
      setErrorMessage("FACTURE : sélectionnez ou créez la fiche client avant de valider.");
      setIsCustomerModalOpen(true);
      return;
    }
    setErrorMessage(null);
    setPayInitialMethod(method);
    setIsPaymentModalOpen(true);
  };

  const handleQuickCash = () => {
    if (cart.length === 0) return;
    // Vente à 0 (100% offert) : aucune jambe — le serveur marque PAYE sans règlement.
    const tenders: TenderLegInput[] =
      totals.totalTTC > 0 ? [{ method: "ESPECES", amountCents: totals.totalTTC }] : [];
    void handlePayment({ tenders, creditCents: 0 });
  };

  const handlePayment = async ({ tenders, creditCents }: { tenders: TenderLegInput[]; creditCents: number }) => {
    if (cart.length === 0) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // Motif agrégé : prix forcés + offerts déclenchent le garde hors-catalogue.
      const forced = cart.filter((l) => l.priceForced && !l.isFree);
      const free = cart.filter((l) => l.isFree);
      const overrideReason =
        [
          ...forced.map((l) => `${l.sku} prix forcé (${l.forceReason || "caisse"})`),
          ...(free.length ? [`${free.length} article(s) offert(s)`] : []),
        ].join(" — ") || undefined;

      const res = await createSalesDocument({
        docType,
        customerId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerCity: customerCity.trim() || undefined,
        customerIce: customerIce.trim() || undefined,
        lines: cart.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          sku: l.sku,
          oemCode: l.oemCode,
          unitPriceHTCents: l.unitPriceHTCents,
          unitPriceTtcCents: l.unitPriceTtcCents,
          quantity: l.quantity,
          customLabel: l.customLabel,
          isFree: l.isFree,
          priceForced: l.priceForced,
          discountPercent: l.discountPercent,
        })),
        discountPercent,
        // Compat : ignoré quand tenders est présent (le serveur prend la 1ʳᵉ jambe).
        // DEVIS : pas de règlement — ESPECES/0 payé ne déclenche ni crédit ni fiche.
        paymentMethod:
          docType === "DEVIS"
            ? "ESPECES"
            : tenders.length === 0
              ? creditCents > 0
                ? "A_CREDIT"
                : "ESPECES" // vente 100% offerte (total 0) — réglée d'office
              : (["ESPECES", "CHEQUE", "EFFET_LCN", "VIREMENT", "CARTE_BANCAIRE", "VERSEMENT"].includes(tenders[0].method)
                  ? tenders[0].method
                  : "ESPECES") as "ESPECES" | "CHEQUE" | "EFFET_LCN" | "VIREMENT" | "CARTE_BANCAIRE" | "VERSEMENT" | "A_CREDIT",
        paidAmountCents: docType === "DEVIS" ? 0 : tenders.reduce((s, t) => s + t.amountCents, 0),
        tenders: tenders.length ? (tenders as TenderInput[]) : undefined,
        overrideReason,
        commercialId,
        businessLineCode,
        idempotencyKey: idempotencyKeyRef.current ?? undefined,
      });
      if (!res.ok) {
        setErrorMessage(res.error);
        return;
      }

      setCreatedDocument(res.document);
      setIsPaymentModalOpen(false);

      // C7 — plafond de caisse (legacy employe.plafond, t=10) : après un
      // encaissement espèces, avertir si le tiroir dépasse le plafond du caissier.
      if (tenders.some((t) => t.method === "ESPECES")) {
        try {
          const s = await getTillStats(businessLineCode);
          if (s.ok && s.value?.plafondCents != null && s.value.cashDrawerCents > s.value.plafondCents) {
            setErrorMessage(
              `Plafond caisse dépassé — tiroir ${formatMoney(s.value.cashDrawerCents)} / plafond ${formatMoney(s.value.plafondCents)}. Versement conseillé.`
            );
          }
        } catch {
          // stats indisponibles — non bloquant pour la vente
        }
      }

      clearCart();
      setDiscountPercent(0);
      setCustomerId(null);
      setCustomerName("Client Comptoir Particulier");
      setCustomerPhone("");
      setCustomerCity("Casablanca");
      setCustomerIce("");
      setCustomerIsProfessional(false);
      setCustomerCreditLimitCents(null);
      setCustomerOutstandingCents(null);
      idempotencyKeyRef.current = crypto.randomUUID();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erreur lors de la validation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedForModal = lineAction ? cart.find((l) => l.productId === lineAction.productId) : null;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 sm:px-4 flex flex-wrap items-center gap-x-3 gap-y-2 justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            href="/"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            aria-label="Retour au tableau de bord"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-gray-900 leading-tight whitespace-nowrap">Point de Vente</h1>
            <p className="text-[11px] text-gray-500 truncate">{company.raisonSociale}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {POS_DOC_TYPES.map((t) => {
            const Icon = DOC_TYPE_ICONS[t.id];
            return (
              <button
                key={t.id}
                onClick={() => setDocType(t.id)}
                title={t.label}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  docType === t.id ? "bg-[#F7162D] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Icon size={15} />
                <span className="sm:hidden">{t.shortLabel}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setIsTicketsModalOpen(true)}
            title="Tickets du jour — réimprimer / annuler"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-amber-100 text-amber-800 hover:bg-amber-200 transition-all"
          >
            <Ticket size={15} />
            <span className="hidden sm:inline">Tickets</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setCaisseOpen((v) => !v)}
              title="Gestion de caisse — journée, dépenses, règlements, clôture"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-all"
            >
              <Landmark size={15} />
              <span className="hidden sm:inline">Caisse</span>
              <ChevronDown size={12} />
            </button>
            {caisseOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCaisseOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                  {(
                    [
                      { key: "stats", label: "Journée — chiffres", Icon: BarChart3 },
                      { key: "expense", label: "Dépense caisse", Icon: Banknote },
                      { key: "settlement", label: "Règlement client", Icon: HandCoins },
                      { key: "situation", label: "Situation clients", Icon: Users },
                    ] as const
                  ).map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTillModal(key);
                        setCaisseOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <Icon size={14} className="text-gray-400" /> {label}
                    </button>
                  ))}
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => {
                      setTillModal("close");
                      setCaisseOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    <Lock size={14} /> Clôturer la journée
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="mx-3 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-auto">✕</button>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Zone gauche : ticket (haut) + catalogue (bas) */}
        <div className={`flex-1 flex-col overflow-hidden ${mobileTab === "cart" ? "hidden md:flex" : "flex"}`}>
          {/* Client + vendeur — barre au-dessus du panier (desktop) */}
          <div className="hidden md:flex bg-white border-b border-gray-200 px-3 py-2 items-center gap-2">
            <button
              onClick={() => setIsCustomerModalOpen(true)}
              className="flex-[2] min-w-0 h-12 flex items-center gap-2 px-3 bg-gray-50 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <User size={18} className="text-gray-600 shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-bold text-gray-900 truncate">{customerName}</div>
                <div className="text-[11px] font-semibold text-gray-600">{customerId ? `Fiche #${customerId}` : "Comptoir — modifier"}</div>
              </div>
              {Object.keys(priceOverrides).length > 0 && (
                <span className="shrink-0 text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded px-1.5 py-0.5">Tarif client</span>
              )}
            </button>
            {staffList.length > 0 && (
              <div className="flex-1 min-w-0 h-12 flex items-center gap-2 px-3 bg-gray-50 border border-gray-300 rounded-lg">
                <UserCheck size={18} className="text-gray-500 shrink-0" />
                <select
                  value={commercialId ?? ""}
                  onChange={(e) => setCommercialId(e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 min-w-0 bg-transparent text-sm font-bold text-gray-900 outline-none cursor-pointer"
                  aria-label="Vendeur"
                >
                  <option value="">Vendeur : —</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Cart table */}
          <div className="h-[38%] min-h-[180px] bg-white border-b border-gray-200 flex flex-col">
            <CartTable
              cart={cart}
              selectedProductId={selectedProductId}
              tvaRate={tvaRate}
              onSelect={setSelectedProductId}
              onRemoveLine={removeLine}
              onUpdateQuantity={updateQuantity}
            />
          </div>

          {/* Search + categories */}
          <div className="bg-white border-b border-gray-200 p-3 space-y-2">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="searchTerm"
                name="searchTerm"
                aria-label="Rechercher un produit"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleScanEnter();
                  }
                }}
                placeholder="Scanner le code-barres ou rechercher (Réf, Nom)…"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D] focus:ring-2 focus:ring-[#F7162D]/10"
              />
              <button
                type="button"
                onClick={() => setIsProductCreateOpen(true)}
                title="Nouveau produit"
                aria-label="Nouveau produit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-[#F7162D] hover:bg-red-50 rounded-lg transition-colors"
              >
                <PackagePlus size={18} />
              </button>
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {isLoadingProducts ? (
              <div className="text-center text-gray-500 text-sm py-8">Chargement...</div>
            ) : products.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">Aucun produit trouvé</div>
            ) : sellableProducts.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                {products.length} produit(s) en rupture de stock
              </div>
            ) : (
              <ProductGrid products={sellableProducts} onAddToCart={setQuickAddProduct} pricing={priceOverrides} />
            )}
          </div>
        </div>

        {/* Panneau droit : client + numpad + encaissement */}
        <div className={`w-full md:w-[340px] lg:w-[380px] shrink-0 flex flex-col ${mobileTab === "catalog" ? "hidden md:flex" : "flex"}`}>
          {/* Customer — mobile seulement (desktop : barre au-dessus du panier) */}
          <div className="md:hidden bg-white border-l border-b border-gray-200 p-3">
            <button
              onClick={() => setIsCustomerModalOpen(true)}
              className="w-full flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <User size={16} className="text-gray-500" />
              <div className="flex-1 text-left min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">{customerName}</div>
                <div className="text-[10px] text-gray-500">{customerId ? `Fiche #${customerId}` : "Comptoir — modifier"}</div>
              </div>
            </button>
            {staffList.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg">
                <UserCheck size={14} className="text-gray-400 shrink-0" />
                <select
                  value={commercialId ?? ""}
                  onChange={(e) => setCommercialId(e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 bg-transparent text-[11px] font-semibold text-gray-700 outline-none cursor-pointer"
                  aria-label="Vendeur"
                >
                  <option value="">Vendeur : —</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <NumpadPanel
              value={numpadValue}
              onValueChange={setNumpadValue}
              hasSelection={selectedLine != null}
              cartCount={cart.length}
              parkedCount={parkedCarts.length}
              totals={totals}
              isSubmitting={isSubmitting}
              isDevis={docType === "DEVIS"}
              globalDiscount={discountPercent}
              onGlobalDiscount={setDiscountPercent}
              onSetQuantity={handleSetQuantity}
              onForcePrice={() => selectedLine && setLineAction({ mode: "force", productId: selectedLine.productId })}
              onLineDiscount={handleLineDiscount}
              onToggleFree={handleToggleFree}
              onRename={() => selectedLine && setLineAction({ mode: "rename", productId: selectedLine.productId })}
              onDeleteLine={() => selectedLine && removeLine(selectedLine.productId)}
              onPark={parkCart}
              onRecall={() => setIsRecallOpen(true)}
              onClearCart={clearCart}
              onQuickCash={handleQuickCash}
              onQuickMethod={handleQuickMethod}
              onCheckout={handleCheckout}
            />
          </div>
        </div>
      </div>

      {/* Barre d'onglets mobile */}
      <div className="md:hidden bg-white border-t border-gray-200 grid grid-cols-2">
        <button
          onClick={() => setMobileTab("catalog")}
          className={`py-3 text-sm font-bold ${mobileTab === "catalog" ? "text-[#F7162D]" : "text-gray-500"}`}
        >
          Catalogue
        </button>
        <button
          onClick={() => setMobileTab("cart")}
          className={`py-3 text-sm font-bold relative ${mobileTab === "cart" ? "text-[#F7162D]" : "text-gray-500"}`}
        >
          Panier
          {cartCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[#F7162D] text-white text-[11px]">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Modals */}
      {isCustomerModalOpen && (
        <CustomerSelect
          customerId={customerId}
          customerName={customerName}
          customerPhone={customerPhone}
          customerCity={customerCity}
          customerIce={customerIce}
          customerIsProfessional={customerIsProfessional}
          onClose={() => {
            returnToPaymentRef.current = false;
            setIsCustomerModalOpen(false);
          }}
          onSave={async (data) => {
            setCustomerId(data.id);
            setCustomerName(data.name);
            setCustomerPhone(data.phone);
            setCustomerCity(data.city);
            setCustomerIce(data.ice);
            setCustomerIsProfessional(data.isProfessional ?? false);
            setCustomerCreditLimitCents(data.creditLimitCents);
            setIsCustomerModalOpen(false);
            if (returnToPaymentRef.current) {
              returnToPaymentRef.current = false;
              setIsPaymentModalOpen(true);
            }
            if (data.id) {
              try {
                const stmt = await getCustomerStatement(data.id);
                setCustomerOutstandingCents(stmt?.balanceDueCents ?? 0);
              } catch {
                setCustomerOutstandingCents(null);
              }
            } else {
              setCustomerOutstandingCents(null);
            }
          }}
        />
      )}

      {isPaymentModalOpen && (
        <SplitPaymentModal
          totalTtc={totals.totalTTC}
          customerId={customerId}
          customerName={customerName}
          creditLimitCents={customerCreditLimitCents}
          outstandingCents={customerOutstandingCents}
          docType={docType}
          initialMethod={payInitialMethod}
          isSubmitting={isSubmitting}
          onClose={() => setIsPaymentModalOpen(false)}
          onRequireCustomer={() => {
            returnToPaymentRef.current = true;
            setIsPaymentModalOpen(false);
            setIsCustomerModalOpen(true);
          }}
          onPayment={handlePayment}
        />
      )}

      {isTicketsModalOpen && (
        <TicketsModal onClose={() => setIsTicketsModalOpen(false)} onCancelled={() => loadProducts()} />
      )}

      {/* Caisse — gate bloquant tant qu'aucune journée n'est ouverte */}
      {journeeChecked && !journee && (
        <TillGateModal businessLineCode={businessLineCode} onOpened={setJournee} />
      )}
      {tillModal === "stats" && <TillStatsModal businessLineCode={businessLineCode} onClose={() => setTillModal(null)} />}
      {tillModal === "expense" && journee && <TillExpenseModal journeeId={journee.id} onClose={() => setTillModal(null)} />}
      {tillModal === "settlement" && <TillSettlementModal onClose={() => setTillModal(null)} />}
      {tillModal === "situation" && <TillSituationModal onClose={() => setTillModal(null)} />}
      {tillModal === "close" && journee && (
        <CloseDayModal
          journee={journee}
          businessLineCode={businessLineCode}
          onClose={() => setTillModal(null)}
          onClosed={() => {
            setTillModal(null);
            setJournee(null);
          }}
        />
      )}

      {createdDocument && (
        <InvoiceModal document={createdDocument} onClose={() => setCreatedDocument(null)} onCancelled={() => loadProducts()} />
      )}

      {quickAddProduct && (
        <ProductQuickAddModal
          product={quickAddProduct}
          quantityInCart={cart.find((l) => l.productId === quickAddProduct.id)?.quantity ?? 0}
          displayName={priceOverrides[quickAddProduct.id]?.designation}
          priceHtCents={priceOverrides[quickAddProduct.id]?.priceHtCents}
          onClose={() => setQuickAddProduct(null)}
          onConfirm={handleQuickAddConfirm}
        />
      )}

      {isProductCreateOpen && (
        <ProductCreateModal
          categories={categories}
          businessLineCode={businessLineCode}
          onClose={() => setIsProductCreateOpen(false)}
          onCreated={(p) => {
            setIsProductCreateOpen(false);
            setProducts((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
            setQuickAddProduct(p);
          }}
        />
      )}

      {selectedForModal && lineAction && (
        <LineActionModal
          mode={lineAction.mode}
          productName={selectedForModal.productName}
          currentTtcCents={selectedForModal.unitPriceTtcCents ?? Math.round(selectedForModal.unitPriceHTCents * (1 + tvaRate / 100))}
          currentLabel={selectedForModal.customLabel}
          initialTtc={lineAction.mode === "force" ? numpadValue : undefined}
          onClose={() => setLineAction(null)}
          onConfirmForce={handleConfirmForce}
          onConfirmRename={handleConfirmRename}
        />
      )}

      {/* Rappel des tickets en attente */}
      {isRecallOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 font-bold text-gray-900 flex items-center gap-2">
              <Clock size={16} /> Tickets en attente ({parkedCarts.length})
            </div>
            <div className="max-h-80 overflow-y-auto">
              {parkedCarts.map((p) => {
                const lines = (p.payload?.cart as PosCartLine[] | undefined) ?? [];
                return (
                  <div key={p.id} className="flex items-center border-b border-gray-100">
                    <button
                      onClick={() => void recallCart(p.id)}
                      className="flex-1 text-left px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="text-xs font-bold text-gray-900">
                        #{p.id} · {lines.length} ligne(s) — {new Date(p.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        {p.docType !== "BL" && <span className="ml-1 text-[10px] text-gray-400">({p.docType})</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {p.customerName || "Comptoir"} · {lines.map((l) => l.sku).join(", ")}
                        {p.commercialName ? ` · ${p.commercialName}` : ""}
                        {p.actorName ? ` · par ${p.actorName}` : ""}
                      </div>
                    </button>
                    <button
                      onClick={() => void dropParked(p.id)}
                      className="px-3 py-3 text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="Abandonner ce ticket"
                      aria-label={`Abandonner le ticket #${p.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="p-3">
              <button onClick={() => setIsRecallOpen(false)} className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-700">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
