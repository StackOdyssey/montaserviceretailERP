// Registre des questions ouvertes (décisions du comptable / propriétaire).
// Source de vérité unique : chaque question est « câblée » à un point du code qui
// applique le comportement retenu. Les réponses ont été fournies dans
// docs/QUESTIONS_OUVERTES.md (2026-10-12).

export type OpenQuestionStatus = "BLOQUE" | "A_DECIDER" | "REPONDU";

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
  /** Réponse retenue (source : docs/QUESTIONS_OUVERTES.md). */
  answer?: string;
  /** Comportement actuellement appliqué dans le code. */
  defautActuel: string;
  /** Fichier(s) où la question est câblée dans le code. */
  cablage: string;
}

export const OPEN_QUESTIONS: OpenQuestion[] = [
  {
    code: "DGI-e-invoicing",
    title: "Périmètre et date d'entrée en vigueur de la facturation électronique DGI",
    status: "REPONDU",
    contexte:
      "La DGI déploie progressivement la facturation électronique au Maroc. Le périmètre et la date d'obligation pour BM Motors ne sont pas encore confirmés.",
    impact:
      "Détermine si, quand et sous quel format le système devra transmettre les factures à la DGI (API, dépôt de fichiers, UBL…).",
    decisionRequise: "Confirmer le périmètre et la date d'entrée en vigueur avant toute intégration.",
    answer: "Ignorer cette étape pour l'instant — cible d'intégration : 1er janvier 2027.",
    defautActuel:
      "Intégration désactivée (DGI_ENABLED absent = désactivé). Aucun envoi réseau ; l'export UBL 2.1 est généré localement.",
    cablage: "src/lib/actions/dgi.ts (getDocumentUbl, isDgiIntegrationEnabled), src/lib/ubl.ts",
  },
  {
    code: "Retention-Q4",
    title: "Durée de conservation des archives (§9 Q4)",
    status: "REPONDU",
    contexte: "La durée légale de conservation (documents comptables, pièces, exports) devait être tranchée.",
    impact: "Détermine la politique de purge/archivage : combien de temps on conserve, quand on supprime.",
    decisionRequise: "Trancher la durée de conservation avant de durcir l'archivage de la Phase 9.",
    answer: "10 ans.",
    defautActuel:
      "Archivage append-only : aucune purge applicative. Conservation cible de 10 ans assurée par une règle de cycle de vie du bucket R2.",
    cablage: "scripts/backup-to-r2.mjs (RETENTION_YEARS=10), src/lib/actions/dgi.ts (createArchiveManifest)",
  },
  {
    code: "Prix-negocie",
    title: "Politique de prix négocié (« prix fixé »)",
    status: "REPONDU",
    contexte: "Un vendeur peut-il fixer un prix hors catalogue, et sous quelles conditions ?",
    impact: "Détermine s'il faut autoriser une saisie de prix manuelle et à qui l'autoriser.",
    decisionRequise: "Choisir : prix catalogue imposé, ou prix négocié autorisé avec motif tracé.",
    answer: "Oui, mais seul l'administrateur gère les prix.",
    defautActuel:
      "Prix résolu côté serveur depuis la base. Un prix hors catalogue est refusé sauf motif d'override ; l'override est journalisé (PRIX_FIXE). Les actions étant déjà réservées au rôle propriétaire (ADMIN/OWNER), seul l'administrateur peut fixer un prix.",
    cablage: "src/lib/actions/sales.ts (createSalesDocument, garde PRIX_HORS_CATALOGUE)",
  },
  {
    code: "Acomptes-Q19",
    title: "Acomptes clients et fait générateur de TVA (Q19)",
    status: "REPONDU",
    contexte: "Sur les commandes véhicules, un acompte peut être versé avant facturation.",
    impact: "Détermine le rattachement acompte ↔ facture et la date de TVA.",
    decisionRequise: "Confirmer si l'on gère les acomptes au démarrage.",
    answer: "Oui.",
    defautActuel:
      "Acompte enregistré comme règlement non affecté ; à la création d'un document, les règlements non affectés du client sont imputés automatiquement (FIFO par date) sur le nouveau document.",
    cablage: "src/lib/actions/sales.ts (createSalesDocument), src/lib/actions/customers.ts (recordCustomerPayment)",
  },
  {
    code: "Side2-Q16-Q19",
    title: "Vente de véhicules (Side 2) : champs VIN / garantie / livraison / accessoires",
    status: "REPONDU",
    contexte: "La vente de véhicules nécessitait des champs spécifiques non confirmés.",
    impact: "Détermine le schéma des lignes/documents Side 2.",
    decisionRequise: "Lister les champs obligatoires et optionnels (Q16/Q19).",
    answer: "Annuler la vente des véhicules (Side 2) dans le projet.",
    defautActuel:
      "La vente de véhicules est retirée : la page /stock/vehicules a été supprimée et le lien retiré. Seule la ligne métier PIECES (Side 1) est opérationnelle pour les ventes.",
    cablage: "src/app/stock/page.tsx (lien supprimé), src/app/stock/vehicules (page supprimée)",
  },
  {
    code: "Templates-Q13-Q16",
    title: "Modèles d'impression (Q13–Q16)",
    status: "REPONDU",
    contexte: "Contenu et apparence des documents imprimés (devis, BC, BL, facture, avoir).",
    impact: "Détermine la mise en page finale et les mentions imprimées.",
    decisionRequise: "Obtenir les réponses Q13–Q16 pour figer les modèles.",
    answer:
      "Seule la remise est affichée sur les documents (BL, FAC, BC, DEVIS, AV) ; la TVA est saisie dans les paramètres mais n'est jamais affichée sur un document. Modèle de référence : References_/Model_facture.",
    defautActuel:
      "Les documents n'affichent jamais la TVA ; seule la remise (et un total) apparaît. Le taux de TVA reste paramétrable dans les paramètres.",
    cablage: "src/components/sales/DocumentPrintView.tsx",
  },
  {
    code: "Identite-individuel-Q14",
    title: "Champs d'identité des particuliers (CNDP)",
    status: "REPONDU",
    contexte: "Collecter un numéro de pièce d'identité pour un particulier soulève une question CNDP.",
    impact: "Détermine les champs obligatoires d'une fiche particulier.",
    decisionRequise: "Confirmer si un numéro de pièce d'identité est requis.",
    answer: "Ajouter le champ pièce d'identité mais le rendre optionnel (n'empêche pas l'enregistrement).",
    defautActuel:
      "Champ « Pièce d'identité (CIN / passeport) » présent sur la fiche client, optionnel : son absence ne bloque pas l'enregistrement. ICE obligatoire uniquement pour un professionnel (B2B).",
    cablage: "src/components/customers/CustomerModal.tsx, src/lib/actions/customers.ts",
  },
];
