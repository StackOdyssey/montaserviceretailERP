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
