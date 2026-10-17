"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Download, Printer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Button, DateInput, ErrorBox, Spinner, Th, cx } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { date, monthStart, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Permission } from "@/lib/permissions";
import type { StoreSettings } from "@/lib/types";

/** A link to another module that falls back to plain text when the user can't open that page */
export function ReportLink({ href, perms, className, children }: { href: string; perms: Permission[]; className?: string; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(...perms)) return <span className={cx(className?.includes("font-medium") && "font-medium", "text-slate-900")}>{children}</span>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export interface Range {
  from: string;
  to: string;
}

/** Indian financial year starts 1 April */
function fyStart(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return today(new Date(y, 3, 1));
}

function lastMonth(): Range {
  const d = new Date();
  return { from: today(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: today(new Date(d.getFullYear(), d.getMonth(), 0)) };
}

export const PRESETS: { label: string; range: () => Range }[] = [
  { label: "Today", range: () => ({ from: today(), to: today() }) },
  { label: "This Month", range: () => ({ from: monthStart(), to: today() }) },
  { label: "Last Month", range: lastMonth },
  { label: "This FY", range: () => ({ from: fyStart(), to: today() }) },
];

export const defaultRange = (): Range => ({ from: monthStart(), to: today() });

export function periodLabel(r: Range) {
  return r.from === r.to ? date(r.from) : `${date(r.from)} – ${date(r.to)}`;
}

export function RangeBar({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <DateInput value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="From date" />
        <span className="text-sm text-slate-400">to</span>
        <DateInput value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="To date" />
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => {
          const r = p.range();
          const active = r.from === value.from && r.to === value.to;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(r)}
              className={cx(
                "h-8 rounded-lg px-2.5 text-xs font-medium transition-colors",
                active ? "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/20" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Common chrome for every report: filter controls + Print/CSV (hidden when printing),
 * and a print-only letterhead with the store name, report title and period.
 */
export function ReportFrame({
  title,
  period,
  controls,
  onCsv,
  loading,
  error,
  onRetry,
  hasData,
  children,
}: {
  title: string;
  period?: string;
  controls?: ReactNode;
  onCsv?: () => void;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  hasData: boolean;
  children: ReactNode;
}) {
  const { data: store } = useApi<StoreSettings>("/settings");
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-surface p-3 shadow-sm">
        {controls}
        <div className="flex-1" />
        <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!hasData}>
          Print
        </Button>
        {onCsv && (
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={onCsv} disabled={!hasData}>
            CSV
          </Button>
        )}
      </div>
      <div className="print-area">
        <div className="mb-4 hidden border-b border-slate-300 pb-2 print:block">
          <p className="text-lg font-semibold">{store?.storeName}</p>
          {store?.gstin && <p className="text-xs">GSTIN {store.gstin}</p>}
          <p className="mt-1 text-sm font-medium">
            {title}
            {period && <span className="font-normal"> · {period}</span>}
          </p>
        </div>
        {error ? <ErrorBox message={error} onRetry={onRetry} /> : loading && !hasData ? <Spinner /> : children}
      </div>
    </div>
  );
}

/** Bold totals row for report tables */
export function TotalRow({ children }: { children: ReactNode }) {
  return <tr className="bg-slate-50 font-semibold text-slate-900 [&>td]:border-t [&>td]:border-slate-200">{children}</tr>;
}

// ───────────── Sorting ─────────────

export type SortDir = "asc" | "desc";

export function useSort<T, K extends keyof T & string>(rows: T[], initial: K, initialDir: SortDir = "desc") {
  const [key, setKey] = useState<K>(initial);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const x = a[key];
      const y = b[key];
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return dir === "asc" ? c : -c;
    });
    return out;
  }, [rows, key, dir]);
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(k);
      setDir(typeof rows[0]?.[k] === "number" ? "desc" : "asc");
    }
  };
  return { sorted, key, dir, toggle };
}

export function SortTh<K extends string>({
  label,
  k,
  sort,
  right,
}: {
  label: string;
  k: K;
  sort: { key: K; dir: SortDir; toggle: (k: K) => void };
  right?: boolean;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Th right={right}>
      <button
        type="button"
        onClick={() => sort.toggle(k)}
        className={cx("inline-flex items-center gap-1 uppercase hover:text-slate-800", active && "text-slate-800", right && "flex-row-reverse")}
      >
        {label}
        <Icon className={cx("no-print size-3", !active && "opacity-40")} />
      </button>
    </Th>
  );
}
