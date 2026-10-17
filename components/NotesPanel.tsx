"use client";

import { FileMinus, FilePlus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { date, inr, n, round2 } from "@/lib/format";
import { NOTE_REASON_LABEL, type NoteSummary, type NoteType } from "@/lib/types";
import { NoteForm, NoteStatusBadge, NoteTypeBadge, reducesPayable, type NotePreset } from "./NoteForm";
import { Button, Card, cx } from "./ui";

/** Posted notes that reduced the payable (rejected-at-inward notes were never billed) */
export function postedNotesTotal(notes: NoteSummary[] | undefined) {
  return round2((notes ?? []).filter((d) => d.status === "SENT" && reducesPayable(d.reasonType)).reduce((s, d) => s + n(d.totalAmount), 0));
}

/**
 * "Debit & credit notes" card for a PO or purchase invoice: lists the notes against it and lets
 * buyers raise a debit note or record a vendor's credit note with the vendor / document preset.
 */
export function NotesPanel({
  notes,
  preset,
  onChanged,
  allowNew = true,
  className,
}: {
  notes: NoteSummary[] | undefined;
  preset: NotePreset;
  onChanged: () => void;
  /** False when the document can't take new notes (e.g. a cancelled invoice) */
  allowNew?: boolean;
  className?: string;
}) {
  const { can } = useAuth();
  const [formType, setFormType] = useState<NoteType | null>(null);
  const list = notes ?? [];
  const canRaise = allowNew && can("purchases.manage");
  const posted = postedNotesTotal(list);
  const drafts = list.filter((d) => d.status === "DRAFT").length;

  return (
    <>
      <Card
        className={cx("no-print", className)}
        bodyClassName="p-0"
        title={
          <span className="inline-flex items-center gap-1.5">
            <ReceiptText className="size-4 text-slate-400" /> Debit &amp; Credit Notes
          </span>
        }
        actions={
          canRaise && (
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button size="sm" variant="secondary" icon={<FileMinus className="size-4" />} onClick={() => setFormType("DEBIT")}>
                Raise Debit Note
              </Button>
              <Button size="sm" variant="secondary" icon={<FilePlus className="size-4" />} onClick={() => setFormType("CREDIT")}>
                Record Credit Note
              </Button>
            </div>
          )
        }
      >
        {!list.length ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            No debit or credit notes yet
            {canRaise && " — raise a debit note for returns, rate differences or short supply, or record a credit note the vendor gave you"}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {list.map((d) => (
                <li key={d.id} className={cx("flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-sm", d.status === "CANCELLED" && "opacity-60")}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5">
                      {/* Named PO approvers can see this panel without the Purchases section */}
                      {can("purchases.view") ? (
                        <Link
                          href={`/debit-notes${d.noteType === "CREDIT" ? "?type=credit" : ""}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {d.dnNo}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-800">{d.dnNo}</span>
                      )}
                      <NoteTypeBadge type={d.noteType} />
                      <span className="text-slate-700">{NOTE_REASON_LABEL[d.reasonType] ?? d.reasonType}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {date(d.noteDate)}
                      {d.vendorRef && ` · vendor ref ${d.vendorRef}`}
                      {d.purchase && ` · ${d.purchase.purchaseNo}`}
                      {d.reason && ` · ${d.reason}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <NoteStatusBadge status={d.status} type={d.noteType} />
                    <span className="num w-24 text-right font-medium text-slate-900">{inr(d.totalAmount)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-sm">
              <span className="text-slate-500">
                {drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"} not yet posted` : "Posted notes"}
              </span>
              <span className="text-slate-600">
                Reduced the payable by <span className="num font-semibold text-slate-900">{inr(posted)}</span>
              </span>
            </div>
          </>
        )}
      </Card>

      <NoteForm
        open={!!formType}
        noteType={formType ?? "DEBIT"}
        preset={preset}
        onClose={() => setFormType(null)}
        onSaved={() => {
          setFormType(null);
          onChanged();
        }}
      />
    </>
  );
}
