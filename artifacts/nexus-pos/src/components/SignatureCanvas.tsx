import { useRef, useImperativeHandle, forwardRef, useEffect } from "react";

export type SignatureCanvasHandle = {
  getDataUrl: () => string;
  isEmpty: () => boolean;
  clear: () => void;
};

interface SignatureCanvasProps {
  className?: string;
  /** Called with `true` when the user draws the first stroke, `false` after clear. */
  onChange?: (hasSignature: boolean) => void;
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  function SignatureCanvas({ className, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const hasDrawn = useRef(false);

    // Fill white background on mount
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    useImperativeHandle(ref, () => ({
      getDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? "",
      isEmpty: () => !hasDrawn.current,
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        hasDrawn.current = false;
        onChange?.(false);
      },
    }));

    const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ("touches" in e) {
        const t = e.touches[0];
        return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
      }
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      isDrawing.current = true;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = getPos(e);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!hasDrawn.current) {
        hasDrawn.current = true;
        onChange?.(true);
      }
    };

    const stopDraw = () => {
      isDrawing.current = false;
    };

    return (
      <canvas
        ref={canvasRef}
        width={400}
        height={160}
        className={`border border-input rounded-lg touch-none bg-white w-full cursor-crosshair ${className ?? ""}`}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
    );
  },
);
