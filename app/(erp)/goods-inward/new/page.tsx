"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, Info as InfoIcon, PackageCheck, ScanLine, Store } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RequireRole } from "@/components/AppShell";
import { useCounts } from "@/components/Notifications";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Field,
  Info,
  Input,
  PageHeader,
  Spinner,
  Textarea,
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

interface Line {
  passed: string;
  rejected: string;
  damaged: string;
  expired: string;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
}

const QTY_FIELDS = [
  { key: "passed", label: "Passed", hint: "Into sellable stock", tone: "text-brand-700" },
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
  return { pending, total, errors };
}

export default function NewGrnPage() {
  return (
    <RequireRole roles={["MANAGER"]}>
      <NewGrn />
    </RequireRole>
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
  if (loading || !po) return <Spinner />;
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
  const [receivedAt, setReceivedAt] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(
      items.map((i) => [
        i.id,
        { passed: String(pendingOf(i)), rejected: "", damaged: "", expired: "", batchNo: "", mfgDate: "", expiryDate: "" },
      ]),
    ),
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);
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
  });
  // Goods are received into the branch the PO delivers to; with another branch selected the API refuses
  const poBranchId = po.branchId ?? po.branch?.id ?? null;
  const wrongBranch = !!poBranchId && currentId !== "all" && currentId !== poBranchId;
  const canSwitch = !locked && branches.some((b) => b.id === poBranchId);

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));
  const open = items.filter((i) => pendingOf(i) > 0);
  const checks = new Map(open.map((i) => [i.id, check(i, lines[i.id])]));

  const sum = (k: keyof Line) => r3(open.reduce((s, i) => s + num(lines[i.id][k]), 0));
  const totals = { passed: sum("passed"), rejected: sum("rejected"), damaged: sum("damaged"), expired: sum("expired") };
  const passedValue = round2(open.reduce((s, i) => s + num(lines[i.id].passed) * n(i.rate), 0));
  const anyQty = open.some((i) => (checks.get(i.id)?.total ?? 0) > 0);
  const shortLines = open.filter((i) => {
    const c = checks.get(i.id);
    return c && c.total < c.pending;
  });

  async function submit() {
    if (wrongBranch) return toast.error(`This PO is delivered to ${po.branch?.name ?? "another branch"} — switch to that branch to receive it`);
    setSubmitted(true);
    if (!receivedAt) return toast.error("Enter the received date");
    if (receivedAt > today()) return toast.error("Received date can't be in the future");
    if (!anyQty) return toast.error("Enter at least one received quantity");
    for (const i of open) {
      const errs = Object.values(checks.get(i.id)?.errors ?? {});
      if (errs.length) return toast.error(`${i.product.name}: ${errs[0]!.msg}`);
    }

    const parts = [`${qty(totals.passed)} into stock`];
    if (totals.rejected) parts.push(`${qty(totals.rejected)} rejected (a debit note will be drafted to ${po.vendor?.name ?? "the vendor"})`);
    if (totals.damaged) parts.push(`${qty(totals.damaged)} written off as damaged`);
    if (totals.expired) parts.push(`${qty(totals.expired)} expired, kept out of stock`);
    const balance = shortLines.length
      ? ` ${shortLines.length} line${shortLines.length === 1 ? "" : "s"} will stay open for the balance.`
      : " The PO will be marked fully received.";
    if (!(await confirm(`Post goods inward for ${po.poNo}? ${parts.join(", ")}.${balance}`, { confirmLabel: "Post GRN" }))) return;

    setSaving(true);
    try {
      const grn = await api.post<Grn>(`/purchase-orders/${po.id}/grn`, {
        vehicleNo: vehicleNo.trim() || undefined,
        receivedAt,
        notes: notes.trim() || undefined,
        items: open.map((i) => {
          const l = lines[i.id];
          return {
            poItemId: i.id,
            passedQty: num(l.passed),
            rejectedQty: num(l.rejected),
            damagedQty: num(l.damaged),
            expiredQty: num(l.expired),
            batchNo: l.batchNo.trim() || undefined,
            mfgDate: l.mfgDate || undefined,
            expiryDate: l.expiryDate || undefined,
          };
        }),
      });
      toast.success(`${grn.grnNo} posted · stock updated${totals.rejected > 0 ? " · debit note drafted" : ""}`);
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
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
        <dl className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Purchase order">
            <Link href={`/purchase-orders/${po.id}`} className="text-brand-700 hover:underline">
              {po.poNo}
            </Link>
          </Info>
          <Info label="Vendor">{po.vendor?.name}</Info>
          <Info label="Ordered">
            {date(po.orderDate)}
            {po.expectedDate && <span className="font-normal text-slate-500"> · expected {date(po.expectedDate)}</span>}
          </Info>
          <Info label="Received so far">{po.receivedPct}%</Info>
        </dl>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Vehicle no.">
            <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} placeholder="KA 01 AB 1234" />
          </Field>
          <Field label="Received date" required>
            <Input type="date" value={receivedAt} max={today()} onChange={(e) => setReceivedAt(e.target.value)} />
          </Field>
          <Field label="Received by">
            <Input value={user?.name ?? ""} readOnly disabled />
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="LR no., transporter, condition on arrival…" />
          </Field>
        </div>
      </Card>

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          Count every item and split it: <b>Passed</b> goes into sellable stock · <b>Rejected</b> is returned and a debit note is drafted to
          the vendor · <b>Damaged</b> is written off · <b>Expired</b> is kept out of stock. Anything not counted stays open on the PO for a
          later delivery.
          <span className="mt-1 flex items-center gap-1 text-xs text-sky-700">
            <ScanLine className="size-3.5" /> Scan a pack&apos;s barcode to jump to its line and fill the batch details.
          </span>
        </p>
      </div>

      <div className="mb-4 space-y-3">
        {items.map((item) => {
          const pending = pendingOf(item);
          const p = item.product;
          if (pending <= 0) {
            return (
              <Card key={item.id} bodyClassName="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-500">{p.name}</p>
                  <p className="text-xs text-slate-400">
                    {[p.sku, p.packSize, p.unit].filter(Boolean).join(" · ")} · ordered {qty(item.quantity)}
                  </p>
                </div>
                <Badge tone="green">
                  <CheckCircle2 className="mr-1 size-3.5" /> Fully received
                </Badge>
              </Card>
            );
          }
          const l = lines[item.id];
          const c = checks.get(item.id)!;
          const show = (k: keyof Line) => {
            const e = c.errors[k];
            return e && (!e.required || submitted) ? e.msg : null;
          };
          const over = !!c.errors.total;
          return (
            <div key={item.id} id={`grn-line-${item.id}`}>
            <Card className={cx(over && "border-red-300", scanned === item.id && "ring-2 ring-brand-500")}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {[p.sku, p.packSize, `per ${p.unit}`].filter(Boolean).join(" · ")} · PO rate {inr(item.rate)} · ordered {qty(item.quantity)}
                    {p.trackBatch && " · batch tracked"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      "num rounded-full px-2.5 py-0.5 text-xs font-medium",
                      over ? "bg-red-100 text-red-700" : c.total === pending ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {qty(c.total)} of {qty(pending)} pending
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update(item.id, { passed: String(pending), rejected: "", damaged: "", expired: "" })}
                  >
                    All passed
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => update(item.id, { passed: "", rejected: "", damaged: "", expired: "" })}>
                    Not arrived
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {QTY_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label} hint={f.hint}>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      className={cx("num w-full text-right font-medium", f.tone, (over || show(f.key)) && "border-red-400")}
                      value={l[f.key]}
                      placeholder="0"
                      onChange={(e) => update(item.id, { [f.key]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
              {over && (
                <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle className="size-3.5" /> {c.errors.total!.msg}
                </p>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
                <Field label="Batch no." required={p.trackBatch && (num(l.passed) > 0 || num(l.expired) > 0)}>
                  <Input
                    id={`grn-batch-${item.id}`}
                    className={cx(show("batchNo") && "border-red-400")}
                    value={l.batchNo}
                    onChange={(e) => update(item.id, { batchNo: e.target.value })}
                    placeholder={p.trackBatch ? "As printed on the pack" : "Optional"}
                  />
                  <FieldError msg={show("batchNo")} />
                </Field>
                <Field label="Mfg date">
                  <Input
                    type="date"
                    max={today()}
                    className={cx(show("mfgDate") && "border-red-400")}
                    value={l.mfgDate}
                    onChange={(e) => update(item.id, { mfgDate: e.target.value })}
                  />
                  <FieldError msg={show("mfgDate")} />
                </Field>
                <Field label="Expiry date" required={p.trackBatch && num(l.passed) > 0}>
                  <Input
                    type="date"
                    className={cx(show("expiryDate") && "border-red-400")}
                    value={l.expiryDate}
                    min={l.mfgDate || undefined}
                    onChange={(e) => update(item.id, { expiryDate: e.target.value })}
                  />
                  <FieldError msg={show("expiryDate")} />
                </Field>
              </div>
            </Card>
            </div>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
            <Total label="Passed" value={qty(totals.passed)} className="text-brand-700" />
            <Total label="Rejected" value={qty(totals.rejected)} className={totals.rejected ? "text-red-600" : undefined} />
            <Total label="Damaged" value={qty(totals.damaged)} className={totals.damaged ? "text-amber-700" : undefined} />
            <Total label="Expired" value={qty(totals.expired)} className={totals.expired ? "text-amber-700" : undefined} />
            <Total label="Passed value (PO rate)" value={inr(passedValue)} />
          </dl>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/goods-inward")}>
              Cancel
            </Button>
            <Button icon={<PackageCheck className="size-4" />} onClick={submit} loading={saving} disabled={!anyQty || wrongBranch}>
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
