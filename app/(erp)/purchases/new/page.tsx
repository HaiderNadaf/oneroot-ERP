"use client";

import { AlertTriangle, ArrowLeft, PackagePlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BranchBadge, useNeedBranch } from "@/components/BranchNotice";
// Payment now (hidden for now): import { CASH_MODES, modeLabel } from "@/components/PartyPaymentForm";
import { ProductPicker, VendorPicker } from "@/components/pickers";
import {
  // Notes (hidden for now)
  Th,
  // Textarea,
  Button,
  Card,
  Checkbox,
  DateInput,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { daysUntil, inr, n, qty, round2, today } from "@/lib/format";
import { GST_RATES, /* type PaymentMode, */ type Product, type Purchase, type Vendor } from "@/lib/types";

type LineProduct = Pick<Product, "id" | "name" | "sku" | "unit" | "trackBatch">;

interface Line {
  key: number;
  product: LineProduct;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
  quantity: string;
  freeQty: string;
  rate: string;
  discountPct: string;
  gstRate: string;
  mrp: string;
  salePrice: string;
}

/** Same math as the backend's calcPurchaseItem */
function calcLine(l: Line) {
  const gross = (Number(l.quantity) || 0) * (Number(l.rate) || 0);
  const taxableAmount = round2(gross * (1 - (Number(l.discountPct) || 0) / 100));
  const taxAmount = round2((taxableAmount * (Number(l.gstRate) || 0)) / 100);
  return { taxableAmount, taxAmount, amount: round2(taxableAmount + taxAmount) };
}

function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return today(d);
}

const numStr = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(n(v)));

let lineSeq = 0;

export default function NewPurchasePage() {
  return (
    <RequirePerm perms={["purchases.manage"]}>
      <NewPurchase />
    </RequirePerm>
  );
}

