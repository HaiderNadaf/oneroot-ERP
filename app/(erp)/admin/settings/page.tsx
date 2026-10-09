"use client";

import { Save } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RequireRole } from "@/components/AppShell";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner, Textarea, errMsg, useToast } from "@/components/ui";
import { GstinField, StateSelect } from "@/components/GstinField";
import { api } from "@/lib/api";
import { GST_STATES, parseGstin } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import type { StoreSettings } from "@/lib/types";

type Form = Record<Exclude<keyof StoreSettings, "id" | "expiryAlertDays">, string> & { expiryAlertDays: string };

const TEXT_FIELDS = [
  "storeName",
  "ownerName",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "stateCode",
  "pincode",
  "gstin",
  "fertilizerLicenseNo",
  "pesticideLicenseNo",
  "seedLicenseNo",
  "invoicePrefix",
  "purchasePrefix",
  "poPrefix",
  "receiptPrefix",
  "invoiceFooter",
] as const;

function toForm(s: StoreSettings): Form {
  const f = {} as Form;
  for (const k of TEXT_FIELDS) f[k] = (s[k] as string | null | undefined) ?? "";
  f.expiryAlertDays = String(s.expiryAlertDays ?? 60);
  return f;
}

/** Indian financial year label used in document numbers, e.g. "26-27" */
function fyLabel(d = new Date()) {
  const y = d.getFullYear() % 100;
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${String(start).padStart(2, "0")}-${String(start + 1).padStart(2, "0")}`;
}


export default function SettingsPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <Settings />
    </RequireRole>
  );
}

function Settings() {
  const { data, error, loading, reload, setData } = useApi<StoreSettings>("/settings");
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  return <SettingsForm key={data.id} initial={data} onSaved={setData} />;
}

function SettingsForm({ initial, onSaved }: { initial: StoreSettings; onSaved: (s: StoreSettings) => void }) {
  const toast = useToast();
  const [f, setF] = useState<Form>(() => toForm(initial));
  const [saved, setSaved] = useState<Form>(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);

  const set = (k: keyof Form, v: string) => setF((s) => ({ ...s, [k]: v }));
  const text = (k: keyof Form, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <Input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} />
  );

  const gstin = f.gstin.trim().toUpperCase();
  const gstinInfo = parseGstin(gstin);
  /** Picking a state also sets its GST state code */
  const setState = (name: string) => {
    const code = Object.entries(GST_STATES).find(([, n]) => n === name)?.[0] ?? "";
    setF((s) => ({ ...s, state: name, stateCode: code }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.storeName.trim()) return toast.error("Store name is required");
    const days = Number(f.expiryAlertDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) return toast.error("Expiry alert days must be between 1 and 365");
    for (const k of ["invoicePrefix", "purchasePrefix", "poPrefix", "receiptPrefix"] as const) {
      if (!f[k].trim()) return toast.error("Document prefixes cannot be blank");
    }
    if (!gstinInfo.empty && !gstinInfo.valid) return toast.error(`GSTIN: ${gstinInfo.error}`);
    if (gstinInfo.valid && f.stateCode && gstinInfo.stateCode !== f.stateCode) {
      return toast.error(`GSTIN is registered in ${gstinInfo.stateName} but the store state is ${f.state || f.stateCode}`);
    }
    const body: Record<string, unknown> = { expiryAlertDays: days };
    for (const k of TEXT_FIELDS) body[k] = f[k].trim();
    body.gstin = gstin;
    for (const k of ["invoicePrefix", "purchasePrefix", "poPrefix", "receiptPrefix"] as const) body[k] = f[k].trim().toUpperCase();
    setSaving(true);
    try {
      const res = await api.put<StoreSettings>("/settings", body);
      const next = toForm(res);
      setF(next);
      setSaved(next);
      onSaved(res);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  const fy = fyLabel();
  const example = (prefix: string) => `${(prefix.trim() || "—").toUpperCase()}/${fy}/00001`;

  return (
    <form onSubmit={save}>
      <PageHeader
        title="Store settings"
        subtitle="Store profile, GST registration and licences printed on every invoice"
        actions={
          <>
            {dirty && (
              <Button variant="ghost" onClick={() => setF(saved)}>
                Discard changes
              </Button>
            )}
            <Button type="submit" icon={<Save className="size-4" />} loading={saving} disabled={!dirty}>
              Save settings
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Store profile" note="Shown on the invoice header.">
          <Field label="Store name" required className="sm:col-span-2">
            {text("storeName", { required: true })}
          </Field>
          <Field label="Proprietor / owner">{text("ownerName")}</Field>
          <Field label="Phone">{text("phone", { type: "tel" })}</Field>
          <Field label="Email" className="sm:col-span-2">
            {text("email", { type: "email" })}
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="City / town">{text("city")}</Field>
          <Field label="PIN code">{text("pincode", { inputMode: "numeric", maxLength: 6 })}</Field>
          <StateSelect value={f.state} onChange={setState} gstin={gstin} />
          <Field label="GST state code" hint="Set from the state — decides CGST + SGST vs IGST on every bill">
            <Input value={f.stateCode ? `${f.stateCode} · ${GST_STATES[f.stateCode] ?? "unknown code"}` : ""} readOnly placeholder="Choose a state" className="bg-slate-50" />
          </Field>
        </Section>

        <div className="space-y-4">
          <Section title="GST & licences" note="These numbers print on every invoice. Agri-input dealers must show valid licence numbers.">
            <GstinField
              label="Store GSTIN"
              className="sm:col-span-2"
              value={f.gstin}
              onChange={(g) => set("gstin", g)}
              onState={setState}
              showTaxType={false}
              hint="Leave blank if unregistered. The state is taken from the first two digits."
            />
            <Field label="Fertilizer licence no.">{text("fertilizerLicenseNo")}</Field>
            <Field label="Pesticide (insecticide) licence no.">{text("pesticideLicenseNo")}</Field>
            <Field label="Seed licence no.">{text("seedLicenseNo")}</Field>
          </Section>

          <Section title="Stock alerts">
            <Field label="Expiry alert days" hint="Batches expiring within this many days are flagged on the dashboard and stock pages">
              {text("expiryAlertDays", { type: "number", min: 1, max: 365, step: 1 })}
            </Field>
          </Section>
        </div>

        <Section title="Document numbering" note={`Numbers restart every financial year (April–March). Changing a prefix only affects new documents.`}>
          {(
            [
              ["invoicePrefix", "Sales invoice"],
              ["purchasePrefix", "Purchase entry"],
              ["poPrefix", "Purchase order"],
              ["receiptPrefix", "Payment / receipt"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={`${label} prefix`} hint={`e.g. ${example(f[k])}`}>
              <Input value={f[k]} onChange={(e) => set(k, e.target.value.toUpperCase())} maxLength={8} className="font-mono" />
            </Field>
          ))}
        </Section>

        <Section title="Invoice footer" note="Printed at the bottom of every sales invoice — terms, bank details, a thank-you note.">
          <Field label="Footer text" className="sm:col-span-2">
            <Textarea
              rows={5}
              value={f.invoiceFooter}
              onChange={(e) => set("invoiceFooter", e.target.value)}
              placeholder={"Goods once sold will not be taken back.\nRead the label carefully before use.\nThank you for your business!"}
            />
          </Field>
        </Section>
      </div>
    </form>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card title={title}>
      {note && <p className="-mt-1 mb-3 text-xs text-slate-500">{note}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </Card>
  );
}
