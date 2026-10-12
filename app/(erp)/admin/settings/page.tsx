"use client";

import { Save } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RequirePerm } from "@/components/AppShell";
import { Button, Card, Checkbox, ErrorBox, Field, Input, PageHeader, Select, Spinner, Textarea, errMsg, useToast } from "@/components/ui";
import { GstinField, StateSelect } from "@/components/GstinField";
import { api } from "@/lib/api";
import { GST_STATES, parseGstin } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import type { StoreSettings } from "@/lib/types";

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
  "reminderTemplate",
] as const;

type TextKey = (typeof TEXT_FIELDS)[number] | "expiryAlertDays" | "reminderGraceDays" | "receiptFormat";
type Form = Record<TextKey, string> & { autoReminders: boolean; blockOverdueCredit: boolean; requireOpenShift: boolean };

const DEFAULT_TEMPLATE =
  "Namaste {name} ji, a gentle reminder from {store}: ₹{amount} is pending on your account ({days} days past due). Kindly clear it at your earliest convenience. If you have already paid, please ignore this message. Thank you! — {store} {phone}";

function toForm(s: StoreSettings): Form {
  const f = {} as Form;
  for (const k of TEXT_FIELDS) f[k] = (s[k] as string | null | undefined) ?? "";
  f.expiryAlertDays = String(s.expiryAlertDays ?? 60);
  f.reminderGraceDays = String(s.reminderGraceDays ?? 7);
  f.receiptFormat = s.receiptFormat ?? "A4";
  f.autoReminders = !!s.autoReminders;
  f.blockOverdueCredit = !!s.blockOverdueCredit;
  f.requireOpenShift = !!s.requireOpenShift;
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
    <RequirePerm perms={["admin.settings"]}>
      <Settings />
    </RequirePerm>
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

  const set = (k: TextKey, v: string) => setF((s) => ({ ...s, [k]: v }));
  const text = (k: TextKey, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
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
    const grace = Number(f.reminderGraceDays);
    if (!Number.isInteger(grace) || grace < 0 || grace > 90) return toast.error("Grace days must be between 0 and 90");
    for (const k of ["invoicePrefix", "purchasePrefix", "poPrefix", "receiptPrefix"] as const) {
      if (!f[k].trim()) return toast.error("Document prefixes cannot be blank");
    }
    if (!gstinInfo.empty && !gstinInfo.valid) return toast.error(`GSTIN: ${gstinInfo.error}`);
    if (gstinInfo.valid && f.stateCode && gstinInfo.stateCode !== f.stateCode) {
      return toast.error(`GSTIN is registered in ${gstinInfo.stateName} but the store state is ${f.state || f.stateCode}`);
    }
    const body: Record<string, unknown> = {
      expiryAlertDays: days,
      reminderGraceDays: grace,
      receiptFormat: f.receiptFormat,
      autoReminders: f.autoReminders,
      blockOverdueCredit: f.blockOverdueCredit,
      requireOpenShift: f.requireOpenShift,
    };
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
        subtitle="Store profile, GST registration, licences, printing, credit rules and reminders"
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

          <Section title="Counter, printing & stock alerts">
            <div className="sm:col-span-2">
              <Checkbox label="No billing without an open shift (cashier enters the opening cash first)" checked={f.requireOpenShift} onChange={(v) => setF((s) => ({ ...s, requireOpenShift: v }))} />
            </div>
            <Field label="Bill print layout" hint="Thermal receipts suit 80 mm / 58 mm roll printers at the counter; A4 is the full GST invoice">
              <Select value={f.receiptFormat} onChange={(e) => set("receiptFormat", e.target.value)}>
                <option value="A4">A4 tax invoice</option>
                <option value="THERMAL_80">Thermal receipt · 80 mm</option>
                <option value="THERMAL_58">Thermal receipt · 58 mm</option>
              </Select>
            </Field>
            <Field label="Expiry alert days" hint="Batches expiring within this many days are flagged on the dashboard and stock pages">
              {text("expiryAlertDays", { type: "number", min: 1, max: 365, step: 1 })}
            </Field>
          </Section>
        </div>

        <Section title="Credit control & due reminders" note="Bills on credit fall due after each customer's credit days. After the grace period they count as overdue.">
          <Field label="Grace days after due date" hint="Overdue reminders and credit checks start after this">
            {text("reminderGraceDays", { type: "number", min: 0, max: 90, step: 1 })}
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <Checkbox label="Block new credit sales to overdue customers (managers can override)" checked={f.blockOverdueCredit} onChange={(v) => setF((s) => ({ ...s, blockOverdueCredit: v }))} />
            <Checkbox
              label={`Send WhatsApp reminders automatically every day${initial.whatsappConfigured ? "" : " (needs the WhatsApp API keys on the server)"}`}
              checked={f.autoReminders}
              onChange={(v) => setF((s) => ({ ...s, autoReminders: v }))}
            />
          </div>
          <Field
            label="Reminder message"
            className="sm:col-span-2"
            hint="Placeholders: {name} {amount} {overdue} {days} {store} {phone} {date}. Leave blank for the default."
          >
            <Textarea rows={4} value={f.reminderTemplate} onChange={(e) => set("reminderTemplate", e.target.value)} placeholder={DEFAULT_TEMPLATE} />
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">
            WhatsApp sending: {initial.whatsappConfigured ? "API keys found — reminders can be sent from the server." : "not set up — the Due Reminders page opens WhatsApp with the message ready to send. To send automatically, set WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (and optionally WHATSAPP_TEMPLATE) on the server."}
          </p>
        </Section>

        <div className="space-y-4">
          <Section title="Document numbering" note="Numbers restart every financial year (April–March). Changing a prefix only affects new documents.">
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

          <Section title="Invoice footer" note="Printed at the bottom of every sales invoice and receipt — terms, bank details, a thank-you note.">
            <Field label="Footer text" className="sm:col-span-2">
              <Textarea
                rows={4}
                value={f.invoiceFooter}
                onChange={(e) => set("invoiceFooter", e.target.value)}
                placeholder={"Goods once sold will not be taken back.\nRead the label carefully before use.\nThank you for your business!"}
              />
            </Field>
          </Section>
        </div>
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
