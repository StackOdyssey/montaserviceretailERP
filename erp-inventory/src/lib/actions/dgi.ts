"use server";

import { createHash } from "crypto";
import { desc } from "drizzle-orm";
import { archiveManifests, db } from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";
import { getSalesDocumentById } from "./sales";
import { getSettings } from "./settings";
import { buildUblInvoice, type UblDocument } from "@/lib/ubl";

function requireDb() {
  if (!db) throw new Error("BASE_INDISPONIBLE: DATABASE_URL non configurée");
  return db;
}

/**
 * Question ouverte « DGI-e-invoicing » : l'intégration DGI est DÉSACTIVÉE par
 * défaut (fail-closed). Aucun envoi réseau n'a lieu tant que le périmètre et la
 * date d'entrée en vigueur ne sont pas confirmés par le comptable. L'export UBL
 * reste purement local et ne dépend pas de ce drapeau.
 */
export async function isDgiIntegrationEnabled(): Promise<boolean> {
  return process.env.DGI_ENABLED === "true";
}

/**
 * Export UBL 2.1 d'un document validé (couche isolée, readiness DGI).
 * Aucun envoi vers la DGI : le XML est produit et retourné tel quel.
 */
export async function getDocumentUbl(documentId: number): Promise<{ filename: string; xml: string }> {
  await assertAuthenticated();
  const doc = await getSalesDocumentById(documentId);
  if (!doc) throw new Error("Document introuvable");
  const s = await getSettings();

  const ublDoc: UblDocument = {
    docType: doc.docType,
    docNumber: doc.docNumber,
    docDate: doc.docDate,
    customerName: doc.customerName,
    customerIce: doc.customerIce,
    customerCity: doc.customerCity,
    totalNetHtCents: doc.totalNetHtCents,
    tvaAmountCents: doc.tvaAmountCents,
    totalTtcCents: doc.totalTtcCents,
    lines: doc.lines.map((l) => {
      const rate = l.tvaRate ?? doc.tvaRate;
      return {
        name: l.productName,
        sku: l.sku,
        quantity: l.quantity,
        unitPriceHtCents: l.unitPriceHTCents,
        totalHtCents: l.totalHtCents,
        tvaRate: rate,
        tvaAmountCents: Math.round((l.totalHtCents * rate) / 100),
        totalTtcCents: Math.round(l.totalHtCents * (1 + rate / 100)),
      };
    }),
  };

  const xml = buildUblInvoice(
    {
      name: s?.raisonSociale ?? "",
      ice: s?.ice,
      identifiantFiscal: s?.identifiantFiscal,
      address: s?.address,
      city: s?.city,
      phone: s?.phone,
      email: s?.email,
      registreCommerce: s?.registreCommerce,
      taxeProfessionnelle: s?.taxeProfessionnelle,
      capitalCents: s?.capitalCents,
    },
    ublDoc
  );

  return { filename: `${doc.docNumber.replace(/[^A-Za-z0-9_-]/g, "_")}.xml`, xml };
}

export interface ArchiveManifestItem {
  id: number;
  periodLabel: string;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  docCount: number;
  createdAt: string;
}

/** Liste des manifestes d'archivage (les plus récents d'abord). */
export async function getArchiveManifests(limit = 50): Promise<ArchiveManifestItem[]> {
  await assertAuthenticated();
  const d = requireDb();
  const rows = await d.select().from(archiveManifests).orderBy(desc(archiveManifests.id)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    objectKey: r.objectKey,
    sha256: r.sha256,
    sizeBytes: r.sizeBytes,
    docCount: r.docCount,
    createdAt: (r.createdAt ?? new Date()).toISOString(),
  }));
}

/**
 * Enregistre un manifeste d'archivage : SHA-256 calculé côté serveur sur le
 * contenu exporté (jamais fourni par le client).
 * Question ouverte « Retention-Q4 » : archivage append-only, aucune purge tant
 * que la durée de conservation n'est pas tranchée.
 */
export async function createArchiveManifest(data: {
  periodLabel: string;
  objectKey: string;
  content: string;
  docCount: number;
}): Promise<ArchiveManifestItem> {
  await assertAuthenticated();
  const d = requireDb();
  const sha256 = createHash("sha256").update(data.content, "utf8").digest("hex");
  const sizeBytes = Buffer.byteLength(data.content, "utf8");

  const row = (
    await d
      .insert(archiveManifests)
      .values({
        periodLabel: data.periodLabel,
        objectKey: data.objectKey,
        sha256,
        sizeBytes,
        docCount: data.docCount,
      })
      .returning()
  )[0];

  return {
    id: row.id,
    periodLabel: row.periodLabel,
    objectKey: row.objectKey,
    sha256: row.sha256,
    sizeBytes: row.sizeBytes,
    docCount: row.docCount,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  };
}
