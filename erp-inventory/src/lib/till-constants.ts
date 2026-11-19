// Modes physiquement déclarés à la clôture (bons/avoirs = théorique seul).
// Partagé client/serveur — ne pas remettre dans actions/till.ts ("use server"
// n'autorise que des exports async).
export const TILL_DECLARED_METHODS = ["ESPECES", "CARTE_BANCAIRE", "CHEQUE", "EFFET_LCN", "VIREMENT", "VERSEMENT"] as const;
