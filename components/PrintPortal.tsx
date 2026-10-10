"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Renders print-only content (thermal receipts, label sheets) directly under <body>, outside the app
 * layout, so the print stylesheet can hide everything else without blank pages.
 */
export function PrintPortal({ className, children }: { className: string; children: ReactNode }) {
  // Portals need the DOM; on the server (and the first client render) nothing is drawn
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  return createPortal(<div className={className}>{children}</div>, document.body);
}
