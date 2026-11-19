import { readFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";

/**
 * DEV LOCAL UNIQUEMENT — sert les photos produits legacy depuis le disque
 * (web/produits, web/produits0) pendant la phase de test, avant l'import R2.
 * En prod LEGACY_PHOTOS_DIR est absent → 404, photo_url pointera sur R2.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const dir = process.env.LEGACY_PHOTOS_DIR;
  if (!dir) return new NextResponse(null, { status: 404 });

  const { name } = await params;
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(name)) {
    return new NextResponse(null, { status: 400 });
  }

  for (const sub of ["produits0", "produits"]) {
    try {
      const buf = await readFile(join(dir, sub, name));
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      /* essaie le dossier suivant */
    }
  }
  return new NextResponse(null, { status: 404 });
}
