export type PosDocType = "BL" | "FACTURE" | "BC";

export const POS_DOC_TYPES: Array<{ id: PosDocType; label: string; shortLabel: string }> = [
  { id: "BL", label: "Bon de Livraison", shortLabel: "BL" },
  { id: "FACTURE", label: "Facture", shortLabel: "Facture" },
  { id: "BC", label: "Bon de Commande", shortLabel: "BC" },
];
