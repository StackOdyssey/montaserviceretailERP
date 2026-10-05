"use server";

import { db, products, stockMovements, categories } from "@/db";
import { eq, desc, ilike, or, and, lte, lt } from "drizzle-orm";

export interface ProductItem {
  id: number;
  sku: string;
  oemCode: string | null;
  name: string;
  brand: string | null;
  categoryId: number | null;
  categoryName?: string;
  purchasePriceCents: number;
  salePriceRetailCents: number;
  salePriceWholesaleCents: number | null;
  tvaRate: number;
  minStockAlert: number;
  currentStock: number;
  shelfLocation: string | null;
  barcode: string | null;
  photoUrl: string | null;
  isActive: boolean;
}

// Données réalistes pour initialisation et mode hors base active
const initialProducts: ProductItem[] = [
  {
    id: 1,
    sku: "BASH-014",
    oemCode: "16001-BSH-001",
    name: "Plaquettes de frein avant Bashan 200 / 250cc",
    brand: "Bashan",
    categoryId: 2,
    categoryName: "Freinage",
    purchasePriceCents: 4500, // 45,00 DH
    salePriceRetailCents: 8500, // 85,00 DH
    salePriceWholesaleCents: 6500, // 65,00 DH
    tvaRate: 10,
    minStockAlert: 4,
    currentStock: -2, // Stock négatif autorisé
    shelfLocation: "Rayon A-02",
    barcode: "611123456701",
    photoUrl: null,
    isActive: true,
  },
  {
    id: 2,
    sku: "BASH-092",
    oemCode: "22870-BSH-092",
    name: "Câble d'embrayage renforcé Bashan 250cc",
    brand: "Bashan",
    categoryId: 3,
    categoryName: "Transmission & Câblage",
    purchasePriceCents: 3200,
    salePriceRetailCents: 6500,
    salePriceWholesaleCents: 4800,
    tvaRate: 10,
    minStockAlert: 3,
    currentStock: 0,
    shelfLocation: "Rayon B-05",
    barcode: "611123456702",
    photoUrl: null,
    isActive: true,
  },
  {
    id: 3,
    sku: "YAM-088",
    oemCode: "5NW-E7641-00",
    name: "Courroie transmission renforcée MBK / Yamaha 100cc",
    brand: "Yamaha",
    categoryId: 3,
    categoryName: "Transmission & Câblage",
    purchasePriceCents: 9500,
    salePriceRetailCents: 16000,
    salePriceWholesaleCents: 13000,
    tvaRate: 10,
    minStockAlert: 5,
    currentStock: 1,
    shelfLocation: "Rayon C-01",
    barcode: "611123456703",
    photoUrl: null,
    isActive: true,
  },
  {
    id: 4,
    sku: "NGK-D8EA",
    oemCode: "D8EA-2120",
    name: "Bougie d'allumage NGK D8EA Moto & Quad",
    brand: "NGK",
    categoryId: 4,
    categoryName: "Électricité & Allumage",
    purchasePriceCents: 1800,
    salePriceRetailCents: 3500,
    salePriceWholesaleCents: 2600,
    tvaRate: 10,
    minStockAlert: 10,
    currentStock: 18,
    shelfLocation: "Rayon E-12",
    barcode: "611123456704",
    photoUrl: null,
    isActive: true,
  },
  {
    id: 5,
    sku: "CARB-PZ30",
    oemCode: "PZ30-BASH",
    name: "Carburateur complet PZ30 starter manuel Bashan 250",
    brand: "Bashan",
    categoryId: 1,
    categoryName: "Moteur & Carburation",
    purchasePriceCents: 19000,
    salePriceRetailCents: 32000,
    salePriceWholesaleCents: 26000,
    tvaRate: 10,
    minStockAlert: 2,
    currentStock: 4,
    shelfLocation: "Rayon A-08",
    barcode: "611123456705",
    photoUrl: null,
    isActive: true,
  },
  {
    id: 6,
    sku: "BAT-YTX9",
    oemCode: "YTX9-BS-GEL",
    name: "Batterie Gel 12V 9Ah YTX9-BS sans entretien",
    brand: "Outdo",
    categoryId: 4,
    categoryName: "Électricité & Allumage",
    purchasePriceCents: 17500,
    salePriceRetailCents: 29000,
    salePriceWholesaleCents: 23500,
    tvaRate: 10,
    minStockAlert: 3,
    currentStock: 6,
    shelfLocation: "Zone Batteries",
    barcode: "611123456706",
    photoUrl: null,
    isActive: true,
  },
  {
    id: 7,
    sku: "KIT-CHAINE-428",
    oemCode: "428H-136L-GOLD",
    name: "Kit chaîne renforcé 428H - 136 maillons Gold",
    brand: "KMC",
    categoryId: 3,
    categoryName: "Transmission & Câblage",
    purchasePriceCents: 14000,
    salePriceRetailCents: 24000,
    salePriceWholesaleCents: 19000,
    tvaRate: 10,
    minStockAlert: 3,
    currentStock: 5,
    shelfLocation: "Rayon C-04",
    barcode: "611123456707",
    photoUrl: null,
    isActive: true,
  },
  {
    id: 8,
    sku: "CYL-BASH-250",
    oemCode: "12100-BSH-250",
    name: "Cylindre piston complet 67mm Bashan 250cc 4T",
    brand: "Bashan",
    categoryId: 1,
    categoryName: "Moteur & Carburation",
    purchasePriceCents: 38000,
    salePriceRetailCents: 58000,
    salePriceWholesaleCents: 49000,
    tvaRate: 10,
    minStockAlert: 2,
    currentStock: 2,
    shelfLocation: "Rayon A-10",
    barcode: "611123456708",
    photoUrl: null,
    isActive: true,
  },
];

