"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { n } from "@/lib/format";
import type { StoreSettings, Vendor } from "@/lib/types";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { parseGstin } from "@/lib/gst";
import { GstinField, StateSelect } from "./GstinField";
import { Button, Checkbox, Field, Input, Modal, Textarea, errMsg, useToast } from "./ui";

type FormState = Record<string, string | boolean>;

const TEXT_FIELDS = [
  "name",
  "contactPerson",
  "phone",
  "email",
  "gstin",
  "address",
  "city",
  "state",
  "pincode",
  "billingAddress",
  "shippingAddress",
  "bankName",
  "bankAccount",
  "ifsc",
  "notes",
] as const;

function toForm(v?: Vendor | null): FormState {
  const f: FormState = {};
  for (const k of TEXT_FIELDS) f[k] = (v?.[k] as string | null | undefined) ?? "";
  f.paymentTermsDays = v ? String(v.paymentTermsDays ?? 0) : "30";
  f.openingBalance = v ? String(n(v.openingBalance)) : "";
  f.isActive = v?.isActive ?? true;
  // "Same as Address" starts ticked when the saved address matches the main one
  for (const k of LINKED_ADDRESSES) f[sameKey(k)] = !!v?.[k] && v[k] === v.address;
  return f;
}

/** Addresses that can be copied from the main Address with a "Same as Address" tick */
const LINKED_ADDRESSES = ["billingAddress", "shippingAddress"] as const;
const sameKey = (k: (typeof LINKED_ADDRESSES)[number]) => `${k}Same`;

interface VendorFormProps {
  open: boolean;
  vendor?: Vendor | null;
  onClose: () => void;
  onSaved: (v: Vendor) => void;
}

/** Create / edit vendor modal. The form mounts fresh each time it opens, so it always starts from `vendor`. */
export function VendorForm(props: VendorFormProps) {
  if (!props.open) return null;
  return <VendorFormBody key={props.vendor?.id ?? "new"} {...props} />;
}

/** Shown until the admin saves their own terms; saving replaces it */
const DEFAULT_VENDOR_TERMS = [
  "1. The vendor agrees to a 5-year association from the date of registration.",
  "2. The vendor cannot end the association before 5 years.",
  "3. The company may end the association early by giving written notice; dues must be settled first.",
  "4. Payment is made against invoices within the credit days set on this vendor's record.",
  "5. Bank details must be supplied before the first payment.",
].join("\n");

/** Saved in capitals; State stays as chosen (GST compares it with the store's state) */
const UPPER_FIELDS = ["name", "contactPerson", "address", "billingAddress", "shippingAddress", "city", "bankName"] as const;

