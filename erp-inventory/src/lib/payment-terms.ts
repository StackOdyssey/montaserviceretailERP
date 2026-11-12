// Conditions de règlement (QUAND le client paie) — distinctes du mode (COMMENT).
// Pur (client + serveur). Loi 69-21 : délai max 60 jours sans accord écrit,
// 120 jours max avec accord ; au-delà, refus côté serveur.

export const PAYMENT_CONDITIONS = [
  { code: "IMMEDIAT", label: "Paiement immédiat", days: 0 },
  { code: "RECEPTION", label: "À réception", days: 0 },
  { code: "FIN_DE_MOIS", label: "Fin de mois", days: 0, endOfMonth: true },
  { code: "J7", label: "7 jours", days: 7 },
  { code: "J15", label: "15 jours", days: 15 },
  { code: "J30", label: "30 jours", days: 30 },
  { code: "J45", label: "45 jours", days: 45 },
  { code: "J60", label: "60 jours", days: 60 },
  { code: "J90", label: "90 jours", days: 90 },
  { code: "J120", label: "120 jours", days: 120 },
  { code: "J30_FDM", label: "30 jours fin de mois", days: 30, endOfMonth: true },
  { code: "J45_FDM", label: "45 jours fin de mois", days: 45, endOfMonth: true },
  { code: "J60_FDM", label: "60 jours fin de mois", days: 60, endOfMonth: true },
  { code: "ECHEANCES", label: "Paiement en plusieurs échéances", custom: true },
  { code: "PERSONNALISE", label: "Paiement personnalisé", custom: true },
] as const satisfies ReadonlyArray<{ code: string; label: string; days?: number; endOfMonth?: boolean; custom?: boolean }>;

export type PaymentConditionCode = (typeof PAYMENT_CONDITIONS)[number]["code"];
export const PAYMENT_CONDITION_CODES = PAYMENT_CONDITIONS.map((c) => c.code) as [PaymentConditionCode, ...PaymentConditionCode[]];

export const LEGAL_DEFAULT_MAX_DAYS = 60;
export const LEGAL_ABSOLUTE_MAX_DAYS = 120;

const DAY_MS = 86400000;

export function conditionLabel(code: string | null | undefined): string | null {
  return PAYMENT_CONDITIONS.find((c) => c.code === code)?.label ?? null;
}

export function isCustomCondition(code: string | null | undefined): boolean {
  const c = PAYMENT_CONDITIONS.find((x) => x.code === code);
  return Boolean(c && "custom" in c && c.custom);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
}

/** Date d'échéance (midi local, évite les décalages de fuseau). Personnalisé/échéances : date saisie. */
export function computeDueDate(code: string | null | undefined, docDate: Date, customDueDate?: string | null): Date | null {
  const c = PAYMENT_CONDITIONS.find((x) => x.code === code);
  if (!c) return null;
  if ("custom" in c && c.custom) return customDueDate ? new Date(`${customDueDate.slice(0, 10)}T12:00:00`) : null;
  const base = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate(), 12);
  const shifted = new Date(base.getTime() + ("days" in c ? c.days : 0) * DAY_MS);
  return "endOfMonth" in c && c.endOfMonth ? endOfMonth(shifted) : shifted;
}

export function termDays(docDate: Date, dueDate: Date | null): number {
  if (!dueDate) return 0;
  const base = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate(), 12);
  return Math.round((dueDate.getTime() - base.getTime()) / DAY_MS);
}

/** Avertissement loi 69-21 (null = conforme). */
export function legalTermWarning(days: number): string | null {
  if (days > LEGAL_ABSOLUTE_MAX_DAYS) return `Délai de ${days} jours : dépasse le maximum légal de 120 jours (loi 69-21).`;
  if (days > LEGAL_DEFAULT_MAX_DAYS) return `Délai de ${days} jours : au-delà de 60 jours, un accord écrit avec le client est requis (loi 69-21, max 120 jours).`;
  return null;
}

/** Condition par défaut depuis la fiche client (paymentTermDays), sinon immédiat si réglé. */
export function defaultConditionFor(clientTermDays: number | null | undefined, fullyPaid: boolean): {
  code: PaymentConditionCode | null;
  customDays?: number;
} {
  if (clientTermDays != null && clientTermDays >= 0) {
    if (clientTermDays === 0) return { code: "IMMEDIAT" };
    const exact = PAYMENT_CONDITIONS.find((c) => !("endOfMonth" in c) && "days" in c && c.days === clientTermDays && c.code.startsWith("J"));
    return exact ? { code: exact.code } : { code: "PERSONNALISE", customDays: clientTermDays };
  }
  return { code: fullyPaid ? "IMMEDIAT" : null };
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
