"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { n } from "@/lib/format";
import type { Customer } from "@/lib/types";
import { parseGstin } from "@/lib/gst";
import { GstinField, StateSelect } from "./GstinField";
import { Button, Checkbox, Field, Input, Modal, Textarea, errMsg, useToast } from "./ui";

type FormState = Record<string, string | boolean>;

const TEXT_FIELDS = ["name", "phone", "email", "gstin", "village", "address", "city", "state", "pincode", "crops", "notes"] as const;

function toForm(c?: Customer | null): FormState {
  return {
    name: c?.name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    gstin: c?.gstin ?? "",
    village: c?.village ?? "",
    address: c?.address ?? "",
    city: c?.city ?? "",
    state: c?.state ?? "",
    pincode: c?.pincode ?? "",
    landAcres: c?.landAcres !== null && c?.landAcres !== undefined ? String(n(c.landAcres)) : "",
    crops: c?.crops ?? "",
    creditLimit: c ? String(n(c.creditLimit)) : "",
    openingBalance: c ? String(n(c.openingBalance)) : "",
    notes: c?.notes ?? "",
    isActive: c?.isActive ?? true,
  };
}

/** Create / edit a customer (farmer or dealer). Also used for quick-add from the POS screen. */
interface CustomerFormProps {
  open: boolean;
  customer?: Customer | null;
  onClose: () => void;
  onSaved: (c: Customer) => void;
  /** Only name, phone and village — for fast billing */
  quick?: boolean;
  initialName?: string;
}

export function CustomerForm(props: CustomerFormProps) {
  // Mount the form only while open so every opening starts from fresh state
  return props.open ? <CustomerFormBody {...props} /> : null;
}

function CustomerFormBody({ open, customer, onClose, onSaved, quick, initialName }: CustomerFormProps) {
  const toast = useToast();
  const [f, setF] = useState<FormState>(() => ({ ...toForm(customer), ...(!customer && initialName ? { name: initialName } : {}) }));
  const [saving, setSaving] = useState(false);
  const editing = !!customer;

  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const str = (k: string) => String(f[k] ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const phone = str("phone").trim();
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    const gst = parseGstin(str("gstin"));
    if (!gst.empty && !gst.valid) {
      toast.error(`GSTIN: ${gst.error}`);
      return;
    }
    setSaving(true);
    // On create blank fields are omitted; on edit they are cleared with null
    const blank = editing ? null : undefined;
    const body: Record<string, unknown> = {};
    for (const k of TEXT_FIELDS) {
      const v = str(k).trim();
      body[k] = v === "" ? blank : k === "gstin" ? v.toUpperCase() : v;
    }
    body.name = str("name").trim();
    if (editing && body.phone === null) body.phone = "";
    const numOr = (k: string) => (str(k) === "" ? blank : Number(str(k)));
    body.landAcres = numOr("landAcres");
    body.creditLimit = str("creditLimit") === "" ? (editing ? 0 : undefined) : Number(str("creditLimit"));
    body.openingBalance = str("openingBalance") === "" ? (editing ? 0 : undefined) : Number(str("openingBalance"));
    if (editing) body.isActive = f.isActive;
    try {
      const saved = editing
        ? await api.patch<Customer>(`/customers/${customer!.id}`, body)
        : await api.post<Customer>("/customers", body);
      toast.success(editing ? "Customer updated" : `Customer ${saved.name} added`);
      onSaved(saved);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${customer?.name}` : "New customer"}
      size={quick ? "sm" : "lg"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={saving}>
            {editing ? "Save changes" : "Add customer"}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={save} className={quick ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-3"}>
        <Field label="Name" required className={quick ? undefined : "sm:col-span-2"}>
          <Input value={str("name")} onChange={(e) => set("name", e.target.value)} required autoFocus placeholder="e.g. Ramesh Patil" />
        </Field>
        <Field label="Mobile">
          <Input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={str("phone")}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
            placeholder="10-digit mobile"
          />
        </Field>
        <Field label="Village">
          <Input value={str("village")} onChange={(e) => set("village", e.target.value)} />
        </Field>
        {!quick && (
          <>
            <Field label="Email">
              <Input type="email" value={str("email")} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <GstinField
              value={str("gstin")}
              onChange={(g) => set("gstin", g)}
              onState={(st) => set("state", st)}
              hint="For dealers / registered buyers — decides IGST on their invoices"
            />
            <Field label="Address" className="sm:col-span-3">
              <Input value={str("address")} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="City / Taluka">
              <Input value={str("city")} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <StateSelect value={str("state")} onChange={(st) => set("state", st)} gstin={str("gstin")} />
            <Field label="PIN code">
              <Input
                inputMode="numeric"
                maxLength={6}
                value={str("pincode")}
                onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field label="Land (acres)">
              <Input type="number" step="any" min="0" value={str("landAcres")} onChange={(e) => set("landAcres", e.target.value)} />
            </Field>
            <Field label="Crops" className="sm:col-span-2" hint="e.g. Cotton, Soybean, Tur">
              <Input value={str("crops")} onChange={(e) => set("crops", e.target.value)} />
            </Field>
            <Field label="Credit limit (₹)" hint="0 = no limit">
              <Input type="number" step="0.01" min="0" value={str("creditLimit")} onChange={(e) => set("creditLimit", e.target.value)} />
            </Field>
            <Field label="Opening balance (₹)" hint="Old dues before using this software">
              <Input type="number" step="0.01" value={str("openingBalance")} onChange={(e) => set("openingBalance", e.target.value)} />
            </Field>
            <Field label="Notes" className="sm:col-span-3">
              <Textarea rows={2} value={str("notes")} onChange={(e) => set("notes", e.target.value)} />
            </Field>
            {editing && (
              <div className="sm:col-span-3">
                <Checkbox label="Active" checked={!!f.isActive} onChange={(v) => set("isActive", v)} />
              </div>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