function VendorFormBody({ open, vendor, onClose, onSaved }: VendorFormProps) {
  const toast = useToast();
  const [f, setF] = useState<FormState>(() => toForm(vendor));
  const [saving, setSaving] = useState(false);
  const editing = !!vendor;
  const { can } = useAuth();
  const { data: settings, setData: setSettings } = useApi<StoreSettings>(editing ? null : "/settings");
  const [termsDraft, setTermsDraft] = useState<string | null>(null);
  const [savingTerms, setSavingTerms] = useState(false);
  const savedTerms = settings ? (settings.vendorTerms ?? DEFAULT_VENDOR_TERMS) : "";
  const termsValue = termsDraft ?? savedTerms;
  const termsChanged = termsValue.trim() !== savedTerms.trim();

  async function saveTerms() {
    setSavingTerms(true);
    try {
      const saved = await api.put<StoreSettings>("/settings", { vendorTerms: termsValue.trim() });
      setSettings(saved);
      setTermsDraft(null);
      toast.success("Terms saved");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingTerms(false);
    }
  }

  const set = (k: string, v: string | boolean) =>
    setF((s) => {
      const next = { ...s, [k]: v };
      // Ticked "Same as Address" fields follow the main address as it is typed
      if (k === "address") for (const a of LINKED_ADDRESSES) if (s[sameKey(a)]) next[a] = v;
      return next;
    });
  // Ticking copies the main address in; unticking leaves the copy to edit
  const setSame = (k: (typeof LINKED_ADDRESSES)[number], same: boolean) =>
    setF((s) => ({ ...s, [sameKey(k)]: same, ...(same ? { [k]: s.address } : {}) }));
  // Shown in capitals while typing (CSS) and saved in capitals, so the cursor never jumps
  const caps = (k: string) => ({ value: str(k), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value), className: "uppercase" });
  const str = (k: string) => String(f[k] ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const gst = parseGstin(str("gstin"));
    if (gst.empty) {
      toast.error("GSTIN is required");
      return;
    }
    if (!gst.valid) {
      toast.error(`GSTIN: ${gst.error}`);
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {};
    for (const k of TEXT_FIELDS) {
      const v = str(k).trim();
      // On edit, send "" so a cleared field is actually cleared (email must be valid or omitted)
      body[k] = v || (editing && k !== "email" ? "" : undefined);
    }
    body.name = str("name").trim();
    // Names and addresses are stored in capitals ("abc tractors" → "ABC TRACTORS"); the server does the same
    for (const k of UPPER_FIELDS) if (typeof body[k] === "string") body[k] = (body[k] as string).replace(/\s+/g, " ").toUpperCase();
    body.gstin = str("gstin").trim().toUpperCase();
    body.ifsc = str("ifsc").trim().toUpperCase() || (editing ? "" : undefined);
    body.paymentTermsDays = str("paymentTermsDays") === "" ? 0 : Math.max(0, Math.round(Number(str("paymentTermsDays"))));
    body.openingBalance = str("openingBalance") === "" ? 0 : Number(str("openingBalance"));
    if (editing) body.isActive = f.isActive;
    try {
      const saved = editing
        ? await api.patch<Vendor>(`/vendors/${vendor!.id}`, body)
        : await api.post<Vendor>("/vendors", body);
      toast.success(editing ? "Vendor updated" : `Vendor ${saved.name} created`);
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
      title={editing ? `Edit ${vendor?.name}` : "New Vendor"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="vendor-form" loading={saving}>
            {editing ? "Save Changes" : "Create Vendor"}
          </Button>
        </>
      }
    >
      <form id="vendor-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Vendor / Firm Name" required className="sm:col-span-2">
          <Input {...caps("name")} required autoFocus placeholder="E.G. SRI LAKSHMI AGRO DISTRIBUTORS" />
        </Field>
        <Field label="Contact Person">
          <Input {...caps("contactPerson")} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={str("phone")} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={str("email")} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <GstinField
          value={str("gstin")}
          onChange={(g) => set("gstin", g)}
          onState={(st) => set("state", st)}
          required
          hint="Place of supply and IGST / CGST + SGST are worked out from this"
        />
        <Field label="Address" className="sm:col-span-3">
          <Input {...caps("address")} />
        </Field>
        <Field label="City">
          <Input {...caps("city")} />
        </Field>
        <StateSelect value={str("state")} onChange={(st) => set("state", st)} gstin={str("gstin")} />
        <Field label="Pincode">
          <Input inputMode="numeric" maxLength={6} value={str("pincode")} onChange={(e) => set("pincode", e.target.value)} />
        </Field>
        {LINKED_ADDRESSES.map((k) => (
          <div key={k} className="sm:col-span-3">
            <Field label={k === "billingAddress" ? "Billing Address" : "Shipping Address"}>
              <Input {...caps(k)} disabled={!!f[sameKey(k)]} />
            </Field>
            <div className="mt-1.5">
              <Checkbox label="Same as Address" checked={!!f[sameKey(k)]} onChange={(v) => setSame(k, v)} />
            </div>
          </div>
        ))}

        <fieldset className="min-w-0 rounded-lg border border-dashed border-slate-300 p-3 sm:col-span-3">
          <legend className="px-1 text-xs font-medium text-slate-600">Bank details (for payments)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Bank Name">
              <Input {...caps("bankName")} />
            </Field>
            <Field label="Account Number">
              <Input value={str("bankAccount")} onChange={(e) => set("bankAccount", e.target.value)} />
            </Field>
            <Field label="IFSC">
              <Input value={str("ifsc")} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} maxLength={11} />
            </Field>
          </div>
        </fieldset>

        <Field label="Payment Terms (Days)" hint="Credit period; sets bill due dates">
          <Input type="number" min="0" step="1" value={str("paymentTermsDays")} onChange={(e) => set("paymentTermsDays", e.target.value)} />
        </Field>
        <Field label="Opening Balance (₹)" hint="Amount you already owe this vendor">
          <Input type="number" step="0.01" value={str("openingBalance")} onChange={(e) => set("openingBalance", e.target.value)} />
        </Field>
        <div className="hidden sm:block" />
        <Field label="Notes" className="sm:col-span-3">
          <Textarea rows={2} value={str("notes")} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        {editing && (
          <div className="sm:col-span-3">
            <Checkbox label="Active" checked={!!f.isActive} onChange={(v) => set("isActive", v)} />
          </div>
        )}
        {!editing && (
          <section className="sm:col-span-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-xs font-medium text-slate-700">Terms &amp; Conditions</h3>
            {can("settings.edit") ? (
              <>
                <Textarea
                  rows={6}
                  className="mt-1.5 text-xs"
                  value={termsValue}
                  onChange={(e) => setTermsDraft(e.target.value)}
                  placeholder="Lock-in period, early-exit rules and payment terms, one point per line"
                  aria-label="Vendor terms"
                />
                {termsChanged && (
                  <div className="mt-1.5">
                    <Button type="button" size="sm" onClick={saveTerms} loading={savingTerms}>
                      Save Terms
                    </Button>
                  </div>
                )}
              </>
            ) : savedTerms.trim() ? (
              <p className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-line text-xs text-slate-600">{savedTerms.trim()}</p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">No terms set yet.</p>
            )}
          </section>
        )}
      </form>
    </Modal>
  );
}
