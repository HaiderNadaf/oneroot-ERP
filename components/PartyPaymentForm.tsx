"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { inr, n, round2, today } from "@/lib/format";
import { MONEY_MODES, modeLabel, type Customer, type Payment, type PaymentMode, type Vendor } from "@/lib/types";
import { RecordedIn } from "./BranchNotice";
import { CustomerPicker, VendorPicker } from "./pickers";
import { Button, Field, Input, Modal, Select, Textarea, cx, errMsg, useToast } from "./ui";

export type PartyType = "CUSTOMER" | "VENDOR";

/** A party already chosen by the calling page (vendor profile, purchase bill…) */
export interface FixedParty {
  partyType: PartyType;
  partyId: string;
  partyName: string;
  /** Current account balance: receivable for customers, payable for vendors */
  balance?: number;
  /** Apply to one specific bill instead of auto-allocating to the oldest */
  documentId?: string;
  documentLabel?: string;
  /** Outstanding on that bill */
  due?: number;
}

export const CASH_MODES = MONEY_MODES;
export { modeLabel };

interface PartyPaymentFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: (p: Payment) => void;
  fixed?: FixedParty | null;
  defaultType?: PartyType;
}

/**
 * Record money received from a customer or paid to a vendor.
 * With `fixed`, the party (and optionally the bill) is preset; otherwise the user picks one.
 */
export function PartyPaymentForm(props: PartyPaymentFormProps) {
  if (!props.open) return null;
  return <PartyPaymentFormBody {...props} />;
}

const defaultMode = (t: PartyType): PaymentMode => (t === "VENDOR" ? "BANK" : "CASH");

/** Mounted fresh on every open, so the initial state below is the reset */
function PartyPaymentFormBody({ open, onClose, onSaved, fixed, defaultType = "CUSTOMER" }: PartyPaymentFormProps) {
  const toast = useToast();
  const initialType = fixed?.partyType ?? defaultType;
  const suggested = fixed ? (fixed.due ?? fixed.balance ?? 0) : 0;
  const [partyType, setPartyType] = useState<PartyType>(initialType);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [amount, setAmount] = useState(suggested > 0 ? String(round2(suggested)) : "");
  const [mode, setMode] = useState<PaymentMode>(defaultMode(initialType));
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isVendor = partyType === "VENDOR";
  const party = fixed
    ? { id: fixed.partyId, name: fixed.partyName }
    : isVendor
      ? vendor && { id: vendor.id, name: vendor.name }
      : customer && { id: customer.id, name: customer.name };
  const balance = fixed ? fixed.balance : isVendor ? (vendor ? n(vendor.balance) : undefined) : customer ? n(customer.balance) : undefined;
  const amt = Number(amount) || 0;
  const limit = fixed?.documentId ? fixed.due : undefined;
  const overBill = limit !== undefined && amt > round2(limit) + 0.004;
  const advance = !fixed?.documentId && balance !== undefined && amt > balance + 0.004;

  function pickParty(p: Customer | Vendor | null, type: PartyType) {
    if (type === "VENDOR") setVendor(p as Vendor | null);
    else setCustomer(p as Customer | null);
    const b = p ? n(p.balance) : 0;
    setAmount(b > 0 ? String(round2(b)) : "");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!party) return toast.error(`Choose a ${isVendor ? "vendor" : "customer"}`);
    if (amt <= 0) return toast.error("Enter an amount greater than zero");
    if (overBill) return toast.error(`Amount is more than the ${inr(limit)} due on this bill`);
    setSaving(true);
    try {
      const p = await api.post<Payment>("/payments", {
        partyType,
        partyId: party.id,
        documentId: fixed?.documentId,
        amount: round2(amt),
        mode,
        reference: reference.trim() || undefined,
        paymentDate,
        notes: notes.trim() || undefined,
      });
      toast.success(`${isVendor ? "Payment" : "Receipt"} ${p.paymentNo} recorded · ${inr(p.amount)}`);
      onSaved(p);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  const title = fixed
    ? isVendor
      ? `Pay ${fixed.partyName}`
      : `Receive from ${fixed.partyName}`
    : "New payment";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="party-payment-form" loading={saving} disabled={!party}>
            {isVendor ? "Record payment" : "Record receipt"}
          </Button>
        </>
      }
    >
      <form id="party-payment-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!fixed && (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:col-span-2">
              {(["CUSTOMER", "VENDOR"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setPartyType(t);
                    setAmount("");
                    setMode(defaultMode(t));
                  }}
                  className={cx(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    partyType === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {t === "CUSTOMER" ? "Receive from customer" : "Pay vendor"}
                </button>
              ))}
            </div>
            <Field label={isVendor ? "Vendor" : "Customer"} required className="sm:col-span-2">
              {isVendor ? (
                <VendorPicker value={vendor} onChange={(v) => pickParty(v, "VENDOR")} autoFocus />
              ) : (
                <CustomerPicker value={customer} onChange={(c) => pickParty(c, "CUSTOMER")} autoFocus />
              )}
            </Field>
          </>
        )}

        {(fixed || party) && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm sm:col-span-2">
            {fixed?.documentId ? (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Due on {fixed.documentLabel ?? "this bill"}</span>
                <span className="num font-semibold text-slate-900">{inr(fixed.due)}</span>
              </div>
            ) : null}
            {balance !== undefined && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">{isVendor ? "Total payable to vendor" : "Customer balance due"}</span>
                <span className={cx("num font-semibold", balance > 0 ? (isVendor ? "text-amber-700" : "text-red-600") : "text-slate-700")}>
                  {inr(balance)}
                  {balance < 0 && <span className="ml-1 text-xs font-normal text-slate-500">(advance)</span>}
                </span>
              </div>
            )}
          </div>
        )}

        <Field label="Amount (₹)" required>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus={!!fixed}
            className={overBill ? "border-red-400" : undefined}
          />
        </Field>
        <Field label="Mode" required>
          <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {CASH_MODES.map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" hint={mode === "CASH" ? undefined : "UTR / cheque no. / txn id"}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={paymentDate} max={today()} onChange={(e) => setPaymentDate(e.target.value)} required />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {overBill && <p className="text-xs text-red-600 sm:col-span-2">Amount exceeds the bill&apos;s outstanding {inr(limit)}.</p>}
        {advance && (
          <p className="text-xs text-amber-700 sm:col-span-2">
            This is more than the current balance — the extra {inr(amt - Math.max(balance ?? 0, 0))} will be kept as an advance.
          </p>
        )}
        {!fixed?.documentId && party && (
          <p className="text-xs text-slate-500 sm:col-span-2">
            The amount is applied to the oldest unpaid {isVendor ? "bills" : "invoices"} first.
          </p>
        )}
        <RecordedIn className="sm:col-span-2" />
      </form>
    </Modal>
  );
}
