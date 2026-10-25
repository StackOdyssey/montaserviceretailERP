// Cycle préparation/livraison (bons de préparation + feuille de route, G2).
export const PREP_STATUS_LABELS: Record<string, string> = {
  A_PREPARER: "À préparer",
  EN_PREPARATION: "En préparation",
  PREPARE: "Préparé (accord)",
  LIVRE: "Livré",
  NON_LIVRE: "Non livré",
};

export const PREP_TRANSITIONS: Record<string, string[]> = {
  A_PREPARER: ["EN_PREPARATION", "PREPARE"],
  EN_PREPARATION: ["PREPARE", "A_PREPARER"],
  PREPARE: ["LIVRE", "NON_LIVRE", "EN_PREPARATION"],
  LIVRE: ["NON_LIVRE"],
  NON_LIVRE: ["EN_PREPARATION"],
};
