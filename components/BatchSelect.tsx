"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { date, n, qty, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Batch, Paged } from "@/lib/types";
import { Button, Input, cx } from "./ui";

/** The batch chosen for a goods-receipt line: an existing one (its dates come along) or a new number */
export interface BatchPick {
  batchNo: string;
  existing: boolean;
  mfgDate?: string;
  expiryDate?: string;
}

/** Stock without a batch number is kept under this name; it is not offered as a batch */
const DEFAULT_BATCH = "DEFAULT";

/**
 * Batch dropdown for goods inward: the product's batches in this branch (expiry and stock shown,
 * expired ones greyed out) with an "Add batch" button at the bottom to type a new batch number.
 * Receiving into an existing batch adds to its stock.
 */
export function BatchSelect({
  id,
  productId,
  unit,
  value,
  onChange,
  placeholder = "Select batch",
  invalid,
  onAddMultiple,
}: {
  id?: string;
  productId: string;
  unit: string;
  value: string;
  onChange: (pick: BatchPick) => void;
  placeholder?: string;
  invalid?: boolean;
  /** When given, the bottom of the list offers "Multiple batches" next to "Single batch" */
  onAddMultiple?: () => void;
}) {
  const { data, loading } = useApi<Paged<Batch>>("/inventory/batches", { productId, status: "all", pageSize: 100 });
  const batches = (data?.items ?? [])
    .filter((b) => b.batchNo !== DEFAULT_BATCH)
    .sort((a, b) => (b.expiryDate ?? "").localeCompare(a.expiryDate ?? ""));
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const isExisting = batches.some((b) => b.batchNo.toLowerCase() === value.trim().toLowerCase());

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 280) });
  }, []);

  function toggle() {
    if (open) return setOpen(false);
    place();
    setAdding(false);
    setDraft("");
    setOpen(true);
  }

  // Close on a click elsewhere or Escape; follow the button while the page scrolls
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popup.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  function pickExisting(b: Batch) {
    onChange({
      batchNo: b.batchNo,
      existing: true,
      mfgDate: b.mfgDate ? today(new Date(b.mfgDate)) : undefined,
      expiryDate: b.expiryDate ? today(new Date(b.expiryDate)) : undefined,
    });
    setOpen(false);
  }

  function addNew() {
    const no = draft.trim();
    if (!no) return;
    const same = batches.find((b) => b.batchNo.toLowerCase() === no.toLowerCase());
    if (same) pickExisting(same);
    else {
      onChange({ batchNo: no, existing: false });
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cx(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30",
          invalid ? "border-red-400" : "border-slate-300 hover:border-slate-400",
        )}
      >
        {value ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-slate-900">{value}</span>
            {!loading && !isExisting && <span className="shrink-0 rounded bg-brand-50 px-1 text-[10px] font-semibold uppercase text-brand-700">New</span>}
          </span>
        ) : (
          <span className="truncate text-slate-400">{placeholder}</span>
        )}
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popup}
            role="listbox"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
            className="fixed z-[70] overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-xl"
          >
            <div className="max-h-60 overflow-y-auto py-1">
              {loading && !data ? (
                <p className="px-3 py-2 text-slate-400">Loading batches…</p>
              ) : !batches.length ? (
                <p className="px-3 py-2 text-slate-500">No batches of this product yet — add the first one below</p>
              ) : (
                batches.map((b) => {
                  const expired = !!b.expiryDate && today(new Date(b.expiryDate)) <= today();
                  const selected = b.batchNo === value;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={expired}
                      onClick={() => pickExisting(b)}
                      className={cx(
                        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
                        expired ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50",
                        selected && "bg-brand-50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block font-mono font-medium text-slate-900">{b.batchNo}</span>
                        <span className="block text-xs text-slate-500">
                          {b.expiryDate ? `${expired ? "Expired" : "Exp"} ${date(b.expiryDate)}` : "No expiry"}
                          {b.mfgDate ? ` · Mfg ${date(b.mfgDate)}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                        <span className="num">
                          {qty(n(b.quantity))} {unit} in stock
                        </span>
                        {selected && <Check className="size-4 text-brand-600" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t border-slate-100 bg-slate-50 p-2">
              {adding ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addNew();
                      }
                    }}
                    placeholder="New batch no., as printed on the pack"
                    data-scan-input

                    className="h-8 font-mono"
                    aria-label="New batch number"
                  />
                  <Button size="sm" onClick={addNew} disabled={!draft.trim()}>
                    Add
                  </Button>
                </div>
              ) : onAddMultiple ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                  >
                    <Plus className="size-3.5" /> Single batch
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onAddMultiple();
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                  >
                    <Plus className="size-3.5" /> Multiple batches
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                >
                  <Plus className="size-3.5" /> Add batch
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
