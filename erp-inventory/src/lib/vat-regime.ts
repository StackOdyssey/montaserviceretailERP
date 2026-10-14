/**
 * Régime TVA global (interrupteur unique) :
 * - assujetti (`vatLiable: true`) = comportement historique, taux paramétré appliqué ;
 * - non-assujetti (`false`) = taux effectif 0, TVA ni calculée ni affichée (ventes).
 * Les documents existants gardent leur snapshot : effet immédiat, sans rétroactivité.
 * Fichier neutre (client + serveur).
 */

/** Mention légale portée par les FACTURE/AVOIR en régime non-assujetti. */
export const VAT_NOT_LIABLE_MENTION = "TVA non applicable";

/** Taux effectif compte tenu du régime (0 si non-assujetti). */
export function effectiveVatRate(configuredRate: number, vatLiable: boolean): number {
  if (!vatLiable) return 0;
  return Math.max(0, configuredRate);
}
