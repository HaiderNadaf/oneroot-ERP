"use client";

import { Columns3, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, cx } from "./ui";

export interface ColumnDef<T> {
  id: string;
  label: string;
  /** Cell content */
  render: (row: T) => ReactNode;
  /** Plain value for CSV export */
  csv?: (row: T) => string | number | null | undefined;
  right?: boolean;
  /** Visible until the user changes their choice */
  defaultVisible?: boolean;
  /** Can't be hidden (e.g. the name column) */
  locked?: boolean;
  /** Extra classes for header and cells */
  className?: string;
}

function load(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;
  } catch {
    return null;
  }
}

function save(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Which columns of a table are shown, remembered per table in this browser.
 * Only use on pages rendered after sign-in (client side), since it reads localStorage on first render.
 */
export function useColumns<T>(storageKey: string, columns: ColumnDef<T>[]) {
  const defaults = () => columns.filter((c) => c.locked || c.defaultVisible).map((c) => c.id);
  const [visible, setVisible] = useState<string[]>(() => load(`oneroot.cols.${storageKey}`) ?? defaults());

  const update = (ids: string[]) => {
    // Keep locked columns and the defined order
    const next = columns.filter((c) => c.locked || ids.includes(c.id)).map((c) => c.id);
    save(`oneroot.cols.${storageKey}`, next);
    setVisible(next);
  };

  return {
    columns: columns.filter((c) => c.locked || visible.includes(c.id)),
    all: columns,
    visible,
    toggle: (id: string) => update(visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]),
    showAll: () => update(columns.map((c) => c.id)),
    reset: () => update(defaults()),
  };
}

/** "Columns" button with a checklist of every column */
export function ColumnPicker<T>({ state }: { state: ReturnType<typeof useColumns<T>> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const hidden = state.all.length - state.columns.length;

  return (
    <div ref={box} className="relative">
      <Button
        variant="secondary"
        icon={<Columns3 className="size-4" />}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Columns
        {hidden > 0 && <span className="num rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{state.columns.length}/{state.all.length}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Show Columns</p>
            <div className="flex gap-2 text-xs">
              <button onClick={state.showAll} className="font-medium text-brand-700 hover:underline">
                All
              </button>
              <button onClick={state.reset} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
                <RotateCcw className="size-3" /> Reset
              </button>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {state.all.map((c) => {
              const on = c.locked || state.visible.includes(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={cx(
                      "flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 sm:py-1.5",
                      c.locked && "cursor-default text-slate-400",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 rounded border-slate-300 accent-brand-600"
                      checked={on}
                      disabled={c.locked}
                      onChange={() => state.toggle(c.id)}
                    />
                    {c.label}
                    {c.locked && <span className="ml-auto text-[11px]">always</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
