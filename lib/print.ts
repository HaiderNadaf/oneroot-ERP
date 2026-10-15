"use client";

import type { StoreSettings } from "./types";

/** "sheet": a document rendered in a PrintPortal with its own margins (e.g. the PO), printed on its own */
export type PrintMode = "a4" | "thermal" | "labels" | "sheet";

/** Paper width for the receipt layout the store chose */
export const receiptWidth = (s: StoreSettings | null | undefined) => (s?.receiptFormat === "THERMAL_58" ? 58 : 80);
export const defaultPrintMode = (s: StoreSettings | null | undefined): "a4" | "thermal" => (s?.receiptFormat?.startsWith("THERMAL") ? "thermal" : "a4");

/**
 * Prints one part of the page: the A4 `.print-area`, the `.thermal-area` receipt, or a `.label-sheet`.
 * `pageCss` sets the paper size so the browser does not pad a receipt or label to A4.
 * `fileName` becomes the suggested name of a saved PDF (browsers use the page title); restored after printing.
 */
export function printAs(mode: PrintMode, pageCss?: string, fileName?: string) {
  document.body.dataset.print = mode;
  const title = document.title;
  // Characters a file name can't hold (e.g. the slashes in PO/26-27/00001) become dashes
  if (fileName) document.title = fileName.replace(/[\\/:*?"<>|]+/g, "-");
  let style: HTMLStyleElement | null = null;
  const css = pageCss ?? (mode === "thermal" ? "size: 80mm auto; margin: 2mm 3mm;" : null);
  if (css) {
    style = document.createElement("style");
    style.textContent = `@page { ${css} }`;
    document.head.appendChild(style);
  }
  const done = () => {
    delete document.body.dataset.print;
    document.title = title;
    style?.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 60);
}

export const printReceipt = (widthMm: number) => printAs("thermal", `size: ${widthMm}mm auto; margin: 2mm 3mm;`);