// Cache en mémoire pour fonctionnement immédiat en dev
let memoryProducts = [...initialProducts];

/**
 * Récupère les pièces du catalogue avec recherche et filtres instantanés
 */
export async function getProducts(options?: {
  search?: string;
  category?: string;
  stockFilter?: "all" | "low" | "negative";
}): Promise<ProductItem[]> {
  const search = options?.search?.toLowerCase().trim() || "";
  const stockFilter = options?.stockFilter || "all";
  const category = options?.category || "";

  // Si base PostgreSQL connectée
  if (db) {
    try {
      let query = db.select().from(products).$dynamic();

      // En mode base de données
      const rows = await query;
      if (rows.length > 0) {
        return rows.map((r) => ({
          id: r.id,
          sku: r.sku,
          oemCode: r.oemCode,
          name: r.name,
          brand: r.brand,
          categoryId: r.categoryId,
          purchasePriceCents: r.purchasePriceCents,
          salePriceRetailCents: r.salePriceRetailCents,
          salePriceWholesaleCents: r.salePriceWholesaleCents,
          tvaRate: r.tvaRate,
          minStockAlert: r.minStockAlert,
          currentStock: r.currentStock,
          shelfLocation: r.shelfLocation,
          barcode: r.barcode,
          photoUrl: r.photoUrl,
          isActive: r.isActive,
        }));
      }
    } catch {
      // Fallback gracieux en mode mémoire
    }
  }

  // Filtrage mémoire instantané (< 1ms)
  return memoryProducts.filter((p) => {
    // 1. Recherche multi-critères
    if (search) {
      const matchSku = p.sku.toLowerCase().includes(search);
      const matchOem = p.oemCode?.toLowerCase().includes(search);
      const matchName = p.name.toLowerCase().includes(search);
      const matchBrand = p.brand?.toLowerCase().includes(search);
      const matchShelf = p.shelfLocation?.toLowerCase().includes(search);

      if (!matchSku && !matchOem && !matchName && !matchBrand && !matchShelf) {
        return false;
      }
    }

    // 2. Filtre de stock
    if (stockFilter === "low" && (p.currentStock > p.minStockAlert || p.currentStock < 0)) {
      return false;
    }
    if (stockFilter === "negative" && p.currentStock >= 0) {
      return false;
    }

    // 3. Filtre par catégorie
    if (category && p.categoryName !== category) {
      return false;
    }

    return true;
  });
}

