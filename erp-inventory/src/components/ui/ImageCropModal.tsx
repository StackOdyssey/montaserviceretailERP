"use client";

import React, { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { X, Check, ZoomIn, ZoomOut } from "lucide-react";

interface ImageCropModalProps {
  imageSrc: string;
  /** ratio largeur/hauteur du cadre (1 = carré) */
  aspect?: number;
  onValidate: (crop: Area) => void;
  onCancel: () => void;
}

/**
 * Cadre de recadrage tactile : l'utilisateur déplace / zoome la photo dans
 * un cadre fixe puis valide. Utilisé avant compression WebP + upload R2.
 */
export function ImageCropModal({
  imageSrc,
  aspect = 1,
  onValidate,
  onCancel,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90">
      {/* En-tête */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-bold text-white">Recadrer la photo</span>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 text-white/80 hover:text-white"
          aria-label="Annuler"
        >
          <X size={20} />
        </button>
      </div>

      {/* Zone de recadrage — tactile (drag + pinch) via react-easy-crop */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          cropShape="rect"
          showGrid
          style={{
            containerStyle: { background: "transparent" },
          }}
        />
      </div>

      {/* Zoom + actions */}
      <div className="px-4 pb-5 pt-3 space-y-4">
        <div className="flex items-center gap-3">
          <ZoomOut size={16} className="text-white/70 shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[#F7162D]"
            aria-label="Zoom"
          />
          <ZoomIn size={16} className="text-white/70 shrink-0" />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-white/30 text-white text-sm font-bold active:scale-98 transition-all"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => croppedArea && onValidate(croppedArea)}
            className="flex-1 py-3 rounded-xl bg-[#F7162D] text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <Check size={16} />
            Valider le cadrage
          </button>
        </div>
      </div>
    </div>
  );
}
