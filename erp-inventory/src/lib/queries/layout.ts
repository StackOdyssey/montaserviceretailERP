// Lectures d'affichage du layout racine (rendu aussi sur /login, donc sans session).
// Volontairement HORS "use server" : ces fonctions ne sont pas exposées comme Server
// Actions (aucun point d'entrée RPC appelable depuis le navigateur).
import { asc, eq } from "drizzle-orm";
import { businessLines, db, expenseCategories, paymentMethods, priceLevels, settings, vatRates } from "@/db";

export interface BusinessLineDTO {
  id: number;
  code: string;
  displayName: string;
}

const FALLBACK_LINES: BusinessLineDTO[] = [{ id: 1, code: "PIECES", displayName: "Pièces moto" }];

/** Lignes métier actives (avec repli sûr si la base n'est pas joignable). */
export async function getBusinessLines(): Promise<BusinessLineDTO[]> {
  try {
    if (!db) throw new Error("no-db");
    const rows = await db
      .select({
        id: businessLines.id,
        code: businessLines.code,
        displayName: businessLines.displayName,
      })
      .from(businessLines)
      .where(eq(businessLines.isActive, true))
      .orderBy(asc(businessLines.sortOrder));
    return rows.length ? rows : FALLBACK_LINES;
  } catch {
    return FALLBACK_LINES;
  }
}

// Uniquement les champs consommés par SettingsProvider (rien de plus n'est sérialisé vers le client).
const PUBLIC_SETTINGS_COLUMNS = {
  raisonSociale: settings.raisonSociale,
  tradeName: settings.tradeName,
  legalForm: settings.legalForm,
  address: settings.address,
  city: settings.city,
  phone: settings.phone,
  email: settings.email,
  ice: settings.ice,
  identifiantFiscal: settings.identifiantFiscal,
  registreCommerce: settings.registreCommerce,
  taxeProfessionnelle: settings.taxeProfessionnelle,
  capitalCents: settings.capitalCents,
  footerText: settings.footerText,
  logoUrl: settings.logoUrl,
  currency: settings.currency,
  vatLiable: settings.vatLiable,
  defaultVatRateId: settings.defaultVatRateId,
};

type PublicSettingsRow = { [K in keyof typeof PUBLIC_SETTINGS_COLUMNS]: (typeof settings.$inferSelect)[K] };
export type PublicSettings = Omit<PublicSettingsRow, "defaultVatRateId"> & { defaultVatRate: number };

/**
 * Lecture (affichage) des paramètres société — sûre au build.
 * Retourne `null` si la base n'est pas joignable.
 */
export async function getPublicSettings(): Promise<PublicSettings | null> {
  try {
    if (!db) return null;
    const row = (await db.select(PUBLIC_SETTINGS_COLUMNS).from(settings).limit(1))[0];
    if (!row) return null;
    const { defaultVatRateId, ...s } = row;
    let defaultVatRate = 20;
    if (defaultVatRateId) {
      const v = (
        await db.select({ r: vatRates.ratePercent }).from(vatRates).where(eq(vatRates.id, defaultVatRateId)).limit(1)
      )[0];
      if (v) defaultVatRate = v.r;
    }
    return { ...s, defaultVatRate };
  } catch {
    return null;
  }
}

export interface Parameters {
  vatRates: Array<{ id: number; label: string; ratePercent: number; isDefault: boolean }>;
  expenseCategories: Array<{ id: number; name: string; vatDeductibleDefault: boolean; receiptRequired: boolean }>;
  paymentMethods: Array<{ code: string; label: string }>;
  priceLevels: Array<{ id: number; code: string; label: string }>;
}

const EMPTY_PARAMS: Parameters = { vatRates: [], expenseCategories: [], paymentMethods: [], priceLevels: [] };

/** Listes de paramètres (TVA, catégories de dépense, moyens de paiement, niveaux de prix) — sûres au build. */
export async function getParameters(): Promise<Parameters> {
  try {
    if (!db) return EMPTY_PARAMS;
    const [vats, cats, methods, levels] = await Promise.all([
      db
        .select({ id: vatRates.id, label: vatRates.label, ratePercent: vatRates.ratePercent, isDefault: vatRates.isDefault })
        .from(vatRates)
        .where(eq(vatRates.isActive, true))
        .orderBy(asc(vatRates.ratePercent)),
      db
        .select({
          id: expenseCategories.id,
          name: expenseCategories.name,
          vatDeductibleDefault: expenseCategories.vatDeductibleDefault,
          receiptRequired: expenseCategories.receiptRequired,
        })
        .from(expenseCategories)
        .where(eq(expenseCategories.isActive, true))
        .orderBy(asc(expenseCategories.sortOrder)),
      db
        .select({ code: paymentMethods.code, label: paymentMethods.label })
        .from(paymentMethods)
        .where(eq(paymentMethods.isActive, true))
        .orderBy(asc(paymentMethods.sortOrder)),
      db.select({ id: priceLevels.id, code: priceLevels.code, label: priceLevels.label }).from(priceLevels).orderBy(asc(priceLevels.id)),
    ]);
    return { vatRates: vats, expenseCategories: cats, paymentMethods: methods, priceLevels: levels };
  } catch {
    return EMPTY_PARAMS;
  }
}
