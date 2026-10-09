"use client";

import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  CornerUpLeft,
  FileText,
  PackageCheck,
  Pencil,
  Printer,
  Truck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ApprovalChain } from "@/components/ApprovalChain";
import { NotesPanel } from "@/components/NotesPanel";
import { useCounts } from "@/components/Notifications";
import { isInterState } from "@/components/PoForm";
import { placeOfSupply } from "@/lib/gst";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { amountInWords, date, dateTime, daysUntil, inr, n, qty, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { ChainStep, PoHistory, PurchaseOrder, StoreSettings } from "@/lib/types";

type Decision = "approve" | "send_back" | "reject";

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const { refresh } = useCounts();
  const toast = useToast();
  const confirm = useConfirm();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { data: po, error, loading, reload } = useApi<PurchaseOrder>(`/purchase-orders/${id}`);
  const { data: store } = useApi<StoreSettings>("/settings");

  async function cancelPo() {
    if (!po) return;
    const ok = await confirm(
      `Cancel ${po.poNo}? The vendor order for ${inr(po.totalAmount)} is withdrawn and no goods can be received against it. This cannot be undone.`,
      { danger: true, confirmLabel: "Cancel PO" },
    );
    if (!ok) return;
    setCancelling(true);
    try {
      await api.post(`/purchase-orders/${po.id}/cancel`);
      toast.success(`${po.poNo} cancelled`);
      refresh();
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCancelling(false);
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !po) return <Spinner />;
  if (!po) return null;

  const v = po.vendor;
  const items = po.items ?? [];
  const history = po.history ?? [];
  const pending = po.status === "PENDING_APPROVAL";
  const receivable = po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED";
  const isBuyer = can("MANAGER", "ACCOUNTANT");
  const igst = isInterState(v, store);
  const pos = placeOfSupply(v, store);
  const tax = n(po.taxAmount);
  const cgst = round2(tax / 2);
  const late = receivable ? daysUntil(po.expectedDate) : null;
  const lastNote = (prefix: string) => history.find((h) => h.action.startsWith(prefix));

  const editLabel =
    po.status === "APPROVED" ? "Edit (needs re-approval)" : po.status === "DRAFT" || po.status === "SENT_BACK" ? "Edit and submit" : "Edit";

  const completedBills = (po.purchases ?? []).filter((p) => p.status === "COMPLETED");
  // Notes make sense once goods have been ordered from (or delivered by) the vendor
  const notesOpen = po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED" || po.status === "RECEIVED";
  const showNotes = notesOpen || (po.debitNotes?.length ?? 0) > 0;

  const sum = (key: "quantity" | "passedQty" | "rejectedQty" | "damagedQty" | "expiredQty") => items.reduce((s, i) => s + n(i[key]), 0);
  const pendingTotal = items.reduce((s, i) => s + n(i.pendingQty), 0);

  return (
    <>
      <div className="no-print mb-2">
        <Link
          href={isBuyer ? "/purchase-orders" : "/purchase-orders/approvals"}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" /> {isBuyer ? "Purchase orders" : "PO approvals"}
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {po.poNo}
            <StatusBadge status={po.status} />
            {po.round > 1 && <Badge tone="violet">Round {po.round}</Badge>}
          </span>
        }
        subtitle={`${v?.name ?? "Vendor"} · ${date(po.orderDate)} · ${inr(po.totalAmount)}`}
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print
            </Button>
            {po.canEdit && isBuyer && (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => router.push(`/purchase-orders/${po.id}/edit`)}>
                {editLabel}
              </Button>
            )}
            {po.canEdit && can("MANAGER") && (
              <Button variant="secondary" icon={<Ban className="size-4" />} onClick={cancelPo} loading={cancelling}>
                Cancel PO
              </Button>
            )}
            {receivable && can("MANAGER") && (
              <Button icon={<PackageCheck className="size-4" />} onClick={() => router.push(`/goods-inward/new?po=${po.id}`)}>
                Receive goods
              </Button>
            )}
            {pending && po.canAct && (
              <>
                <Button variant="danger" icon={<XCircle className="size-4" />} onClick={() => setDecision("reject")}>
                  Reject
                </Button>
                <Button variant="secondary" icon={<CornerUpLeft className="size-4" />} onClick={() => setDecision("send_back")}>
                  Send back
                </Button>
                <Button icon={<CheckCircle2 className="size-4" />} onClick={() => setDecision("approve")}>
                  Approve
                </Button>
              </>
            )}
          </>
        }
      />

      <StatusNotice po={po} lastNote={lastNote} />

      <div className="print-area">
        <div className="hidden pb-3 text-center print:block">
          <p className="text-lg font-semibold">{store?.storeName ?? "Purchase order"}</p>
          {store && (
            <p className="text-xs text-slate-600">
              {[store.address, store.city, store.state, store.pincode].filter(Boolean).join(", ")}
              {store.gstin && ` · GSTIN ${store.gstin}`}
              {store.phone && ` · ${store.phone}`}
            </p>
          )}
          <p className="mt-1 text-sm font-medium uppercase tracking-wide">
            Purchase order{po.status === "CANCELLED" && " — CANCELLED"}
            {(po.status === "DRAFT" || pending || po.status === "SENT_BACK") && " — NOT YET APPROVED"}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3 print:block">
          <Card title="Order details" className="lg:col-span-2 print:mb-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Vendor</p>
                {v ? (
                  <>
                    <Link href={`/vendors/${v.id}`} className="mt-1 block font-semibold text-slate-900 hover:text-brand-700">
                      {v.name}
                    </Link>
                    <p className="text-sm text-slate-600">{[v.address, v.city, v.state, v.pincode].filter(Boolean).join(", ")}</p>
                    <p className="text-sm text-slate-600">{[v.contactPerson, v.phone].filter(Boolean).join(" · ")}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">—</p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">PO date</dt>
                <dd className="font-medium text-slate-900">{date(po.orderDate)}</dd>
                <dt className="text-slate-500">Expected</dt>
                <dd>
                  {date(po.expectedDate)}
                  {late !== null && late < 0 && (
                    <span className="no-print ml-1.5">
                      <Badge tone="red">{-late}d late</Badge>
                    </span>
                  )}
                </dd>
                <dt className="text-slate-500">Vendor GSTIN</dt>
                <dd className="font-mono text-xs">{v?.gstin || "—"}</dd>
                <dt className="text-slate-500">Place of supply</dt>
                <dd>
                  {pos.label}
                </dd>
                {po.branch && (
                  <>
                    <dt className="text-slate-500">Deliver to</dt>
                    <dd>
                      <span className="font-medium text-slate-900">{po.branch.name}</span>
                      <span className="ml-1 font-mono text-[11px] text-slate-500">{po.branch.code}</span>
                      {(po.branch.address || po.branch.city) && (
                        <span className="block text-xs text-slate-500">{[po.branch.address, po.branch.city].filter(Boolean).join(", ")}</span>
                      )}
                    </dd>
                  </>
                )}
                <dt className="text-slate-500">Raised by</dt>
                <dd>{po.createdBy?.name ?? "—"}</dd>
                <dt className="text-slate-500">Approval round</dt>
                <dd>{po.round}</dd>
              </dl>
            </div>
          </Card>

          <Card title="Approval" className="no-print">
            <ApprovalSteps po={po} history={history} />
          </Card>
        </div>

        <Card bodyClassName="p-0" className="mb-4" title={`Items (${items.length})`}>
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Product</Th>
                <Th right>Ordered</Th>
                <Th right>Rate</Th>
                <Th right>GST</Th>
                <Th right>Amount</Th>
                <Th right className="print:hidden">Passed</Th>
                <Th right className="print:hidden">Rejected</Th>
                <Th right className="print:hidden">Damaged</Th>
                <Th right className="print:hidden">Expired</Th>
                <Th right className="print:hidden">Pending</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id}>
                  <Td className="text-slate-400">{i + 1}</Td>
                  <Td className="min-w-48">
                    <p className="font-medium text-slate-900">{it.product.name}</p>
                    <p className="text-xs text-slate-500">
                      {it.product.sku}
                      {it.product.hsnCode && ` · HSN ${it.product.hsnCode}`}
                      {it.product.packSize && ` · ${it.product.packSize}`}
                    </p>
                  </Td>
                  <Td right className="whitespace-nowrap">
                    {qty(it.quantity)} <span className="text-xs text-slate-500">{it.product.unit}</span>
                  </Td>
                  <Td right>{inr(it.rate)}</Td>
                  <Td right className="text-slate-500">
                    {n(it.gstRate)}%
                  </Td>
                  <Td right className="font-medium text-slate-900">
                    {inr(it.amount)}
                  </Td>
                  <QtyCell value={it.passedQty} tone="text-brand-700" />
                  <QtyCell value={it.rejectedQty} tone="text-red-600" />
                  <QtyCell value={it.damagedQty} tone="text-amber-700" />
                  <QtyCell value={it.expiredQty} tone="text-amber-700" />
                  <QtyCell value={it.pendingQty} tone="font-semibold text-slate-900" />
                </tr>
              ))}
            </tbody>
            {items.length > 1 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <Td colSpan={2} className="text-right text-slate-600">
                    Total
                  </Td>
                  <Td right>{qty(sum("quantity"))}</Td>
                  <Td />
                  <Td />
                  <Td right className="text-slate-900">
                    {inr(po.totalAmount)}
                  </Td>
                  <Td right className="print:hidden">{qty(sum("passedQty"))}</Td>
                  <Td right className="print:hidden">{qty(sum("rejectedQty"))}</Td>
                  <Td right className="print:hidden">{qty(sum("damagedQty"))}</Td>
                  <Td right className="print:hidden">{qty(sum("expiredQty"))}</Td>
                  <Td right className="print:hidden">{qty(pendingTotal)}</Td>
                </tr>
              </tfoot>
            )}
          </Table>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <div className="text-sm">
              <p className="text-xs text-slate-500">Amount in words</p>
              <p className="mt-0.5 font-medium text-slate-800">{amountInWords(n(po.totalAmount))}</p>
              {po.notes && (
                <>
                  <p className="mt-3 text-xs text-slate-500">Notes</p>
                  <p className="mt-0.5 whitespace-pre-line text-slate-700">{po.notes}</p>
                </>
              )}
            </div>
            <dl className="space-y-1.5 text-sm sm:ml-auto sm:w-72">
              <Row label="Taxable value" value={inr(po.subtotal)} />
              {igst ? (
                <Row label="IGST" value={inr(tax)} />
              ) : (
                <>
                  <Row label="CGST" value={inr(cgst)} />
                  <Row label="SGST" value={inr(round2(tax - cgst))} />
                </>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <dt>PO total</dt>
                <dd className="num">{inr(po.totalAmount)}</dd>
              </div>
            </dl>
          </div>
          <div className="hidden grid-cols-2 gap-8 px-4 pb-4 pt-10 text-center text-xs text-slate-600 print:grid">
            <p className="border-t border-slate-400 pt-1">Prepared by {po.createdBy?.name ?? ""}</p>
            <p className="border-t border-slate-400 pt-1">Authorised signatory</p>
          </div>
        </Card>
      </div>

      <div className="no-print mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title={
            <span className="inline-flex items-center gap-1.5">
              <Truck className="size-4 text-slate-400" /> Goods inward
            </span>
          }
          bodyClassName="p-0"
          actions={<span className="num text-xs text-slate-500">{po.receivedPct}% received</span>}
        >
          {!po.grns?.length ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              {receivable ? "Nothing received yet" : "Goods can be received once the PO is approved"}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {po.grns.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <Link href={`/goods-inward/${g.id}`} className="font-medium text-brand-700 hover:underline">
                    {g.grnNo}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {dateTime(g.receivedAt)}
                    {g.receivedBy && ` · ${g.receivedBy.name}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title={
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-4 text-slate-400" /> Purchase invoices
            </span>
          }
          bodyClassName="p-0"
        >
          {!po.purchases?.length ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No vendor bills booked against this PO yet</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {po.purchases.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <Link href={`/purchases/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.purchaseNo}
                  </Link>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {showNotes && v && (
        <NotesPanel
          className="mb-4"
          notes={po.debitNotes}
          allowNew={notesOpen}
          preset={{
            vendor: { id: v.id, name: v.name },
            po: { id: po.id, poNo: po.poNo },
            // One bill against this PO: the note is against it; otherwise the form lets you pick
            purchase: completedBills.length === 1 ? completedBills[0] : undefined,
          }}
          onChanged={() => void reload()}
        />
      )}

      <Card title="Approval history" className="no-print">
        <Timeline history={history} currentRound={po.round} />
      </Card>

      {decision && (
        <DecisionModal
          po={po}
          action={decision}
          onClose={() => setDecision(null)}
          onDone={() => {
            setDecision(null);
            refresh();
            void reload();
          }}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="num text-slate-800">{value}</dd>
    </div>
  );
}

function QtyCell({ value, tone }: { value: unknown; tone: string }) {
  const x = n(value);
  return (
    <Td right className={cx("print:hidden", x ? tone : "text-slate-300")}>
      {x ? qty(x) : "—"}
    </Td>
  );
}

/** Banner explaining where the PO stands and what happens next */
function StatusNotice({ po, lastNote }: { po: PurchaseOrder; lastNote: (prefix: string) => PoHistory | undefined }) {
  const box = "no-print mb-4 flex gap-2.5 rounded-lg border px-4 py-3 text-sm";
  if (po.status === "PENDING_APPROVAL" && po.waitingFor) {
    const w = po.waitingFor;
    return (
      <div className={cx(box, "border-amber-200 bg-amber-50 text-amber-800")}>
        <Clock className="mt-0.5 size-4 shrink-0" />
        <p>
          Waiting for <strong>{w.approverName ?? "any manager"}</strong> ({w.title}) — step {po.level + 1} of {po.chain.length}.
          {po.canAct && <span className="font-medium"> You can approve, send back or reject it now.</span>}
        </p>
      </div>
    );
  }
  if (po.status === "SENT_BACK") {
    const h = lastNote("Sent back");
    return (
      <div className={cx(box, "border-amber-200 bg-amber-50 text-amber-800")}>
        <CornerUpLeft className="mt-0.5 size-4 shrink-0" />
        <p>
          Sent back for changes{h && ` by ${h.userName}`}
          {h?.note && (
            <>
              : <span className="italic">&ldquo;{h.note}&rdquo;</span>
            </>
          )}
          . Edit and resubmit to start approval round {po.round + 1}.
        </p>
      </div>
    );
  }
  if (po.status === "REJECTED") {
    const h = lastNote("Rejected");
    return (
      <div className={cx(box, "border-red-200 bg-red-50 text-red-700")}>
        <XCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          Rejected{h && ` by ${h.userName}`}
          {h?.note && (
            <>
              : <span className="italic">&ldquo;{h.note}&rdquo;</span>
            </>
          )}
          . Raise a new PO if the order is still needed.
        </p>
      </div>
    );
  }
  if (po.status === "DRAFT") {
    return (
      <div className={cx(box, "border-slate-200 bg-slate-50 text-slate-600")}>
        <FileText className="mt-0.5 size-4 shrink-0" />
        <p>This is a draft. Nobody has been asked to approve it yet — edit and submit it when ready.</p>
      </div>
    );
  }
  if (po.status === "CANCELLED") {
    return (
      <div className={cx(box, "border-slate-200 bg-slate-100 text-slate-600")}>
        <Ban className="mt-0.5 size-4 shrink-0" />
        <p>This PO was cancelled. No goods can be received against it.</p>
      </div>
    );
  }
  return null;
}

/** Vertical list of the chain, with who approved each step in the current round */
function ApprovalSteps({ po, history }: { po: PurchaseOrder; history: PoHistory[] }) {
  const approvals = history.filter((h) => h.round === po.round && h.action.startsWith("Approved"));
  const byLevel = (i: number) => approvals.find((h) => h.action.endsWith(`level ${i + 1}`));
  const icon = (s: ChainStep) =>
    s.state === "done" ? (
      <CheckCircle2 className="size-4 text-brand-600" />
    ) : s.state === "current" ? (
      <Clock className="size-4 text-amber-600" />
    ) : s.state === "rejected" ? (
      <XCircle className="size-4 text-red-600" />
    ) : (
      <span className="block size-4 rounded-full border-2 border-slate-300" />
    );
  return (
    <>
      <ApprovalChain chain={po.chain} className="mb-3" />
      <ol className="space-y-2.5">
        {po.chain.map((s, i) => {
          const h = s.state === "done" ? byLevel(i) : undefined;
          return (
            <li key={s.order} className="flex gap-2.5">
              <span className="mt-0.5 shrink-0">{icon(s)}</span>
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-800">
                  {s.title} <span className="font-normal text-slate-500">· {s.approverName ?? "any manager"}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {s.state === "done"
                    ? h
                      ? `Approved by ${h.userName} · ${dateTime(h.at)}`
                      : "Approved"
                    : s.state === "current"
                      ? "Waiting for a decision"
                      : s.state === "rejected"
                        ? "Rejected here"
                        : "Not reached yet"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
        {po.chain.length} approval{po.chain.length === 1 ? "" : "s"} needed for {inr(po.totalAmount)}
      </p>
    </>
  );
}

const dotTone = (action: string) =>
  /^(Approved|GRN)/.test(action) || action.endsWith("posted")
    ? "bg-brand-500"
    : /^(Rejected|Cancelled)/.test(action)
      ? "bg-red-500"
      : /^Sent back|Edited|Saved changes/.test(action)
        ? "bg-amber-500"
        : "bg-sky-500";

function Timeline({ history, currentRound }: { history: PoHistory[]; currentRound: number }) {
  if (!history.length) return <p className="text-sm text-slate-400">No history yet</p>;
  const rounds = [...new Set(history.map((h) => h.round))].sort((a, b) => b - a);
  return (
    <div className="space-y-5">
      {rounds.map((r) => (
        <section key={r}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Round {r}</h3>
            {r === currentRound && rounds.length > 1 && <Badge tone="blue">Current</Badge>}
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <ol className="relative ml-1.5 border-l border-slate-200">
            {history
              .filter((h) => h.round === r)
              .map((h) => (
                <li key={h.id} className="relative pb-3 pl-5 last:pb-0">
                  <span className={cx("absolute -left-1.25 top-1.5 size-2.5 rounded-full ring-2 ring-white", dotTone(h.action))} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm">
                      <span className="font-medium text-slate-900">{h.action}</span>
                      <span className="text-slate-500"> · {h.userName}</span>
                    </p>
                    <p className="text-xs text-slate-400">{dateTime(h.at)}</p>
                  </div>
                  {h.note && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{h.note}</p>}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

const DECISION_COPY: Record<Decision, { title: string; button: string; variant: "primary" | "secondary" | "danger"; help: string }> = {
  approve: {
    title: "Approve",
    button: "Approve",
    variant: "primary",
    help: "Approving passes the PO to the next step, or marks it approved for goods inward if this is the last step.",
  },
  send_back: {
    title: "Send back",
    button: "Send back for changes",
    variant: "primary",
    help: "The buyer is asked to make changes. When they resubmit, approval starts again from the first step as a new round.",
  },
  reject: {
    title: "Reject",
    button: "Reject PO",
    variant: "danger",
    help: "Rejecting closes the PO for good. The buyer has to raise a new one if the order is still needed.",
  },
};

function DecisionModal({ po, action, onClose, onDone }: { po: PurchaseOrder; action: Decision; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const copy = DECISION_COPY[action];
  const needsNote = action !== "approve";
  const step = po.waitingFor;

  async function submit() {
    if (needsNote && !note.trim()) return toast.error("Add a comment so the buyer knows what to change");
    setSaving(true);
    try {
      await api.post(`/purchase-orders/${po.id}/decision`, { action, note: note.trim() || undefined });
      toast.success(
        action === "approve"
          ? po.level + 1 >= po.chain.length
            ? `${po.poNo} approved — ready for goods inward`
            : `${po.poNo} approved and passed to ${po.chain[po.level + 1]?.title ?? "the next step"}`
          : action === "send_back"
            ? `${po.poNo} sent back for changes`
            : `${po.poNo} rejected`,
      );
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${copy.title} ${po.poNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={copy.variant} onClick={submit} loading={saving}>
            {copy.button}
          </Button>
        </>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Vendor</p>
          <p className="font-medium text-slate-800">{po.vendor?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Value</p>
          <p className="num font-medium text-slate-800">{inr(po.totalAmount)}</p>
        </div>
        {step && (
          <div className="col-span-2">
            <p className="text-xs text-slate-500">Deciding for</p>
            <p className="font-medium text-slate-800">
              Step {po.level + 1} of {po.chain.length}: {step.title}
              {step.approverName && <span className="font-normal text-slate-500"> (assigned to {step.approverName})</span>}
            </p>
          </div>
        )}
      </div>
      <p className="mb-3 text-sm text-slate-600">{copy.help}</p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Comment{needsNote ? <span className="text-red-500"> *</span> : " (optional)"}
        </span>
        <Textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            action === "approve" ? "Anything the buyer or next approver should know" : action === "send_back" ? "What should be changed?" : "Why is this PO rejected?"
          }
        />
      </label>
    </Modal>
  );
}
