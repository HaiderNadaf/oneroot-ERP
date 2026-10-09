"use client";

import { Ban, CheckCircle2, Eye, FileMinus, FilePlus, Printer, Send } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RequireRole } from "@/components/AppShell";
import { NoteForm, NoteStatusBadge, ReasonBadge, noteTypeName, postLabel, reducesPayable } from "@/components/NoteForm";
import { VendorPicker } from "@/components/pickers";
import {
  Button,
  Card,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  Modal,
  PageHeader,
  Table,
  Tabs,
  Pagination,
  Td,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { amountInWords, date, inr, n, qty } from "@/lib/format";
import { placeOfSupply } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import { NOTE_REASON_LABEL, type DebitNote, type DebitNoteStatus, type NoteType, type Paged, type StoreSettings, type Vendor } from "@/lib/types";

type Filter = "" | DebitNoteStatus;
type TypeTab = "debit" | "credit";

export default function DebitNotesPage() {
  return (
    <RequireRole roles={["MANAGER", "ACCOUNTANT"]}>
      <Notes />
    </RequireRole>
  );
}

/** What posting a draft does, in words, for the confirm dialog */
function postMessage(dn: DebitNote) {
  const amount = inr(dn.totalAmount);
  if (!reducesPayable(dn.reasonType)) {
    return `Send ${dn.dnNo} to ${dn.vendor.name}? This records that the vendor has been told about the goods rejected on ${dn.grn?.grnNo ?? "goods inward"} (${amount}). Rejected goods never entered stock and were never billed, so stock and the vendor balance don't change.`;
  }
  const settles = dn.purchase ? ` The balance due on invoice ${dn.purchase.purchaseNo} is settled from it first.` : "";
  if (dn.noteType === "CREDIT") {
    return `Accept and apply credit note ${dn.dnNo}${dn.vendorRef ? ` (vendor's no. ${dn.vendorRef})` : ""} from ${dn.vendor.name}? ${amount} will be taken off what you owe the vendor.${settles} This can't be undone.`;
  }
  if (dn.affectsStock) {
    return `Send ${dn.dnNo} to ${dn.vendor.name}? The returned quantities will be taken out of stock now and ${amount} will be taken off what you owe the vendor.${settles} This can't be undone.`;
  }
  return `Send ${dn.dnNo} to ${dn.vendor.name}? ${amount} (${NOTE_REASON_LABEL[dn.reasonType].toLowerCase()}) will be taken off what you owe the vendor.${settles} Stock does not change. This can't be undone.`;
}

function Notes() {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: TypeTab = params.get("type") === "credit" ? "credit" : "debit";
  const noteType: NoteType = tab === "credit" ? "CREDIT" : "DEBIT";
  const isDebit = noteType === "DEBIT";
  const [status, setStatus] = useState<Filter>("");
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<DebitNote | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<DebitNote> & { drafts: { count: number; value: string | number } }>(
    "/debit-notes",
    { noteType, status, vendorId: vendor?.id, page, pageSize: 25 },
  );
  const { data: store } = useApi<StoreSettings>("/settings");

  const rows = data?.items ?? [];
  // Draft totals come from the server so they cover every page
  const drafts = { length: data?.drafts.count ?? 0 };
  const draftValue = n(data?.drafts.value);

  function changeTab(t: TypeTab) {
    setPage(1);
    router.replace(t === "credit" ? `${pathname}?type=credit` : pathname, { scroll: false });
  }

  async function post(dn: DebitNote) {
    if (!(await confirm(postMessage(dn), { confirmLabel: postLabel(dn.noteType) }))) return;
    setBusy(dn.id);
    try {
      await api.post(`/debit-notes/${dn.id}/send`);
      toast.success(
        dn.noteType === "CREDIT"
          ? `${dn.dnNo} applied · payable reduced by ${inr(dn.totalAmount)}`
          : `${dn.dnNo} sent${dn.affectsStock ? " · stock removed" : ""}${reducesPayable(dn.reasonType) ? " · payable reduced" : ""}`,
      );
      void reload();
      setViewing((v) => (v?.id === dn.id ? { ...v, status: "SENT" } : v));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(dn: DebitNote) {
    const msg = `Cancel ${noteTypeName(dn.noteType)} ${dn.dnNo}? It hasn't been ${dn.noteType === "DEBIT" ? "sent" : "applied"} yet, so stock and balances are unaffected.`;
    if (!(await confirm(msg, { danger: true, confirmLabel: "Cancel note" }))) return;
    setBusy(dn.id);
    try {
      await api.post(`/debit-notes/${dn.id}/cancel`);
      toast.success(`${dn.dnNo} cancelled`);
      void reload();
      setViewing((v) => (v?.id === dn.id ? { ...v, status: "CANCELLED" } : v));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const actions = (dn: DebitNote, size: "sm" | "md" = "sm") =>
    dn.status === "DRAFT" && (
      <>
        <Button
          size={size}
          icon={dn.noteType === "DEBIT" ? <Send className="size-4" /> : <CheckCircle2 className="size-4" />}
          onClick={() => post(dn)}
          loading={busy === dn.id}
        >
          {postLabel(dn.noteType)}
        </Button>
        <Button size={size} variant="ghost" icon={<Ban className="size-4" />} onClick={() => cancel(dn)} disabled={busy === dn.id}>
          Cancel
        </Button>
      </>
    );

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Debit & Credit Notes"
          subtitle={
            isDebit
              ? "Debit notes you raise to vendors to reduce what you owe — goods returned, rate overcharged, short supply, damaged in transit"
              : "Credit notes vendors give you, reducing what you owe — scheme incentives, price protection, cash discounts, accepted debit notes"
          }
          actions={
            isDebit ? (
              <Button icon={<FileMinus className="size-4" />} onClick={() => setFormOpen(true)}>
                New debit note
              </Button>
            ) : (
              <Button icon={<FilePlus className="size-4" />} onClick={() => setFormOpen(true)}>
                Record credit note
              </Button>
            )
          }
        />

        <Tabs<TypeTab>
          value={tab}
          onChange={changeTab}
          tabs={[
            { value: "debit", label: "Debit notes" },
            { value: "credit", label: "Credit notes" },
          ]}
        />

        {status !== "SENT" && status !== "CANCELLED" && drafts.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {drafts.length} draft {noteTypeName(noteType)}
            {drafts.length === 1 ? "" : "s"} worth {inr(draftValue)}{" "}
            {isDebit ? "not yet sent to the vendor" : "recorded but not yet applied"} — they don&apos;t change the vendor balance until{" "}
            {isDebit ? "sent" : "accepted & applied"}.
          </div>
        )}

        <Card bodyClassName="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["", "All"],
                  ["DRAFT", "Draft"],
                  ["SENT", isDebit ? "Sent" : "Applied"],
                  ["CANCELLED", "Cancelled"],
                ] as [Filter, string][]
              ).map(([value, label]) => (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => {
                    setStatus(value);
                    setPage(1);
                  }}
                  className={cx(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    status === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="w-full sm:w-80">
              <VendorPicker
                value={vendor}
                onChange={(v) => {
                  setVendor(v);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {error ? (
            <div className="p-4">
              <ErrorBox message={error} onRetry={reload} />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{isDebit ? "Debit note" : "Credit note"}</Th>
                  <Th>Vendor</Th>
                  <Th>Reason</Th>
                  <Th>Against</Th>
                  <Th>Vendor ref</Th>
                  <Th right>Value incl. GST</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <LoadingRow colSpan={8} />
                ) : !rows.length ? (
                  <EmptyRow colSpan={8}>
                    No {noteTypeName(noteType)}s{status || vendor ? " for these filters" : " yet"}.
                  </EmptyRow>
                ) : (
                  rows.map((dn) => (
                    <tr key={dn.id} className={cx("align-top hover:bg-slate-50", dn.status === "CANCELLED" && "opacity-60")}>
                      <Td className="whitespace-nowrap">
                        <button type="button" onClick={() => setViewing(dn)} className="font-medium text-slate-900 hover:text-brand-700">
                          {dn.dnNo}
                        </button>
                        <p className="text-xs text-slate-500">{date(dn.noteDate)}</p>
                      </Td>
                      <Td>
                        <Link href={`/vendors/${dn.vendor.id}`} className="hover:text-brand-700">
                          {dn.vendor.name}
                        </Link>
                      </Td>
                      <Td className="max-w-64">
                        <ReasonBadge reason={dn.reasonType} />
                        <p className="mt-0.5 text-xs text-slate-600">{dn.reason}</p>
                      </Td>
                      <Td className="whitespace-nowrap text-sm">
                        <Against dn={dn} />
                      </Td>
                      <Td className="whitespace-nowrap text-slate-600">{dn.vendorRef || "—"}</Td>
                      <Td right className="font-medium">
                        {inr(dn.totalAmount)}
                      </Td>
                      <Td>
                        <NoteStatusBadge status={dn.status} type={dn.noteType} />
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          {actions(dn)}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Eye className="size-4" />}
                            onClick={() => setViewing(dn)}
                            aria-label={`View ${dn.dnNo}`}
                          />
                        </div>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
        </Card>
      </div>

      {viewing && (
        <>
          <Modal
            open
            onClose={() => setViewing(null)}
            size="lg"
            title={
              <span className="flex items-center gap-2">
                {viewing.dnNo} <NoteStatusBadge status={viewing.status} type={viewing.noteType} />
              </span>
            }
            footer={
              <>
                {actions(viewing, "md")}
                <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
                  Print
                </Button>
              </>
            }
          >
            <NoteDoc dn={viewing} store={store} />
          </Modal>
          {/* The modal is hidden when printing; this copy is what prints */}
          <div className="print-area hidden print:block">
            <NoteDoc dn={viewing} store={store} />
          </div>
        </>
      )}

      <NoteForm
        open={formOpen}
        noteType={noteType}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          if (status && status !== "DRAFT") setStatus("DRAFT");
          void reload();
        }}
      />
    </>
  );
}

/** Invoice / PO / GRN the note is against */
function Against({ dn }: { dn: DebitNote }) {
  const links = [
    dn.purchase && { href: `/purchases/${dn.purchase.id}`, label: dn.purchase.purchaseNo, sub: dn.purchase.vendorInvoiceNo },
    dn.po && { href: `/purchase-orders/${dn.po.id}`, label: dn.po.poNo },
    dn.grn && { href: `/goods-inward/${dn.grn.id}`, label: dn.grn.grnNo },
  ].filter(Boolean) as { href: string; label: string; sub?: string | null }[];
  if (!links.length) return <span className="text-slate-400">{dn.affectsStock ? "Stock return" : "Vendor account"}</span>;
  return (
    <>
      {links.map((l) => (
        <p key={l.href}>
          <Link href={l.href} className="text-brand-700 hover:underline">
            {l.label}
          </Link>
          {l.sub && <span className="text-xs text-slate-500"> · {l.sub}</span>}
        </p>
      ))}
    </>
  );
}

function NoteDoc({ dn, store }: { dn: DebitNote; store: StoreSettings | null }) {
  const isDebit = dn.noteType === "DEBIT";
  const pos = placeOfSupply(dn.vendor, store);
  const hasBatches = dn.items.some((i) => i.batchNo);
  const against = [
    dn.purchase && `${dn.purchase.purchaseNo}${dn.purchase.vendorInvoiceNo ? ` (vendor bill ${dn.purchase.vendorInvoiceNo})` : ""}`,
    dn.po && dn.po.poNo,
    dn.grn && `${dn.grn.grnNo}${dn.reasonType === "REJECTED_AT_INWARD" ? " (rejected at inward)" : ""}`,
  ].filter(Boolean);
  return (
    <div className="text-sm text-slate-800">
      <div className="mb-4 border-b border-slate-200 pb-3 text-center">
        <p className="text-lg font-semibold">{store?.storeName ?? (isDebit ? "Debit note" : "Credit note")}</p>
        {store && (
          <p className="text-xs text-slate-600">
            {[store.address, store.city, store.state, store.pincode].filter(Boolean).join(", ")}
            {store.gstin && ` · GSTIN ${store.gstin}`}
          </p>
        )}
        <p className="mt-1 font-medium uppercase tracking-wide">
          {isDebit ? "Debit note" : "Credit note (received)"}
          {dn.status === "CANCELLED" && " — CANCELLED"}
          {dn.status === "DRAFT" && " — DRAFT"}
        </p>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{isDebit ? "To" : "From"}</p>
          <p className="font-semibold">{dn.vendor.name}</p>
          {(dn.vendor.address || dn.vendor.city) && (
            <p className="text-xs text-slate-600">{[dn.vendor.address, dn.vendor.city, dn.vendor.state].filter(Boolean).join(", ")}</p>
          )}
          <p className="mt-1 text-xs text-slate-600">
            GSTIN <span className="font-mono">{dn.vendor.gstin || "—"}</span>
          </p>
          <p className="text-xs text-slate-600">Place of supply: {pos.label}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-slate-500">Note no.</dt>
          <dd className="font-medium">{dn.dnNo}</dd>
          <dt className="text-slate-500">Date</dt>
          <dd>{date(dn.noteDate)}</dd>
          {dn.vendorRef && (
            <>
              <dt className="text-slate-500">{isDebit ? "Vendor ref." : "Vendor's note no."}</dt>
              <dd className="font-medium">{dn.vendorRef}</dd>
            </>
          )}
          <dt className="text-slate-500">Against</dt>
          <dd>{against.length ? against.join(" · ") : dn.affectsStock ? "Stock return" : "Vendor account"}</dd>
          <dt className="text-slate-500">Type</dt>
          <dd>{NOTE_REASON_LABEL[dn.reasonType]}</dd>
          <dt className="text-slate-500">Reason</dt>
          <dd>{dn.reason}</dd>
        </dl>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-y border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">Item</th>
            {hasBatches && <th className="py-1.5 pr-2">Batch</th>}
            <th className="py-1.5 pr-2 text-right">Qty</th>
            <th className="py-1.5 pr-2 text-right">{dn.reasonType === "RATE_DIFFERENCE" ? "Overcharge / unit" : "Rate"}</th>
            <th className="py-1.5 pr-2 text-right">GST</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {dn.items.map((i, idx) => (
            <tr key={i.id} className="border-b border-slate-100">
              <td className="py-1.5 pr-2 text-slate-400">{idx + 1}</td>
              <td className="py-1.5 pr-2">
                {i.product?.name ?? i.description ?? "—"}
                {i.product?.hsnCode && <span className="text-xs text-slate-500"> · HSN {i.product.hsnCode}</span>}
                {i.product && i.description && <span className="block text-xs text-slate-500">{i.description}</span>}
              </td>
              {hasBatches && <td className="py-1.5 pr-2 font-mono text-xs">{i.batchNo || "—"}</td>}
              <td className="num py-1.5 pr-2 text-right">
                {qty(i.quantity)} {i.product?.unit ?? ""}
              </td>
              <td className="num py-1.5 pr-2 text-right">{inr(i.rate)}</td>
              <td className="num py-1.5 pr-2 text-right">{n(i.gstRate)}%</td>
              <td className="num py-1.5 text-right font-medium">{inr(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap justify-between gap-4">
        <div className="max-w-sm">
          <p className="text-xs text-slate-500">Amount in words</p>
          <p className="font-medium">{amountInWords(n(dn.totalAmount))}</p>
        </div>
        <dl className="w-60 space-y-1">
          <div className="flex justify-between">
            <dt className="text-slate-500">Taxable value</dt>
            <dd className="num">{inr(dn.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">GST{pos.taxType ? ` (${pos.taxType})` : ""}</dt>
            <dd className="num">{inr(dn.taxAmount)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
            <dt>Total</dt>
            <dd className="num">{inr(dn.totalAmount)}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs text-slate-600">
        <p className="border-t border-slate-400 pt-1">{isDebit ? "Received by (vendor)" : "Recorded by"}</p>
        <p className="border-t border-slate-400 pt-1">Authorised signatory</p>
      </div>
    </div>
  );
}
