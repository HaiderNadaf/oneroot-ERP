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
  // Margins are always 0 so the browser adds no date / URL header or footer (globals.css pads the content instead)
  const css = pageCss ?? (mode === "thermal" ? "size: 80mm auto; margin: 0;" : null);
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

export const printReceipt = (widthMm: number) => printAs("thermal", `size: ${widthMm}mm auto; margin: 0;`);

/**
 * Opens the browser's print dialog for a PDF in /public (e.g. a brand brochure) by loading it in an off-screen iframe.
 * Phones and tablets can't print a PDF from an iframe, so there it opens in a new tab and the viewer's own print / share
 * is used. `onReady` runs once the file has loaded (big catalogues take a few seconds).
 */
export function printPdf(url: string, onReady?: () => void) {
  if (window.matchMedia("(pointer: coarse)").matches) {
    window.open(url, "_blank", "noopener");
    onReady?.();
    return;
  }
  // The previous frame is kept until now: removing it while its print dialog is open would cancel the print
  document.getElementById("pdf-print-frame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "pdf-print-frame";
  frame.src = url;
  // Not display: none: Chrome doesn't load the PDF viewer in a hidden frame
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
  frame.onload = () => {
    onReady?.();
    // A short wait lets the PDF viewer finish laying out pages, or the first print can come out blank
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, "_blank", "noopener");
      }
    }, 300);
  };
  document.body.appendChild(frame);
}
