"use client";

import { FilePlus2, PackageMinus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { date, inr, n, qty, round2, today } from "@/lib/format";
import { useBranch } from "@/lib/branch";
import { useApi } from "@/lib/hooks";
import {
  GST_RATES,
  NOTE_REASON_LABEL,
  type Batch,
  type DebitNote,
  type DebitNoteStatus,
  type Grn,
  type NoteReason,
  type NoteType,
  type Paged,
  type Product,
  type Purchase,
  type PurchaseOrder,
  type Vendor,
} from "@/lib/types";
import { BranchBadge, BranchNotice } from "./BranchNotice";
import { ProductPicker, VendorPicker } from "./pickers";
import { Badge, Button, DateInput, Field, InfinityLoader, Input, Modal, Select, StatusBadge, Table, Td, Th, cx, errMsg, useToast } from "./ui";

// ───────────────────────── Shared note helpers ─────────────────────────

/** Reasons a user can pick when raising a debit note (REJECTED_AT_INWARD is created by goods inward) */
export const DEBIT_REASONS: NoteReason[] = ["RETURN", "RATE_DIFFERENCE", "SHORT_SUPPLY", "DAMAGED_IN_TRANSIT", "OTHER"];
/** Reasons a vendor gives us a credit note for */
export const CREDIT_REASONS: NoteReason[] = ["SCHEME_INCENTIVE", "PRICE_PROTECTION", "CASH_DISCOUNT", "AGAINST_DEBIT_NOTE", "OTHER"];

const REASON_HELP: Record<NoteType, Partial<Record<NoteReason, string>>> = {
  DEBIT: {
    RETURN: "Goods going back to the vendor — stock leaves from the chosen batches when the note is sent.",
    RATE_DIFFERENCE: "The vendor billed a higher rate than agreed — claim the overcharge per unit.",
    SHORT_SUPPLY: "The vendor billed for more than was delivered — claim the missing quantity.",
    DAMAGED_IN_TRANSIT: "Goods arrived damaged and the vendor bears the loss — claim their value.",
    OTHER: "Any other amount you are claiming back from the vendor.",
  },
  CREDIT: {
    SCHEME_INCENTIVE: "A scheme or target incentive the vendor is passing on to you.",
    PRICE_PROTECTION: "The vendor compensates a price drop on stock you already bought.",
    CASH_DISCOUNT: "A discount the vendor gives you for paying early.",
    AGAINST_DEBIT_NOTE: "The vendor's credit note accepting a debit note you raised.",
    OTHER: "Any other credit the vendor has given you.",
  },
};

const REASON_CHIPS: Record<NoteType, Partial<Record<NoteReason, string[]>>> = {
  DEBIT: {
    RETURN: ["Near expiry", "Damaged", "Quality issue", "Excess stock"],
    RATE_DIFFERENCE: ["Billed above PO rate", "Billed above agreed rate"],
    SHORT_SUPPLY: ["Billed quantity not delivered", "Bags short in delivery"],
    DAMAGED_IN_TRANSIT: ["Torn bags", "Leaking containers", "Wet / caked stock"],
    OTHER: ["Freight charged in error", "Duplicate billing"],
  },
  CREDIT: {
    SCHEME_INCENTIVE: ["Kharif scheme incentive", "Rabi scheme incentive", "Target achievement incentive"],
    PRICE_PROTECTION: ["Price drop on stock in hand"],
    CASH_DISCOUNT: ["Early payment discount"],
    AGAINST_DEBIT_NOTE: ["Accepted our debit note"],
    OTHER: ["Rate correction", "Goodwill credit"],
  },
};

const REASON_TONE: Record<NoteReason, "slate" | "green" | "amber" | "red" | "blue" | "violet"> = {
  RETURN: "violet",
  REJECTED_AT_INWARD: "amber",
  RATE_DIFFERENCE: "blue",
  SHORT_SUPPLY: "amber",
  DAMAGED_IN_TRANSIT: "red",
  SCHEME_INCENTIVE: "green",
  PRICE_PROTECTION: "green",
  CASH_DISCOUNT: "green",
  AGAINST_DEBIT_NOTE: "blue",
  OTHER: "slate",
};

export const noteTypeName = (t: NoteType) => (t === "DEBIT" ? "debit note" : "credit note");

/** Action that posts a draft: we send a debit note, we accept a vendor's credit note */
export const postLabel = (t: NoteType) => (t === "DEBIT" ? "Send to vendor" : "Accept & apply");

/** Goods rejected at inward were never billed, so posting their note doesn't change the payable */
/**
 * Whether posting the note changes stock or the vendor balance. Notes goods inward raises on its own (rejected or
 * short-supplied goods) are only a record for the vendor: those goods were never billed.
 */
export const reducesPayable = (d: { reasonType: NoteReason; affectsStock?: boolean; affectsBalance?: boolean }) =>
  d.affectsStock !== undefined || d.affectsBalance !== undefined ? !!(d.affectsStock || d.affectsBalance) : d.reasonType !== "REJECTED_AT_INWARD";

export function ReasonBadge({ reason }: { reason: NoteReason }) {
  return <Badge tone={REASON_TONE[reason] ?? "slate"}>{NOTE_REASON_LABEL[reason] ?? reason}</Badge>;
}

export function NoteTypeBadge({ type }: { type: NoteType }) {
  return <Badge tone={type === "DEBIT" ? "red" : "green"}>{type === "DEBIT" ? "Debit" : "Credit"}</Badge>;
}

/** SENT reads "Sent" for a debit note and "Applied" for a credit note */
export function NoteStatusBadge({ status, type }: { status: DebitNoteStatus; type: NoteType }) {
  if (status === "SENT") return <Badge tone="green">{type === "DEBIT" ? "Sent" : "Applied"}</Badge>;
  return <StatusBadge status={status} />;
}

// ───────────────────────── Form ─────────────────────────

export interface NotePreset {
  vendor?: { id: string; name: string };
  purchase?: { id: string; purchaseNo: string; vendorInvoiceNo?: string | null };
  po?: { id: string; poNo: string };
  grn?: { id: string; grnNo: string };
}

interface ReturnLine {
  key: number;
  product: Product;
  /** null while the product's batches are loading */
  batches: Batch[] | null;
  loadError?: string;
  batchId: string;
  quantity: string;
  rate: string;
  gstRate: string;
}

interface MoneyLine {
  key: number;
  product: { id: string; name: string; unit: string; hsnCode?: string | null } | null;
  description: string;
  quantity: string;
  rate: string;
  gstRate: string;
}

let seq = 0;
const numStr = (v: unknown) => String(n(v));
const blankMoneyLine = (): MoneyLine => ({ key: ++seq, product: null, description: "", quantity: "1", rate: "", gstRate: "0" });

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (note: DebitNote) => void;
  noteType: NoteType;
  preset?: NotePreset;
}

