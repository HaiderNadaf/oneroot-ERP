"use client";

import { AlertTriangle, Store } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useBranch, type BranchLite } from "@/lib/branch";
import { useApi } from "@/lib/hooks";
import type { Branch } from "@/lib/types";
import { cx } from "./ui";

/**
 * Screens that move stock or money need one branch: the API refuses them while
 * "All branches" is selected. `blocked` disables the save button; `notice` explains why
 * and offers one-click switching.
 */
export function useNeedBranch(action = "continue"): { blocked: boolean; notice: ReactNode } {
  const { currentId } = useBranch();
  const blocked = currentId === "all";
  return { blocked, notice: blocked ? <BranchNotice action={action} /> : null };
}

/** Amber banner: "You're viewing All branches. Pick a branch in the top bar to …" */
export function BranchNotice({ action = "continue", className }: { action?: string; className?: string }) {
  const { branches, setBranch } = useBranch();
  return (
    <div
      className={cx(
        "no-print flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800",
        className,
      )}
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1">
        You&apos;re viewing <strong>All branches</strong>. Pick a branch in the top bar to {action}.
      </span>
      {branches.length > 1 && (
        <span className="flex flex-wrap gap-1.5">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBranch(b.id)}
              className="rounded-md border border-amber-300 bg-surface px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Use {b.name}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

/** "Billing at: Main Branch" — shows which branch a transaction will be recorded in */
export function BranchBadge({ label = "Billing at", className }: { label?: string; className?: string }) {
  const { current, branches } = useBranch();
  // A single-branch store doesn't need reminding
  if (!current || branches.length < 2) return null;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-600/20",
        className,
      )}
    >
      <Store className="size-3.5" />
      {label}: {current.name}
    </span>
  );
}

/**
 * For money-only entries (payments, expenses) that may be recorded without a branch:
 * says which branch the entry is booked under, or "head office" while viewing All branches.
 */
export function RecordedIn({ className }: { className?: string }) {
  const { current, currentId, branches } = useBranch();
  if (currentId !== "all" && branches.length < 2) return null;
  return (
    <p className={cx("flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600", className)}>
      <Store className="mt-px size-3.5 shrink-0 text-slate-400" />
      {current ? (
        <span>
          Recorded in <strong className="font-medium text-slate-800">{current.name}</strong>.
        </span>
      ) : (
        <span>
          Recorded at <strong className="font-medium text-slate-800">head office (no branch)</strong> — pick a branch in the top bar to
          book it under one.
        </span>
      )}
    </p>
  );
}

/** Small code chip for tables, e.g. "MAIN" */
export function BranchCode({ code, title }: { code?: string | null; title?: string }) {
  if (!code) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span
      title={title}
      className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/10"
    >
      {code}
    </span>
  );
}

/**
 * Active branches for pickers (deliver-to, transfer destination, home branch).
 * Managers / accountants / admins read the full list; others fall back to the branches
 * they may switch between.
 */
export function useBranchOptions(): { branches: BranchLite[]; loading: boolean } {
  const { can } = useAuth();
  const { branches: mine } = useBranch();
  const full = can("inventory.transfer", "purchases.view", "grn.view", "invoices.view", "reports.view", "admin.users", "admin.branches");
  const { data, error, loading } = useApi<Branch[]>(full ? "/branches" : null);
  if (!full || error) return { branches: mine, loading: false };
  return {
    branches: (data ?? []).filter((b) => b.isActive).map((b) => ({ id: b.id, code: b.code, name: b.name, city: b.city })),
    loading,
  };
}
