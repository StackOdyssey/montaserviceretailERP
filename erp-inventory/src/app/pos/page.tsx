"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Search, ArrowLeft } from "lucide-react";
import { getProducts, getCategories, ProductItem, CategoryItem } from "@/lib/actions/products";
import { createSalesDocument, SalesLineInput, SalesDocumentItem } from "@/lib/actions/sales";
import { getCustomerStatement } from "@/lib/actions/customers";
import { calculateDocumentTotals } from "@/lib/money";
import { useSettings } from "@/components/layout/SettingsProvider";
import { useBusinessLine } from "@/components/layout/BusinessLineProvider";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { CartSidebar } from "@/components/pos/CartSidebar";
import { CustomerSelect } from "@/components/pos/CustomerSelect";
import { PaymentModal } from "@/components/pos/PaymentModal";
import { InvoiceModal } from "@/components/pos/InvoiceModal";
import { POS_DOC_TYPES, type PosDocType } from "@/components/pos/docTypes";

interface CartLine extends SalesLineInput {
  currentStock: number;
}

export default function POSPage() {
  const company = useSettings();
  const { activeCode: businessLineCode } = useBusinessLine();

  // Cart state
  const [cart, setCart] = useState<CartLine[]>([]);
  const [docType, setDocType] = useState<PosDocType>("BL");

  // Customer state
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("Client Comptoir Particulier");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCity, setCustomerCity] = useState("Casablanca");
  const [customerIce, setCustomerIce] = useState("");
  const [customerIsProfessional, setCustomerIsProfessional] = useState(false);
  const [customerCreditLimitCents, setCustomerCreditLimitCents] = useState<number | null>(null);
  const [customerOutstandingCents, setCustomerOutstandingCents] = useState<number | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // Product search state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Discount state
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  // Payment and checkout state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdDocument, setCreatedDocument] = useState<SalesDocumentItem | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await getCategories();
      setCategories(cats);
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
        categoryId: selectedCategory ?? undefined,
      });
      setProducts(results);
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [searchTerm, businessLineCode, selectedCategory]);

  // Load categories on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCategories();
  }, [loadCategories]);

  // Load products (debounced to avoid one query per keystroke)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  // Add product to cart
  const handleAddToCart = (product: ProductItem) => {
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
          unitPriceHTCents: product.salePriceRetailCents,
          quantity: 1,
          currentStock: product.currentStock,
        },
      ];
    });
  };

  // Update quantity
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

  // Remove item
  const removeLine = (productId: number) => {
    setCart((prevCart) => prevCart.filter((item) => item.productId !== productId));
  };

  // Calculate totals
  // Régime global : non-assujetti ⇒ taux effectif 0 (TVA ni calculée ni affichée).
  const totals = calculateDocumentTotals(
    cart.map((c) => ({
      unitPriceHT: c.unitPriceHTCents,
      quantity: c.quantity,
    })),
    discountPercent,
    company.vatLiable ? company.defaultVatRate : 0
  );

  // Open payment modal
  // T1.3 — matrice UI : FACTURE exige toujours une fiche avant même le paiement.
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
    setIsPaymentModalOpen(true);
  };

  // Process payment and create document
  const handlePayment = async (paymentData: {
    paymentMethod: "ESPECES" | "CHEQUE" | "A_CREDIT";
    chequeDetails?: {
      bankName: string;
      chequeNumber: string;
      issueDate: string;
      encaissementDate: string;
    };
  }) => {
    if (cart.length === 0) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const notes = paymentData.paymentMethod === "CHEQUE" && paymentData.chequeDetails
        ? `Chèque N°${paymentData.chequeDetails.chequeNumber} - Banque: ${paymentData.chequeDetails.bankName} - Date émission: ${paymentData.chequeDetails.issueDate} - Encaissement: ${paymentData.chequeDetails.encaissementDate}`
        : undefined;

      const doc = await createSalesDocument({
        docType,
        customerId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerCity: customerCity.trim() || undefined,
        customerIce: customerIce.trim() || undefined,
        lines: cart,
        discountPercent,
        paymentMethod: paymentData.paymentMethod,
        paidAmountCents: paymentData.paymentMethod === "A_CREDIT" ? 0 : totals.totalTTC,
        notes,
        businessLineCode,
      });

      setCreatedDocument(doc);
      setIsPaymentModalOpen(false);
      setCart([]);
      setDiscountPercent(0);
      // Reset the customer so the next sale is not silently attributed to the previous one.
      setCustomerId(null);
      setCustomerName("Client Comptoir Particulier");
      setCustomerPhone("");
      setCustomerCity("Casablanca");
      setCustomerIce("");
      setCustomerIsProfessional(false);
      setCustomerCreditLimitCents(null);
      setCustomerOutstandingCents(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erreur lors de la validation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Point de Vente</h1>
            <p className="text-xs text-gray-500">{company.raisonSociale}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {POS_DOC_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setDocType(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                docType === t.id
                  ? "bg-[#F7162D] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-auto"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Product Grid (Left) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search and Category Bar */}
          <div className="bg-white border-b border-gray-200 p-4 space-y-3">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par Réf, SKU, Nom..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#F7162D] focus:ring-2 focus:ring-[#F7162D]/10"
              />
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === null
                    ? "bg-[#F7162D] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Toutes
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === cat.id
                      ? "bg-[#F7162D] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingProducts ? (
              <div className="text-center text-gray-500 text-sm py-8">
                Chargement...
              </div>
            ) : products.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                Aucun produit trouvé
              </div>
            ) : (
              <ProductGrid
                products={products}
                onAddToCart={handleAddToCart}
              />
            )}
          </div>
        </div>

        {/* Cart Sidebar (Right) */}
        <CartSidebar
          cart={cart}
          docType={docType}
          onDocTypeChange={setDocType}
          discountPercent={discountPercent}
          onDiscountChange={setDiscountPercent}
          totals={totals}
          onUpdateQuantity={updateQuantity}
          onRemoveLine={removeLine}
          onClearCart={() => setCart([])}
          onCheckout={handleCheckout}
          onCustomerSelect={() => setIsCustomerModalOpen(true)}
          customerName={customerName}
        />
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
          onClose={() => setIsCustomerModalOpen(false)}
          onSave={async (data) => {
            setCustomerId(data.id);
            setCustomerName(data.name);
            setCustomerPhone(data.phone);
            setCustomerCity(data.city);
            setCustomerIce(data.ice);
            setCustomerIsProfessional(data.isProfessional ?? false);
            setCustomerCreditLimitCents(data.creditLimitCents);
            setIsCustomerModalOpen(false);
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
        <PaymentModal
          totalTtc={totals.totalTTC}
          creditLimitCents={customerCreditLimitCents}
          outstandingCents={customerOutstandingCents}
          customerId={customerId}
          docType={docType}
          onClose={() => setIsPaymentModalOpen(false)}
          onRequireCustomer={() => {
            setIsPaymentModalOpen(false);
            setIsCustomerModalOpen(true);
          }}
          onPayment={handlePayment}
          isSubmitting={isSubmitting}
        />
      )}

      {createdDocument && (
        <InvoiceModal
          document={createdDocument}
          onClose={() => setCreatedDocument(null)}
        />
      )}
    </div>
  );
}
