"use client";

import { Plus, Store, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { n } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Vendor, VendorBranch } from "@/lib/types";
import { parseGstin } from "@/lib/gst";
import { GstinField, StateSelect } from "./GstinField";
import { Button, Checkbox, Field, Input, Modal, Textarea, errMsg, useToast } from "./ui";
import { branchAddress, branchLabel } from "./VendorBranches";

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
  // "Same as Primary Depot Address" starts ticked when the saved address matches the vendor's (the primary depot's)
  for (const k of LINKED_ADDRESSES) f[sameKey(k)] = !!v?.[k] && v[k] === v.address;
  return f;
}

/** Addresses that can be copied from the primary depot's address with a "Same as Primary Depot Address" tick */
const LINKED_ADDRESSES = ["billingAddress", "shippingAddress"] as const;
const sameKey = (k: (typeof LINKED_ADDRESSES)[number]) => `${k}Same`;

/** A depot / branch typed on the vendor form; saved (as a vendor branch) right after the vendor */
interface DepotRow {
  key: number;
  name: string;
  code: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  contactPerson: string;
  phone: string;
}
let depotSeq = 0;
const blankDepot = (): DepotRow => ({ key: ++depotSeq, name: "", code: "", gstin: "", address: "", city: "", state: "", pincode: "", contactPerson: "", phone: "" });
const filled = (d: DepotRow) => Object.entries(d).some(([k, v]) => k !== "key" && String(v).trim());

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

/** Saved in capitals; State stays as chosen (GST compares it with the store's state) */
const UPPER_FIELDS = ["name", "contactPerson", "address", "billingAddress", "shippingAddress", "city", "bankName"] as const;