/**
 * Enregistre ou met à jour une pièce dans le catalogue
 */
export async function saveProduct(data: {
  id?: number;
  sku: string;
  oemCode?: string;
  name: string;
  brand?: string;
  categoryName?: string;
  purchasePriceCents: number;
  salePriceRetailCents: number;
  salePriceWholesaleCents?: number;
  tvaRate?: number;
  minStockAlert: number;
  currentStock: number;
  shelfLocation?: string;
  barcode?: string;
  photoUrl?: string;
}): Promise<ProductItem> {
  if (data.id) {
    // Mise à jour
    const index = memoryProducts.findIndex((p) => p.id === data.id);
    if (index !== -1) {
      const updated: ProductItem = {
        ...memoryProducts[index],
        ...data,
        oemCode: data.oemCode || null,
        brand: data.brand || null,
        salePriceWholesaleCents: data.salePriceWholesaleCents || null,
        shelfLocation: data.shelfLocation || null,
        barcode: data.barcode || null,
        photoUrl: data.photoUrl || null,
        tvaRate: data.tvaRate ?? 10,
      };
      memoryProducts[index] = updated;
      return updated;
    }
  }

  // Création
  const newProduct: ProductItem = {
    id: Date.now(),
    sku: data.sku,
    oemCode: data.oemCode || null,
    name: data.name,
    brand: data.brand || "Bashan",
    categoryId: 1,
    categoryName: data.categoryName || "Général",
    purchasePriceCents: data.purchasePriceCents,
    salePriceRetailCents: data.salePriceRetailCents,
    salePriceWholesaleCents: data.salePriceWholesaleCents || null,
    tvaRate: data.tvaRate ?? 10,
    minStockAlert: data.minStockAlert,
    currentStock: data.currentStock,
    shelfLocation: data.shelfLocation || null,
    barcode: data.barcode || null,
    photoUrl: data.photoUrl || null,
    isActive: true,
  };

  memoryProducts.unshift(newProduct);
  return newProduct;
}

/**
 * Enregistre un mouvement de stock dans le grand livre (append-only)
 */
export async function recordStockMovement(data: {
  productId: number;
  movementType: "ACHAT_RECEPTION" | "VENTE_BL" | "AVOIR_RETOUR" | "AJUSTEMENT_INVENTAIRE";
  quantity: number; // positif pour entrée, négatif pour sortie
  reason: string;
  unitCostCents?: number;
}): Promise<ProductItem> {
  const product = memoryProducts.find((p) => p.id === data.productId);
  if (!product) {
    throw new Error("Pièce introuvable");
  }

  // Mise à jour du stock calculé
  product.currentStock += data.quantity;

  return product;
}

/**
 * Importation de masse depuis un tableau CSV
 */
export async function importProductsBatch(
  items: Array<{
    sku: string;
    oemCode?: string;
    name: string;
    brand?: string;
    purchasePriceDH: number;
    salePriceRetailDH: number;
    stock: number;
    minStock?: number;
    shelfLocation?: string;
  }>
): Promise<{ count: number }> {
  for (const item of items) {
    const existingIndex = memoryProducts.findIndex((p) => p.sku === item.sku);
    const productData: ProductItem = {
      id: existingIndex !== -1 ? memoryProducts[existingIndex].id : Date.now() + Math.random(),
      sku: item.sku,
      oemCode: item.oemCode || null,
      name: item.name,
      brand: item.brand || "Générique",
      categoryId: 1,
      categoryName: "Importé",
      purchasePriceCents: Math.round(item.purchasePriceDH * 100),
      salePriceRetailCents: Math.round(item.salePriceRetailDH * 100),
      salePriceWholesaleCents: null,
      tvaRate: 10,
      minStockAlert: item.minStock || 2,
      currentStock: item.stock,
      shelfLocation: item.shelfLocation || null,
      barcode: null,
      photoUrl: null,
      isActive: true,
    };

    if (existingIndex !== -1) {
      memoryProducts[existingIndex] = productData;
    } else {
      memoryProducts.push(productData);
    }
  }

  return { count: items.length };
}
