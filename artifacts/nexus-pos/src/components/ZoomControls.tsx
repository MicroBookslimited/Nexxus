import { ZoomIn, ZoomOut } from "lucide-react";
import { usePosZoom } from "@/hooks/usePosZoom";

type ZoomControlsProps = {
  /** Tailwind classes for the +/- icon buttons (match the host toolbar). */
  buttonClassName: string;
  /** Tailwind classes for the percentage label (match the host toolbar). */
  labelClassName?: string;
};

/**
 * Zoom in / out control for the POS screens (a magnifying glass with + and -).
 * Scales the whole page via the browser's CSS `zoom` (see usePosZoom).
 * Clicking the percentage resets to 100%.
 */
export function ZoomControls({ buttonClassName, labelClassName = "" }: ZoomControlsProps) {
  const { zoom, zoomIn, zoomOut, resetZoom, minZoom, maxZoom } = usePosZoom();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        onClick={zoomOut}
        disabled={zoom <= minZoom}
        className={`${buttonClassName} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Reset zoom to 100%"
        aria-label="Reset zoom to 100%"
        onClick={resetZoom}
        className={`min-w-[2.75rem] text-center text-xs font-semibold tabular-nums ${labelClassName}`}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        onClick={zoomIn}
        disabled={zoom >= maxZoom}
        className={`${buttonClassName} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <ZoomIn className="h-4 w-4" />
      </button>
    </div>
  );
}
