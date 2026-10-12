"use client";

import { Hourglass, IndianRupee, Package, Pin, Plus, Receipt, Truck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { NAV } from "./AppShell";
import { cx } from "./ui";

interface Action {
  href: string;
  label: string;
  icon: ReactNode;
  perms?: Permission[];
}

const STORAGE_KEY = "oneroot.quickActions";

/** Shown until the user pins their own */
const DEFAULT_ACTIONS: Action[] = [
  { href: "/purchases", label: "Purchase", icon: <Truck />, perms: ["purchases.view"] },
  { href: "/inventory", label: "Inventory", icon: <Package /> },
  { href: "/sales", label: "Sales", icon: <Receipt /> },
  { href: "/payments", label: "Receive Payment", icon: <IndianRupee /> },
  { href: "/inventory?status=expiring", label: "Expiry Items", icon: <Hourglass /> },
];

/** Every page that can be pinned: the defaults plus all sidebar pages */
const CATALOG: Action[] = (() => {
  const seen = new Set<string>();
  const all: Action[] = [];
  for (const a of [...DEFAULT_ACTIONS, ...NAV.flatMap((g) => g.items)]) {
    if (seen.has(a.href)) continue;
    seen.add(a.href);
    all.push({ href: a.href, label: a.label, icon: a.icon, perms: a.perms });
  }
  return all;
})();

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(list) && list.every((x) => typeof x === "string")) return list;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_ACTIONS.map((a) => a.href);
}

function savePinned(list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

const chip =
  "inline-flex items-center gap-[7px] rounded-[9px] border border-[#e1e6d8] bg-white px-3 py-2 text-[13px] font-semibold text-[#1d2a1f] transition-colors hover:border-brand-500 hover:text-brand-700 [&>svg]:size-[15px] [&>svg]:text-[#2e8b46]";

/** Shortcut buttons on the dashboard, with a "+" panel listing every page */
export function QuickActions() {
  const { can } = useAuth();
  // Rendered only after sign-in (client side), so reading storage here is safe
  const [pinned, setPinned] = useState<string[]>(loadPinned);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const close = (e: MouseEvent) => !panel.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", esc);
    document.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", esc);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  const allowed = (a: Action) => !a.perms || can(...a.perms);
  const shown = pinned.map((h) => CATALOG.find((a) => a.href === h)).filter((a): a is Action => !!a && allowed(a));

  function toggle(href: string) {
    setPinned((list) => {
      const next = list.includes(href) ? list.filter((h) => h !== href) : [...list, href];
      savePinned(next);
      return next;
    });
  }

  function reset() {
    const defaults = DEFAULT_ACTIONS.map((a) => a.href);
    savePinned(defaults);
    setPinned(defaults);
  }

  // Group the catalog like the sidebar; the default shortcuts that aren't sidebar pages go under "Shortcuts"
  const groups = [
    { section: "Shortcuts", items: DEFAULT_ACTIONS.filter((a) => !NAV.some((g) => g.items.some((i) => i.href === a.href))) },
    ...NAV.map((g) => ({ section: g.section || "General", items: g.items })),
  ]
    .map((g) => ({ ...g, items: g.items.filter(allowed) }))
    .filter((g) => g.items.length);

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      {shown.map((a) => (
        <Link key={a.href} href={a.href} className={chip}>
          {a.icon}
          {a.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Show all pages"
        aria-expanded={open}
        title="All pages"
        className={cx(
          "inline-flex size-[38px] items-center justify-center rounded-[9px] border border-dashed transition-colors",
          open ? "border-brand-500 bg-[#e3f1e3] text-brand-700" : "border-[#c9d1c0] bg-white text-[#5f6e60] hover:border-brand-500 hover:text-brand-700",
        )}
      >
        <Plus className="size-4" />
      </button>

      {open && (
        <div
          ref={panel}
          className="absolute left-0 top-full z-40 mt-2 w-[min(64rem,calc(100vw-2rem))] rounded-xl border border-[#e1e6d8] bg-white shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#e1e6d8] px-4 py-3">
            <div>
              <p className="text-sm font-bold text-[#1d2a1f]">All pages</p>
              <p className="text-xs text-[#5f6e60]">Click a page to open it · use the pin to add or remove it from your shortcuts</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={reset} className="text-xs font-medium text-[#5f6e60] hover:text-[#1d2a1f]">
                Reset shortcuts
              </button>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className="grid max-h-[65vh] grid-cols-1 gap-x-6 gap-y-4 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {groups.map((g) => (
              <div key={g.section}>
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#8a9a8b]">{g.section}</p>
                <ul className="space-y-0.5">
                  {g.items.map((a) => {
                    const isPinned = pinned.includes(a.href);
                    return (
                      <li key={a.href} className="group flex items-center gap-1">
                        <Link
                          href={a.href}
                          onClick={() => setOpen(false)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-[#1d2a1f] hover:bg-[#f3f5ef] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-[#2e8b46]"
                        >
                          {a.icon}
                          <span className="truncate">{a.label}</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggle(a.href)}
                          aria-label={isPinned ? `Remove ${a.label} from shortcuts` : `Add ${a.label} to shortcuts`}
                          title={isPinned ? "Remove from shortcuts" : "Add to shortcuts"}
                          className={cx(
                            "rounded-md p-1.5 transition-colors",
                            isPinned ? "text-brand-600 hover:bg-red-50 hover:text-red-600" : "text-slate-300 hover:bg-[#e3f1e3] hover:text-brand-600",
                          )}
                        >
                          <Pin className={cx("size-3.5", isPinned && "fill-current")} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
