"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, Info as InfoIcon, Layers, PackageCheck, Plus, ScanLine, Store, X } from "lucide-react";
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
  Modal,
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

/** One batch of a line, entered in the Batch No. popup: its quantity, number and dates */
interface BatchRow {
  key: number;
  qty: string;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
}

interface Line {
  /** Received (QC passed) stock, batch by batch; the Received Qty is their total */
  batches: BatchRow[];
}

let batchSeq = 0;
const blankBatch = (qtyValue = ""): BatchRow => ({ key: ++batchSeq, qty: qtyValue, batchNo: "", mfgDate: "", expiryDate: "" });

const num = (s: string) => Number(s) || 0;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
/** Received Qty of a line: the total of its batch quantities */
const receivedOf = (l: Line) => r3(l.batches.reduce((s, b) => s + num(b.qty), 0));
const pendingOf = (i: PoItem) =>
  i.pendingQty ?? r3(Math.max(0, n(i.quantity) - n(i.passedQty) - n(i.rejectedQty) - n(i.damagedQty) - n(i.expiredQty)));

/** Problems with a line, mirroring the backend's createGrn checks. `required` problems only show after a submit attempt. */
function check(item: PoItem, l: Line) {
  const pending = pendingOf(item);
  const passed = receivedOf(l);
  const total = passed;
  const track = item.product.trackBatch;
  const errors: Partial<Record<"total" | "batches", { msg: string; required?: boolean }>> = {};
  if (total > pending + 0.0005) errors.total = { msg: `${qty(total)} entered — only ${qty(pending)} pending` };

  // Each batch row: the quantity, and when the product tracks batches its number and a future expiry
  const rowErrors = l.batches.map((b): { msg: string; required?: boolean } | null => {
    const q = num(b.qty);
    const used = q > 0;
    if (q < 0) return { msg: "Quantity can't be negative" };
    if (!used) return b.batchNo.trim() || b.mfgDate || b.expiryDate ? { msg: "Enter its quantity", required: true } : null;
    if (track && !b.batchNo.trim()) return { msg: "Batch no. is required", required: true };
    if (q > 0 && track && !b.expiryDate) return { msg: "Expiry date is required", required: true };
    if (q > 0 && b.expiryDate && b.expiryDate <= today()) return { msg: "Expiry must be a future date — expired goods aren't taken into stock" };
    if (b.mfgDate && b.mfgDate > today()) return { msg: "Mfg date can't be in the future" };
    if (b.mfgDate && b.expiryDate && b.expiryDate < b.mfgDate) return { msg: "Expiry is before the Mfg date" };
    return null;
  });
  const numbers = l.batches.map((b) => b.batchNo.trim().toLowerCase()).filter(Boolean);
  const firstRow = rowErrors.findIndex(Boolean);
  if (new Set(numbers).size !== numbers.length) errors.batches = { msg: "The same batch number is entered twice — put its whole quantity on one row" };
  else if (firstRow >= 0) errors.batches = { msg: `Batch ${firstRow + 1}: ${rowErrors[firstRow]!.msg}`, required: rowErrors[firstRow]!.required };

  return { pending, passed, total, errors, rowErrors };
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
  // Every open line starts as fully received in one batch; the batch popup splits it
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(items.map((i) => [i.id, { batches: [blankBatch(String(pendingOf(i)))] } as Line])),
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
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
    setLines((ls) => (receivedOf(ls[hit.id]) > 0 ? ls : { ...ls, [hit.id]: { ...ls[hit.id], batches: [blankBatch(String(pendingOf(hit)))] } }));
    document.getElementById(`grn-line-${hit.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setBatchFor(hit.id);
  }, true, (t) => !!t?.closest("[data-scan-input]")); // a batch or chassis number scanned into its box stays there
  // Goods are received into the branch the PO delivers to; with another branch selected the API refuses
  const poBranchId = po.branchId ?? po.branch?.id ?? null;
  const wrongBranch = !!poBranchId && currentId !== "all" && currentId !== poBranchId;
  const canSwitch = !locked && branches.some((b) => b.id === poBranchId);

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));
  const open = items.filter((i) => pendingOf(i) > 0);
  const checks = new Map(open.map((i) => [i.id, check(i, lines[i.id])]));

  const totals = { passed: r3(open.reduce((s, i) => s + receivedOf(lines[i.id]), 0)) };
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
      ? ` ${shortLines.length} line${shortLines.length === 1 ? "" : "s"} will stay open for the balance.`
      : " The PO will be marked fully received.";
    const invoiceNote = totals.passed > 0 ? ` The purchase invoice will be booked under ${supplierInvoiceNo.trim()}.` : "";
    if (!(await confirm(`Post goods inward for ${po.poNo}? ${qty(totals.passed)} received into stock.${balance}${invoiceNote}`, { confirmLabel: "Post GRN" }))) return;

    setSaving(true);
    try {
      const grn = await api.post<Grn & { invoiceError?: string | null }>(`/purchase-orders/${po.id}/grn`, {
        vehicleNo: vehicleNo.trim() || undefined,
        supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
        receivedAt,
        // One row per batch with a quantity; stock goes to the product's usual location
        items: open.flatMap((i) => {
          const l = lines[i.id];
          const filled = l.batches.filter((b) => num(b.qty) > 0);
          const rows = filled.length ? filled : [l.batches[0]];
          return rows.map((b) => ({
            poItemId: i.id,
            passedQty: num(b.qty),
            rejectedQty: 0,
            damagedQty: 0,
            expiredQty: 0,
            batchNo: b.batchNo.trim() || undefined,
            mfgDate: b.mfgDate || undefined,
            expiryDate: b.expiryDate || undefined,
          }));
        }),
      });
      // The purchase invoice is booked automatically when anything passed inspection
      toast.success(
        `${grn.grnNo} posted · stock updated${grn.purchase ? ` · invoice ${grn.purchase.purchaseNo} booked` : ""}`,
      );
      if (grn.invoiceError) toast.warn(`Purchase invoice not booked: ${grn.invoiceError}. Book it from the GRN.`);
      counts.refresh();
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
          Click <b>Batch No.</b> on a line to enter each batch received — its quantity, batch number, Mfg and expiry date; <b>Received Qty</b> is
          their total. Anything not received stays open on the PO for a later delivery.
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
                          <span className={cx("truncate", p.trackBatch ? "text-slate-500" : "text-slate-400")}>
                            {p.trackBatch ? "Add batch details" : "Optional — add batches"}
                          </span>
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

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Total label="Received" value={qty(totals.passed)} className="text-brand-700" />
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
          onChange={(batches) => update(batchItem.id, { batches })}
          onClose={() => setBatchFor(null)}
        />
      )}
    </>
  );
}

/**
 * Batch popup for one PO line: a table of Qty · Batch No. · Mfg Date · Expiry Date, one row per batch,
 * with an add button below. The rows' quantities add up to the line's Received Qty.
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
  onChange: (batches: BatchRow[]) => void;
  onClose: () => void;
}) {
  const p = item.product;
  const pending = pendingOf(item);
  const rows = line.batches;
  // "Multiple batches": one empty batch-number box per unit; each becomes its own batch of 1, all with the same dates
  const [multi, setMulti] = useState<{ rowKey: number | null; count: string; numbers: string[]; mfgDate: string; expiryDate: string } | null>(null);
  const [multiError, setMultiError] = useState<string | null>(null);
  const received = receivedOf(line);
  const left = r3(pending - received);
  const set = (key: number, patch: Partial<BatchRow>) => onChange(rows.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  // Removing the only row clears it instead
  const remove = (key: number) => onChange(rows.length > 1 ? rows.filter((b) => b.key !== key) : [blankBatch()]);
  // A new row starts with whatever is still due
  const add = () => onChange([...rows, blankBatch(left > 0 ? String(left) : "")]);

  /** Opens the multiple-batches form with one empty box per unit; from a row it takes that row's quantity and dates */
  function startMulti(rowKey: number | null) {
    const row = rowKey !== null ? rows.find((b) => b.key === rowKey) : null;
    const base = row ? num(row.qty) : left;
    const whole = Number.isInteger(base) && base > 0 ? Math.min(base, 500) : 2;
    setMultiError(null);
    setMulti({ rowKey, count: String(whole), numbers: Array(whole).fill(""), mfgDate: row?.mfgDate ?? "", expiryDate: row?.expiryDate ?? "" });
  }

  /** The number of boxes follows the quantity (typed numbers are kept) */
  function setCount(value: string) {
    if (!multi) return;
    const c = Number(value);
    const size = Number.isInteger(c) && c > 0 ? Math.min(c, 500) : 0;
    setMulti({ ...multi, count: value, numbers: Array.from({ length: size }, (_, i) => multi.numbers[i] ?? "") });
  }

  function setNumber(i: number, value: string) {
    if (!multi) return;
    setMulti({ ...multi, numbers: multi.numbers.map((x, j) => (j === i ? value : x)) });
  }

  /** Several batch numbers pasted at once fill the boxes from this one on */
  function pasteNumbers(i: number, text: string) {
    if (!multi) return false;
    const parts = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return false;
    const next = [...multi.numbers];
    parts.forEach((part, k) => {
      if (i + k < next.length) next[i + k] = part;
    });
    setMulti({ ...multi, numbers: next });
    return true;
  }

  function createMulti() {
    if (!multi) return;
    const count = Number(multi.count);
    if (!Number.isInteger(count) || count < 2 || count > 500) return setMultiError("Quantity must be a whole number from 2 to 500");
    const numbers = multi.numbers.map((x) => x.trim());
    const empty = numbers.findIndex((x) => !x);
    if (empty >= 0) return setMultiError(`Enter the batch number in box ${empty + 1}`);
    const lower = numbers.map((x) => x.toLowerCase());
    const twice = lower.findIndex((x, i) => lower.indexOf(x) !== i);
    if (twice >= 0) return setMultiError(`${numbers[twice]} is entered twice`);
    if (p.trackBatch && !multi.expiryDate) return setMultiError("Enter the expiry date");
    if (multi.expiryDate && multi.expiryDate <= today()) return setMultiError("Expiry must be a future date");
    if (multi.mfgDate && multi.expiryDate && multi.expiryDate < multi.mfgDate) return setMultiError("Expiry is before the Mfg date");
    // One batch per box, quantity 1 each, all with the dates entered once
    const made = numbers.map((batchNo) => ({ ...blankBatch("1"), batchNo, mfgDate: multi.mfgDate, expiryDate: multi.expiryDate }));
    const taken = new Set(rows.filter((b) => b.key !== multi.rowKey).map((b) => b.batchNo.trim().toLowerCase()).filter(Boolean));
    const clash = made.find((b) => taken.has(b.batchNo.toLowerCase()));
    if (clash) return setMultiError(`${clash.batchNo} is already on another row`);
    if (multi.rowKey !== null) {
      // From a row: that row becomes the new batches, in its place
      const at = rows.findIndex((b) => b.key === multi.rowKey);
      onChange([...rows.slice(0, at), ...made, ...rows.slice(at + 1)]);
    } else {
      // From the bottom: added after the others; a single row without a batch number gives way
      const lone = rows.length === 1 && !rows[0].batchNo.trim();
      onChange(lone ? made : [...rows, ...made]);
    }
    setMulti(null);
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
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
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="w-8 px-3 py-2 font-medium">#</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Qty ({p.unit})</th>
              <th className="min-w-52 px-3 py-2 font-medium">Batch No.{p.trackBatch ? " *" : ""}</th>
              <th className="px-3 py-2 font-medium">Mfg Date</th>
              <th className="px-3 py-2 font-medium">Expiry Date{p.trackBatch ? " *" : ""}</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => {
              const err = rowErrors[i];
              const msg = err && (!err.required || submitted) ? err.msg : null;
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
                        placeholder={p.trackBatch ? "Select or add batch" : "Optional"}
                        onAddMultiple={() => startMulti(b.key)}
                        onChange={(pick: BatchPick) =>
                          set(b.key, pick.existing ? { batchNo: pick.batchNo, mfgDate: pick.mfgDate ?? "", expiryDate: pick.expiryDate ?? "" } : { batchNo: pick.batchNo })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <DateInput max={today()} value={b.mfgDate} onChange={(e) => set(b.key, { mfgDate: e.target.value })} aria-label={`Batch ${i + 1} Mfg date`} />
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
                      <button
                        type="button"
                        onClick={() => remove(b.key)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove batch ${i + 1}`}
                      >
                        <X className="size-4" />
                      </button>
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
      {multi ? (
        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">Add multiple batches · one batch number per unit</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={`Quantity (${p.unit})`} required hint="One box below for each unit">
              <Input type="number" min="2" step="1" inputMode="numeric" value={multi.count} onChange={(e) => setCount(e.target.value)} className="num text-right" aria-label="Number of batches" />
            </Field>
            <Field label="Mfg Date">
              <DateInput max={today()} value={multi.mfgDate} onChange={(e) => setMulti({ ...multi, mfgDate: e.target.value })} aria-label="Mfg date for all" />
            </Field>
            <Field label="Expiry Date" required={p.trackBatch}>
              <DateInput value={multi.expiryDate} min={multi.mfgDate || undefined} onChange={(e) => setMulti({ ...multi, expiryDate: e.target.value })} aria-label="Expiry date for all" />
            </Field>
          </div>
          {multi.numbers.length > 0 && (
            <>
              <div className="mb-1 mt-3 flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">Batch Numbers</span>
                <span className="num text-xs text-slate-500">
                  {multi.numbers.filter((x) => x.trim()).length} of {multi.numbers.length} entered
                </span>
              </div>
              <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {multi.numbers.map((no, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="num w-7 shrink-0 text-right text-xs text-slate-400">{i + 1}.</span>
                    <Input
                      value={no}
                      onChange={(e) => setNumber(i, e.target.value)}
                      onPaste={(e) => {
                        if (pasteNumbers(i, e.clipboardData.getData("text"))) e.preventDefault();
                      }}
                      onKeyDown={(e) => {
                        // Scanners end each code with Enter: move on to the next box
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        document.querySelector<HTMLInputElement>(`input[aria-label="Batch number ${i + 2}"]`)?.focus();
                      }}
                      className="font-mono"
                      placeholder="Batch no."
                      data-scan-input
                      aria-label={`Batch number ${i + 1}`}
                      autoFocus={i === 0}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
          {multiError && <p className="mt-1 text-xs font-medium text-red-600">{multiError}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={createMulti}>
              Create batches
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMulti(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus className="size-4" /> Add batch
          </button>
          <button
            type="button"
            onClick={() => startMulti(null)}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus className="size-4" /> Add multiple batches
          </button>
        </div>
      )}
    </Modal>
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
