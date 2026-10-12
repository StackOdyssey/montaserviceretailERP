// Registre des questions ouvertes (décisions requises du comptable / propriétaire).
// Source de vérité unique : chaque question est « câblée » à un point du code qui
// applique, par défaut, un comportement sûr (fail-closed / inert) en attendant
// la décision. Aucune de ces décisions ne doit être tranchée par un développeur.

export type OpenQuestionStatus = "BLOQUE" | "A_DECIDER";

export interface OpenQuestion {
  /** Référence de la question dans le plan / la checklist comptable. */
  code: string;
  title: string;
  status: OpenQuestionStatus;
  /** Pourquoi la question se pose. */
  contexte: string;
  /** Ce que la décision change concrètement. */
  impact: string;
  /** La décision attendue du comptable / propriétaire. */
  decisionRequise: string;
  /** Comportement actuellement appliqué, sûr par défaut. */
  defautActuel: string;
  /** Fichier(s) où la question est câblée dans le code. */
  cablage: string;
}

export const OPEN_QUESTIONS: OpenQuestion[] = [
  {
    code: "DGI-e-invoicing",
    title: "Périmètre et date d'entrée en vigueur de la facturation électronique DGI",
    status: "BLOQUE",
    contexte:
      "La DGI (Direction Générale des Impôts) déploie progressivement la facturation électronique au Maroc. Le périmètre (obligation, format, plateforme) et la date d'obligation pour BM Motors ne sont pas confirmés.",
    impact:
      "Détermine si, quand et sous quel format le système devra transmettre les factures à la DGI (API, dépôt de fichiers, UBL, etc.).",
    decisionRequise:
      "Confirmer le périmètre et la date d'entrée en vigueur avant toute intégration.",
    defautActuel:
      "Readiness uniquement : aucun envoi réseau vers la DGI. L'export UBL 2.1 est généré localement et l'intégration est désactivée (variable DGI_ENABLED absente = désactivée).",
    cablage: "src/lib/actions/dgi.ts (getDocumentUbl), src/lib/ubl.ts",
  },
  {
    code: "Retention-Q4",
    title: "Durée de conservation des archives (§9 Q4)",
    status: "BLOQUE",
    contexte:
      "La durée légale de conservation (documents comptables, pièces, exports) est contradictoire entre les sources et doit être tranchée.",
    impact:
      "Détermine la politique de purge/archivage : combien de temps on conserve, quand on supprime, et sous quel verrouillage.",
    decisionRequise:
      "Trancher la durée de conservation avant de durcir l'archivage de la Phase 9.",
    defautActuel:
      "Append-only : aucune suppression ni purge automatique n'est effectuée. Les manifestes d'archivage (SHA-256) sont conservés indéfiniment ; les suppressions sont logiques (soft-delete).",
    cablage: "scripts/backup-to-r2.mjs, src/lib/actions/dgi.ts (createArchiveManifest)",
  },
  {
    code: "Prix-negocie",
    title: "Politique de prix négocié (« prix fixé » audité vs. aucun en v1)",
    status: "A_DECIDER",
    contexte:
      "Les prix sont résolus côté serveur depuis la base (prix de détail / gros). Un vendeur peut-il néanmoins fixer un prix hors catalogue, et sous quelles conditions ?",
    impact:
      "Détermine s'il faut autoriser une saisie de prix manuelle, la journaliser, et à qui l'autoriser.",
    decisionRequise:
      "Choisir : prix catalogue imposé, ou prix négocié autorisé avec motif tracé dans le journal d'audit.",
    defautActuel:
      "Fail-closed : un prix hors catalogue (≠ prix de détail et ≠ prix de gros) est refusé sauf si un motif d'override est fourni ; l'override est journalisé (PRIX_FIXE).",
    cablage: "src/lib/actions/sales.ts (createSalesDocument, garde PRIX_HORS_CATALOGUE)",
  },
  {
    code: "Acomptes-Q19",
    title: "Acomptes clients (Side 2) et fait générateur de TVA (Q19)",
    status: "A_DECIDER",
    contexte:
      "Sur les commandes de véhicules (Side 2), un acompte peut être versé avant facturation. Le moment de l'exigibilité de la TVA dépend du régime (vat_regime).",
    impact:
      "Détermine le rattachement acompte ↔ facture, la date de TVA, et l'impact sur les états.",
    decisionRequise:
      "Confirmer si l'on gère les acomptes au démarrage et leur traitement TVA selon vat_regime.",
    defautActuel:
      "Non implémenté : aucun encaissement d'acompte avant facturation n'est possible ; la TVA est assise sur les documents validés uniquement.",
    cablage: "src/lib/actions/sales.ts (modèle document), à câbler avec settings.vat_regime",
  },
  {
    code: "Side2-Q16-Q19",
    title: "Champs à collecter pour les véhicules (Side 2) : série/VIN, garantie, date de livraison, accessoires",
    status: "A_DECIDER",
    contexte:
      "La vente de véhicules (Side 2) nécessite des champs spécifiques non encore confirmés (numéro de série/VIN, garantie, date de livraison, accessoires, caution éventuelle).",
    impact:
      "Détermine le schéma des lignes/documents Side 2 et les mentions imprimées.",
    decisionRequise:
      "Lister précisément les champs obligatoires et optionnels à collecter (Q16/Q19).",
    defautActuel:
      "Champs non collectés : la saisie se limite aux pièces communes ; aucune donnée Side 2 spécifique n'est stockée.",
    cablage: "src/db/schema.ts (sales_lines.stock_unit_id), src/app/stock/vehicules",
  },
  {
    code: "Templates-Q13-Q16",
    title: "Réponses propriétaire Q13–Q16 : modèles d'impression",
    status: "A_DECIDER",
    contexte:
      "L'apparence et le contenu exacts des documents imprimés (devis, BC, BL, facture, avoir) dépendent des réponses du propriétaire aux questions Q13 à Q16.",
    impact:
      "Détermine la mise en page finale et les mentions légales/commerciales de chaque type de document.",
    decisionRequise:
      "Obtenir les réponses Q13–Q16 du propriétaire pour figer les modèles.",
    defautActuel:
      "Modèle provisoire §6A appliqué : TVA masquable uniquement sur BL/BC/DEVIS (PIECES) ; FAC et AV affichent toujours HT/TVA/TTC ; bloc société issu de `settings`.",
    cablage: "src/components/sales/DocumentPrintView.tsx",
  },
  {
    code: "Identite-individuel-Q14",
    title: "Champs d'identité minimaux des particuliers (CNDP)",
    status: "A_DECIDER",
    contexte:
      "Pour les clients particuliers, collecter un numéro de pièce d'identité peut poser une question de conformité (CNDP / protection des données).",
    impact:
      "Détermine les champs obligatoires d'une fiche particulier et ce qui est imprimé sur les documents.",
    decisionRequise:
      "Confirmer si un numéro de pièce d'identité est requis, ou si le minimum (nom, téléphone) suffit (Q14).",
    defautActuel:
      "Minimum collecté : nom et téléphone (obligatoire : nom seul). Aucun numéro d'identité n'est demandé pour un particulier ; ICE obligatoire uniquement pour un professionnel (B2B).",
    cablage: "src/components/customers/CustomerModal.tsx, src/lib/actions/customers.ts",
  },
];
