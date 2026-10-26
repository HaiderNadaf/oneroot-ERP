"use client";

import { useEffect, useRef } from "react";

/**
 * Listens for a hardware barcode scanner anywhere on the page. Scanners "type" the code very fast and
 * finish with Enter, so a burst of quick keystrokes ending in Enter is treated as a scan. If the burst
 * landed in a text box, it is removed again so the box is not left holding the code.
 */
export function useScanner(
  onScan: (code: string) => void,
  enabled = true,
  /** Leave this scan alone (no Enter swallowed, nothing removed from a box), e.g. while a field is being typed in */
  skip?: (target: HTMLElement | null) => boolean,
) {
  const handler = useRef(onScan);
  const skipRef = useRef(skip);
  useEffect(() => {
    handler.current = onScan;
    skipRef.current = skip;
  });

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let first = 0;
    let last = 0;

    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      // Humans pause between keys; a scanner never does
      if (now - last > 120) {
        buffer = "";
        first = now;
      }
      last = now;
      if (e.key === "Enter") {
        const code = buffer;
        buffer = "";
        const perKey = code.length ? (now - first) / code.length : 999;
        if (code.length < 4 || perKey > 60) return;
        const t = e.target as HTMLElement | null;
        if (skipRef.current?.(t)) return;
        e.preventDefault();
        e.stopPropagation();
        if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) && t.value.endsWith(code)) {
          // Put the box back the way it was, through React's own value setter so state stays in step
          const proto = t instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter?.call(t, t.value.slice(0, -code.length));
          t.dispatchEvent(new Event("input", { bubbles: true }));
        }
        handler.current(code);
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) buffer += e.key;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}

/** True when the key presses go into something the user is typing in (a text box, a dropdown's search, an editor) */
export const isTypingTarget = (t: HTMLElement | null) =>
  !!t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable);

/** True when this browser can read barcodes from the camera: any browser with camera access on a secure page (ZXing decodes where BarcodeDetector is missing) */
export const cameraScanSupported = () => typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
