/**
 * Module de calcul monétaire en centimes d'entiers (MAD / Dirhams marocains)
 * Garantit une précision comptable absolue sans erreurs d'arrondis à virgule flottante.
 */

export interface DocumentTotals {
  totalBrutHT: number;       // En centimes (ex: 100000 = 1 000,00 DH) — net des remises ligne
  discountPercent: number;   // Pourcentage (ex: 5 pour 5%)
  discountAmount: number;    // Montant de la remise globale en centimes (ex: 5000 = 50,00 DH)
  lineDiscountAmount: number; // Somme des remises par ligne en centimes (0 si aucune)
  totalNetHT: number;        // En centimes (Total Brut HT - Remise)
  tvaRate: number;           // Pourcentage (taux paramétré, ex: 20 ; 0 si non-assujetti)
  tvaAmount: number;         // En centimes (Total Net HT * TVA)
  totalTTC: number;          // En centimes (Total Net HT + TVA)
}

/**
 * Formate un montant en centimes au format marocain Dirham (DH / MAD)
 * Exemple: 125050 -> "1 250,50 DH"
 */
export function formatMoney(centimes: number): string {
  const isNegative = centimes < 0;
  const absCentimes = Math.abs(centimes);
  const dirhams = Math.floor(absCentimes / 100);
  const cents = absCentimes % 100;

  // Formatage avec séparateur de milliers
  const formattedDirhams = dirhams.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const formattedCents = cents.toString().padStart(2, "0");

  const sign = isNegative ? "-" : "";
  return `${sign}${formattedDirhams},${formattedCents} DH`;
}

/**
 * Convertit des dirhams décimaux en centimes entiers
 * Exemple: 12.50 -> 1250
 */
export function toCentimes(dirhams: number): number {
  return Math.round(dirhams * 100);
}

/**
 * Convertit des centimes en dirhams décimaux
 * Exemple: 1250 -> 12.50
 */
export function toDirhams(centimes: number): number {
  return centimes / 100;
}

/**
 * Calcule le total d'une ligne d'article en centimes
 */
export function calculateLineTotal(unitPriceHTCents: number, quantity: number): number {
  return Math.round(unitPriceHTCents * quantity);
}

/**
 * Calcule la remise globale en centimes sur le Total Brut HT
 * Exemple: Brut HT = 1000,00 DH (100000 centimes), Remise = 10% -> 100,00 DH (10000 centimes)
 */
export function calculateDiscountAmount(totalBrutHTCents: number, discountPercent: number): number {
  if (discountPercent <= 0) return 0;
  if (discountPercent >= 100) return totalBrutHTCents;
  return Math.round((totalBrutHTCents * discountPercent) / 100);
}

/**
 * Calcule le Total Net HT après déduction de la remise
 */
export function calculateNetHT(totalBrutHTCents: number, discountAmountCents: number): number {
  return Math.max(0, totalBrutHTCents - discountAmountCents);
}

/**
 * Calcule le montant de la TVA en centimes sur la base du Total Net HT
 * Taux paramétré (settings → vat_rates) ; repli 20 % (taux normal CGI). 0 = non-assujetti.
 */
export function calculateTVAAmount(totalNetHTCents: number, tvaRatePercent: number = 20): number {
  if (tvaRatePercent <= 0) return 0;
  return Math.round((totalNetHTCents * tvaRatePercent) / 100);
}

/**
 * Calcule les totaux complets d'un Bon de Livraison ou d'une Facture
 * Structure comptable marocaine :
 * 1. Total Brut HT
 * 2. Remise (X%) mentionnée sous le Total Brut HT
 * 3. Total Net HT
 * 4. TVA (taux paramétré)
 * 5. Total TTC (Net à payer)
 */
export function calculateDocumentTotals(
  lines: Array<{ unitPriceHT: number; quantity: number; discountPercent?: number }>,
  discountPercent: number = 0,
  tvaRate: number = 20
): DocumentTotals {
  // Remises par ligne (POS « Rem % ») : le brut document est la somme des
  // lignes nettes, la remise globale s'applique ensuite dessus.
  let grossHT = 0;
  let lineNetHT = 0;
  for (const line of lines) {
    const gross = calculateLineTotal(line.unitPriceHT, line.quantity);
    grossHT += gross;
    const ld = Math.min(100, Math.max(0, line.discountPercent ?? 0));
    lineNetHT += ld > 0 ? Math.round(gross * (1 - ld / 100)) : gross;
  }
  const totalBrutHT = lineNetHT;
  const lineDiscountAmount = grossHT - lineNetHT;

  const discountAmount = calculateDiscountAmount(totalBrutHT, discountPercent);
  const totalNetHT = calculateNetHT(totalBrutHT, discountAmount);
  const tvaAmount = calculateTVAAmount(totalNetHT, tvaRate);
  const totalTTC = totalNetHT + tvaAmount;

  return {
    totalBrutHT,
    discountPercent,
    discountAmount,
    lineDiscountAmount,
    totalNetHT,
    tvaRate,
    tvaAmount,
    totalTTC,
  };
}
