"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/**
 * Runs in <head> before the first paint (see app/layout.tsx): the saved choice, else the device setting.
 * A plain string so it works before React loads; keep it in step with `preferred` below.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`;

function preferred(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const apply = (theme: Theme) => document.documentElement.classList.toggle("dark", theme === "dark");

// The "dark" class on <html> is the source of truth; every toggle on the page follows it
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const snapshot = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");
// The server can't know the saved theme: hydrate as light, then React switches to the real value
const serverSnapshot = (): Theme => "light";

/** The current theme and a toggle; the choice is remembered on this device */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  // React's dev remount resets <html>'s class; put it back before paint (a no-op in production)
  useLayoutEffect(() => {
    apply(preferred());
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = snapshot() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    apply(next);
  }, []);

  return { theme, toggle };
}
