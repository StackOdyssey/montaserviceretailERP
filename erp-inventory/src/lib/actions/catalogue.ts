"use server";

import path from "node:path";
import { readFile } from "node:fs/promises";
import { asc, eq, isNotNull, and } from "drizzle-orm";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { db, products } from "@/db";
import { assertAuthenticated } from "@/lib/action-guard";
import { actionResult, BusinessError, type ActionResult } from "@/lib/action-result";
import { uploadDocument } from "@/lib/storage";

// Grille A4 identique au script de catalogue (4×5, 20 produits/page)
const COLS = 4;
const ROWS = 5;
const PAGE = { w: 595.28, h: 841.89 };
const M = 28;
const GAP = 10;
const HEADER_H = 40;
const cellW = (PAGE.w - 2 * M - (COLS - 1) * GAP) / COLS;
const cellH = (PAGE.h - 2 * M - HEADER_H - (ROWS - 1) * GAP) / ROWS;
const IMG_H = cellH - 34;
const CONCURRENCY = 8;

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

function fontPath(name: string): string | null {
  try {
    return path.join(FONT_DIR, name);
  } catch {
    return null;
  }
}

/** Récupère l'image d'un produit : URL publique R2 ou photo legacy via disque. */
async function loadImage(photoUrl: string): Promise<Buffer | null> {
  if (photoUrl.startsWith("http")) {
    const res = await fetch(photoUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  // dev : /api/photos/<fichier> → lit depuis LEGACY_PHOTOS_DIR si présent
  const dir = process.env.LEGACY_PHOTOS_DIR;
  const name = photoUrl.split("/").pop();
  if (!dir || !name || !/^[\w.-]+$/.test(name)) return null;
  for (const sub of ["produits0", "produits"]) {
    try {
      return await readFile(path.join(dir, sub, name));
    } catch {
      /* dossier suivant */
    }
  }
  return null;
}

async function mapPool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

/**
 * Génère le catalogue produits (photo + nom + réf) en PDF, le dépose dans R2
 * sous catalogues/ et retourne l'URL publique.
 */
export async function generateCatalogue(): Promise<ActionResult<{ publicUrl: string; count: number }>> {
  await assertAuthenticated();
  return actionResult(async () => {
    if (!db) throw new BusinessError("BASE_INDISPONIBLE: DATABASE_URL non configurée");
    const rows = await db
      .select({ sku: products.sku, name: products.name, photoUrl: products.photoUrl })
      .from(products)
      .where(and(eq(products.isActive, true), isNotNull(products.photoUrl)))
      .orderBy(asc(products.sku));
    if (rows.length === 0) {
      throw new BusinessError("CATALOGUE_VIDE: aucun produit avec photo");
    }

    // vignettes 350px — limite le poids du PDF (~10 Mo)
    const thumbs = await mapPool(rows, CONCURRENCY, async (p) => {
      const src = p.photoUrl ? await loadImage(p.photoUrl) : null;
      if (!src) return null;
      try {
        return await sharp(src).resize(350, 350, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
      } catch {
        return null;
      }
    });

    const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: "Catalogue Produits" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on("end", () => resolve(Buffer.concat(chunks)))
    );

    const font = fontPath("Amiri-Regular.ttf");
    if (font) doc.registerFont("main", font);
    const drawHeader = (page: number) => {
      doc.font(font ? "main" : "Helvetica").fontSize(9).fillColor("#888888")
        .text(`Catalogue Produits — ${page}`, M, 12, { width: PAGE.w - 2 * M - 60, align: "left" });
      doc.fontSize(9).text(`${rows.length} produits`, M, 12, { width: PAGE.w - 2 * M, align: "right" });
      doc.moveTo(M, 26).lineTo(PAGE.w - M, 26).lineWidth(0.5).strokeColor("#cccccc").stroke();
    };

    let page = 1;
    drawHeader(page);
    for (const [i, p] of rows.entries()) {
      const idx = i % (COLS * ROWS);
      if (i > 0 && idx === 0) { doc.addPage(); page++; drawHeader(page); }
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const x = M + col * (cellW + GAP);
      const y = HEADER_H + row * (cellH + GAP);

      const img = thumbs[i];
      if (img) {
        doc.save().rect(x, y, cellW, IMG_H).clip()
          .image(img, x, y, { fit: [cellW, IMG_H], align: "center", valign: "center" })
          .restore();
      }
      doc.rect(x, y, cellW, IMG_H).lineWidth(0.4).strokeColor("#e0e0e0").stroke();
      doc.font(font ? "main" : "Helvetica").fontSize(7.5).fillColor("#000000")
        .text(p.name ?? "", x, y + IMG_H + 3, { width: cellW, height: 18, ellipsis: true });
      doc.fontSize(7).fillColor("#666666")
        .text(`Réf: ${p.sku}`, x, y + IMG_H + 22, { width: cellW });
    }
    doc.end();
    const pdf = await done;

    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const ab = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    const { publicUrl } = await uploadDocument(`catalogues/catalogue-${stamp}.pdf`, "application/pdf", ab);
    return { publicUrl, count: rows.length };
  });
}
