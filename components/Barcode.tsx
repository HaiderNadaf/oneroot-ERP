"use client";

import { barcodeRects, encodeBarcode } from "@/lib/barcode";

/** SVG barcode: EAN-13 for valid 13-digit codes, Code 128 otherwise */
export function Barcode({
  value,
  height = 40,
  moduleWidth = 1.5,
  showText = true,
  className,
  fluid,
  stretch,
}: {
  value: string;
  height?: number;
  moduleWidth?: number;
  showText?: boolean;
  className?: string;
  /** Scale to the container width, keeping the aspect ratio */
  fluid?: boolean;
  /** Fill the container's width and height (bars only — print the number separately) */
  stretch?: boolean;
}) {
  const shape = encodeBarcode(value);
  if (!shape) return null;
  const rects = barcodeRects(shape.bits);
  const quiet = 8 * moduleWidth;
  const w = shape.bits.length * moduleWidth + quiet * 2;
  const textH = showText && !stretch ? 12 : 0;
  return (
    <svg
      viewBox={`0 0 ${w} ${height + textH}`}
      width={fluid || stretch ? undefined : w}
      height={fluid || stretch ? undefined : height + textH}
      style={stretch ? { width: "100%", height: "100%", display: "block" } : fluid ? { width: "100%", height: "auto" } : undefined}
      preserveAspectRatio={stretch ? "none" : undefined}
      className={className ? `paper bg-white ${className}` : "paper bg-white"}
      role="img"
      aria-label={value}
      shapeRendering="crispEdges"
    >
      {rects.map((r, i) => (
        <rect key={i} x={quiet + r.x * moduleWidth} y={0} width={r.w * moduleWidth} height={height} fill="#000" />
      ))}
      {showText && !stretch && (
        <text x={w / 2} y={height + 10} textAnchor="middle" fontSize="10" fontFamily="ui-monospace, Consolas, monospace" fill="#000">
          {shape.text}
        </text>
      )}
    </svg>
  );
}

/** Human-readable form of a barcode (EAN-13 is grouped the way packs print it) */
export const barcodeText = (value: string) => encodeBarcode(value)?.text ?? value;