/**
 * Raise a debit note (we claim from the vendor) or record a credit note (the vendor credits us).
 * Both are saved as drafts; posting them reduces the vendor payable (and removes stock for goods returns).
 */
export function NoteForm({ open, ...rest }: Props) {
  if (!open) return null;
  return <NoteFormBody {...rest} />;
}

function NoteFormBody({ onClose, onSaved, noteType, preset }: Omit<Props, "open">) {
  const toast = useToast();
  const isDebit = noteType === "DEBIT";
  const reasons = isDebit ? DEBIT_REASONS : CREDIT_REASONS;
  const [pickedVendor, setPickedVendor] = useState<Vendor | null>(null);
  const vendor = preset?.vendor ?? pickedVendor;
  const [reasonType, setReasonType] = useState<NoteReason>(reasons[0]);
  const [purchaseId, setPurchaseId] = useState(preset?.purchase?.id ?? "");
  const [pickedPoId, setPickedPoId] = useState("");
  const [pickedGrnId, setPickedGrnId] = useState("");
  const [vendorRef, setVendorRef] = useState("");
  const [noteDate, setNoteDate] = useState(today());
  const [reason, setReason] = useState("");
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [moneyLines, setMoneyLines] = useState<MoneyLine[]>(() => [blankMoneyLine()]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const isReturn = isDebit && reasonType === "RETURN";
  // Returned goods leave the stock of one branch — "All branches" can't send stock back
  const { currentId } = useBranch();
  const branchBlocked = isReturn && currentId === "all";
  const rateLabel = reasonType === "RATE_DIFFERENCE" ? "Overcharge per unit (₹)" : "Rate (₹, excl. GST)";

  // The vendor's completed invoices, for "Against invoice"
  const invoices = useApi<Paged<Purchase>>(vendor && !preset?.purchase ? "/purchases" : null, {
    vendorId: vendor?.id,
    status: "COMPLETED",
    pageSize: 100,
  });
  // Every note is against a purchase order and one of its goods inwards (GRN): the vendor's received POs
  const pos = useApi<Paged<PurchaseOrder>>(vendor && !preset?.po ? "/purchase-orders" : null, { vendorId: vendor?.id, pageSize: 100 });
  const poOptions = (pos.data?.items ?? []).filter((p) => ["PARTIALLY_RECEIVED", "RECEIVED"].includes(p.status));
  const poId = preset?.po?.id ?? pickedPoId;
  const grns = useApi<Paged<Grn>>(poId && !preset?.grn ? "/grns" : null, { poId, pageSize: 100 });
  const grnOptions = grns.data?.items ?? [];
  const grnId = preset?.grn?.id ?? pickedGrnId;
  const invoiceOptions = (invoices.data?.items ?? []).filter((p) => !poId || p.poId === poId);
  // The chosen invoice's lines, to add a product line straight from the bill
  const invoice = useApi<Purchase>(purchaseId && !isReturn ? `/purchases/${purchaseId}` : null);
  const chosenInvoice = preset?.purchase ?? invoiceOptions.find((p) => p.id === purchaseId) ?? null;

  function changeVendor(v: Vendor | null) {
    setPickedVendor(v);
    setPurchaseId("");
    setPickedPoId("");
    setPickedGrnId("");
  }

  function changePo(id: string) {
    setPickedPoId(id);
    setPickedGrnId("");
    // Keep the invoice only if it belongs to the newly chosen PO
    if (!preset?.purchase && invoiceOptions.find((p) => p.id === purchaseId)?.poId !== id) setPurchaseId("");
  }

  function changeInvoice(id: string) {
    setPurchaseId(id);
    // An invoice raised against a PO fills that PO in
    const inv = invoiceOptions.find((p) => p.id === id);
    if (inv?.poId && !preset?.po) setPickedPoId(inv.poId);
    // …and the goods inward it was booked from
    if (inv?.grnId && !preset?.grn) setPickedGrnId(inv.grnId);
  }

  function changeReason(r: NoteReason) {
    // Swap a quick-pick reason text for the new type; keep anything typed by hand
    const chips = REASON_CHIPS[noteType][reasonType] ?? [];
    if (chips.includes(reason)) setReason("");
    setReasonType(r);
  }

  // ── Goods-return lines ──
  const updateReturn = (key: number, patch: Partial<ReturnLine>) =>
    setReturnLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function addReturnProduct(p: Product) {
    const key = ++seq;
    setReturnLines((ls) => [
      ...ls,
      {
        key,
        product: p,
        batches: null,
        batchId: "",
        quantity: "",
        rate: n(p.purchasePrice) ? numStr(p.purchasePrice) : "",
        gstRate: numStr(p.gstRate),
      },
    ]);
    try {
      const full = await api.get<Product>(`/products/${p.id}`);
      // Earliest expiry first — that is usually what goes back to the vendor
      const batches = (full.batches ?? [])
        .filter((b) => n(b.quantity) > 0)
        .sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
      updateReturn(key, { batches, batchId: batches[0]?.id ?? "" });
    } catch (e) {
      updateReturn(key, { batches: [], loadError: errMsg(e) });
    }
  }

  const returnRows = returnLines.map((l) => {
    const batch = l.batches?.find((b) => b.id === l.batchId);
    const q = Number(l.quantity) || 0;
    const rate = Number(l.rate) || 0;
    const gst = Number(l.gstRate) || 0;
    const sub = round2(q * rate);
    // Same batch on several lines counts against one stock figure
    const sameBatch = returnLines.filter((x) => x.batchId && x.batchId === l.batchId).reduce((s, x) => s + (Number(x.quantity) || 0), 0);
    const available = batch ? n(batch.quantity) : 0;
    let error: string | null = null;
    if (l.batches && !l.batches.length) error = l.loadError ?? "No stock in any batch of this product";
    else if (l.batches && !batch) error = "Choose a batch";
    else if (!(q > 0)) error = submitted ? "Enter the quantity to return" : null;
    else if (batch && sameBatch > available + 0.0005) error = `Only ${qty(available)} ${l.product.unit} in batch ${batch.batchNo}`;
    else if (l.rate === "" || rate < 0) error = submitted ? "Enter the rate" : null;
    return { l, batch, available, sub, amount: round2(sub * (1 + gst / 100)), error };
  });

  // ── Money-only lines ──
  const updateMoney = (key: number, patch: Partial<MoneyLine>) =>
    setMoneyLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function addMoneyLine(line: Omit<MoneyLine, "key">) {
    setMoneyLines((ls) => {
      // Fill the untouched starter row instead of leaving it empty above the new one
      const starter = ls.length === 1 && !ls[0].product && !ls[0].description.trim() && !ls[0].rate;
      return [...(starter ? [] : ls), { key: ++seq, ...line }];
    });
  }

  function addMoneyProduct(p: Product) {
    const atCost = reasonType === "SHORT_SUPPLY" || reasonType === "DAMAGED_IN_TRANSIT";
    addMoneyLine({
      product: { id: p.id, name: p.name, unit: p.unit, hsnCode: p.hsnCode },
      description: "",
      quantity: "1",
      rate: atCost && n(p.purchasePrice) ? numStr(p.purchasePrice) : "",
      gstRate: numStr(p.gstRate),
    });
  }

  function addInvoiceItem(itemId: string) {
    const it = invoice.data?.items?.find((i) => i.id === itemId);
    if (!it) return;
    // A rate difference or price protection usually covers the whole billed quantity
    const wholeQty = reasonType === "RATE_DIFFERENCE" || reasonType === "PRICE_PROTECTION";
    const atBillRate = reasonType === "SHORT_SUPPLY" || reasonType === "DAMAGED_IN_TRANSIT";
    addMoneyLine({
      product: { id: it.productId, name: it.product?.name ?? "Product", unit: it.product?.unit ?? "", hsnCode: it.product?.hsnCode },
      description: "",
      quantity: wholeQty ? numStr(it.quantity) : "",
      rate: atBillRate ? numStr(it.rate) : "",
      gstRate: numStr(it.gstRate),
    });
  }

  const moneyRows = moneyLines.map((l) => {
    const q = Number(l.quantity) || 0;
    const rate = Number(l.rate) || 0;
    const sub = round2(q * rate);
    let error: string | null = null;
    if (submitted) {
      if (!l.product && !l.description.trim()) error = "Pick a product or enter a description";
      else if (!(q > 0)) error = "Enter the quantity";
      else if (!(rate > 0)) error = reasonType === "RATE_DIFFERENCE" ? "Enter the overcharge per unit" : "Enter the rate";
    }
    return { l, sub, amount: round2(sub * (1 + (Number(l.gstRate) || 0) / 100)), error };
  });

  const rows = isReturn ? returnRows : moneyRows;
  const subtotal = round2(rows.reduce((s, r) => s + r.sub, 0));
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  const lineName = (l: MoneyLine) => l.product?.name ?? (l.description.trim() || "Line");

  async function save() {
    if (branchBlocked) return toast.error("Pick a branch in the top bar to return stock from");
    setSubmitted(true);
    if (!vendor) return toast.error("Choose the vendor");
    if (!poId) return toast.error("Choose the purchase order this note is against");
    if (!grnId) return toast.error("Choose the goods inward (GRN) this note is against");
    if (!reason.trim()) return toast.error(isDebit ? "Enter the reason for the debit note" : "Enter what the credit note is for");
    let items: Record<string, unknown>[];
    if (isReturn) {
      if (!returnLines.length) return toast.error("Add at least one product to return");
      if (returnLines.some((l) => !l.batches)) return toast.error("Batches are still loading");
      for (const r of returnRows) {
        const q = Number(r.l.quantity) || 0;
        if (!(q > 0)) return toast.error(`${r.l.product.name}: enter the quantity to return`);
        if (r.l.rate === "" || Number(r.l.rate) < 0) return toast.error(`${r.l.product.name}: enter the rate`);
        if (r.error) return toast.error(`${r.l.product.name}: ${r.error}`);
      }
      items = returnLines.map((l) => ({
        productId: l.product.id,
        batchId: l.batchId,
        quantity: Number(l.quantity),
        rate: Number(l.rate) || 0,
        gstRate: Number(l.gstRate) || 0,
      }));
    } else {
      if (!moneyLines.length) return toast.error("Add at least one line");
      for (const l of moneyLines) {
        if (!l.product && !l.description.trim()) return toast.error("Each line needs a product or a description");
        if (!((Number(l.quantity) || 0) > 0)) return toast.error(`${lineName(l)}: enter the quantity`);
        if (!((Number(l.rate) || 0) > 0)) return toast.error(`${lineName(l)}: enter the ${reasonType === "RATE_DIFFERENCE" ? "overcharge per unit" : "rate"}`);
      }
      items = moneyLines.map((l) => ({
        productId: l.product?.id,
        description: l.product ? undefined : l.description.trim(),
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        gstRate: Number(l.gstRate) || 0,
      }));
    }
    if (!(total > 0)) return toast.error("The note has no value");
    setSaving(true);
    try {
      const note = await api.post<DebitNote>("/debit-notes", {
        noteType,
        reasonType,
        vendorId: vendor.id,
        purchaseId: purchaseId || undefined,
        poId,
        grnId,
        vendorRef: vendorRef.trim() || undefined,
        noteDate,
        reason: reason.trim(),
        items,
      });
      toast.success(
        isDebit
          ? `Debit note ${note.dnNo} drafted — send it to the vendor to apply it`
          : `Credit note ${note.dnNo} recorded as a draft — accept & apply it to reduce the payable`,
      );
      onSaved(note);
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

  const chips = REASON_CHIPS[noteType][reasonType] ?? [];
  const invoiceLabel = chosenInvoice
    ? `${chosenInvoice.purchaseNo}${chosenInvoice.vendorInvoiceNo ? ` (${chosenInvoice.vendorInvoiceNo})` : ""}`
    : null;
  const gstOptions = (current: string) => [...new Set([...GST_RATES, Number(current) || 0])].sort((a, b) => a - b);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isDebit ? "New Debit Note (To Vendor)" : "Record Credit Note (Received From Vendor)"}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-600">
            {total > 0 && (
              <>
                Taxable {inr(subtotal)} · GST {inr(round2(total - subtotal))} ·{" "}
                <span className="num font-semibold text-slate-900">Total {inr(total)}</span>
              </>
            )}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={branchBlocked || (isReturn ? !returnLines.length : !moneyLines.length)}>
            Save Draft
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {isDebit
            ? "A debit note is raised by you to the vendor to reduce what you owe — for goods returned, an overcharged rate, short supply or goods damaged in transit."
            : "A credit note is given to you by the vendor and reduces what you owe — for a scheme incentive, price protection, cash discount or accepting your debit note. Record the vendor's own note number."}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Vendor" required>
            {preset?.vendor ? (
              <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
                {preset.vendor.name}
              </div>
            ) : (
              <VendorPicker value={pickedVendor} onChange={changeVendor} autoFocus />
            )}
          </Field>
          <Field label={isDebit ? "Reason Type" : "Credit For"} required>
            <Select value={reasonType} onChange={(e) => changeReason(e.target.value as NoteReason)}>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {NOTE_REASON_LABEL[r]}
                </option>
              ))}
            </Select>
            <span className="mt-1 block text-xs text-slate-500">{REASON_HELP[noteType][reasonType]}</span>
          </Field>

          <Field label="Purchase Order" required>
            {preset?.po ? (
              <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
                {preset.po.poNo}
              </div>
            ) : (
              <Select
                value={pickedPoId}
                onChange={(e) => changePo(e.target.value)}
                disabled={!vendor || pos.loading}
                className={submitted && !poId ? "border-red-400" : undefined}
              >
                <option value="">
                  {!vendor ? "Choose the Vendor First" : pos.loading ? "Loading Purchase Orders…" : poOptions.length ? "Choose a Purchase Order" : "No Received POs for This Vendor"}
                </option>
                {poOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.poNo} · {date(p.orderDate)} · {inr(p.totalAmount)}
                  </option>
                ))}
              </Select>
            )}
            {pos.error && <span className="mt-1 block text-xs text-red-600">{pos.error}</span>}
          </Field>

          <Field label="Goods Inward (GRN)" required>
            {preset?.grn ? (
              <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
                {preset.grn.grnNo}
              </div>
            ) : (
              <Select
                value={pickedGrnId}
                onChange={(e) => setPickedGrnId(e.target.value)}
                disabled={!poId || grns.loading}
                className={submitted && !grnId ? "border-red-400" : undefined}
              >
                <option value="">
                  {!poId ? "Choose the Purchase Order First" : grns.loading ? "Loading Goods Inwards…" : grnOptions.length ? "Choose a Goods Inward" : "No Goods Received on This PO Yet"}
                </option>
                {grnOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.grnNo} · {date(g.receivedAt)}
                  </option>
                ))}
              </Select>
            )}
            {grns.error && <span className="mt-1 block text-xs text-red-600">{grns.error}</span>}
          </Field>

          <Field label="Against Invoice" hint={preset?.purchase ? undefined : "Optional — posting settles this invoice's due first"}>
            {preset?.purchase ? (
              <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
                {invoiceLabel}
              </div>
            ) : (
              <Select value={purchaseId} onChange={(e) => changeInvoice(e.target.value)} disabled={!vendor || invoices.loading}>
                <option value="">{!vendor ? "Choose the Vendor First" : invoices.loading ? "Loading Invoices…" : "Not Against a Specific Invoice"}</option>
                {invoiceOptions.map((p) => {
                  const due = round2(n(p.totalAmount) - n(p.paidAmount));
                  return (
                    <option key={p.id} value={p.id}>
                      {p.purchaseNo}
                      {p.vendorInvoiceNo ? ` · ${p.vendorInvoiceNo}` : ""} · {date(p.purchaseDate)} · {inr(p.totalAmount)}
                      {due > 0 ? ` · due ${inr(due)}` : " · paid"}
                    </option>
                  );
                })}
              </Select>
            )}
            {invoices.error && <span className="mt-1 block text-xs text-red-600">{invoices.error}</span>}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={isDebit ? "Vendor's Ref. (Optional)" : "Vendor's Note No."}>
              <Input
                value={vendorRef}
                onChange={(e) => setVendorRef(e.target.value)}
                placeholder={isDebit ? "e.g. their RMA no." : "e.g. CN-0423"}
              />
            </Field>
            <Field label="Note Date" required>
              <DateInput value={noteDate} max={today()} onChange={(e) => setNoteDate(e.target.value)} />
            </Field>
          </div>

          <Field label={isDebit ? "Reason" : "Details"} required className="sm:col-span-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isReturn ? "Why the stock is going back" : isDebit ? "What you are claiming and why" : "What the vendor is crediting"}
              className={cx(submitted && !reason.trim() && "border-red-400")}
            />
            {chips.length > 0 && (
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {chips.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cx(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                      reason === r ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </span>
            )}
          </Field>
        </div>

        {isReturn ? (
          <>
            {branchBlocked ? (
              <BranchNotice action="return goods from its stock" />
            ) : (
              <BranchBadge label="Returning Stock From" />
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Products to return</p>
              <ProductPicker onPick={addReturnProduct} inStockOnly />
            </div>

            {returnLines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                <PackageMinus className="mx-auto mb-2 size-7 text-slate-300" />
                Search above to add the products going back to the vendor
              </div>
            ) : (
              <div className="space-y-3">
                {returnRows.map(({ l, batch, available, amount, error }) => (
                  <div key={l.key} className={cx("rounded-lg border p-3", error ? "border-red-200" : "border-slate-200")}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-slate-900">{l.product.name}</p>
                        <p className="text-xs text-slate-500">{[l.product.sku, l.product.packSize, l.product.unit].filter(Boolean).join(" · ")}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReturnLines((ls) => ls.filter((x) => x.key !== l.key))}
                        className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:p-1"
                        aria-label={`Remove ${l.product.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    {!l.batches ? (
                      <p className="flex items-center gap-2 py-2 text-xs text-slate-500">
                        <InfinityLoader className="size-5" /> Loading batches…
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-end gap-3">
                        <Field label="Batch" className="min-w-full flex-1 sm:min-w-64">
                          <Select value={l.batchId} onChange={(e) => updateReturn(l.key, { batchId: e.target.value })} disabled={!l.batches.length}>
                            {!l.batches.length && <option value="">No Stock</option>}
                            {l.batches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.batchNo} · exp {date(b.expiryDate)} · {qty(b.quantity)} {l.product.unit} available
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={`Qty${batch ? ` (max ${qty(available)})` : ""}`}>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max={available || undefined}
                            className="num w-28 text-right"
                            value={l.quantity}
                            placeholder="0"
                            onChange={(e) => updateReturn(l.key, { quantity: e.target.value })}
                          />
                        </Field>
                        <Field label="Rate (₹, Excl. GST)">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="num w-32 text-right"
                            value={l.rate}
                            onChange={(e) => updateReturn(l.key, { rate: e.target.value })}
                          />
                        </Field>
                        <Field label="GST %">
                          <Select className="w-24" value={l.gstRate} onChange={(e) => updateReturn(l.key, { gstRate: e.target.value })}>
                            {gstOptions(l.gstRate).map((r) => (
                              <option key={r} value={String(r)}>
                                {r}%
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <div className="min-w-28 pb-2 text-right">
                          <p className="text-xs text-slate-500">Amount</p>
                          <p className="num font-semibold text-slate-900">{inr(amount)}</p>
                        </div>
                      </div>
                    )}
                    {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Lines</p>
            <div className="rounded-lg border border-slate-200">
              <Table>
                <thead>
                  <tr>
                    <Th>Product / Description</Th>
                    <Th right>Qty</Th>
                    <Th right>{rateLabel}</Th>
                    <Th right>GST %</Th>
                    <Th right>Amount</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {moneyRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-400">
                        <FilePlus2 className="mx-auto mb-2 size-6 text-slate-300" />
                        Add a line below
                      </td>
                    </tr>
                  ) : (
                    moneyRows.map(({ l, amount, error }) => (
                      <tr key={l.key} className="align-top">
                        <Td className="min-w-48 sm:min-w-64">
                          {l.product ? (
                            <div className="pt-1.5">
                              <p className="font-medium text-slate-900">{l.product.name}</p>
                              <p className="text-xs text-slate-500">
                                {l.product.unit}
                                {l.product.hsnCode && ` · HSN ${l.product.hsnCode}`}
                              </p>
                            </div>
                          ) : (
                            <Input
                              className={cx("min-w-44 sm:min-w-56", error && !l.description.trim() && "border-red-400")}
                              value={l.description}
                              placeholder={
                                reasonType === "SCHEME_INCENTIVE"
                                  ? "e.g. Kharif scheme incentive"
                                  : reasonType === "CASH_DISCOUNT"
                                    ? "e.g. 2% cash discount on Sept bills"
                                    : "Description"
                              }
                              onChange={(e) => updateMoney(l.key, { description: e.target.value })}
                            />
                          )}
                          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
                        </Td>
                        <Td right>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="num w-24 text-right"
                            value={l.quantity}
                            placeholder="0"
                            onChange={(e) => updateMoney(l.key, { quantity: e.target.value })}
                          />
                        </Td>
                        <Td right>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="num w-32 text-right"
                            value={l.rate}
                            placeholder="0.00"
                            onChange={(e) => updateMoney(l.key, { rate: e.target.value })}
                          />
                        </Td>
                        <Td right>
                          <Select className="w-24" value={l.gstRate} onChange={(e) => updateMoney(l.key, { gstRate: e.target.value })}>
                            {gstOptions(l.gstRate).map((r) => (
                              <option key={r} value={String(r)}>
                                {r}%
                              </option>
                            ))}
                          </Select>
                        </Td>
                        <Td right className="whitespace-nowrap pt-4 font-semibold text-slate-900">
                          {inr(amount)}
                        </Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => setMoneyLines((ls) => ls.filter((x) => x.key !== l.key))}
                            className="mt-1 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:p-1"
                            aria-label={`Remove ${lineName(l)}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-4" />}
                onClick={() => setMoneyLines((ls) => [...ls, blankMoneyLine()])}
              >
                Description Line
              </Button>
              <div className="w-full sm:w-80">
                <ProductPicker onPick={addMoneyProduct} />
              </div>
              {purchaseId && (invoice.data?.items?.length ?? 0) > 0 && (
                <Select className="w-full sm:w-72" value="" onChange={(e) => addInvoiceItem(e.target.value)}>
                  <option value="">Add an item from {invoice.data?.purchaseNo}…</option>
                  {invoice.data?.items?.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.product?.name ?? "Product"} · {qty(it.quantity)} {it.product?.unit} @ {inr(it.rate)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            {reasonType === "RATE_DIFFERENCE" && (
              <p className="mt-2 text-xs text-slate-500">
                Enter only the extra charged per unit — e.g. billed ₹1,370 against the agreed ₹1,350 is ₹20 per bag — and the quantity billed.
              </p>
            )}
          </div>
        )}

        <p className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
          The note is saved as a draft and changes nothing yet. When you{" "}
          <strong>{isDebit ? "send it to the vendor" : "accept & apply it"}</strong>
          {isReturn && ", the quantities are taken out of stock from the chosen batches and"}
          {!isReturn && ","} {total > 0 ? inr(total) : "its value"} is taken off what you owe {vendor?.name ?? "the vendor"}
          {invoiceLabel ? `, settling the balance due on ${invoiceLabel} first` : ""}.
          {!isReturn && " Stock does not change."}
        </p>
      </div>
    </Modal>
  );
}
