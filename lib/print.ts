"use client";

import type { StoreSettings } from "./types";

export type PrintMode = "a4" | "thermal" | "labels";

/** Paper width for the receipt layout the store chose */
export const receiptWidth = (s: StoreSettings | null | undefined) => (s?.receiptFormat === "THERMAL_58" ? 58 : 80);
export const defaultPrintMode = (s: StoreSettings | null | undefined): "a4" | "thermal" => (s?.receiptFormat?.startsWith("THERMAL") ? "thermal" : "a4");

/**
 * Prints one part of the page: the A4 `.print-area`, the `.thermal-area` receipt, or a `.label-sheet`.
 * `pageCss` sets the paper size so the browser does not pad a receipt or label to A4.
 */
export function printAs(mode: PrintMode, pageCss?: string) {
  document.body.dataset.print = mode;
  let style: HTMLStyleElement | null = null;
  const css = pageCss ?? (mode === "thermal" ? "size: 80mm auto; margin: 2mm 3mm;" : null);
  if (css) {
    style = document.createElement("style");
    style.textContent = `@page { ${css} }`;
    document.head.appendChild(style);
  }
  const done = () => {
    delete document.body.dataset.print;
    style?.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 60);
}

export const printReceipt = (widthMm: number) => printAs("thermal", `size: ${widthMm}mm auto; margin: 2mm 3mm;`);
