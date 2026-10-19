"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Info as InfoIcon, PackageCheck, Plus, ScanLine, Store, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BatchSelect, type BatchPick } from "@/components/BatchSelect";
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
  PageHeader,
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
import { useApi } from "@/lib/hooks";
import { useScanner } from "@/lib/scanner";
import type { Grn, PoItem, PurchaseOrder } from "@/lib/types";

/** A further batch of the same line (the first batch is the line's own batch fields and takes the rest of the passed qty) */
interface ExtraBatch {
  key: number;
  qty: string;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
}

interface Line {
  passed: string;
  rejected: string;
  damaged: string;
  expired: string;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
  location: string;
  /** Chassis / serial numbers of the passed units, one per box */
  serials: string[];
  extra: ExtraBatch[];
}

type QtyKey = "passed" | "rejected" | "damaged" | "expired";
let batchSeq = 0;
const blankBatch = (): ExtraBatch => ({ key: ++batchSeq, qty: "", batchNo: "", mfgDate: "", expiryDate: "" });
const serialsOf = (l: Line) => l.serials.map((x) => x.trim()).filter(Boolean);
const extraQty = (l: Line) => r3(l.extra.reduce((s, b) => s + num(b.qty), 0));

const QTY_FIELDS = [
  { key: "passed", label: "QC Passed", hint: "Accepted into sellable stock", tone: "text-brand-700" },
  { key: "rejected", label: "Rejected", hint: "Debit note to vendor", tone: "text-red-600" },
  { key: "damaged", label: "Damaged", hint: "Written off", tone: "text-amber-700" },
  { key: "expired", label: "Expired", hint: "Kept out of stock", tone: "text-amber-700" },
] as const;

const num = (s: string) => Number(s) || 0;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const pendingOf = (i: PoItem) =>
  i.pendingQty ?? r3(Math.max(0, n(i.quantity) - n(i.passedQty) - n(i.rejectedQty) - n(i.damagedQty) - n(i.expiredQty)));

