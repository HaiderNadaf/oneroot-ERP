"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { useCounts } from "@/components/Notifications";
// Payment now (hidden for now): import { CASH_MODES, modeLabel } from "@/components/PartyPaymentForm";
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Info,
  Input,
  PageHeader,
  // Select, // Payment mode (hidden for now)
  Spinner,
  Table,
  Td,
  // Textarea, // Notes (hidden for now)
  Th,
  cx,
  errMsg,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { placeOfSupply } from "@/lib/gst";
import { date, inr, n, qty, round2, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Grn, GrnItem, /* PaymentMode, */ Purchase, StoreSettings, Vendor } from "@/lib/types";

type GrnDetail = Grn & { vendor: Vendor; items: GrnItem[] };

interface Line {
  rate: string;
  discountPct: string;
}

/** Same maths as the backend's calcPurchaseItem */
function calc(quantity: number, rate: number, discountPct: number, gstRate: number) {
  const taxableAmount = round2(quantity * rate * (1 - discountPct / 100));
  const taxAmount = round2((taxableAmount * gstRate) / 100);
  return { taxableAmount, taxAmount, amount: round2(taxableAmount + taxAmount) };
}

function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return today(d);
}

export default function BookInvoicePage() {
  return (
    <RequirePerm perms={["purchases.view"]}>
      <BookInvoice />
    </RequirePerm>
  );
}

