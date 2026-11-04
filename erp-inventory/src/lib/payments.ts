// Cycle de vie des paiements (chèques & effets LCN) — statuts et transitions.
export type PaymentMethod =
  | "ESPECES"
  | "CHEQUE"
  | "EFFET_LCN"
  | "VIREMENT"
  | "CARTE_BANCAIRE"
  | "VERSEMENT";

const METHOD_LABELS: Record<string, string> = {
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
  EFFET_LCN: "Effet / LCN",
  VIREMENT: "Virement",
  CARTE_BANCAIRE: "Carte bancaire",
  VERSEMENT: "Versement",
  A_CREDIT: "À crédit",
};

export function paymentMethodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

const CHEQUE_CYCLE = ["RECU", "REMIS_BANQUE", "ENCAISSE"];
const CHEQUE_OFF = ["IMPAYE", "ANNULE"];
const LCN_CYCLE = ["CREE", "ACCEPTE", "REMIS_ENCAISSEMENT", "ESCOMPTE", "PAYE"];
const LCN_OFF = ["IMPAYE", "PROTESTE"];
const LEGACY = ["EN_ATTENTE", "REJETE"];
const TERMINAL = ["ENCAISSE", "PAYE", "IMPAYE", "REJETE", "ANNULE", "PROTESTE"];

const LABELS: Record<string, string> = {
  RECU: "Reçu",
  REMIS_BANQUE: "Remis en banque",
  ENCAISSE: "Encaissé",
  CREE: "Créé",
  ACCEPTE: "Accepté",
  REMIS_ENCAISSEMENT: "Remis à l'encaissement",
  ESCOMPTE: "Escompté",
  PAYE: "Payé",
  IMPAYE: "Impayé",
  REJETE: "Rejeté",
  PROTESTE: "Protesté",
  ANNULE: "Annulé",
  EN_ATTENTE: "En attente",
};

export function paymentStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL.includes(status);
}

/** Statut initial à l'enregistrement selon le moyen de paiement. */
export function initialStatusFor(method: string): string {
  if (method === "CHEQUE") return "RECU";
  if (method === "EFFET_LCN") return "CREE";
  return "ENCAISSE";
}

/** Tous les statuts valides pour un moyen de paiement. */
export function statusesForMethod(method: string): string[] {
  if (method === "CHEQUE") return [...CHEQUE_CYCLE, ...CHEQUE_OFF, ...LEGACY];
  if (method === "EFFET_LCN") return [...LCN_CYCLE, ...LCN_OFF, ...LEGACY];
  return ["ENCAISSE", "EN_ATTENTE", "REJETE"];
}

/** Statuts suivants autorisés (transitions). */
export function nextStatuses(method: string, current: string): string[] {
  if (current === "EN_ATTENTE" || current === "REJETE") {
    return statusesForMethod(method).filter((s) => s !== current);
  }
  if (method === "CHEQUE") {
    switch (current) {
      case "RECU":
        return ["REMIS_BANQUE", "IMPAYE", "ANNULE"];
      case "REMIS_BANQUE":
        return ["ENCAISSE", "IMPAYE"];
      default:
        return [];
    }
  }
  if (method === "EFFET_LCN") {
    switch (current) {
      case "CREE":
        return ["ACCEPTE", "IMPAYE", "PROTESTE"];
      case "ACCEPTE":
        return ["REMIS_ENCAISSEMENT", "ESCOMPTE", "IMPAYE", "PROTESTE"];
      case "REMIS_ENCAISSEMENT":
        return ["PAYE", "IMPAYE", "PROTESTE"];
      case "ESCOMPTE":
        return ["PAYE"];
      default:
        return [];
    }
  }
  return [];
}