/** Problems with a line, mirroring the backend's createGrn checks. `required` errors only show after a submit attempt. */
function check(item: PoItem, l: Line) {
  const pending = pendingOf(item);
  const passed = num(l.passed);
  const expired = num(l.expired);
  const total = r3(passed + num(l.rejected) + num(l.damaged) + expired);
  const errors: Partial<Record<keyof Line | "total", { msg: string; required?: boolean }>> = {};
  const extraTotal = extraQty(l);
  for (const f of QTY_FIELDS) if (num(l[f.key]) < 0) errors[f.key] = { msg: "Can't be negative" };
  if (total > pending + 0.0005) errors.total = { msg: `${qty(total)} entered — only ${qty(pending)} pending` };
  const track = item.product.trackBatch;
  if (track && (passed > 0 || expired > 0) && !l.batchNo.trim()) errors.batchNo = { msg: "Batch no. is required", required: true };
  if (track && passed > 0 && !l.expiryDate) errors.expiryDate = { msg: "Expiry date is required for passed stock", required: true };
  else if (passed > 0 && l.expiryDate && l.expiryDate <= today())
    errors.expiryDate = track
      ? { msg: "Must be a future date — count expired goods under Expired" }
      : { msg: "Already expired — count these under Expired" };
  if (l.mfgDate && l.mfgDate > today()) errors.mfgDate = { msg: "Can't be in the future" };
  else if (l.mfgDate && l.expiryDate && l.expiryDate < l.mfgDate) errors.expiryDate = { msg: "Before the manufacturing date" };
  // Further batches: each needs a quantity (and batch no. / expiry when tracked); the first batch keeps the rest of the passed qty
  if (l.extra.length) {
    const label = (i: number) => `Batch ${i + 2}`;
    const bad = l.extra
      .map((b, i) => {
        if (!(num(b.qty) > 0)) return `${label(i)}: enter its quantity`;
        if (track && !b.batchNo.trim()) return `${label(i)}: batch no. is required`;
        if (track && !b.expiryDate) return `${label(i)}: expiry date is required`;
        if (b.expiryDate && b.expiryDate <= today()) return `${label(i)}: expiry must be a future date`;
        if (b.mfgDate && b.mfgDate > today()) return `${label(i)}: manufacturing date can't be in the future`;
        if (b.mfgDate && b.expiryDate && b.expiryDate < b.mfgDate) return `${label(i)}: expiry is before the manufacturing date`;
        return null;
      })
      .find(Boolean);
    if (extraTotal >= passed - 0.0005) errors.extra = { msg: `Batches add up to ${qty(extraTotal)} — keep part of the ${qty(passed)} passed for batch 1, or raise Passed` };
    else if (bad) errors.extra = { msg: bad, required: true };
  }
  const serials = serialsOf(l);
  if (serials.length > passed + 0.0005) errors.serials = { msg: `${serials.length} chassis / serial numbers entered for ${qty(passed)} passed units` };
  else if (new Set(serials).size !== serials.length) errors.serials = { msg: "The same chassis / serial number is entered twice" };
  return { pending, total, errors, extraTotal };
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
  const { data: po, error, loading, reload } = useApi<PurchaseOrder>(poId ? `/purchase-orders/${poId}` : null);

  if (!poId) {
    return (
      <>
        <BackLink />
        <ErrorBox message="Choose an approved purchase order from Goods Inward to receive goods against." />
      </>
    );
  }
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !po) return <Spinner page />;
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
  const { user } = useAuth();
  const items = po.items ?? [];

  const [vehicleNo, setVehicleNo] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [receivedAt, setReceivedAt] = useState(today());
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(
      items.map((i) => [
        i.id,
        { passed: String(pendingOf(i)), rejected: "", damaged: "", expired: "", batchNo: "", mfgDate: "", expiryDate: "", location: "", serials: [], extra: [] } as Line,
      ]),
    ),
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);
  // Rows whose details (QC split, dates, location, more batches, serials) are open
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const { currentId, branches, locked, setBranch } = useBranch();

  // A barcode scan jumps to that PO line, marks the pending quantity as passed and focuses the batch box
  useScanner((code) => {
    const q = code.toLowerCase();
    const hit = items.find((i) => pendingOf(i) > 0 && (i.product.barcode?.toLowerCase() === q || i.product.sku.toLowerCase() === q));
    if (!hit) return toast.error(`No open line on ${po.poNo} matches barcode ${code}`);
    setScanned(hit.id);
    setLines((ls) => (num(ls[hit.id].passed) > 0 ? ls : { ...ls, [hit.id]: { ...ls[hit.id], passed: String(pendingOf(hit)) } }));
    document.getElementById(`grn-line-${hit.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => document.getElementById(`grn-batch-${hit.id}`)?.focus(), 250);
  }, true, (t) => !!t?.closest("[data-scan-input]")); // a batch or chassis number scanned into its box stays there
  // Goods are received into the branch the PO delivers to; with another branch selected the API refuses
  const poBranchId = po.branchId ?? po.branch?.id ?? null;
  const wrongBranch = !!poBranchId && currentId !== "all" && currentId !== poBranchId;
  const canSwitch = !locked && branches.some((b) => b.id === poBranchId);

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));
  const updateBatch = (id: string, key: number, patch: Partial<ExtraBatch>) =>
    setLines((ls) => ({ ...ls, [id]: { ...ls[id], extra: ls[id].extra.map((b) => (b.key === key ? { ...b, ...patch } : b)) } }));
  const setSerial = (id: string, idx: number, value: string) =>
    setLines((ls) => ({ ...ls, [id]: { ...ls[id], serials: ls[id].serials.map((x, j) => (j === idx ? value : x)) } }));
  // Several numbers pasted at once (from a sheet or a list) become one box each
  const pasteSerials = (id: string, idx: number, text: string) => {
    const parts = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return false;
    setLines((ls) => {
      const next = [...ls[id].serials];
      next.splice(idx, 1, ...parts);
      return { ...ls, [id]: { ...ls[id], serials: next } };
    });
    return true;
  };
  const open = items.filter((i) => pendingOf(i) > 0);
  const checks = new Map(open.map((i) => [i.id, check(i, lines[i.id])]));

  const sum = (k: QtyKey) => r3(open.reduce((s, i) => s + num(lines[i.id][k]), 0));
  const totals = { passed: sum("passed"), rejected: sum("rejected"), damaged: sum("damaged"), expired: sum("expired") };
  const passedValue = round2(open.reduce((s, i) => s + num(lines[i.id].passed) * n(i.rate), 0));
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

    const received = totals.passed + totals.rejected + totals.damaged + totals.expired;
    const parts = [`${qty(received)} received in total`, `${qty(totals.passed)} into stock`];
    if (totals.rejected) parts.push(`${qty(totals.rejected)} rejected (a debit note will be drafted to ${po.vendor?.name ?? "the vendor"})`);
    if (totals.damaged) parts.push(`${qty(totals.damaged)} written off as damaged`);
    if (totals.expired) parts.push(`${qty(totals.expired)} expired, kept out of stock`);
    const balance = shortLines.length
      ? ` ${shortLines.length} line${shortLines.length === 1 ? "" : "s"} will stay open for the balance.`
      : " The PO will be marked fully received.";
    const invoiceNote = totals.passed > 0 ? ` The purchase invoice will be booked under ${supplierInvoiceNo.trim()}.` : "";
    if (!(await confirm(`Post goods inward for ${po.poNo}? ${parts.join(", ")}.${balance}${invoiceNote}`, { confirmLabel: "Post GRN" }))) return;

    setSaving(true);
    try {
      const grn = await api.post<Grn & { invoiceError?: string | null }>(`/purchase-orders/${po.id}/grn`, {
        vehicleNo: vehicleNo.trim() || undefined,
        supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
        receivedAt,
        // Each further batch is sent as its own row for the same PO line; the first row keeps the rest of the passed qty
        items: open.flatMap((i) => {
          const l = lines[i.id];
          const serials = serialsOf(l);
          const location = l.location.trim() || undefined;
          return [
            {
              poItemId: i.id,
              passedQty: r3(num(l.passed) - extraQty(l)),
              rejectedQty: num(l.rejected),
              damagedQty: num(l.damaged),
              expiredQty: num(l.expired),
              batchNo: l.batchNo.trim() || undefined,
              location,
              serialNos: serials.length ? serials : undefined,
              mfgDate: l.mfgDate || undefined,
              expiryDate: l.expiryDate || undefined,
            },
            ...l.extra.map((b) => ({
              poItemId: i.id,
              passedQty: num(b.qty),
              rejectedQty: 0,
              damagedQty: 0,
              expiredQty: 0,
              batchNo: b.batchNo.trim() || undefined,
              location,
              mfgDate: b.mfgDate || undefined,
              expiryDate: b.expiryDate || undefined,
            })),
          ];
        }),
      });
      // The purchase invoice is booked automatically when anything passed inspection
      toast.success(
        `${grn.grnNo} posted · stock updated${grn.purchase ? ` · invoice ${grn.purchase.purchaseNo} booked` : ""}${totals.rejected > 0 ? " · debit note drafted" : ""}`,
      );
      if (grn.invoiceError) toast.warn(`Purchase invoice not booked: ${grn.invoiceError}. Book it from the GRN.`);
      counts.refresh();
      router.push(`/goods-inward/${grn.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

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

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 sm:px-4 text-sm text-sky-800">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          Enter the <b>Received Qty</b> that passed QC for each line and pick its batch. Open <b>▸</b> on a line for goods that were{" "}
          <b>rejected</b> (debit note to the vendor), <b>damaged</b> (written off) or <b>expired</b> (kept out of stock), the Mfg date, location,
          more batches and chassis / serial numbers. Anything not counted stays open on the PO for a later delivery.
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
              <Th />
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
                    <Td right colSpan={3}>
                      <Badge tone="green">
                        <CheckCircle2 className="mr-1 size-3.5" /> Fully Received
                      </Badge>
                    </Td>
                  </tr>
                );
              }
              const l = lines[item.id];
              const c = checks.get(item.id)!;
              const show = (k: keyof Line) => {
                const e = c.errors[k];
                return e && (!e.required || submitted) ? e.msg : null;
              };
              const over = !!c.errors.total;
              const short = r3(Math.max(0, pending - c.total));
              const outOfStock = r3(num(l.rejected) + num(l.damaged) + num(l.expired));
              const amount = round2(num(l.passed) * n(item.rate));
              // Details open by themselves when they hold something or have a problem to fix
              const detailError = !!(show("rejected") || show("damaged") || show("expired") || show("mfgDate") || show("extra") || show("serials"));
              const expanded = openRows[item.id] ?? (!!p.trackSerial || l.extra.length > 0 || outOfStock > 0 || detailError);
              const toggle = () => setOpenRows((o) => ({ ...o, [item.id]: !expanded }));
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
                      {l.extra.length > 0 && (
                        <p className="mb-0.5 text-[11px] font-medium text-slate-500">
                          Batch 1 · {qty(Math.max(0, r3(num(l.passed) - c.extraTotal)))} {p.unit}
                        </p>
                      )}
                      <BatchSelect
                        id={`grn-batch-${item.id}`}
                        productId={item.productId}
                        unit={p.unit}
                        value={l.batchNo}
                        invalid={!!show("batchNo")}
                        placeholder={p.trackBatch ? "Select or add batch" : "Optional"}
                        onChange={(b: BatchPick) =>
                          update(item.id, b.existing ? { batchNo: b.batchNo, mfgDate: b.mfgDate ?? "", expiryDate: b.expiryDate ?? "" } : { batchNo: b.batchNo })
                        }
                      />
                      <FieldError msg={show("batchNo")} />
                      {(p.trackBatch || l.expiryDate) && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="shrink-0 text-[11px] font-medium text-slate-500">Expiry{p.trackBatch && num(l.passed) > 0 ? " *" : ""}</span>
                          <DateInput
                            className={cx("h-8 text-xs", show("expiryDate") && "border-red-400")}
                            value={l.expiryDate}
                            min={l.mfgDate || undefined}
                            onChange={(e) => update(item.id, { expiryDate: e.target.value })}
                            aria-label={`Expiry date of ${p.name}`}
                          />
                        </div>
                      )}
                      <FieldError msg={show("expiryDate")} />
                    </Td>
                    <Td right className="whitespace-nowrap pt-3">
                      <span className="num">{inr(item.rate)}</span>
                      <p className="text-[11px] text-slate-500">per {p.unit}</p>
                    </Td>
                    <Td right className="pt-2">
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        className={cx("num ml-auto h-9 w-28 text-right font-semibold text-brand-700", (over || show("passed")) && "border-red-400")}
                        value={l.passed}
                        placeholder="0"
                        onChange={(e) => update(item.id, { passed: e.target.value })}
                        aria-label={`Received quantity of ${p.name}`}
                      />
                      {over ? (
                        <p className="mt-1 text-[11px] font-medium text-red-600">{c.errors.total!.msg}</p>
                      ) : short > 0 ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-700">
                          Short {qty(short)} {p.unit} · stays open
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-slate-500">QC passed</p>
                      )}
                      {outOfStock > 0 && <p className="text-[11px] text-slate-500">+ {qty(outOfStock)} not taken into stock</p>}
                    </Td>
                    <Td right className="whitespace-nowrap pt-3">
                      <span className="num font-semibold text-slate-900">{inr(amount)}</span>
                      <p className="text-[11px] text-slate-500">excl. GST</p>
                    </Td>
                    <Td className="pt-2.5">
                      <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Hide" : "Show"} details for ${p.name}`}
                        title="Rejected / damaged / expired, Mfg date, location, more batches, serial numbers"
                        className={cx("rounded-md p-1.5 hover:bg-slate-100", detailError ? "text-red-600" : "text-slate-500")}
                      >
                        <ChevronDown className={cx("size-4 transition-transform", expanded && "rotate-180")} />
                      </button>
                    </Td>
                  </tr>
                  {expanded && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={8} className="border-b border-slate-100 px-3 pb-4 pt-2 sm:px-4">
                        <div className="flex flex-wrap items-center gap-2 pb-2">
                          <Button size="sm" variant="ghost" onClick={() => update(item.id, { passed: String(pending), rejected: "", damaged: "", expired: "" })}>
                            All Passed
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => update(item.id, { passed: "", rejected: "", damaged: "", expired: "" })}>
                            Not Arrived
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                          {QTY_FIELDS.filter((f) => f.key !== "passed").map((f) => (
                            <Field key={f.key} label={f.label} hint={f.hint}>
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                inputMode="decimal"
                                className={cx("num w-full text-right font-medium", f.tone, show(f.key) && "border-red-400")}
                                value={l[f.key]}
                                placeholder="0"
                                onChange={(e) => update(item.id, { [f.key]: e.target.value })}
                              />
                            </Field>
                          ))}
                          <Field label="Mfg Date">
                            <DateInput
                              max={today()}
                              className={cx(show("mfgDate") && "border-red-400")}
                              value={l.mfgDate}
                              onChange={(e) => update(item.id, { mfgDate: e.target.value })}
                            />
                            <FieldError msg={show("mfgDate")} />
                          </Field>
                          <Field label="Location" hint={p.location ? `Usually ${p.location}` : "Rack / bin (optional)"}>
                            <Input value={l.location} onChange={(e) => update(item.id, { location: e.target.value })} placeholder={p.location ?? ""} />
                          </Field>
                        </div>

                        {/* Further batches of this line: the + adds a row; batch 1 above keeps the rest of the received qty */}
                        {l.extra.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {l.extra.map((b, bi) => (
                              <div key={b.key} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[1.4fr_0.8fr_1fr_1fr_auto]">
                                <Field label={`Batch ${bi + 2} No.`} required={p.trackBatch}>
                                  <BatchSelect
                                    productId={item.productId}
                                    unit={p.unit}
                                    value={b.batchNo}
                                    placeholder={p.trackBatch ? "Select or add batch" : "Optional"}
                                    onChange={(pick: BatchPick) =>
                                      updateBatch(item.id, b.key, pick.existing ? { batchNo: pick.batchNo, mfgDate: pick.mfgDate ?? "", expiryDate: pick.expiryDate ?? "" } : { batchNo: pick.batchNo })
                                    }
                                  />
                                </Field>
                                <Field label={`Qty (${p.unit})`} required>
                                  <Input type="number" step="any" min="0" inputMode="decimal" className="num text-right" value={b.qty} placeholder="0" onChange={(e) => updateBatch(item.id, b.key, { qty: e.target.value })} />
                                </Field>
                                <Field label="Mfg Date">
                                  <DateInput max={today()} value={b.mfgDate} onChange={(e) => updateBatch(item.id, b.key, { mfgDate: e.target.value })} />
                                </Field>
                                <Field label="Expiry Date" required={p.trackBatch}>
                                  <DateInput value={b.expiryDate} min={b.mfgDate || undefined} onChange={(e) => updateBatch(item.id, b.key, { expiryDate: e.target.value })} />
                                </Field>
                                <button
                                  type="button"
                                  onClick={() => update(item.id, { extra: l.extra.filter((x) => x.key !== b.key) })}
                                  className="mb-1 justify-self-end rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  aria-label={`Remove batch ${bi + 2}`}
                                >
                                  <X className="size-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <FieldError msg={show("extra")} />
                        {num(l.passed) > 0 && (
                          <button
                            type="button"
                            onClick={() => update(item.id, { extra: [...l.extra, blankBatch()] })}
                            className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                          >
                            <Plus className="size-3.5" /> Add another batch
                          </button>
                        )}

                        {p.trackSerial && num(l.passed) > 0 && (
                          <div className="mt-3 border-t border-slate-200 pt-3">
                            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                              <span className="text-xs font-medium text-slate-600">Chassis / Serial Numbers of the Received Units</span>
                              <span className={cx("num text-xs", serialsOf(l).length === num(l.passed) ? "text-brand-700" : "text-slate-500")}>
                                {serialsOf(l).length} of {qty(num(l.passed))} entered
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              {l.serials.map((sn, si) => (
                                <div key={si} className="flex items-center gap-1">
                                  <span className="num w-6 shrink-0 text-right text-xs text-slate-400">{si + 1}.</span>
                                  <Input
                                    value={sn}
                                    onChange={(e) => setSerial(item.id, si, e.target.value)}
                                    onPaste={(e) => {
                                      if (pasteSerials(item.id, si, e.clipboardData.getData("text"))) e.preventDefault();
                                    }}
                                    onKeyDown={(e) => {
                                      // A scanner ends each code with Enter: open the next box for the next unit
                                      if (e.key !== "Enter") return;
                                      e.preventDefault();
                                      if (sn.trim() && si === l.serials.length - 1 && l.serials.length < num(l.passed)) update(item.id, { serials: [...l.serials, ""] });
                                    }}
                                    className="font-mono"
                                    placeholder="Chassis / serial no."
                                    data-scan-input
                                    autoFocus={si === l.serials.length - 1 && !sn}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => update(item.id, { serials: l.serials.filter((_, j) => j !== si) })}
                                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                    aria-label={`Remove serial ${si + 1}`}
                                  >
                                    <X className="size-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <FieldError msg={show("serials")} />
                            {serialsOf(l).length < num(l.passed) && (
                              <button
                                type="button"
                                onClick={() => update(item.id, { serials: [...l.serials, ""] })}
                                className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                              >
                                <Plus className="size-3.5" /> Add chassis / serial no.
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
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
              <Td />
            </tr>
          </tfoot>
        </Table>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-6">
            <Total label="QC Passed" value={qty(totals.passed)} className="text-brand-700" />
            <Total label="Rejected" value={qty(totals.rejected)} className={totals.rejected ? "text-red-600" : undefined} />
            <Total label="Damaged" value={qty(totals.damaged)} className={totals.damaged ? "text-amber-700" : undefined} />
            <Total label="Expired" value={qty(totals.expired)} className={totals.expired ? "text-amber-700" : undefined} />
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
    </>
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