function BookInvoice() {
  const { id } = useParams<{ id: string }>();
  const { data: grn, error, loading, reload } = useApi<GrnDetail>(`/grns/${id}`);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !grn) return <Spinner page />;

  const back = (
    <div className="mb-2">
      <Link href={`/goods-inward/${grn.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> {grn.grnNo}
      </Link>
    </div>
  );
  if (grn.purchase && grn.purchase.status !== "CANCELLED") {
    return (
      <>
        {back}
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
          {grn.grnNo} is already invoiced as{" "}
          <Link href={`/purchases/${grn.purchase.id}`} className="font-medium underline">
            {grn.purchase.purchaseNo}
          </Link>
          .
        </div>
      </>
    );
  }
  if (!grn.items.some((i) => n(i.passedQty) > 0)) {
    return (
      <>
        {back}
        <ErrorBox message="Nothing passed inspection on this GRN, so there is nothing to invoice." />
      </>
    );
  }
  return (
    <>
      {back}
      <InvoiceForm grn={grn} />
    </>
  );
}

function InvoiceForm({ grn }: { grn: GrnDetail }) {
  const router = useRouter();
  const toast = useToast();
  const counts = useCounts();
  const { data: store } = useApi<StoreSettings>("/settings");
  const v = grn.vendor;
  const items = grn.items.filter((i) => n(i.passedQty) > 0);

  // Starts from the supplier invoice no. noted at goods inward
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState(grn.supplierInvoiceNo ?? "");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState(addDays(today(), v.paymentTermsDays ?? 0));
  const [dueTouched, setDueTouched] = useState(false);
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    // Start from the PO's rate and discount on each line
    Object.fromEntries(items.map((i) => [i.id, { rate: String(n(i.rate)), discountPct: n(i.poItem.discountPct) ? String(n(i.poItem.discountPct)) : "" }])),
  );
  const [discount, setDiscount] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  // Payment now and Notes are hidden for now: the invoice is booked on credit (the vendor is paid later from Payments)
  // const [paidAmount, setPaidAmount] = useState("");
  // const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  // const [paymentReference, setPaymentReference] = useState("");
  // const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...patch } }));
  const changeInvoiceDate = (d: string) => {
    setInvoiceDate(d);
    if (!dueTouched && d) setDueDate(addDays(d, v.paymentTermsDays ?? 0));
  };

  const interState = placeOfSupply(v, store).interState === true;

  const rows = items.map((i) => {
    const l = lines[i.id];
    const rate = Number(l.rate) || 0;
    const disc = Number(l.discountPct) || 0;
    const gst = n(i.poItem.gstRate);
    const mismatch = l.rate !== "" && Math.abs(rate - n(i.rate)) > 0.004;
    const badRate = l.rate === "" || Number(l.rate) < 0 || Number.isNaN(Number(l.rate));
    const badDisc = disc < 0 || disc > 100;
    return { i, l, rate, disc, gst, mismatch, badRate, badDisc, ...calc(n(i.passedQty), rate, disc, gst) };
  });
  const mismatches = rows.filter((r) => r.mismatch).length;
  const subtotal = round2(rows.reduce((s, r) => s + r.taxableAmount, 0));
  const taxAmount = round2(rows.reduce((s, r) => s + r.taxAmount, 0));
  const disc = Number(discount) || 0;
  const other = Number(otherCharges) || 0;
  const raw = subtotal + taxAmount - disc + other;
  const total = Math.round(raw);
  const roundOff = round2(total - raw);
  // const paid = Number(paidAmount) || 0;

  async function submit() {
    setSubmitted(true);
    if (!vendorInvoiceNo.trim()) return toast.error("Enter the vendor's invoice number");
    if (!invoiceDate) return toast.error("Enter the invoice date");
    if (dueDate && dueDate < invoiceDate) return toast.error("Due date can't be before the invoice date");
    const bad = rows.find((r) => r.badRate || r.badDisc);
    if (bad) return toast.error(`${bad.i.product.name}: ${bad.badRate ? "enter a valid invoice rate" : "discount must be 0–100%"}`);
    if (disc < 0 || other < 0) return toast.error("Discount and charges can't be negative");
    if (total < 0) return toast.error("Bill discount is more than the invoice value");
    // if (paid < 0) return toast.error("Amount paid can't be negative");
    // if (paid > total) return toast.error(`Amount paid can't exceed the invoice total ${inr(total)}`);

    setSaving(true);
    try {
      const purchase = await api.post<Purchase>(`/grns/${grn.id}/invoice`, {
        vendorInvoiceNo: vendorInvoiceNo.trim(),
        invoiceDate,
        dueDate: dueDate || undefined,
        items: rows.map((r) => ({ grnItemId: r.i.id, rate: r.rate, discountPct: r.disc || undefined })),
        discount: disc || undefined,
        otherCharges: other || undefined,
        // paidAmount: paid || undefined,
        // paymentMode: paid ? paymentMode : undefined,
        // paymentReference: paid ? paymentReference.trim() || undefined : undefined,
        // notes: notes.trim() || undefined,
      });
      toast.success(`Invoice ${purchase.purchaseNo} booked${purchase.rateMismatch ? " · rate difference flagged to the manager" : ""}`);
      counts.refresh();
      router.push(`/purchases/${purchase.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Book purchase invoice" subtitle={`Vendor's bill for the goods passed on ${grn.grnNo}`} />

      <Card className="mb-4">
        <dl className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Vendor">
            <Link href={`/vendors/${v.id}`} className="hover:text-brand-700">
              {v.name}
            </Link>
          </Info>
          <Info label="GRN">
            <Link href={`/goods-inward/${grn.id}`} className="text-brand-700 hover:underline">
              {grn.grnNo}
            </Link>
            <span className="font-normal text-slate-500"> · {date(grn.receivedAt)}</span>
          </Info>
          <Info label="Purchase order">
            <Link href={`/purchase-orders/${grn.po.id}`} className="text-brand-700 hover:underline">
              {grn.po.poNo}
            </Link>
          </Info>
          <Info label="Tax type">
            {interState ? "IGST (inter-state)" : "CGST + SGST (intra-state)"}
          </Info>
        </dl>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Vendor invoice no." required>
            <Input
              value={vendorInvoiceNo}
              onChange={(e) => setVendorInvoiceNo(e.target.value)}
              placeholder="As printed on their bill"
              className={cx(submitted && !vendorInvoiceNo.trim() && "border-red-400")}
              autoFocus
            />
            {submitted && !vendorInvoiceNo.trim() && <span className="mt-1 block text-xs text-red-600">Required</span>}
          </Field>
          <Field label="Invoice date" required>
            <Input type="date" value={invoiceDate} max={today()} onChange={(e) => changeInvoiceDate(e.target.value)} />
          </Field>
          <Field label="Due date" hint={`${v.paymentTermsDays ?? 0} days credit terms`}>
            <Input
              type="date"
              value={dueDate}
              min={invoiceDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDueTouched(true);
              }}
            />
          </Field>
        </div>
      </Card>

      <Card className="mb-4" bodyClassName="p-0" title="Three-way match · PO rate vs GRN passed qty vs invoice rate">
        <Table>
          <thead>
            <tr>
              <Th className="min-w-52">Product</Th>
              <Th right>Qty passed</Th>
              <Th right>PO rate</Th>
              <Th right>Invoice rate</Th>
              <Th right>Disc %</Th>
              <Th right>GST %</Th>
              <Th right>Taxable</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.i.id} className={cx("align-top", r.mismatch && "bg-amber-50/40")}>
                <Td>
                  <p className="font-medium text-slate-900">{r.i.product.name}</p>
                  <p className="text-xs text-slate-500">
                    {r.i.product.sku}
                    {r.i.product.hsnCode ? ` · HSN ${r.i.product.hsnCode}` : ""}
                    {r.i.batchNo ? ` · batch ${r.i.batchNo}` : ""}
                  </p>
                </Td>
                <Td right className="pt-3.5">
                  {qty(r.i.passedQty)} <span className="text-xs text-slate-500">{r.i.product.unit}</span>
                </Td>
                <Td right className="pt-3.5 text-slate-600">
                  {inr(r.i.rate)}
                </Td>
                <Td right>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className={cx(
                      "num w-28 text-right",
                      r.mismatch && "border-amber-400 bg-amber-50 text-amber-800",
                      r.badRate && submitted && "border-red-400",
                    )}
                    value={r.l.rate}
                    onChange={(e) => update(r.i.id, { rate: e.target.value })}
                    aria-label={`Invoice rate for ${r.i.product.name}`}
                  />
                  {r.mismatch && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {r.rate > n(r.i.rate) ? "+" : "−"}
                      {inr(Math.abs(r.rate - n(r.i.rate)))} vs PO
                    </p>
                  )}
                </Td>
                <Td right>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className={cx("num w-20 text-right", r.badDisc && "border-red-400")}
                    value={r.l.discountPct}
                    placeholder="0"
                    onChange={(e) => update(r.i.id, { discountPct: e.target.value })}
                    aria-label={`Discount percent for ${r.i.product.name}`}
                  />
                </Td>
                <Td right className="pt-3.5 text-slate-500">
                  {r.gst}%
                </Td>
                <Td right className="pt-3.5">
                  {inr(r.taxableAmount)}
                </Td>
                <Td right className="pt-3.5 font-medium text-slate-900">
                  {inr(r.amount)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="border-t border-slate-100 p-3">
          {mismatches === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
              <CheckCircle2 className="size-4 shrink-0" /> Rates and quantities match the PO and GRN
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="size-4 shrink-0" /> {mismatches} rate{mismatches === 1 ? "" : "s"} differ
              {mismatches === 1 ? "s" : ""} from the PO — saving flags this invoice and alerts the manager
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Payment now and Notes — hidden for now; the invoice is booked on credit
        <Card title="Payment now">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount paid (₹)" className="col-span-2" hint={paid > 0 && paid < total ? `${inr(total - paid)} will stay payable` : undefined}>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0 — on credit"
                  className={paid > total ? "border-red-400" : undefined}
                />
                <Button variant="secondary" onClick={() => setPaidAmount(String(Math.max(total, 0)))} disabled={total <= 0}>
                  Full
                </Button>
              </div>
            </Field>
            <Field label="Mode">
              <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)} disabled={!paid}>
                {CASH_MODES.map((m) => (
                  <option key={m} value={m}>
                    {modeLabel(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference">
              <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} disabled={!paid} placeholder="UTR / cheque no." />
            </Field>
          </div>
        </Card>

        <Card title="Notes">
          <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remarks about this bill…" />
        </Card>

        */}

        <Card title="Invoice total" className="lg:col-start-3">
          <dl className="space-y-2 text-sm">
            <SumRow label="Taxable value" value={inr(subtotal)} />
            {interState ? (
              <SumRow label="IGST" value={inr(taxAmount)} />
            ) : (
              <>
                <SumRow label="CGST" value={inr(round2(taxAmount / 2))} />
                <SumRow label="SGST" value={inr(round2(taxAmount - round2(taxAmount / 2)))} />
              </>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Bill discount (₹)</dt>
              <dd>
                <Input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="num h-8 w-28 text-right" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Freight / other charges (₹)</dt>
              <dd>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(e.target.value)}
                  className="num h-8 w-28 text-right"
                />
              </dd>
            </div>
            <div className="flex justify-between text-xs">
              <dt className="text-slate-500">Round off</dt>
              <dd className="num">
                {roundOff >= 0 ? "+" : "−"}
                {inr(Math.abs(roundOff))}
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <dt>Total</dt>
              <dd className="num">{inr(total)}</dd>
            </div>
            {/* Balance payable (only with Payment now)
            {paid > 0 && (
              <div className="flex justify-between text-sm">
                <dt className="text-slate-500">Balance payable</dt>
                <dd className="num font-medium text-amber-700">{inr(Math.max(total - paid, 0))}</dd>
              </div>
            )} */}
          </dl>
          <Button className="mt-4 w-full" icon={<FileText className="size-4" />} onClick={submit} loading={saving}>
            Book invoice · {inr(total)}
          </Button>
        </Card>
      </div>
    </>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}
