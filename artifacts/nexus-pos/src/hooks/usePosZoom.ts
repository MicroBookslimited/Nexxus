import { useCallback, useEffect, useState } from "react";

const ZOOM_KEY = "pos_zoom_level";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const STEP = 0.1;

function clamp(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
}

function readSavedZoom(): number {
  if (typeof window === "undefined") return 1;
  const saved = parseFloat(window.localStorage.getItem(ZOOM_KEY) ?? "");
  return Number.isFinite(saved) && saved > 0 ? clamp(saved) : 1;
}

/**
 * Page-zoom control for the POS screens. Applies the CSS `zoom` property to the
 * document body — the same scaling effect as the browser's built-in zoom
 * (Ctrl +/-) — so the entire POS layout scales uniformly. The level is
 * persisted in localStorage so it survives reloads and shift switches, and is
 * reset to 100% when the POS screen unmounts so the rest of the app is never
 * left zoomed.
 */
export function usePosZoom() {
  const [zoom, setZoom] = useState<number>(readSavedZoom);

  useEffect(() => {
    document.body.style.setProperty("zoom", String(zoom));
    window.localStorage.setItem(ZOOM_KEY, String(zoom));
  }, [zoom]);

  useEffect(() => {
    return () => {
      document.body.style.removeProperty("zoom");
    };
  }, []);

  const zoomIn = useCallback(() => setZoom((z) => clamp(z + STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clamp(z - STEP)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  return { zoom, zoomIn, zoomOut, resetZoom, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM };
}
