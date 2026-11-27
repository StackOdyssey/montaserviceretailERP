"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { barcodeFormat } from "@/lib/barcode";
import { formatMoney } from "@/lib/money";

interface BarcodeLabelProps {
  name: string;
  barcode: string;
  priceCents: number;
  shelfLocation?: string | null;
  sku?: string;
  /** sheet = planche A4 63×30 · roll40/roll50 = sticker de rouleau thermique */
  variant?: "sheet" | "roll40" | "roll50";
}

const ROLL_SIZE = {
  roll40: "w-[39mm] h-[29mm]",
  roll50: "w-[49mm] h-[29mm]",
} as const;

/** Une étiquette ~63×30 mm : désignation + prix TTC + emplacement + code-barres. */
export function BarcodeLabel({ name, barcode, priceCents, shelfLocation, sku, variant = "sheet" }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isRoll = variant !== "sheet";

  useEffect(() => {
    if (!svgRef.current || !barcode) return;
    try {
      JsBarcode(svgRef.current, barcode, {
        format: barcodeFormat(barcode),
        displayValue: true,
        fontSize: isRoll ? 9 : 11,
        textMargin: 1,
        height: isRoll ? 24 : 30,
        margin: 0,
        marginTop: 2,
        marginBottom: 0,
      });
    } catch {
      // Code non encodable → le texte sous le SVG reste affiché
    }
  }, [barcode, isRoll]);

  if (isRoll) {
    return (
      <div className={`roll-sticker barcode-label flex flex-col justify-between ${ROLL_SIZE[variant]} px-1 py-0.5 bg-white border border-dashed border-[#D1D5DB] overflow-hidden`}>
        <div className="flex items-baseline justify-between gap-1 leading-none">
          <span className="text-[7px] font-bold text-[#111827] uppercase truncate">{name}</span>
          <span className="text-[9px] font-extrabold text-[#111827] whitespace-nowrap">
            {formatMoney(priceCents)}
          </span>
        </div>
        {barcode ? (
          <svg ref={svgRef} className="w-full max-h-[15mm]" />
        ) : (
          <div className="text-[7px] font-bold text-[#F7162D] text-center py-1">
            SANS CODE-BARRES
          </div>
        )}
        <div className="text-[6px] font-semibold text-[#6B7280] text-center truncate leading-none">
          {shelfLocation || sku || ""}
        </div>
      </div>
    );
  }

  return (
    <div className="barcode-label flex flex-col justify-between w-[62mm] h-[30mm] px-1.5 py-1 bg-white border border-dashed border-[#D1D5DB] overflow-hidden">
      <div className="leading-tight">
        <div className="text-[8px] font-bold text-[#111827] line-clamp-2 uppercase">
          {name}
        </div>
        <div className="flex items-baseline justify-between gap-1 mt-0.5">
          <span className="text-[10px] font-extrabold text-[#111827] whitespace-nowrap">
            {formatMoney(priceCents)}
          </span>
          <span className="text-[7px] font-semibold text-[#6B7280] truncate">
            {shelfLocation || sku || ""}
          </span>
        </div>
      </div>
      {barcode ? (
        <svg ref={svgRef} className="w-full max-h-[14mm]" />
      ) : (
        <div className="text-[8px] font-bold text-[#F7162D] text-center py-1">
          SANS CODE-BARRES
        </div>
      )}
    </div>
  );
}
