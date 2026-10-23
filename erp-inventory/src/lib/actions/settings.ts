"use server";

import { asc, eq } from "drizzle-orm";
import { auditLogs, db, settings, vatRates } from "@/db";
import { assertAuthenticated, assertOwner } from "@/lib/action-guard";
import { actionResult, type ActionResult } from "@/lib/action-result";

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
export async function saveSettings(data: SettingsData): Promise<ActionResult<{ id: number }>> {
  return actionResult(() => saveSettingsImpl(data));
}

export async function saveVatRate(data: { id?: number; ratePercent: number; label?: string; isDefault?: boolean }): Promise<ActionResult<Awaited<ReturnType<typeof saveVatRateImpl>>>> {
  return actionResult(() => saveVatRateImpl(data));
}

async function saveSettingsImpl(data: SettingsData): Promise<{ id: number }> {
  await assertOwner();
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
async function saveVatRateImpl(data: { id?: number; ratePercent: number; label?: string; isDefault?: boolean }) {
  await assertOwner();
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
