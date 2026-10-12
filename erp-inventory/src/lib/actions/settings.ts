"use server";

import { asc, eq } from "drizzle-orm";
import { db, settings, vatRates } from "@/db";
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
  const existing = (await d.select({ id: settings.id }).from(settings).limit(1))[0];

  if (existing) {
    await d
      .update(settings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(settings.id, existing.id));
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
