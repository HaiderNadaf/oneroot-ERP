"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { ProductPicker } from "@/components/pickers";
import { Button, Checkbox, DateInput, Field, Input, Modal, Select, Textarea, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { inr, n, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Campaign, Product, Scheme, SchemeType } from "@/lib/types";

export const SCHEME_TYPE_LABEL: Record<SchemeType, string> = { BUY_X_GET_Y: "Buy X Get Y Free", PCT_OFF: "% off", FLAT_OFF: "Flat ₹ Off per Unit" };
const TYPE_LABEL = SCHEME_TYPE_LABEL;
/** Scheme dates are whole local days; the API sends them as ISO timestamps */
export const dayOf = (iso: string) => today(new Date(iso));

/** "Buy 10 get 1 free", "5% off", "₹20.00 off per unit" */
export function describeScheme(s: Scheme) {
  if (s.type === "BUY_X_GET_Y") return `Buy ${s.buyQty} get ${s.freeQty} free`;
  if (s.type === "PCT_OFF") return `${n(s.pct)}% off`;
  return `${inr(s.flat)} off per unit`;
}

/**
 * Add or edit a scheme (an offer). `campaign` puts a new one in that campaign and starts it on the campaign's dates;
 * otherwise the form offers a campaign to put it in (or none).
 */
export function SchemeForm({
  scheme,
  campaign,
  onClose,
  onSaved,
}: {
  scheme: Scheme | null;
  campaign?: Pick<Campaign, "id" | "name" | "from" | "to"> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(scheme?.name ?? "");
  const [type, setType] = useState<SchemeType>(scheme?.type ?? "BUY_X_GET_Y");
  const [products, setProducts] = useState<{ id: string; name: string }[]>(scheme?.products.map((p) => ({ id: p.productId, name: p.product?.name ?? p.productId })) ?? []);
  const [buyQty, setBuyQty] = useState(String(scheme?.buyQty ?? 10));
  const [freeQty, setFreeQty] = useState(String(scheme?.freeQty ?? 1));
  const [pct, setPct] = useState(scheme?.pct ? String(n(scheme.pct)) : "");
  const [flat, setFlat] = useState(scheme?.flat ? String(n(scheme.flat)) : "");
  const [from, setFrom] = useState(scheme ? dayOf(scheme.from) : campaign ? dayOf(campaign.from) : today());
  const [to, setTo] = useState(scheme?.to ? dayOf(scheme.to) : !scheme && campaign?.to ? dayOf(campaign.to) : "");
  const [campaignId, setCampaignId] = useState(scheme ? (scheme.campaignId ?? "") : (campaign?.id ?? ""));
  // Campaigns to choose from (only when the form wasn't opened from a campaign)
  const { data: campaigns } = useApi<Campaign[]>(campaign ? null : "/campaigns");
  const [claimable, setClaimable] = useState(scheme?.claimable ?? true);
  const [isActive, setIsActive] = useState(scheme?.isActive ?? true);
  const [notes, setNotes] = useState(scheme?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!products.length) return toast.error("Add at least one product");
    const body = {
      name: name.trim(),
      type,
      productIds: products.map((p) => p.id),
      buyQty: Number(buyQty) || undefined,
      freeQty: Number(freeQty) || undefined,
      pct: Number(pct) || undefined,
      flat: Number(flat) || undefined,
      from,
      to: to || undefined,
      claimable,
      isActive,
      notes: notes.trim() || undefined,
      campaignId: campaignId || null,
    };
    setSaving(true);
    try {
      if (scheme) await api.patch(`/schemes/${scheme.id}`, body);
      else await api.post("/schemes", body);
      toast.success(scheme ? "Scheme updated" : "Scheme created — it applies at the counter from the start date");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={scheme ? `Edit ${scheme.name}` : "New Scheme"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="scheme-form" loading={saving}>
            {scheme ? "Save" : "Create Scheme"}
          </Button>
        </>
      }
    >
      <form id="scheme-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Mancozeb 10+1 (Oct)" />
        </Field>
        <Field label="Type" required>
          <Select value={type} onChange={(e) => setType(e.target.value as SchemeType)}>
            {(Object.keys(TYPE_LABEL) as SchemeType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        {type === "BUY_X_GET_Y" ? (
          <>
            <Field label="Buy" required>
              <Input type="number" min="1" step="1" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} className="num" />
            </Field>
            <Field label="Get Free" required>
              <Input type="number" min="1" step="1" value={freeQty} onChange={(e) => setFreeQty(e.target.value)} className="num" />
            </Field>
            <p className="self-end pb-2 text-xs text-slate-500">Free units go out of stock at zero price on the bill.</p>
          </>
        ) : type === "PCT_OFF" ? (
          <Field label="Discount %" required>
            <Input type="number" min="0" max="100" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} className="num" required />
          </Field>
        ) : (
          <Field label="₹ off per unit" required>
            <Input type="number" min="0" step="0.5" value={flat} onChange={(e) => setFlat(e.target.value)} className="num" required />
          </Field>
        )}
        <Field label="From" required>
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To" hint="Blank = until switched off">
          <DateInput value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Checkbox label="Claim Back From the Company" checked={claimable} onChange={setClaimable} />
          <Checkbox label="Switched On" checked={isActive} onChange={setIsActive} />
        </div>
        <Field label="Campaign" hint="Its offers only apply while the campaign runs" className="sm:col-span-3">
          {campaign ? (
            <Input value={campaign.name} readOnly disabled />
          ) : (
            <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="Campaign">
              <option value="">No campaign (standalone scheme)</option>
              {campaigns?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
              {campaignId && !campaigns?.some((c) => c.id === campaignId) && <option value={campaignId}>{scheme?.campaign?.name ?? "Current campaign"}</option>}
            </Select>
          )}
        </Field>
        <Field label="Products" required className="sm:col-span-3">
          <ProductPicker onPick={(p: Product) => setProducts((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, { id: p.id, name: p.name }]))} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {products.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-600/20">
                {p.name}
                <button type="button" onClick={() => setProducts((ps) => ps.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {!products.length && <span className="text-xs text-slate-400">No products yet</span>}
          </div>
        </Field>
        <Field label="Notes" className="sm:col-span-3">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Company circular no., conditions…" />
        </Field>
      </form>
    </Modal>
  );
}

