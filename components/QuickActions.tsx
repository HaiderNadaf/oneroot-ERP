"use client";

import {
  GripHorizontal,
  Hourglass,
  IndianRupee,
  Package,
  Pin,
  Receipt,
  Truck,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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
const POSITION_KEY = "oneroot.quickDock.position";

/** Shown until the user pins their own */
const DEFAULT_ACTIONS: Action[] = [
  {
    href: "/purchases",
    label: "Purchase",
    icon: <Truck />,
    perms: ["purchases.view"],
  },
  { href: "/inventory", label: "Inventory", icon: <Package />, perms: ["inventory.view"] },
  { href: "/sales", label: "Sales", icon: <Receipt />, perms: ["sales.bill"] },
  { href: "/payments", label: "Receive Payment", icon: <IndianRupee />, perms: ["payments.view"] },
  {
    href: "/inventory?status=expiring",
    label: "Expiry Items",
    icon: <Hourglass />,
    perms: ["inventory.view"],
  },
];

/**
 * Every page that can be pinned: the defaults plus all sidebar pages. Built on first use, not at import:
 * AppShell imports this file, so NAV isn't defined yet while it loads.
 */
let catalog: Action[] | null = null;
function getCatalog(): Action[] {
  if (catalog) return catalog;
  const seen = new Set<string>();
  const all: Action[] = [];
  for (const a of [...DEFAULT_ACTIONS, ...NAV.flatMap((g) => g.items)]) {
    if (seen.has(a.href)) continue;
    seen.add(a.href);
    all.push({ href: a.href, label: a.label, icon: a.icon, perms: a.perms });
  }
  return (catalog = all);
}

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(list) && list.every((x) => typeof x === "string"))
      return list;
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

// ───────────────────────── Dock position ─────────────────────────

/**
 * Where the dock sits: on the left or right edge of the window, at a height chosen by dragging. The height is kept
 * as a share of the window (0 = top, 1 = bottom) so it stays in the same place when the window resizes.
 */
type DockSide = "left" | "right";
interface DockPosition {
  side: DockSide;
  y: number;
}

const DEFAULT_POSITION: DockPosition = { side: "right", y: 0.5 };
const EDGE = 12; // gap between the dock and the window edges
/** Pinned icons shown before the column scrolls: 6 × 36px icons + 5 × 4px gaps */
const VISIBLE_PINS = 6;
const PINS_MAX_HEIGHT = VISIBLE_PINS * 36 + (VISIBLE_PINS - 1) * 4;

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

