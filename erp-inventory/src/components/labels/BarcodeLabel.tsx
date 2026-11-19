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
}

/** Une étiquette ~63×30 mm : désignation + prix TTC + emplacement + code-barres. */
export function BarcodeLabel({ name, barcode, priceCents, shelfLocation, sku }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !barcode) return;
    try {
      JsBarcode(svgRef.current, barcode, {
        format: barcodeFormat(barcode),
        displayValue: true,
        fontSize: 11,
        textMargin: 1,
        height: 30,
        margin: 0,
        marginTop: 2,
        marginBottom: 0,
      });
    } catch {
      // Code non encodable → le texte sous le SVG reste affiché
    }
  }, [barcode]);

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
