// Coût moyen pondéré (CMUP) — logique pure, réutilisable par les actions et les tests.
// Règles: les entrées valorisées recalculent le CMUP ; les sorties ne le changent pas.

export type StockMovementKind =
  | "STOCK_INITIAL"
  | "ACHAT_RECEPTION"
  | "VENTE"
  | "AVOIR_RETOUR"
  | "AJUSTEMENT_INVENTAIRE"
  | "RETOUR_FOURNISSEUR";

export interface CmupState {
  quantity: number;
  cmupCents: number;
}

/** Nouveau CMUP après une entrée valorisée (BR, retour client au COGS d'origine, stock initial, ajustement positif). */
export function applyInbound(state: CmupState, qtyIn: number, unitCostCents: number): CmupState {
  if (qtyIn <= 0) return { quantity: state.quantity, cmupCents: state.cmupCents };
  const quantity = state.quantity + qtyIn;
  if (quantity <= 0) return { quantity, cmupCents: state.cmupCents };
  const value = state.quantity * state.cmupCents + qtyIn * unitCostCents;
  return { quantity, cmupCents: Math.round(value / quantity) };
}

/** Sortie (vente, retour fournisseur) : le CMUP est inchangé ; renvoie le COGS valorisé au CMUP courant. */
export function applyOutbound(
  state: CmupState,
  qtyOut: number
): { state: CmupState; cogsCents: number } {
  const cogsCents = state.cmupCents * qtyOut;
  return { state: { quantity: state.quantity - qtyOut, cmupCents: state.cmupCents }, cogsCents };
}

/** Applique un mouvement signé (quantité > 0 = entrée, < 0 = sortie) et renvoie le nouvel état + le COGS éventuel. */
export function applyMovement(
  state: CmupState,
  signedQty: number,
  inboundUnitCostCents: number
): { state: CmupState; cogsCents: number } {
  if (signedQty >= 0) {
    return { state: applyInbound(state, signedQty, inboundUnitCostCents), cogsCents: 0 };
  }
  return applyOutbound(state, -signedQty);
}
