"use client";

import { ExternalLink, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { date, inr, n, qty, round2 } from "@/lib/format";
import { NOTE_REASON_LABEL, type DebitNote } from "@/lib/types";
import { NoteStatusBadge, NoteTypeBadge } from "./NoteForm";
import { Button, ErrorBox, Modal, Spinner, cx } from "./ui";

/**
 * Debit and credit notes for a GRN in a popup: raised against the GRN itself (e.g. goods rejected at
 * inward) or against the purchase invoice booked from it. Each note shows its lines and totals.
 */
export function GrnNotesModal({
  open,
  onClose,
  grnNo,
  notes,
  loading,
  error,
  onRetry,
  focusId,
}: {
  open: boolean;
  onClose: () => void;
  grnNo: string;
  notes: DebitNote[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Note to scroll to when the popup opens */
  focusId?: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !focusId) return;
    const t = setTimeout(() => box.current?.querySelector(`[data-note="${focusId}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 150);
    return () => clearTimeout(t);
  }, [open, focusId]);

  const live = notes.filter((d) => d.status !== "CANCELLED");
  const total = (type: "DEBIT" | "CREDIT") => round2(live.filter((d) => d.noteType === type).reduce((s, d) => s + n(d.totalAmount), 0));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="inline-flex items-center gap-1.5">
          <ReceiptText className="size-4 text-slate-400" /> Debit &amp; Credit Notes · {grnNo}
        </span>
      }
      footer={
        <>
          <Link href="/debit-notes" className="mr-auto inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            All notes <ExternalLink className="size-3.5" />
          </Link>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div ref={box} className="space-y-3">
        {error && !notes.length ? (
          <ErrorBox message={error} onRetry={onRetry} />
        ) : loading && !notes.length ? (
          <Spinner />
        ) : !notes.length ? (
          <p className="py-8 text-center text-sm text-slate-500">No debit or credit notes for this GRN or its purchase invoice.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Figure label="Debit notes" value={inr(total("DEBIT"))} tone="text-red-700" />
              <Figure label="Credit notes" value={inr(total("CREDIT"))} tone="text-emerald-700" />
              <Figure label="Notes" value={`${notes.length}${notes.length !== live.length ? ` (${notes.length - live.length} cancelled)` : ""}`} />
            </div>
            {notes.map((d) => (
              <article
                key={d.id}
                data-note={d.id}
                className={cx("overflow-hidden rounded-lg border", focusId === d.id ? "border-brand-400 ring-2 ring-brand-500/20" : "border-slate-200", d.status === "CANCELLED" && "opacity-60")}
              >
                <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                      {d.dnNo} <NoteTypeBadge type={d.noteType} /> <NoteStatusBadge status={d.status} type={d.noteType} />
                    </p>
                    <p className="text-xs text-slate-500">
                      {NOTE_REASON_LABEL[d.reasonType] ?? d.reasonType} · {date(d.noteDate)}
                      {d.vendorRef && ` · vendor ref. ${d.vendorRef}`}
                      {d.purchase && ` · invoice ${d.purchase.purchaseNo}`}
                      {d.grn && !d.purchase && ` · ${d.grn.grnNo}`}
                    </p>
                    {d.reason && <p className="mt-0.5 text-sm text-slate-700">{d.reason}</p>}
                  </div>
                  <div className="text-right">
                    <p className={cx("num text-base font-semibold", d.noteType === "DEBIT" ? "text-red-700" : "text-emerald-700")}>{inr(d.totalAmount)}</p>
                    <p className="num text-[11px] text-slate-500">
                      {inr(d.subtotal)} + GST {inr(d.taxAmount)}
                    </p>
                  </div>
                </header>
                {d.items.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-1.5 font-medium">Item</th>
                          <th className="px-3 py-1.5 font-medium">Batch</th>
                          <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                          <th className="px-3 py-1.5 text-right font-medium">Rate</th>
                          <th className="px-3 py-1.5 text-right font-medium">GST</th>
                          <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((it) => (
                          <tr key={it.id} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-slate-800">{it.product?.name ?? it.description ?? "—"}</td>
                            <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{it.batchNo || "—"}</td>
                            <td className="num whitespace-nowrap px-3 py-1.5 text-right">
                              {n(it.quantity) ? `${qty(it.quantity)} ${it.product?.unit ?? ""}` : "—"}
                            </td>
                            <td className="num px-3 py-1.5 text-right">{inr(it.rate)}</td>
                            <td className="num px-3 py-1.5 text-right text-slate-500">{n(it.gstRate)}%</td>
                            <td className="num px-3 py-1.5 text-right font-medium">{inr(it.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("num font-semibold text-slate-900", tone)}>{value}</p>
    </div>
  );
}