function NewPurchase() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const presetVendorId = params.get("vendorId");

  const [vendor, setVendorState] = useState<Vendor | null>(null);
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [dueTouched, setDueTouched] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [updatePrices, setUpdatePrices] = useState(true);
  // Payment now and Notes are hidden for now: the purchase is saved on credit (the vendor is paid later from Payments)
  // const [paidAmount, setPaidAmount] = useState("");
  // const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
  // const [paymentReference, setPaymentReference] = useState("");
  // const [notes, setNotes] = useState("");
  const [preloading, setPreloading] = useState(!!presetVendorId);
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needBranch = useNeedBranch("receive the goods into it");
  const pickerRef = useRef<HTMLInputElement>(null);

  const setVendor = (v: Vendor | null, date = purchaseDate) => {
    setVendorState(v);
    if (v && !dueTouched) setDueDate(addDays(date, v.paymentTermsDays ?? 0));
  };

  const changePurchaseDate = (d: string) => {
    setPurchaseDate(d);
    if (!dueTouched && d) setDueDate(addDays(d, vendor?.paymentTermsDays ?? 0));
  };

  // Preselect the vendor (?vendorId=)
  useEffect(() => {
    if (!presetVendorId) return;
    let cancelled = false;
    api
      .get<Vendor>(`/vendors/${presetVendorId}`)
      .then((v) => {
        if (cancelled) return;
        setVendorState(v);
        setDueDate(addDays(today(), v.paymentTermsDays ?? 0));
      })
      .catch((e) => !cancelled && setPreloadError(errMsg(e)))
      .finally(() => !cancelled && setPreloading(false));
    return () => {
      cancelled = true;
    };
  }, [presetVendorId]);

  function addProduct(p: Product) {
    setLines((ls) => [
      ...ls,
      {
        key: ++lineSeq,
        product: { id: p.id, name: p.name, sku: p.sku, unit: p.unit, trackBatch: p.trackBatch },
        batchNo: "",
        mfgDate: "",
        expiryDate: "",
        quantity: "1",
        freeQty: "",
        rate: n(p.purchasePrice) ? numStr(p.purchasePrice) : "",
        discountPct: "",
        gstRate: numStr(p.gstRate),
        mrp: n(p.mrp) ? numStr(p.mrp) : "",
        salePrice: n(p.salePrice) ? numStr(p.salePrice) : "",
      },
    ]);
  }

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));

  // Totals, rounded exactly like the backend
  const calcs = lines.map(calcLine);
  const subtotal = round2(calcs.reduce((s, c) => s + c.taxableAmount, 0));
  const taxAmount = round2(calcs.reduce((s, c) => s + c.taxAmount, 0));
  const disc = Number(discount) || 0;
  const other = Number(otherCharges) || 0;
  const raw = subtotal + taxAmount - disc + other;
  const total = Math.round(raw);
  const roundOff = round2(total - raw);
  // const paid = Number(paidAmount) || 0;
  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0) + (Number(l.freeQty) || 0), 0);

  async function submit() {
    if (needBranch.blocked) return toast.error("Pick a branch in the top bar to receive the goods into");
    if (!vendor) return toast.error("Choose the vendor");
    if (!lines.length) return toast.error("Add at least one product");
    for (const l of lines) {
      if (!(Number(l.quantity) > 0)) return toast.error(`Enter a quantity for ${l.product.name}`);
      if (l.rate === "" || Number(l.rate) < 0) return toast.error(`Enter the purchase rate for ${l.product.name}`);
      if (l.product.trackBatch && !l.batchNo.trim()) return toast.error(`Batch number is required for ${l.product.name}`);
      if (l.mfgDate && l.expiryDate && l.expiryDate < l.mfgDate)
        return toast.error(`Expiry date is before the manufacturing date for ${l.product.name}`);
    }
    if (total < 0) return toast.error("Bill discount is more than the bill value");
    // if (paid > total) return toast.error(`Amount paid can't exceed the bill total ${inr(total)}`);

    const warnings: string[] = [];
    const noExpiry = lines.filter((l) => l.product.trackBatch && !l.expiryDate).map((l) => l.product.name);
    if (noExpiry.length) warnings.push(`No expiry date for: ${noExpiry.join(", ")}.`);
    const expired = lines.filter((l) => l.expiryDate && l.expiryDate < today()).map((l) => l.product.name);
    if (expired.length) warnings.push(`Already expired: ${expired.join(", ")}.`);
    if (warnings.length && !(await confirm(`${warnings.join(" ")} Save the bill anyway?`, { confirmLabel: "Save Anyway" }))) return;

    setSaving(true);
    try {
      const body = {
        vendorId: vendor.id,
        vendorInvoiceNo: vendorInvoiceNo.trim() || undefined,
        purchaseDate,
        dueDate: dueDate || undefined,
        items: lines.map((l) => ({
          productId: l.product.id,
          batchNo: l.batchNo.trim() || undefined,
          mfgDate: l.mfgDate || undefined,
          expiryDate: l.expiryDate || undefined,
          quantity: Number(l.quantity),
          freeQty: Number(l.freeQty) || undefined,
          rate: Number(l.rate) || 0,
          mrp: l.mrp === "" ? undefined : Number(l.mrp),
          discountPct: Number(l.discountPct) || undefined,
          gstRate: l.gstRate === "" ? undefined : Number(l.gstRate),
          salePrice: l.salePrice === "" ? undefined : Number(l.salePrice),
        })),
        discount: disc || undefined,
        otherCharges: other || undefined,
        // paidAmount: paid || undefined,
        // paymentMode: paid ? paymentMode : undefined,
        // paymentReference: paid ? paymentReference.trim() || undefined : undefined,
        updateProductPrices: updatePrices,
        // notes: notes.trim() || undefined,
      };
      const saved = await api.post<Purchase>("/purchases", body);
      toast.success(`Purchase ${saved.purchaseNo} saved · stock updated`);
      router.push(`/purchases/${saved.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

  if (preloading) return <Spinner page />;

  return (
    <>
      <div className="mb-2">
        <Link href="/purchases" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Purchase Invoices
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Direct Purchase <BranchBadge label="Stock Goes To" />
          </span>
        }
        subtitle="Quick buy without a purchase order — the bill is recorded and the goods go into stock immediately"
      />

      {needBranch.notice && <div className="mb-4">{needBranch.notice}</div>}

      <p className="-mt-3 mb-4 text-xs text-slate-500">
        Goods ordered on a purchase order are received through{" "}
        <Link href="/goods-inward" className="font-medium text-brand-700 hover:underline">
          Goods Inward
        </Link>{" "}
        instead, and the vendor&apos;s bill is booked against the GRN.
      </p>

      {preloadError && (
        <div className="mb-4">
          <ErrorBox message={preloadError} />
        </div>
      )}

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Vendor" required className="sm:col-span-2">
            <VendorPicker value={vendor} onChange={(v) => setVendor(v)} autoFocus={!vendor} />
          </Field>
          <Field label="Vendor Invoice No.">
            <Input value={vendorInvoiceNo} onChange={(e) => setVendorInvoiceNo(e.target.value)} placeholder="As printed on their bill" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bill Date" required>
              <DateInput value={purchaseDate} max={today()} onChange={(e) => changePurchaseDate(e.target.value)} required />
            </Field>
            <Field label="Due Date" hint={vendor ? `${vendor.paymentTermsDays ?? 0} days terms` : undefined}>
              <DateInput
                value={dueDate}
                min={purchaseDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  setDueTouched(true);
                }}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        className="mb-4"
        bodyClassName="p-0"
        title={`Items${lines.length ? ` (${lines.length})` : ""}`}
        actions={
          lines.length ? (
            <span className="text-xs text-slate-500">
              Total qty received: <span className="num font-medium text-slate-700">{qty(totalQty)}</span>
            </span>
          ) : undefined
        }
      >
        <div className="border-b border-slate-100 p-3">
          <ProductPicker onPick={addProduct} inputRef={pickerRef} autoFocus={!!vendor && !lines.length} />
        </div>
        <Table>
          <thead>
            <tr>
              <Th className="min-w-44 sm:min-w-52">Product</Th>
              <Th className="min-w-32">Batch</Th>
              <Th className="min-w-40">Mfg</Th>
              <Th className="min-w-40">Expiry</Th>
              <Th right>Qty</Th>
              <Th right>Free</Th>
              <Th right>Rate</Th>
              <Th right>Disc %</Th>
              <Th right>GST %</Th>
              <Th right>MRP</Th>
              <Th right>New Sale Price</Th>
              <Th right>Taxable</Th>
              <Th right>Tax</Th>
              <Th right>Amount</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-3 py-12 text-center text-sm text-slate-400">
                  <PackagePlus className="mx-auto mb-2 size-7 text-slate-300" />
                  Search above to add products from the vendor&apos;s bill
                </td>
              </tr>
            ) : (
              lines.map((l, i) => {
                const c = calcs[i];
                const days = l.expiryDate ? daysUntil(l.expiryDate) : null;
                const cell = "h-8 px-2 text-sm";
                const numCell = `${cell} num text-right`;
                return (
                  <tr key={l.key} className="align-top">
                    <Td>
                      <p className="font-medium text-slate-900">{l.product.name}</p>
                      <p className="text-xs text-slate-500">
                        {l.product.sku} · {l.product.unit}
                      </p>
                    </Td>
                    <Td>
                      <Input
                        className={cx(cell, "w-32", l.product.trackBatch && !l.batchNo.trim() && "border-amber-400")}
                        value={l.batchNo}
                        onChange={(e) => update(l.key, { batchNo: e.target.value })}
                        placeholder={l.product.trackBatch ? "Required" : "Optional"}
                        aria-label="Batch number"
                      />
                    </Td>
                    <Td>
                      <DateInput
                        className={cx(cell, "w-38")}
                        value={l.mfgDate}
                        max={today()}
                        onChange={(e) => update(l.key, { mfgDate: e.target.value })}
                        aria-label="Manufacturing date"
                      />
                    </Td>
                    <Td>
                      <DateInput
                        className={cx(
                          cell,
                          "w-38",
                          l.product.trackBatch && !l.expiryDate && "border-amber-400",
                          days !== null && days < 0 && "border-red-400 text-red-700",
                        )}
                        value={l.expiryDate}
                        min={l.mfgDate || undefined}
                        onChange={(e) => update(l.key, { expiryDate: e.target.value })}
                        aria-label="Expiry date"
                      />
                      {days !== null && days < 0 && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600">
                          <AlertTriangle className="size-3" /> Expired
                        </p>
                      )}
                      {days !== null && days >= 0 && days <= 90 && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="size-3" /> Expires in {days} day{days === 1 ? "" : "s"}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className={cx(numCell, "w-28")}
                        value={l.quantity}
                        onChange={(e) => update(l.key, { quantity: e.target.value })}
                        aria-label="Quantity"
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className={cx(numCell, "w-20")}
                        value={l.freeQty}
                        onChange={(e) => update(l.key, { freeQty: e.target.value })}
                        aria-label="Free quantity"
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className={cx(numCell, "w-28")}
                        value={l.rate}
                        onChange={(e) => update(l.key, { rate: e.target.value })}
                        aria-label="Rate excluding GST"
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        className={cx(numCell, "w-20")}
                        value={l.discountPct}
                        onChange={(e) => update(l.key, { discountPct: e.target.value })}
                        aria-label="Discount percent"
                      />
                    </Td>
                    <Td>
                      <Select
                        className={cx(cell, "w-24 pr-7")}
                        value={l.gstRate}
                        onChange={(e) => update(l.key, { gstRate: e.target.value })}
                        aria-label="GST rate"
                      >
                        {[...new Set([...GST_RATES, Number(l.gstRate) || 0])].map((r) => (
                          <option key={r} value={String(r)}>
                            {r}%
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className={cx(numCell, "w-28")}
                        value={l.mrp}
                        onChange={(e) => update(l.key, { mrp: e.target.value })}
                        aria-label="MRP"
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className={cx(numCell, "w-28")}
                        value={l.salePrice}
                        onChange={(e) => update(l.key, { salePrice: e.target.value })}
                        aria-label="New selling price"
                        disabled={!updatePrices}
                        title={updatePrices ? undefined : "Turn on “Update product prices” to change selling price"}
                      />
                    </Td>
                    <Td right className="pt-3.5">
                      {inr(c.taxableAmount)}
                    </Td>
                    <Td right className="pt-3.5 text-slate-500">
                      {inr(c.taxAmount)}
                    </Td>
                    <Td right className="pt-3.5 font-medium text-slate-900">
                      {inr(c.amount)}
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        className="mt-1 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:p-1"
                        aria-label={`Remove ${l.product.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-3 py-2.5">
          <Checkbox label="Update product prices (purchase rate, MRP, selling price)" checked={updatePrices} onChange={setUpdatePrices} />
          <span className="text-xs text-slate-500">Rates are per unit, excluding GST. Free quantity is added to stock at no cost.</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Payment now and Notes — hidden for now; the purchase is saved on credit
        <Card title="Payment Now" className="lg:col-span-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount Paid (₹)" className="col-span-2" hint={paid > 0 && paid < total ? `${inr(total - paid)} will stay payable` : undefined}>
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

        <Card title="Notes" className="lg:col-span-1">
          <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Transport, LR no., remarks…" />
        </Card>

        */}

        <Card title="Bill Total" className="lg:col-span-1 lg:col-start-3">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Taxable value</dt>
              <dd className="num">{inr(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">GST</dt>
              <dd className="num">{inr(taxAmount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Bill discount (₹)</dt>
              <dd>
                <Input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="num h-8 w-28 text-right" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Freight / loading (₹)</dt>
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
              <dd className="num">{roundOff >= 0 ? "+" : "−"}{inr(Math.abs(roundOff))}</dd>
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
          <Button className="mt-4 w-full" onClick={submit} loading={saving} disabled={!vendor || !lines.length || needBranch.blocked}>
            Save Purchase · {inr(total)}
          </Button>
        </Card>
      </div>
    </>
  );
}
