"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, History, Info as InfoIcon, Layers, PackageCheck, Plus, ScanLine, Store, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BatchSelect, type BatchPick } from "@/components/BatchSelect";
import { NotesPanel } from "@/components/NotesPanel";
import { PendingFiles, uploadAttachments } from "@/components/Attachments";
import { useCounts } from "@/components/Notifications";
import {
  Badge,
  Button,
  Card,
  DateInput,
  ErrorBox,
  Field,
  Info,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { date, inr, n, qty, round2, today } from "@/lib/format";
import { clearApiCache, useApi } from "@/lib/hooks";
import { useScanner } from "@/lib/scanner";
import type { Grn, NoteSummary, PoItem, PurchaseOrder } from "@/lib/types";

/** One batch of a line, entered in the Batch No. popup: its quantity, number and dates */
interface BatchRow {
  key: number;
  qty: string;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
}

/** Why goods were not accepted at inward (same list as the API) */
type Issue = "DAMAGED" | "LEAKAGE" | "EXPIRED" | "QUALITY" | "OTHER";
const ISSUES: { value: Issue; label: string }[] = [
  { value: "DAMAGED", label: "Damaged in transit" },
  { value: "LEAKAGE", label: "Leakage" },
  { value: "EXPIRED", label: "Expired" },
  { value: "QUALITY", label: "Quality / wrong item" },
  { value: "OTHER", label: "Other" },
];

interface Line {
  /** Received (QC passed) stock, batch by batch; the Received Qty is their total */
  batches: BatchRow[];
  /** Multiple batches mode: one batch of 1 per unit */
  multi?: boolean;
  /**
   * Delivered but not accepted (damaged, leaking, expired…), one entry per batch and reason: kept out of stock and put
   * on the GRN's debit note. Serial-numbered items: one unit per entry, its serial matched to the unit rows.
   */
  issues?: IssueRow[];
}

interface IssueRow {
  key: number;
  qty: string;
  reason: Issue;
  batchNo: string;
  remark: string;
}

let issueSeq = 0;
const blankIssue = (serial: boolean): IssueRow => ({ key: ++issueSeq, qty: serial ? "1" : "", reason: "DAMAGED", batchNo: "", remark: "" });
const norm = (s: string) => s.trim().toUpperCase();
/** Serial numbers a multi-unit line has marked not accepted: those unit rows don't count as received */
const rejectedOf = (l: Line) => new Set(l.multi ? (l.issues ?? []).filter((i) => num(i.qty) > 0 && i.batchNo.trim()).map((i) => norm(i.batchNo)) : []);
/** Batch rows that count as received: all of them, less the units marked not accepted on a multi-unit line */
const acceptedRows = (l: Line) => {
  const rejected = rejectedOf(l);
  return l.batches.filter((b) => !rejected.has(norm(b.batchNo)));
};
const notAcceptedOf = (l: Line) => r3((l.issues ?? []).reduce((s, i) => s + num(i.qty), 0));

let batchSeq = 0;
const blankBatch = (qtyValue = ""): BatchRow => ({ key: ++batchSeq, qty: qtyValue, batchNo: "", mfgDate: "", expiryDate: "" });

/**
 * A line as the form starts it: everything due as one batch, or — for products that track serial numbers —
 * one row per unit, each with its own Batch / Serial No. (the same number is the unit's batch and its serial)
 */
function startLine(item: PoItem): Line {
  const due = pendingOf(item);
  if (!item.product.trackSerial) return { batches: [blankBatch(String(due))] };
  const units = Number.isInteger(due) && due > 0 ? Math.min(due, 500) : 1;
  return { multi: true, batches: Array.from({ length: units }, () => blankBatch("1")) };
}

const num = (s: string) => Number(s) || 0;

/**
 * The line's batches resized to a new Received total: one row per unit for serial-tracked products (the rows beyond it
 * dropped), else the single batch's quantity changed (or, with several batches, the last ones trimmed / the last grown).
 * Batch numbers and dates already typed are kept.
 */
function withReceived(l: Line, received: number, item: PoItem): BatchRow[] {
  if (l.multi || item.product.trackSerial) {
    // Units marked not accepted keep their rows (matched by serial). Only blank unit rows are removed to make room —
    // a unit with a typed serial stays until it is picked as not accepted (or removed by hand), so nothing typed is lost
    const rejected = rejectedOf(l);
    const units = Math.max(0, Math.floor(received));
    const rows = l.batches.map((b) => ({ ...b }));
    const counted = () => rows.filter((b) => !rejected.has(norm(b.batchNo)) && num(b.qty) > 0).length;
    for (let i = rows.length - 1; i >= 0 && counted() > units; i--) {
      if (!rows[i].batchNo.trim() && !rows[i].mfgDate && !rows[i].expiryDate) rows.splice(i, 1);
    }
    while (counted() < units) rows.push(blankBatch("1"));
    // Nothing at all: one empty row stays so the batch popup still opens
    return rows.length ? rows : [{ ...(l.batches[0] ?? blankBatch()), qty: "" }];
  }
  if (l.batches.length <= 1) return [{ ...(l.batches[0] ?? blankBatch()), qty: received > 0 ? String(received) : "" }];
  // Several batches: take the difference off the last rows (or add it to the last one)
  let diff = r3(received - l.batches.reduce((s, b) => s + num(b.qty), 0));
  const rows = l.batches.map((b) => ({ ...b }));
  for (let i = rows.length - 1; i >= 0 && diff !== 0; i--) {
    const q = num(rows[i].qty);
    const next = diff > 0 ? r3(q + diff) : r3(Math.max(0, q + diff));
    diff = r3(diff - (next - q));
    rows[i].qty = next > 0 ? String(next) : "";
    if (diff > 0) break;
  }
  return rows;
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;
/** Received Qty of a line: the total of its batch quantities */
const receivedOf = (l: Line) => r3(acceptedRows(l).reduce((s, b) => s + num(b.qty), 0));
const pendingOf = (i: PoItem) =>
  i.pendingQty ?? r3(Math.max(0, n(i.quantity) - n(i.passedQty) - n(i.rejectedQty) - n(i.damagedQty) - n(i.expiredQty)));

/** Problems with a line, mirroring the backend's createGrn checks. `required` problems only show after a submit attempt. */
function check(item: PoItem, l: Line) {
  const pending = pendingOf(item);
  const passed = receivedOf(l);
  // Not accepted counts as delivered on the PO (the line closes), but stays out of stock
  const notAccepted = notAcceptedOf(l);
  const total = r3(passed + notAccepted);
  const errors: Partial<Record<"total" | "batches" | "issue", { msg: string; required?: boolean }>> = {};
  if (total > pending + 0.0005) errors.total = { msg: `${qty(total)} entered — only ${qty(pending)} pending` };
  // Each not-accepted entry: a quantity, its batch no. (which one was rejected), and a remark for "Other"
  const issueErrors = (l.issues ?? []).map((i): { msg: string; required?: boolean } | null => {
    const q = num(i.qty);
    if (q < 0) return { msg: "Quantity can't be negative" };
    if (!(q > 0)) return { msg: "Enter the quantity", required: true };
    if (item.product.trackSerial && q !== 1) return { msg: "One unit per entry for serial-numbered items — add an entry for each" };
    if (!i.batchNo.trim()) return { msg: `${item.product.trackSerial ? "Batch / serial no." : "Batch no."} is required`, required: true };
    if (i.reason === "OTHER" && !i.remark.trim()) return { msg: "Say what was wrong", required: true };
    return null;
  });
  const serialsRejected = (l.issues ?? []).map((i) => norm(i.batchNo)).filter(Boolean);
  const firstIssue = issueErrors.findIndex(Boolean);
  if (item.product.trackSerial && new Set(serialsRejected).size !== serialsRejected.length)
    errors.issue = { msg: "The same serial no. is marked not accepted twice" };
  else if (firstIssue >= 0) errors.issue = { msg: `Not accepted ${firstIssue + 1}: ${issueErrors[firstIssue]!.msg}`, required: issueErrors[firstIssue]!.required };

  // Each batch row: the quantity, its batch number, Mfg date and a future expiry
  const serialTracked = !!item.product.trackSerial;
  const numberName = serialTracked ? "Batch / serial no." : "Batch no.";
  const rejected = rejectedOf(l);
  const rowErrors = l.batches.map((b): { msg: string; required?: boolean } | null => {
    // A unit marked not accepted doesn't go into stock: no dates needed
    if (rejected.has(norm(b.batchNo))) return null;
    const q = num(b.qty);
    const used = q > 0;
    if (q < 0) return { msg: "Quantity can't be negative" };
    if (used && serialTracked && q !== 1) return { msg: "Each Batch / Serial No. is one unit — enter 1" };
    // An empty row is ignored; typed details without a quantity are flagged, unless the goods were not accepted
    if (!used) return (b.batchNo.trim() || b.mfgDate || b.expiryDate) && !notAccepted ? { msg: "Enter its quantity", required: true } : null;
    if (!b.batchNo.trim()) return { msg: `${numberName} is required`, required: true };
    if (!b.mfgDate) return { msg: "Mfg date is required", required: true };
    if (!b.expiryDate) return { msg: "Expiry date is required", required: true };
    if (b.expiryDate <= today()) return { msg: "Expiry must be a future date — expired goods aren't taken into stock" };
    if (b.mfgDate && b.mfgDate > today()) return { msg: "Mfg date can't be in the future" };
    if (b.mfgDate && b.expiryDate && b.expiryDate < b.mfgDate) return { msg: "Expiry is before the Mfg date" };
    return null;
  });
  const numbers = l.batches.map((b) => b.batchNo.trim().toLowerCase()).filter(Boolean);
  const firstRow = rowErrors.findIndex(Boolean);
  if (new Set(numbers).size !== numbers.length)
    errors.batches = { msg: serialTracked ? "The same Batch / Serial No. is entered twice — each unit needs its own" : "The same batch number is entered twice — put its whole quantity on one row" };
  else if (firstRow >= 0) errors.batches = { msg: `Batch ${firstRow + 1}: ${rowErrors[firstRow]!.msg}`, required: rowErrors[firstRow]!.required };

  return { pending, passed, notAccepted, total, errors, rowErrors };
}

export default function NewGrnPage() {
  return (
    <RequirePerm perms={["purchases.receive"]}>
      <NewGrn />
    </RequirePerm>
  );
}

function NewGrn() {
  const params = useSearchParams();
  const poId = params.get("po");
  const { data: po, error, loading, refreshing, reload } = useApi<PurchaseOrder>(poId ? `/purchase-orders/${poId}` : null);

  if (!poId) {
    return (
      <>
        <BackLink />
        <ErrorBox message="Choose an approved purchase order from Goods Inward to receive goods against." />
      </>
    );
  }
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  // The form seeds each line from the pending qty once, so wait for a fresh copy, not a cached one from before an earlier GRN
  if (loading || refreshing || !po) return <Spinner page />;
  if (po.status !== "APPROVED" && po.status !== "PARTIALLY_RECEIVED") {
    return (
      <>
        <BackLink />
        <ErrorBox
          message={`${po.poNo} is ${po.status.toLowerCase().replace(/_/g, " ")} — goods can only be received against approved purchase orders with a balance open.`}
        />
      </>
    );
  }
  return <GrnForm po={po} />;
}

function BackLink() {
  return (
    <div className="mb-2">
      <Link href="/goods-inward" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Goods Inward
      </Link>
    </div>
  );
}

function GrnForm({ po }: { po: PurchaseOrder }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const counts = useCounts();
  const { user, can } = useAuth();
  const items = po.items ?? [];
  // Notes are reloaded on their own so raising one doesn't reset what is typed on the form
  const [notes, setNotes] = useState<NoteSummary[] | undefined>(po.debitNotes);
  const reloadNotes = () =>
    api.get<PurchaseOrder>(`/purchase-orders/${po.id}`).then((fresh) => setNotes(fresh.debitNotes), (e) => toast.error(errMsg(e)));
  const completedBills = (po.purchases ?? []).filter((p) => p.status === "COMPLETED");

  const [vehicleNo, setVehicleNo] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [receivedAt, setReceivedAt] = useState(today());
  // Every open line starts as fully received in one batch; the batch popup splits it
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(items.map((i) => [i.id, startLine(i)])),
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  // Supplier invoice scan, delivery challan, photos… uploaded right after the GRN is posted
  const [files, setFiles] = useState<File[]>([]);
  const [scanned, setScanned] = useState<string | null>(null);
  // Line whose batch popup is open
  const [batchFor, setBatchFor] = useState<string | null>(null);
  const { currentId, branches, locked, setBranch } = useBranch();

  // A barcode scan jumps to that PO line and opens its batch popup
  useScanner((code) => {
    const q = code.toLowerCase();
    const hit = items.find((i) => pendingOf(i) > 0 && (i.product.barcode?.toLowerCase() === q || i.product.sku.toLowerCase() === q));
    if (!hit) return toast.error(`No open line on ${po.poNo} matches barcode ${code}`);
    setScanned(hit.id);
    setLines((ls) => (receivedOf(ls[hit.id]) > 0 ? ls : { ...ls, [hit.id]: startLine(hit) }));
    document.getElementById(`grn-line-${hit.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setBatchFor(hit.id);
  }, true, (t) => !!t?.closest("[data-scan-input]")); // a batch or chassis number scanned into its box stays there
  // Goods are received into the branch the PO delivers to; with another branch selected the API refuses
  const poBranchId = po.branchId ?? po.branch?.id ?? null;
  const wrongBranch = !!poBranchId && currentId !== "all" && currentId !== poBranchId;
  const canSwitch = !locked && branches.some((b) => b.id === poBranchId);

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));
  // Not accepted changed: Received becomes what is due less what was not accepted (0 when everything was rejected)
  const setIssues = (item: PoItem, issues: IssueRow[] | undefined) =>
    setLines((ls) => {
      const l = { ...ls[item.id], issues: issues?.length ? issues : undefined };
      const accepted = r3(Math.max(0, pendingOf(item) - notAcceptedOf(l)));
      return { ...ls, [item.id]: { ...l, batches: withReceived(l, accepted, item) } };
    });
  const open = items.filter((i) => pendingOf(i) > 0);
  const checks = new Map(open.map((i) => [i.id, check(i, lines[i.id])]));

  const totals = {
    passed: r3(open.reduce((s, i) => s + receivedOf(lines[i.id]), 0)),
    notAccepted: r3(open.reduce((s, i) => s + (checks.get(i.id)?.notAccepted ?? 0), 0)),
  };
  const passedValue = round2(open.reduce((s, i) => s + receivedOf(lines[i.id]) * n(i.rate), 0));
  const shortfall = r3(open.reduce((s, i) => s + Math.max(0, pendingOf(i) - (checks.get(i.id)?.total ?? 0)), 0));
  const anyQty = open.some((i) => (checks.get(i.id)?.total ?? 0) > 0);
  const shortLines = open.filter((i) => {
    const c = checks.get(i.id);
    return c && c.total < c.pending;
  });

  async function submit() {
    if (wrongBranch) return toast.error(`This PO is delivered to ${po.branch?.name ?? "another branch"} — switch to that branch to receive it`);
    setSubmitted(true);
    if (!supplierInvoiceNo.trim()) return toast.error("Enter the supplier's invoice number");
    if (!receivedAt) return toast.error("Enter the received date");
    if (receivedAt > today()) return toast.error("Received date can't be in the future");
    if (!anyQty) return toast.error("Enter at least one received quantity");
    for (const i of open) {
      const errs = Object.values(checks.get(i.id)?.errors ?? {});
      if (errs.length) return toast.error(`${i.product.name}: ${errs[0]!.msg}`);
    }

    const balance = shortLines.length
      ? ` ${shortLines.length} line${shortLines.length === 1 ? "" : "s"} will stay open for the balance, and the shortfall (${qty(shortfall)}) is noted on a draft short-supply debit note.`
      : " The PO will be marked fully received.";
    const invoiceNote = totals.passed > 0 ? ` The purchase invoice will be booked under ${supplierInvoiceNo.trim()}.` : "";
    const issueNote = totals.notAccepted > 0 ? ` ${qty(totals.notAccepted)} not accepted stays out of stock and goes on a draft debit note with the reasons.` : "";
    if (!(await confirm(`Post goods inward for ${po.poNo}? ${qty(totals.passed)} received into stock.${issueNote}${balance}${invoiceNote}`, { confirmLabel: "Post GRN" }))) return;

    setSaving(true);
    try {
      const grn = await api.post<Grn & { invoiceError?: string | null; shortNoteNo?: string | null }>(`/purchase-orders/${po.id}/grn`, {
        vehicleNo: vehicleNo.trim() || undefined,
        supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
        receivedAt,
        // One row per batch with a quantity; stock goes to the product's usual location
        items: open.flatMap((i) => {
          const l = lines[i.id];
          // Received rows only: units marked not accepted go in their own rows below
          const filled = acceptedRows(l).filter((b) => num(b.qty) > 0);
          const rows = filled.length ? filled : [l.batches[0]];
          return [
            ...rows.map((b) => ({
              poItemId: i.id,
              passedQty: num(b.qty),
              rejectedQty: 0,
              damagedQty: 0,
              expiredQty: 0,
              batchNo: b.batchNo.trim() || undefined,
              mfgDate: b.mfgDate || undefined,
              expiryDate: b.expiryDate || undefined,
              // Serial-tracked: the unit's Batch / Serial No. is also its serial number
              serialNos: i.product.trackSerial && num(b.qty) > 0 ? [b.batchNo.trim()] : undefined,
            })),
            // Not accepted: a row per entry, under damaged / expired / rejected by reason, with its batch no. and remark
            ...(l.issues ?? [])
              .filter((x) => num(x.qty) > 0)
              .map((x) => ({
                poItemId: i.id,
                passedQty: 0,
                rejectedQty: x.reason === "QUALITY" || x.reason === "OTHER" ? num(x.qty) : 0,
                damagedQty: x.reason === "DAMAGED" || x.reason === "LEAKAGE" ? num(x.qty) : 0,
                expiredQty: x.reason === "EXPIRED" ? num(x.qty) : 0,
                batchNo: x.batchNo.trim() || undefined,
                mfgDate: undefined,
                expiryDate: undefined,
                serialNos: undefined,
                issueReason: x.reason,
                issueRemark: x.remark.trim() || undefined,
              })),
          ];
        }),
      });
      // The purchase invoice is booked automatically when anything passed inspection
      toast.success(`${grn.grnNo} posted · stock updated${grn.purchase ? ` · invoice ${grn.purchase.purchaseNo} booked` : ""}`);
      if (grn.shortNoteNo) toast.info(`Short supply noted on draft debit note ${grn.shortNoteNo}`);
      if (grn.invoiceError) toast.warn(`Purchase invoice not booked: ${grn.invoiceError}. Book it from the GRN.`);
      if (files.length) {
        await uploadAttachments("GRN", grn.id, files).then(
          (done) => toast.success(`${done.length} file${done.length === 1 ? "" : "s"} attached to ${grn.grnNo}`),
          (e) => toast.warn(`${grn.grnNo} posted, but the files were not attached: ${errMsg(e)}. Add them from the GRN.`),
        );
      }
      counts.refresh();
      // The PO's received and pending quantities changed
      clearApiCache("/purchase-orders");
      router.push(`/goods-inward/${grn.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

  const batchItem = batchFor ? items.find((i) => i.id === batchFor) : null;

  return (
    <>
      <BackLink />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Receive goods
            {po.branch && branches.length > 1 && !wrongBranch && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-600/20">
                <Store className="size-3.5" />
                Receiving into: {po.branch.name}
              </span>
            )}
          </span>
        }
        subtitle={`Goods inward against ${po.poNo} · ${po.vendor?.name ?? ""}`}
      />

      {/* Advance terms: receiving isn't blocked (vendors sometimes deliver first), but the unpaid advance is flagged */}
      {po.paymentTerm && po.paymentTerm !== "AFTER_GRN" && n(po.advancePaid) < n(po.advanceAmount) - 0.004 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 sm:px-4">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            {po.paymentTerm === "ADVANCE_FULL" ? "This PO is on 100% advance" : "This PO has a partial advance"}, and{" "}
            <strong>{inr(n(po.advanceAmount) - n(po.advancePaid))}</strong> of the {inr(po.advanceAmount)} advance is not paid yet. You can still
            receive the goods; Finance has been asked to pay it.
          </span>
        </div>
      )}

      {wrongBranch && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 sm:px-4">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">
            This PO is delivered to <strong>{po.branch?.name ?? "another branch"}</strong>
            {po.branch?.code && ` (${po.branch.code})`}. Goods can only be received into that branch
            {canSwitch ? "." : " — ask a manager there, or an administrator, to post it."}
          </span>
          {canSwitch && poBranchId && (
            <Button size="sm" variant="secondary" icon={<Store className="size-4" />} onClick={() => setBranch(poBranchId)}>
              Switch to {po.branch?.name ?? "that branch"}
            </Button>
          )}
        </div>
      )}

      <Card className="mb-4">
        <dl className="mb-4 grid grid-cols-2 gap-4 break-words sm:grid-cols-4">
          <Info label="Purchase Order">
            <Link href={`/purchase-orders/${po.id}`} className="text-brand-700 hover:underline">
              {po.poNo}
            </Link>
          </Info>
          <Info label="Vendor">{po.vendor?.name}</Info>
          <Info label="Ordered">
            {date(po.orderDate)}
            {po.expectedDate && <span className="font-normal text-slate-500"> · expected {date(po.expectedDate)}</span>}
          </Info>
          <Info label="Received So Far">{po.receivedPct}%</Info>
        </dl>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier Invoice No." required hint="As printed on the bill; the purchase invoice is booked under it">
            <Input
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              maxLength={50}
              placeholder="e.g. SLA/2026/0458"
              className={cx(!supplierInvoiceNo.trim() && (submitted ? "border-red-400" : "border-amber-400 bg-amber-50"))}
            />
          </Field>
          <Field label="Vehicle No.">
            <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} placeholder="KA 01 AB 1234" />
          </Field>
          <Field label="Received Date" required>
            <DateInput value={receivedAt} max={today()} onChange={(e) => setReceivedAt(e.target.value)} />
          </Field>
          <Field label="Received By">
            <Input value={user?.name ?? ""} readOnly disabled />
          </Field>
        </div>
      </Card>

      {(po.grns?.length ?? 0) > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ReceivedEarlier po={po} canBrowse={can("purchases.view")} />
          <NotesPanel
            notes={notes}
            preset={{
              vendor: po.vendor ? { id: po.vendor.id, name: po.vendor.name } : undefined,
              po: { id: po.id, poNo: po.poNo },
              // One bill against this PO: the note is against it; otherwise the form lets you pick
              purchase: completedBills.length === 1 ? completedBills[0] : undefined,
            }}
            onChanged={() => void reloadNotes()}
          />
        </div>
      )}

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 sm:px-4 text-sm text-sky-800">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          Click <b>Batch No.</b> on a line to enter each batch received — its quantity, batch number, Mfg and expiry date; <b>Received Qty</b> is
          their total. For serial-numbered products, each unit gets one <b>Batch / Serial No.</b> Anything not received stays open on the PO for
          a later delivery.
          <span className="mt-1 flex items-center gap-1 text-xs text-sky-700">
            <ScanLine className="size-3.5" /> Scan a pack&apos;s barcode to jump to its line and fill the batch details.
          </span>
        </p>
      </div>

      <Card className="mb-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th className="w-8">#</Th>
              <Th>Product</Th>
              <Th right>PO Qty</Th>
              <Th className="min-w-56">Batch No.</Th>
              <Th right>PO Rate</Th>
              <Th right className="min-w-36">Received Qty</Th>
              <Th right>Total Amount</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const pending = pendingOf(item);
              const p = item.product;
              const earlier = r3(n(item.quantity) - pending);
              if (pending <= 0) {
                return (
                  <tr key={item.id} className="text-slate-400">
                    <Td>{idx + 1}</Td>
                    <Td>
                      <p className="font-medium text-slate-500">{p.name}</p>
                      <p className="text-xs">{[p.sku, p.packSize].filter(Boolean).join(" · ")}</p>
                    </Td>
                    <Td right className="whitespace-nowrap">
                      {qty(item.quantity)} {p.unit}
                    </Td>
                    <Td>—</Td>
                    <Td right>{inr(item.rate)}</Td>
                    <Td right colSpan={2}>
                      <Badge tone="green">
                        <CheckCircle2 className="mr-1 size-3.5" /> Fully Received
                      </Badge>
                    </Td>
                  </tr>
                );
              }
              const l = lines[item.id];
              const c = checks.get(item.id)!;
              const show = (k: keyof typeof c.errors) => {
                const e = c.errors[k];
                return e && (!e.required || submitted) ? e.msg : null;
              };
              const over = !!c.errors.total;
              const short = r3(Math.max(0, pending - c.total));
              const amount = round2(c.passed * n(item.rate));
              const batchProblem = show("batches");
              const named = l.batches.filter((b) => b.batchNo.trim());
              return (
                <Fragment key={item.id}>
                  <tr id={`grn-line-${item.id}`} className={cx("align-top", scanned === item.id && "bg-brand-50/60", over && "bg-red-50/60")}>
                    <Td className="pt-4 text-slate-400">{idx + 1}</Td>
                    <Td className="min-w-48 pt-3">
                      <p className="break-words font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{p.sku}</span>
                        {p.packSize && ` · ${p.packSize}`}
                        {p.trackBatch && " · batch tracked"}
                        {p.trackSerial && " · batch / serial no. per unit"}
                      </p>
                    </Td>
                    <Td right className="whitespace-nowrap pt-3">
                      <span className="num font-medium text-slate-900">
                        {qty(item.quantity)} <span className="text-xs font-normal text-slate-500">{p.unit}</span>
                      </span>
                      {earlier > 0 && (
                        <p className="text-[11px] text-slate-500">
                          {qty(earlier)} received earlier · {qty(pending)} due
                        </p>
                      )}
                    </Td>
                    <Td className="pt-2">
                      {/* Opens the batch popup: quantity, batch no., Mfg and expiry date per batch */}
                      <button
                        type="button"
                        id={`grn-batch-${item.id}`}
                        onClick={() => setBatchFor(item.id)}
                        className={cx(
                          "flex w-full items-start justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30",
                          batchProblem ? "border-red-400" : "border-slate-300",
                        )}
                      >
                        {named.length ? (
                          <span className="min-w-0 space-y-0.5">
                            {named.slice(0, 2).map((b) => (
                              <span key={b.key} className="block truncate">
                                <span className="font-mono font-medium text-slate-900">{b.batchNo}</span>
                                <span className="text-xs text-slate-500">
                                  {" "}
                                  · {qty(num(b.qty))} {p.unit}
                                  {b.expiryDate ? ` · Exp ${date(b.expiryDate)}` : ""}
                                </span>
                              </span>
                            ))}
                            {named.length > 2 && <span className="block text-xs text-brand-700">+ {named.length - 2} more batches</span>}
                          </span>
                        ) : (
                          <span className="truncate text-slate-500">Add batch details</span>
                        )}
                        <Layers className="mt-0.5 size-4 shrink-0 text-slate-400" />
                      </button>
                      <FieldError msg={batchProblem} />
                    </Td>
                    <Td right className="whitespace-nowrap pt-3">
                      <span className="num">{inr(item.rate)}</span>
                      <p className="text-[11px] text-slate-500">per {p.unit}</p>
                    </Td>
                    <Td right className="pt-2">
                      <button
                        type="button"
                        onClick={() => setBatchFor(item.id)}
                        title="Change in the batch popup"
                        aria-label={`Received quantity of ${p.name}`}
                        className={cx(
                          "num ml-auto block h-9 w-28 rounded-lg border bg-slate-50 px-3 text-right font-semibold text-brand-700 hover:border-brand-500",
                          over ? "border-red-400" : "border-slate-200",
                        )}
                      >
                        {qty(c.passed)}
                      </button>
                      {over ? (
                        <p className="mt-1 text-[11px] font-medium text-red-600">{c.errors.total!.msg}</p>
                      ) : short > 0 ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-700">
                          Short {qty(short)} {p.unit} · stays open
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {l.batches.length > 1 ? `${l.batches.length} batches · ` : ""}QC passed
                        </p>
                      )}
                    </Td>
                    <Td right className="whitespace-nowrap pt-3">
                      <span className="num font-semibold text-slate-900">{inr(amount)}</span>
                      <p className="text-[11px] text-slate-500">excl. GST</p>
                    </Td>
                  </tr>
                  {/* Delivered but not accepted: damaged, leaking, expired… — out of stock, onto a debit note with the reason */}
                  <tr className={cx(over && "bg-red-50/60")}>
                    <td />
                    <td colSpan={6} className="px-3 pb-3 pt-0 sm:px-4">
                      {!l.issues?.length ? (
                        <button
                          type="button"
                          onClick={() => setIssues(item, [blankIssue(!!p.trackSerial)])}
                          className="text-xs font-medium text-amber-700 hover:text-amber-800 hover:underline"
                        >
                          + Not accepted (damaged / leakage / expired…)
                        </button>
                      ) : (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                          {/* The line's batch / serial numbers, offered for the Batch No. of each entry */}
                          <datalist id={`grn-batches-${item.id}`}>
                            {[...new Set(l.batches.map((b) => b.batchNo.trim()).filter(Boolean))].map((b) => (
                              <option key={b} value={b} />
                            ))}
                          </datalist>
                          <div className="space-y-2">
                            {l.issues.map((x, k) => {
                              const change = (patch: Partial<IssueRow>) => setIssues(item, l.issues!.map((y) => (y.key === x.key ? { ...y, ...patch } : y)));
                              return (
                                <div key={x.key} className="flex flex-wrap items-end gap-2">
                                  <label className="block">
                                    <span className="mb-0.5 block text-[11px] font-medium text-amber-900">Qty ({p.unit})</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="any"
                                      className="num h-8 w-20 text-right"
                                      value={x.qty}
                                      disabled={!!p.trackSerial}
                                      title={p.trackSerial ? "One unit per entry — add an entry for each unit" : undefined}
                                      onChange={(e) => change({ qty: e.target.value })}
                                      aria-label={`Not accepted ${k + 1}: quantity of ${p.name}`}
                                    />
                                  </label>
                                  <label className="block">
                                    <span className="mb-0.5 block text-[11px] font-medium text-amber-900">Reason</span>
                                    <Select
                                      className="h-8 w-44"
                                      value={x.reason}
                                      onChange={(e) => change({ reason: e.target.value as Issue })}
                                      aria-label={`Not accepted ${k + 1}: why ${p.name} was not accepted`}
                                    >
                                      {ISSUES.map((o) => (
                                        <option key={o.value} value={o.value}>
                                          {o.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </label>
                                  <label className="block">
                                    <span className="mb-0.5 block text-[11px] font-medium text-amber-900">
                                      {p.trackSerial ? "Batch / Serial No." : "Batch No."}
                                      <span className="text-red-500"> *</span>
                                    </span>
                                    <Input
                                      className="h-8 w-40 font-mono"
                                      list={`grn-batches-${item.id}`}
                                      value={x.batchNo}
                                      onChange={(e) => change({ batchNo: e.target.value })}
                                      placeholder={p.trackSerial ? "Pick the unit" : "Which batch"}
                                      aria-label={`Not accepted ${k + 1}: batch no. of ${p.name}`}
                                    />
                                  </label>
                                  <label className="block min-w-40 flex-1">
                                    <span className="mb-0.5 block text-[11px] font-medium text-amber-900">
                                      Remark{x.reason === "OTHER" ? <span className="text-red-500"> *</span> : " (optional)"}
                                    </span>
                                    <Input
                                      className="h-8"
                                      maxLength={300}
                                      value={x.remark}
                                      onChange={(e) => change({ remark: e.target.value })}
                                      placeholder="e.g. box crushed, bottle leaking"
                                      aria-label={`Not accepted ${k + 1}: what was wrong with ${p.name}`}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setIssues(item, l.issues!.filter((y) => y.key !== x.key))}
                                    className="mb-1.5 rounded p-1 text-slate-400 hover:text-slate-700"
                                    aria-label={`Remove not accepted ${k + 1}`}
                                    title="Remove"
                                  >
                                    <X className="size-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <button
                              type="button"
                              onClick={() => setIssues(item, [...l.issues!, blankIssue(!!p.trackSerial)])}
                              className="text-xs font-medium text-amber-800 hover:underline"
                            >
                              + Add another
                            </button>
                            {c.notAccepted > 0 && (
                              <span className="text-[11px] text-amber-800">
                                {qty(c.notAccepted)} {p.unit} not accepted · stays out of stock and goes on the GRN&apos;s debit note (
                                {inr(round2(c.notAccepted * n(item.rate)))} excl. GST)
                              </span>
                            )}
                          </div>
                          <FieldError msg={show("issue")} />
                        </div>
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <Td colSpan={5} className="text-right text-slate-600">
                Total
              </Td>
              <Td right className="num text-brand-700">
                {qty(totals.passed)}
              </Td>
              <Td right className="num whitespace-nowrap text-slate-900">
                {inr(passedValue)}
              </Td>
            </tr>
          </tfoot>
        </Table>
      </Card>

      <Card title="Attachments" className="mb-4">
        <PendingFiles files={files} onChange={setFiles} />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Total label="Received" value={qty(totals.passed)} className="text-brand-700" />
            {totals.notAccepted > 0 && <Total label="Not Accepted" value={qty(totals.notAccepted)} className="text-red-700" />}
            <Total label="Shortfall" value={qty(shortfall)} className={shortfall ? "text-amber-700" : undefined} />
            <Total label="Passed Value (PO Rate)" value={inr(passedValue)} />
          </dl>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => router.push("/goods-inward")}>
              Cancel
            </Button>
            <Button className="flex-1 sm:flex-none" icon={<PackageCheck className="size-4" />} onClick={submit} loading={saving} disabled={!anyQty || wrongBranch}>
              Post GRN
            </Button>
          </div>
        </div>
        {anyQty && shortLines.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Partial receipt: {shortLines.map((i) => i.product.name).join(", ")} will stay open on {po.poNo} for the balance.
          </p>
        )}
      </Card>

      {batchItem && (
        <BatchesModal
          item={batchItem}
          line={lines[batchItem.id]}
          rowErrors={checks.get(batchItem.id)?.rowErrors ?? []}
          submitted={submitted}
          onChange={(patch) => update(batchItem.id, patch)}
          onClose={() => setBatchFor(null)}
        />
      )}
    </>
  );
}

/**
 * Batch popup for one PO line, in one of two modes:
 * - Single batch: a table of Qty · Batch No. · Mfg Date · Expiry Date; usually one row, with Add row to split the quantity.
 * - Multiple batches: one batch per unit (qty 1 each), every one with its own batch no., Mfg and expiry date.
 * The rows' quantities add up to the line's Received Qty.
 */
function BatchesModal({
  item,
  line,
  rowErrors,
  submitted,
  onChange,
  onClose,
}: {
  item: PoItem;
  line: Line;
  rowErrors: ({ msg: string; required?: boolean } | null)[];
  submitted: boolean;
  onChange: (patch: Partial<Line>) => void;
  onClose: () => void;
}) {
  const p = item.product;
  const pending = pendingOf(item);
  const confirm = useConfirm();
  const multiple = !!line.multi;
  // Serial-tracked products: one row per unit with a single Batch / Serial No. field
  const serialTracked = !!p.trackSerial;
  const numberLabel = serialTracked ? "Batch / Serial No." : "Batch No.";
  // Multiple batches: # · Batch No. · Mfg · Expiry
  const unitCols = "sm:grid-cols-[1.75rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]";
  const rows = line.batches;
  const setRows = (batches: BatchRow[]) => onChange({ batches });
  // Multiple batches: a "for all" date shows at the top only while every row has that same date
  const sameOf = (k: "mfgDate" | "expiryDate") => (rows.every((b) => b[k] === rows[0]?.[k]) ? (rows[0]?.[k] ?? "") : null);
  const allMfg = sameOf("mfgDate");
  const allExpiry = sameOf("expiryDate");
  const [count, setCountText] = useState(String(rows.length));
  const received = receivedOf(line);
  const left = r3(pending - received);
  const set = (key: number, patch: Partial<BatchRow>) => setRows(rows.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  // Removing the only row clears it instead
  const remove = (key: number) => setRows(rows.length > 1 ? rows.filter((b) => b.key !== key) : [blankBatch()]);
  // A new row starts with whatever is still due
  const add = () => setRows([...rows, blankBatch(left > 0 ? String(left) : "")]);
  const errorOf = (i: number) => {
    const err = rowErrors[i];
    return err && (!err.required || submitted) ? err.msg : null;
  };

  /** One batch of 1 per unit, starting with the shared dates (blank where the rows differ) */
  const unitRow = (dates = { mfgDate: allMfg ?? "", expiryDate: allExpiry ?? "" }) => ({ ...blankBatch("1"), ...dates });

  async function changeMode(next: "single" | "multiple") {
    if ((next === "multiple") === multiple) return;
    const filled = rows.filter((b) => num(b.qty) > 0 || b.batchNo.trim());
    if (next === "multiple") {
      // As many units as received (or still due), as whole batches of 1
      const base = received > 0 ? received : pending;
      const units = Number.isInteger(base) && base > 0 ? Math.min(base, 500) : 2;
      if (filled.length > 1 && !(await confirm(`Replace the ${filled.length} batches entered with ${units} batches of 1 ${p.unit} each?`, { confirmLabel: "Use multiple batches" })))
        return;
      const dates = { mfgDate: rows[0]?.mfgDate ?? "", expiryDate: rows[0]?.expiryDate ?? "" };
      setCountText(String(units));
      onChange({ multi: true, batches: Array.from({ length: units }, () => unitRow(dates)) });
    } else {
      if (filled.length > 1 && !(await confirm(`Replace the ${filled.length} batches with a single batch of ${qty(received)} ${p.unit}?`, { confirmLabel: "Use single batch" })))
        return;
      const first = rows.find((b) => b.batchNo.trim()) ?? rows[0];
      onChange({ multi: false, batches: [{ ...blankBatch(received > 0 ? String(received) : String(pending)), batchNo: first?.batchNo ?? "", mfgDate: first?.mfgDate ?? "", expiryDate: first?.expiryDate ?? "" }] });
    }
  }

  /** The number of rows follows the quantity (typed rows are kept) */
  function setCount(value: string) {
    setCountText(value);
    const c = Number(value);
    if (!Number.isInteger(c) || c < 1) return;
    const size = Math.min(c, 500);
    setRows(Array.from({ length: size }, (_, i) => rows[i] ?? unitRow()));
  }

  /** A date at the top is copied to every row */
  function setAllDates(patch: { mfgDate?: string; expiryDate?: string }) {
    setRows(rows.map((b) => ({ ...b, ...patch })));
  }

  /** Several batch numbers pasted at once fill the rows from this one on */
  function pasteNumbers(i: number, text: string) {
    const parts = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return false;
    setRows(rows.map((b, j) => (j >= i && j - i < parts.length ? { ...b, batchNo: parts[j - i] } : b)));
    return true;
  }

  const complete = rows.filter((b) => b.batchNo.trim() && b.mfgDate && b.expiryDate).length;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      centered
      title={
        <span className="inline-flex flex-wrap items-center gap-x-2">
          Batches · {p.name}
          <span className="text-sm font-normal text-slate-500">
            PO qty {qty(item.quantity)} {p.unit}
            {pending < n(item.quantity) ? ` · ${qty(pending)} due` : ""}
          </span>
        </span>
      }
      footer={
        <>
          <div className="mr-auto text-sm">
            <span className="text-slate-500">Received Qty </span>
            <b className="num text-brand-700">
              {qty(received)} {p.unit}
            </b>
            {left > 0 && <span className="ml-2 text-amber-700">· {qty(left)} short (stays open on the PO)</span>}
            {left < 0 && <span className="ml-2 font-medium text-red-600">· {qty(-left)} more than due</span>}
          </div>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {serialTracked ? (
        <p className="mb-3 text-xs text-slate-500">One row per unit: enter each unit&apos;s Batch / Serial No., Mfg date and expiry date.</p>
      ) : (
        <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-1">
          <Field label="Batches" className="w-full sm:w-56">
            <Select value={multiple ? "multiple" : "single"} onChange={(e) => void changeMode(e.target.value as "single" | "multiple")} aria-label="Single or multiple batches">
              <option value="single">Single batch</option>
              <option value="multiple">Multiple batches</option>
            </Select>
          </Field>
          <p className="pb-2 text-xs text-slate-500">
            {multiple ? "One batch per unit, each with its own batch no., Mfg date and expiry date." : "The quantity received as one batch — add a row to split it across batches."}
          </p>
        </div>
      )}

      {multiple ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={`Quantity (${p.unit})`} required hint="One row below for each unit">
              <Input type="number" min="1" step="1" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className="num text-right" aria-label="Number of batches" />
            </Field>
            {/* Hidden once any row has its own date; the rows below hold the dates then */}
            {allMfg !== null && (
              <Field label="Mfg Date for all" hint="Fills every row; change any row below">
                <DateInput max={today()} value={allMfg} onChange={(e) => setAllDates({ mfgDate: e.target.value })} aria-label="Mfg date for all" />
              </Field>
            )}
            {allExpiry !== null && (
              <Field label="Expiry Date for all" hint="Fills every row; change any row below">
                <DateInput value={allExpiry} min={allMfg || undefined} onChange={(e) => setAllDates({ expiryDate: e.target.value })} aria-label="Expiry date for all" />
              </Field>
            )}
          </div>
          <div className="mb-1 mt-3 flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-600">Batches · each needs its {serialTracked ? "batch / serial no." : "batch no."}, Mfg and expiry date</span>
            <span className="num text-xs text-slate-500">
              {complete} of {rows.length} complete
            </span>
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            <div className={cx("hidden gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:grid", unitCols)}>
              <span />
              <span>{numberLabel} *</span>
              <span>Mfg Date *</span>
              <span>Expiry Date *</span>
            </div>
            {rows.map((b, i) => {
              const msg = errorOf(i);
              return (
                <div key={b.key}>
                  <div className={cx("grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2", unitCols)}>
                    <span className="num text-right text-xs text-slate-400">{i + 1}.</span>
                    <Input
                      value={b.batchNo}
                      onChange={(e) => set(b.key, { batchNo: e.target.value })}
                      onPaste={(e) => {
                        if (pasteNumbers(i, e.clipboardData.getData("text"))) e.preventDefault();
                      }}
                      onKeyDown={(e) => {
                        // Scanners end each code with Enter: move on to the next row
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        document.querySelector<HTMLInputElement>(`input[aria-label="Batch number ${i + 2}"]`)?.focus();
                      }}
                      className={cx("font-mono", msg && /batch/i.test(msg) && "border-red-400")}
                      placeholder={serialTracked ? "Batch / serial no." : "Batch no."}
                      data-scan-input
                      aria-label={`Batch number ${i + 1}`}
                      autoFocus={i === 0}
                    />
                    <div className="col-start-2 sm:col-start-auto">
                      <DateInput
                        max={today()}
                        value={b.mfgDate}
                        onChange={(e) => set(b.key, { mfgDate: e.target.value })}
                        className={cx(msg && /mfg/i.test(msg) && "border-red-400")}
                        aria-label={`Batch ${i + 1} Mfg date`}
                      />
                    </div>
                    <div className="col-start-2 sm:col-start-auto">
                      <DateInput
                        value={b.expiryDate}
                        min={b.mfgDate || undefined}
                        onChange={(e) => set(b.key, { expiryDate: e.target.value })}
                        className={cx(msg && /expir/i.test(msg) && "border-red-400")}
                        aria-label={`Batch ${i + 1} expiry date`}
                      />
                    </div>
                  </div>
                  {msg && <p className="ml-9 mt-0.5 text-xs text-red-600">{msg}</p>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="w-8 px-3 py-2 font-medium">#</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">Qty ({p.unit})</th>
                  <th className="min-w-52 px-3 py-2 font-medium">Batch No. *</th>
                  <th className="px-3 py-2 font-medium">Mfg Date *</th>
                  <th className="px-3 py-2 font-medium">Expiry Date *</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((b, i) => {
                  const msg = errorOf(i);
                  return (
                    <Fragment key={b.key}>
                      <tr className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2 pt-4 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            inputMode="decimal"
                            value={b.qty}
                            placeholder="0"
                            onChange={(e) => set(b.key, { qty: e.target.value })}
                            className="num text-right font-semibold"
                            aria-label={`Batch ${i + 1} quantity`}
                            autoFocus={i === rows.length - 1 && rows.length > 1}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <BatchSelect
                            productId={item.productId}
                            unit={p.unit}
                            value={b.batchNo}
                            invalid={!!msg && /batch no/i.test(msg)}
                            placeholder="Select or add batch"
                            onChange={(pick: BatchPick) =>
                              set(b.key, pick.existing ? { batchNo: pick.batchNo, mfgDate: pick.mfgDate ?? "", expiryDate: pick.expiryDate ?? "" } : { batchNo: pick.batchNo })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <DateInput
                            max={today()}
                            value={b.mfgDate}
                            onChange={(e) => set(b.key, { mfgDate: e.target.value })}
                            className={cx(msg && /mfg/i.test(msg) && "border-red-400")}
                            aria-label={`Batch ${i + 1} Mfg date`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <DateInput
                            value={b.expiryDate}
                            min={b.mfgDate || undefined}
                            onChange={(e) => set(b.key, { expiryDate: e.target.value })}
                            className={cx(msg && /expir/i.test(msg) && "border-red-400")}
                            aria-label={`Batch ${i + 1} expiry date`}
                          />
                        </td>
                        <td className="px-3 py-2 pt-3">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => remove(b.key)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              aria-label={`Remove batch ${i + 1}`}
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {msg && (
                        <tr>
                          <td />
                          <td colSpan={5} className="px-3 pb-2 text-xs text-red-600">
                            {msg}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={add}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus className="size-4" /> Add row
          </button>
        </>
      )}
    </Modal>
  );
}

/** What earlier GRNs against this PO took in: per GRN, each line's received qty and batch */
function ReceivedEarlier({ po, canBrowse }: { po: PurchaseOrder; canBrowse: boolean }) {
  const items = po.items ?? [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = r3(items.reduce((s, i) => s + n(i.quantity), 0));
  const received = r3(items.reduce((s, i) => s + n(i.passedQty), 0));
  return (
    <Card
      bodyClassName="p-0"
      title={
        <span className="inline-flex items-center gap-1.5">
          <History className="size-4 text-slate-400" /> Received Earlier
        </span>
      }
      actions={
        <span className="text-sm text-slate-500">
          <span className="num font-semibold text-brand-700">{qty(received)}</span> of <span className="num">{qty(ordered)}</span> received
        </span>
      }
    >
      <ul className="divide-y divide-slate-100">
        {(po.grns ?? []).map((g) => (
          <li key={g.id} className="px-4 py-2.5 text-sm">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              {canBrowse ? (
                <Link href={`/goods-inward/${g.id}`} className="font-medium text-brand-700 hover:underline">
                  {g.grnNo}
                </Link>
              ) : (
                <span className="font-medium text-slate-800">{g.grnNo}</span>
              )}
              <span className="text-xs text-slate-500">
                {date(g.receivedAt)}
                {g.receivedBy && ` · ${g.receivedBy.name}`}
              </span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {(g.items ?? [])
                .filter((gi) => n(gi.passedQty) > 0)
                .map((gi, k) => {
                  const line = byId.get(gi.poItemId);
                  return (
                    <li key={k} className="flex justify-between gap-3 text-xs text-slate-600">
                      <span className="min-w-0 truncate">
                        {line?.product.name ?? "—"}
                        {gi.batchNo && <span className="font-mono text-slate-500"> · {gi.batchNo}</span>}
                        {gi.expiryDate && <span className="text-slate-500"> · Exp {date(gi.expiryDate)}</span>}
                      </span>
                      <span className="num shrink-0 font-medium text-slate-800">
                        {qty(gi.passedQty)} {line?.product.unit}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <span className="mt-1 block text-xs text-red-600">{msg}</span>;
}

function Total({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cx("num font-semibold text-slate-900", className)}>{value}</dd>
    </div>
  );
}
