"use server";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { auditLogs, db } from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

export interface OperationsLogEntry {
  id: number;
  action: string;
  label: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: string;
}

/** Libellés français des actions tracées (repli : code brut). */
// Non exporté : un fichier "use server" ne peut exporter que des fonctions async.
const OPERATIONS_LOG_LABELS: Record<string, string> = {
  CONNEXION: "Connexion",
  DECONNEXION: "Déconnexion",
  VALIDATION_DOCUMENT: "Vente validée (BL / Facture / BC)",
  CONVERSION_BL_FAC: "BL convertis en facture",
  AVOIR_EMIS: "Avoir émis",
  ANNULATION_DOCUMENT: "Document annulé",
  PRIX_FIXE: "Prix négocié (hors catalogue)",
  REBUT_STOCK: "Rebut / mise au rebut",
  RETOUR_FOURNISSEUR: "Retour fournisseur",
  REGLEMENT_CLIENT: "Encaissement client",
  STATUT_REGLEMENT: "Statut règlement modifié",
  CREATION_CLIENT: "Client créé",
  FUSION_CLIENT: "Clients fusionnés",
  FUSION_FOURNISSEUR: "Fournisseurs fusionnés",
  CREATION_FOURNISSEUR: "Fournisseur créé",
  RECEPTION_BR: "Réception fournisseur (BR)",
  REGLEMENT_FOURNISSEUR: "Règlement fournisseur",
  AVOIR_PRIX_FOURNISSEUR: "Avoir prix fournisseur",
  DEPENSE_CAISSE: "Dépense de caisse",
  SUPPRESSION_DEPENSE: "Dépense supprimée",
  INVENTAIRE_VALIDE: "Inventaire validé",
  INVENTAIRE_ANNULE: "Inventaire annulé",
  REGIME_TVA: "Régime TVA modifié",
};

/**
 * Journal des opérations (historique global ordonné) : connexions,
 * créations, suppressions, ventes, annulations, règlements, inventaires.
 * Les marqueurs CONNEXION / DECONNEXION délimitent les sessions,
 * le regroupement par journée se fait côté affichage.
 */
export async function getOperationsLog(options?: {
  action?: string;
  search?: string;
  limit?: number;
}): Promise<OperationsLogEntry[]> {
  await assertAuthenticated();
  const d = requireDb();

  const conds = [];
  if (options?.action && options.action !== "ALL") {
    conds.push(eq(auditLogs.action, options.action));
  }
  const search = options?.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conds.push(
      or(ilike(auditLogs.details, like), ilike(auditLogs.action, like))!
    );
  }

  const rows = await d
    .select()
    .from(auditLogs)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(auditLogs.id))
    .limit(Math.min(Math.max(options?.limit ?? 300, 1), 1000));

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    label: OPERATIONS_LOG_LABELS[r.action] ?? r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    details: r.details,
    createdAt: (r.createdAt ?? new Date()).toISOString(),
  }));
}

/** Actions distinctes présentes dans le journal (pour le filtre). */
export async function getOperationsLogActions(): Promise<Array<{ action: string; label: string; count: number }>> {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d
    .select({
      action: auditLogs.action,
      count: sql<string>`count(*)::int`,
    })
    .from(auditLogs)
    .groupBy(auditLogs.action)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({
    action: r.action,
    label: OPERATIONS_LOG_LABELS[r.action] ?? r.action,
    count: Number(r.count),
  }));
}
