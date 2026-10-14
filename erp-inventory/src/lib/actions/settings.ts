"use server";

import { asc, eq } from "drizzle-orm";
import { auditLogs, db, expenseCategories, paymentMethods, priceLevels, settings, vatRates } from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";

export type SettingsRow = typeof settings.$inferSelect;

export interface SettingsData {
  raisonSociale: string;
  tradeName?: string;
  legalForm?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  ice?: string;
  identifiantFiscal?: string;
  registreCommerce?: string;
  rcTribunal?: string;
  taxeProfessionnelle?: string;
  capitalCents?: number;
  cnss?: string;
  website?: string;
  logoUrl?: string;
  footerText?: string;
  mobileWhatsapp?: string;
  bankName?: string;
  bankAgency?: string;
  bankRib?: string;
  bank2Name?: string;
  bank2Agency?: string;
  bank2Rib?: string;
  defaultVatRateId?: number | null;
  vatRegime?: string;
  /** Interrupteur global de régime TVA : false = ventes sans TVA. */
  vatLiable?: boolean;
  currency?: string;
  localeDefault?: string;
  localeSecondary?: string;
  timezone?: string;
  negativeStockAllowed?: boolean;
  defaultPaymentDueDays?: number;
  displayDiscountUnderBrut?: boolean;
  cashDailyThresholdCents?: number;
  cashMonthlyThresholdCents?: number;
  yearStartMonth?: number;
  numberWidth?: number;
  devisPrefix?: string;
  bcPrefix?: string;
  blPrefix?: string;
  facPrefix?: string;
  avPrefix?: string;
  brPrefix?: string;
}

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

/** Lit la ligne unique de configuration société (source de vérité). */
export async function getSettings(): Promise<SettingsRow | null> {
  await assertAuthenticated();
  const d = requireDb();
  return (await d.select().from(settings).limit(1))[0] ?? null;
}

/** Enregistre (crée ou met à jour) la configuration société. */
export async function saveSettings(data: SettingsData): Promise<{ id: number }> {
  await assertAuthenticated();
  const d = requireDb();
  const existing = (await d.select().from(settings).limit(1))[0];

  if (existing) {
    await d
      .update(settings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(settings.id, existing.id));
    // Traçabilité du basculement de régime TVA (effet immédiat, sans rétroactivité).
    if (typeof data.vatLiable === "boolean" && data.vatLiable !== (existing.vatLiable ?? true)) {
      try {
        await d.insert(auditLogs).values({
          action: "REGIME_TVA",
          entityType: "SETTINGS",
          entityId: existing.id,
          details: data.vatLiable
            ? "Basculement en régime assujetti TVA (taux paramétré appliqué aux nouvelles ventes)."
            : "Basculement en régime non-assujetti : nouvelles ventes à taux 0, TVA ni calculée ni affichée (historique inchangé).",
        });
      } catch {
        // journal non bloquant
      }
    }
    return { id: existing.id };
  }
  const inserted = await d.insert(settings).values(data).returning({ id: settings.id });
  return { id: inserted[0].id };
}

/** Taux de TVA disponibles (table paramétrable). */
export async function getVatRates() {
  await assertAuthenticated();
  const d = requireDb();
  return d.select().from(vatRates).orderBy(asc(vatRates.ratePercent));
}

/** Crée ou met à jour un taux de TVA (paramétrable, non codé en dur). */
export async function saveVatRate(data: { id?: number; ratePercent: number; label?: string; isDefault?: boolean }) {
  await assertAuthenticated();
  const d = requireDb();
  if (!Number.isFinite(data.ratePercent) || data.ratePercent < 0 || data.ratePercent > 100) {
    throw new Error("Taux de TVA invalide (0–100).");
  }
  const label = data.label?.trim() || `TVA ${data.ratePercent}%`;

  if (data.id) {
    const updated = (
      await d.update(vatRates).set({ ratePercent: data.ratePercent, label }).where(eq(vatRates.id, data.id)).returning()
    )[0];
    if (!updated) throw new Error("Taux de TVA introuvable");
    return updated;
  }
  const inserted = (
    await d
      .insert(vatRates)
      .values({ ratePercent: data.ratePercent, label, isDefault: data.isDefault ?? false })
      .returning()
  )[0];
  return inserted;
}

export type PublicSettings = SettingsRow & { defaultVatRate: number };

/**
 * Lecture publique (affichage) des paramètres société — sans session, sûre au build.
 * Retourne `null` si la base n'est pas joignable.
 */
export async function getPublicSettings(): Promise<PublicSettings | null> {
  try {
    if (!db) return null;
    const s = (await db.select().from(settings).limit(1))[0];
    if (!s) return null;
    let defaultVatRate = 20;
    if (s.defaultVatRateId) {
      const v = (
        await db.select({ r: vatRates.ratePercent }).from(vatRates).where(eq(vatRates.id, s.defaultVatRateId)).limit(1)
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