function loadPosition(): DockPosition {
  try {
    const p = JSON.parse(
      localStorage.getItem(POSITION_KEY) ?? "null",
    ) as unknown;
    // Older saves: just "left" / "right", or { h, x, v, y } in px
    if (p === "left" || p === "right") return { side: p, y: 0.5 };
    const o = p as { side?: unknown; y?: unknown; h?: unknown } | null;
    if (
      (o?.side === "left" || o?.side === "right") &&
      typeof o.y === "number" &&
      Number.isFinite(o.y)
    )
      return { side: o.side, y: clamp01(o.y) };
    if (o?.h === "left" || o?.h === "right") return { side: o.h, y: 0.5 };
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_POSITION;
}

function savePosition(p: DockPosition) {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

// ───────────────────────── Floating dock ─────────────────────────

/**
 * Floating shortcuts on every page: the pinned pages as icons in a column, one per row, each showing its name in a
 * tooltip on hover. Drag the grip to move it: it stays at the height it is dropped and snaps to the nearer side
 * (remembered on this device). The ⚡ button opens every page in a centred modal.
 * The ⚡ button opens every page, with pins to add or remove shortcuts.
 */
export function QuickDock() {
  const { can } = useAuth();
  // Rendered only after sign-in (client side), so reading storage here is safe
  const [pinned, setPinned] = useState<string[]>(loadPinned);
  const [pos, setPos] = useState<DockPosition>(loadPosition);
  const side = pos.side;
  // While dragging: the dock's live top-left corner, in px
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [dockHeight, setDockHeight] = useState(0);
  // The one tooltip, drawn outside the scrolling column so it is never clipped
  const [tip, setTip] = useState<{
    label: string;
    y: number;
    x: number;
  } | null>(null);
  const dock = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const grab = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !dock.current?.contains(t))
        setOpen(false);
    };
    window.addEventListener("keydown", esc);
    document.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", esc);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  const allowed = (a: Action) => !a.perms || can(...a.perms);
  const shown = pinned
    .map((h) => getCatalog().find((a) => a.href === h))
    .filter((a): a is Action => !!a && allowed(a));

  const toggle = useCallback((href: string) => {
    setPinned((list) => {
      const next = list.includes(href)
        ? list.filter((h) => h !== href)
        : [...list, href];
      savePinned(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const defaults = DEFAULT_ACTIONS.map((a) => a.href);
    savePinned(defaults);
    setPinned(defaults);
  }, []);

  const place = useCallback((next: DockPosition) => {
    setPos(next);
    savePosition(next);
  }, []);

  // The dock's height (it changes with the number of pins), to keep it fully on screen at any position
  useEffect(() => {
    const el = dock.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDockHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Dragging by the grip (mouse, pen and touch) ──
  function onGripDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || !dock.current) return;
    const r = dock.current.getBoundingClientRect();
    grab.current = {
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onGripMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const g = grab.current;
    if (!g || !dock.current) return;
    const r = dock.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(e.clientX - g.dx, EDGE),
      window.innerWidth - r.width - EDGE,
    );
    const top = Math.min(
      Math.max(e.clientY - g.dy, EDGE),
      window.innerHeight - r.height - EDGE,
    );
    g.moved = true;
    setOpen(false);
    setDrag({ left, top });
  }
  function onGripUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const g = grab.current;
    grab.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g?.moved || !dock.current) return;
    // Snap to whichever side the dock was dropped nearer to, at the height it was dropped
    const r = dock.current.getBoundingClientRect();
    place({
      side: r.left + r.width / 2 > window.innerWidth / 2 ? "right" : "left",
      y: clamp01((r.top + r.height / 2) / window.innerHeight),
    });
    setDrag(null);
  }

  // Keyboard: ← / → switch sides, ↑ / ↓ move it up and down
  function onGripKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, () => DockPosition> = {
      ArrowLeft: () => ({ ...pos, side: "left" }),
      ArrowRight: () => ({ ...pos, side: "right" }),
      ArrowUp: () => ({ ...pos, y: clamp01(pos.y - 0.05) }),
      ArrowDown: () => ({ ...pos, y: clamp01(pos.y + 0.05) }),
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    place(moves[e.key]());
  }

  // Resting: flush with its side at the chosen height, never past the top or bottom. While dragging: follows the pointer
  const half = dockHeight / 2 + EDGE;
  const style: CSSProperties = drag
    ? { left: drag.left, top: drag.top }
    : {
        [side]: EDGE,
        top: `clamp(${half}px, ${pos.y * 100}dvh, calc(100dvh - ${half}px))`,
        transform: "translateY(-50%)",
      };

  // Tooltips and the panel open towards the middle of the screen, away from the edge the dock hugs
  const tipSide = side === "right" ? "left" : "right";

  // Tooltip beside the hovered / focused icon, on the screen-centre side of the dock
  function showTip(label: string, el: HTMLElement) {
    if (drag) return;
    const r = el.getBoundingClientRect();
    setTip({
      label,
      y: r.top + r.height / 2,
      x: side === "right" ? window.innerWidth - r.left + 10 : r.right + 10,
    });
  }
  const hideTip = () => setTip(null);
  const tipHandlers = (label: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) =>
      showTip(label, e.currentTarget),
    onMouseLeave: hideTip,
    onFocus: (e: React.FocusEvent<HTMLElement>) =>
      showTip(label, e.currentTarget),
    onBlur: hideTip,
  });

  function togglePanel() {
    setOpen((o) => !o);
  }

  return (
    <>
      <div
        ref={dock}
        style={style}
        data-dragging={drag ? "" : undefined}
        className={cx(
          "group/dock no-print fixed z-40 flex flex-col items-stretch gap-1 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-[0_8px_30px_rgba(20,40,25,.18)] backdrop-blur",
          drag && "cursor-grabbing select-none",
        )}
      >
        <button
          type="button"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onKeyDown={onGripKey}
          aria-label="Move quick actions (drag, or use the arrow keys)"
          title="Drag to Move"
          className="flex h-5 w-full shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
        >
          <GripHorizontal className="size-4" />
        </button>

        {/* Pinned pages: icons only; names open out while the dock is hovered or focused */}
        {/* More than 6 pins: the column keeps its height and scrolls */}
        <nav
          aria-label="Pinned shortcuts"
          onScroll={hideTip}
          style={{ maxHeight: PINS_MAX_HEIGHT }}
          className={cx(
            "flex flex-col items-center gap-1 overflow-y-auto overscroll-contain",
            shown.length > VISIBLE_PINS && "-mr-1 pr-1",
          )}
        >
          {shown.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              aria-label={a.label}
              {...tipHandlers(a.label)}
              className="relative flex size-9 shrink-0 items-center justify-center rounded-[10px] text-ink transition-colors hover:bg-leaf-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:text-leaf-600"
            >
              {a.icon}
            </Link>
          ))}
        </nav>

        {shown.length > 0 && (
          <span aria-hidden className="mx-1 h-px shrink-0 bg-line" />
        )}

        <button
          type="button"
          onClick={togglePanel}
          aria-label="Quick actions: show all pages"
          aria-expanded={open}
          {...tipHandlers("All Pages")}
          className={cx(
            "relative inline-flex size-9 shrink-0 items-center justify-center self-center rounded-[10px] transition-colors",
            open
              ? "bg-brand-600 text-white"
              : "bg-leaf-100 text-brand-700 hover:bg-brand-600 hover:text-white",
          )}
        >
          <Zap className="size-[18px]" />
        </button>
      </div>

      {tip && !drag && !(open && tip.label === "All Pages") && (
        <DockTooltip side={tipSide} x={tip.x} y={tip.y} label={tip.label} />
      )}

      {open && (
        <AllPagesPanel
          ref={panel}
          pinned={pinned}
          allowed={allowed}
          onToggle={toggle}
          onReset={reset}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Small dark label beside a dock icon (fixed to the window, so the scrolling column can't clip it) */
function DockTooltip({
  side,
  x,
  y,
  label,
}: {
  side: "left" | "right";
  x: number;
  y: number;
  label: string;
}) {
  return (
    <span
      aria-hidden
      style={{ top: y, [side === "left" ? "right" : "left"]: x }}
      className={cx(
        "no-print pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-night-900 px-2 py-1 text-xs font-semibold text-white shadow-lg",
        // Little arrow pointing back at the icon
        "after:absolute after:top-1/2 after:-translate-y-1/2 after:border-4 after:border-transparent",
        side === "left"
          ? "after:left-full after:border-l-night-900"
          : "after:right-full after:border-r-night-900",
      )}
    >
      {label}
    </span>
  );
}

// ───────────────────────── All pages panel ─────────────────────────

function AllPagesPanel({
  ref,
  pinned,
  allowed,
  onToggle,
  onReset,
  onClose,
}: {
  ref: React.Ref<HTMLDivElement>;
  pinned: string[];
  allowed: (a: Action) => boolean;
  onToggle: (href: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  // Group the catalog like the sidebar. The untitled sidebar groups (Dashboard, Notifications) share one "General"
  // list; the default shortcuts that aren't sidebar pages go under "Shortcuts"
  const bySection = new Map<string, (typeof NAV)[number]["items"]>();
  for (const g of NAV)
    bySection.set(g.section || "General", [
      ...(bySection.get(g.section || "General") ?? []),
      ...g.items,
    ]);
  bySection.set(
    "Shortcuts",
    DEFAULT_ACTIONS.filter(
      (a) => !NAV.some((g) => g.items.some((i) => i.href === a.href)),
    ),
  );
  const listOf = (sections: string[]) =>
    sections
      .map((section) => ({
        section,
        items: (bySection.get(section) ?? []).filter(allowed),
      }))
      .filter((g) => g.items.length);
  // First row: Sales, Purchases, Admin, Finance; second row: Inventory, General, Shortcuts
  const rows = [
    listOf(["Sales", "Purchases", "Admin", "Finance"]),
    listOf(["Inventory", "General", "Shortcuts"]),
  ].filter((r) => r.length);

  return (
    <>
      {/* Modal backdrop; clicking it closes the panel (handled by the dock's outside-click listener) */}
      <div
        aria-hidden
        className="no-print fixed inset-0 z-50 bg-night-900/40"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="All pages"
        className="no-print fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p className="text-sm font-bold text-ink">All Pages</p>
            <p className="text-xs text-muted">
              Click a page to open it · use the pin to add or remove it from
              your shortcuts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="rounded-md border border-transparent p-1 text-xs font-medium text-muted transition-colors duration-200 hover:border-rust-900 hover:bg-rust-700 hover:text-white"
            >
              Reset Shortcuts
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {rows.map((row, r) => (
            <div
              key={r}
              className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {row.map((g) => (
                <div key={g.section}>
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-2">
                    {g.section}
                  </p>
                  <ul className="space-y-0.5">
                    {g.items.map((a) => {
                      const isPinned = pinned.includes(a.href);
                      return (
                        <li
                          key={a.href}
                          className="group flex items-center gap-1"
                        >
                          <Link
                            href={a.href}
                            onClick={onClose}
                            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-ink hover:bg-paper [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-leaf-600"
                          >
                            {a.icon}
                            <span className="truncate">{a.label}</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => onToggle(a.href)}
                            aria-label={
                              isPinned
                                ? `Remove ${a.label} from shortcuts`
                                : `Add ${a.label} to shortcuts`
                            }
                            title={
                              isPinned
                                ? "Remove From Shortcuts"
                                : "Add to Shortcuts"
                            }
                            className={cx(
                              "rounded-md p-1.5 transition-colors",
                              isPinned
                                ? "text-brand-600 hover:bg-red-50 hover:text-red-600"
                                : "text-slate-300 hover:bg-leaf-100 hover:text-brand-600",
                            )}
                          >
                            <Pin
                              className={cx(
                                "size-3.5",
                                isPinned && "fill-current",
                              )}
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