function VendorFormBody({ open, vendor, onClose, onSaved }: VendorFormProps) {
  const toast = useToast();
  const [f, setF] = useState<FormState>(() => toForm(vendor));
  const [saving, setSaving] = useState(false);
  const editing = !!vendor;
  // Depots: the vendor's branches / places we buy from (new ones typed here; existing ones listed on edit)
  // A new vendor starts with its primary depot (Depot 1) open: at least one is needed
  const [depots, setDepots] = useState<DepotRow[]>(() => (vendor ? [] : [blankDepot()]));
  const { data: existingDepots } = useApi<VendorBranch[]>(editing ? `/vendor-branches/vendor/${vendor!.id}` : null);
  // The primary depot: the first one (on edit, the vendor's oldest; listed first)
  const primary = editing ? existingDepots?.[0] : depots[0];
  const joinAddress = (d?: Pick<DepotRow, "address" | "city" | "state" | "pincode"> | null) =>
    d ? [d.address, d.city, [d.state, d.pincode].filter(Boolean).join(" ")].map((x) => (x ?? "").trim()).filter(Boolean).join(", ") : "";
  const primaryAddress = primary ? joinAddress({ address: primary.address ?? "", city: primary.city ?? "", state: primary.state ?? "", pincode: primary.pincode ?? "" }) : String(f.address ?? "");
  const setDepot = (key: number, patch: Partial<DepotRow>) => setDepots((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const set = (k: string, v: string | boolean) =>
    setF((s) => {
      const next = { ...s, [k]: v };
      return next;
    });
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
    const newDepots = depots.filter(filled);
    if (!editing && !newDepots.length) return toast.error("Add at least one depot — the first is the vendor's primary depot");
    for (const [i, d] of newDepots.entries()) {
      if (!d.name.trim()) return toast.error(`Depot ${i + 1}: enter its name`);
      if (d.phone && !/^[6-9]\d{9}$/.test(d.phone)) return toast.error(`Depot ${d.name}: phone must be 10 digits starting with 6, 7, 8 or 9`);
      if (d.pincode && !/^\d{6}$/.test(d.pincode)) return toast.error(`Depot ${d.name}: pincode must be 6 digits`);
      const g = parseGstin(d.gstin);
      if (!g.empty && !g.valid) return toast.error(`Depot ${d.name} GSTIN: ${g.error}`);
    }
    setSaving(true);
    const body: Record<string, unknown> = {};
    for (const k of TEXT_FIELDS) {
      const v = str(k).trim();
      // On edit, send "" so a cleared field is actually cleared (email must be valid or omitted)
      body[k] = v || (editing && k !== "email" ? "" : undefined);
    }
    // Address, city and pincode aren't on this form: a new vendor takes its primary depot's; an edit leaves them as they are.
    // State always follows the vendor's GSTIN (the server fills it in), which decides GST.
    for (const k of ["address", "city", "state", "pincode"] as const) delete body[k];
    if (!editing && newDepots[0]) {
      body.address = newDepots[0].address.trim() || undefined;
      body.city = newDepots[0].city.trim() || undefined;
      body.pincode = newDepots[0].pincode.trim() || undefined;
    }
    for (const k of LINKED_ADDRESSES) if (f[sameKey(k)]) body[k] = primaryAddress || undefined;
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
      // Then its depots; a depot that fails doesn't undo the vendor
      let added = 0;
      for (const d of newDepots) {
        try {
          await api.post("/vendor-branches", {
            vendorId: saved.id,
            name: d.name,
            code: d.code,
            gstin: d.gstin.trim().toUpperCase(),
            address: d.address,
            city: d.city,
            state: d.state,
            pincode: d.pincode,
            contactPerson: d.contactPerson,
            phone: d.phone,
          });
          added++;
        } catch (err) {
          toast.warn(`Depot ${d.name}: ${errMsg(err)} — add it from Depot`);
        }
      }
      toast.success(
        `${editing ? "Vendor updated" : `Vendor ${saved.name} created`}${added ? ` with ${added} depot${added === 1 ? "" : "s"}` : ""}`,
      );
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
        {LINKED_ADDRESSES.map((k) => (
          <div key={k} className="sm:col-span-3">
            <Field label={k === "billingAddress" ? "Billing Address" : "Shipping Address"}>
              {f[sameKey(k)] ? <Input value={primaryAddress.toUpperCase()} disabled /> : <Input {...caps(k)} />}
            </Field>
            <div className="mt-1.5">
              <Checkbox label="Same as Primary Depot Address" checked={!!f[sameKey(k)]} onChange={(v) => set(sameKey(k), v)} />
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

        <fieldset className="min-w-0 rounded-lg border border-dashed border-slate-300 p-3 sm:col-span-3">
          <legend className="flex items-center gap-1 px-1 text-xs font-medium text-slate-600">
            <Store className="size-3.5" /> Depots / branches{!editing && " *"} — the first is the vendor&apos;s primary depot; add more if it supplies from other places
          </legend>
          {editing && (existingDepots?.length ?? 0) > 0 && (
            <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
              {existingDepots!.map((b, i) => (
                <li key={b.id} className="px-3 py-1.5">
                  <span className="font-medium text-slate-900">{branchLabel(b)}</span>
                  {i === 0 && <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">Primary</span>}
                  <span className="text-xs text-slate-500">
                    {branchAddress(b) && ` · ${branchAddress(b)}`}
                    {b.gstin && ` · GSTIN ${b.gstin}`}
                  </span>
                </li>
              ))}
              <li className="px-3 py-1.5 text-xs text-slate-500">Edit or remove these under Purchases → Depot.</li>
            </ul>
          )}
          <div className="space-y-3">
            {depots.map((d, i) => (
              <div key={d.key} className="relative rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                {(editing || i > 0) && (
                <button
                  type="button"
                  onClick={() => setDepots((ds) => ds.filter((x) => x.key !== d.key))}
                  className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove depot ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label={!editing && i === 0 ? "Primary Depot Name" : `Depot ${i + 1} Name`} required className="sm:col-span-2">
                    <Input value={d.name} onChange={(e) => setDepot(d.key, { name: e.target.value })} className="uppercase" placeholder="E.G. CHENNAI DEPOT" aria-label={`Depot ${i + 1} name`} />
                  </Field>
                  <Field label="Code">
                    <Input value={d.code} onChange={(e) => setDepot(d.key, { code: e.target.value.toUpperCase() })} maxLength={10} placeholder="MAA" />
                  </Field>
                  <GstinField value={d.gstin} onChange={(g) => setDepot(d.key, { gstin: g })} onState={(st) => setDepot(d.key, { state: st })} />
                  <Field label="Contact Person">
                    <Input value={d.contactPerson} onChange={(e) => setDepot(d.key, { contactPerson: e.target.value })} className="uppercase" />
                  </Field>
                  <Field label="Phone">
                    <Input type="tel" inputMode="numeric" maxLength={10} value={d.phone} onChange={(e) => setDepot(d.key, { phone: e.target.value.replace(/\D/g, "") })} />
                  </Field>
                  <Field label="Address" className="sm:col-span-3">
                    <Input value={d.address} onChange={(e) => setDepot(d.key, { address: e.target.value })} className="uppercase" />
                  </Field>
                  <Field label="City">
                    <Input value={d.city} onChange={(e) => setDepot(d.key, { city: e.target.value })} className="uppercase" />
                  </Field>
                  <StateSelect value={d.state} onChange={(st) => setDepot(d.key, { state: st })} gstin={d.gstin} />
                  <Field label="Pincode">
                    <Input inputMode="numeric" maxLength={6} value={d.pincode} onChange={(e) => setDepot(d.key, { pincode: e.target.value.replace(/\D/g, "") })} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDepots((ds) => [...ds, blankDepot()])}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus className="size-4" /> Add Depot
          </button>
        </fieldset>
        {editing && (
          <div className="sm:col-span-3">
            <Checkbox label="Active" checked={!!f.isActive} onChange={(v) => set("isActive", v)} />
          </div>
        )}
      </form>
    </Modal>
  );
}
