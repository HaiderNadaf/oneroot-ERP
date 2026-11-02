"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { ProductPicker } from "@/components/pickers";
import { Button, Checkbox, DateInput, Field, Input, Modal, Select, Textarea, cx, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { n, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { OCCASIONS, PURPOSE_LABEL, SCHEME_TYPE_LABEL, SCOPE_LABEL } from "@/lib/offers";
import type { Campaign, Category, OfferPurpose, Product, Scheme, SchemeScope, SchemeType } from "@/lib/types";

export { SCHEME_TYPE_LABEL, describeScheme } from "@/lib/offers";
const TYPE_LABEL = SCHEME_TYPE_LABEL;
/** Scheme dates are whole local days; the API sends them as ISO timestamps */
export const dayOf = (iso: string) => today(new Date(iso));

/** What the offer is for, with a starting type and hint */
const PURPOSE_HINT: Record<OfferPurpose, string> = {
  GENERAL: "",
  FESTIVAL: "Festival offers usually cover whole categories or the store, often above a bill value.",
  STOCK_CLEARANCE: "Clear slow-moving or near-expiry stock: set an offer price and a stock limit so it stops when the lot is sold.",
  SEASONAL: "For the sowing season — e.g. seeds and fertiliser before Kharif / Rabi.",
  COMPANY: "A manufacturer's scheme, usually claimed back from the company.",
  NEW_LAUNCH: "Introduce a new product at a lower price for a while.",
  BULK: "Reward bigger purchases: set the minimum units per line.",
};

/**
 * Add or edit a scheme (an offer). `campaign` puts a new one in that campaign and starts it on the campaign's dates;
 * otherwise the form offers a campaign to put it in (or none).
 */
export function SchemeForm({
  scheme,
  campaign,
  purpose: initialPurpose,
  onClose,
  onSaved,
}: {
  scheme: Scheme | null;
  campaign?: Pick<Campaign, "id" | "name" | "from" | "to"> | null;
  /** Purpose a new offer starts with (from the page's quick-add buttons) */
  purpose?: OfferPurpose;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const startPurpose = scheme?.purpose ?? initialPurpose ?? "GENERAL";
  const [name, setName] = useState(scheme?.name ?? "");
  const [purpose, setPurpose] = useState<OfferPurpose>(startPurpose);
  const [occasion, setOccasion] = useState(scheme?.occasion ?? "");
  const [type, setType] = useState<SchemeType>(scheme?.type ?? (startPurpose === "STOCK_CLEARANCE" ? "FIXED_PRICE" : startPurpose === "FESTIVAL" || startPurpose === "BULK" ? "PCT_OFF" : "BUY_X_GET_Y"));
  const [scope, setScope] = useState<SchemeScope>(scheme?.scope ?? (startPurpose === "FESTIVAL" ? "ALL" : "PRODUCTS"));
  const [categoryIds, setCategoryIds] = useState<string[]>(scheme?.categories.map((c) => c.categoryId) ?? []);
  const { data: categories } = useApi<Category[]>(scope === "CATEGORIES" ? "/categories" : null);
  const [price, setPrice] = useState(scheme?.price ? String(n(scheme.price)) : "");
  const [minQty, setMinQty] = useState(scheme?.minQty ? String(n(scheme.minQty)) : "");
  const [minBill, setMinBill] = useState(scheme?.minBill ? String(n(scheme.minBill)) : "");
  const [maxQty, setMaxQty] = useState(scheme?.maxQty ? String(n(scheme.maxQty)) : "");
  const [excludeSubsidised, setExcludeSubsidised] = useState(scheme ? scheme.excludeSubsidised || scheme.scope === "PRODUCTS" : true);
  const [products, setProducts] = useState<{ id: string; name: string }[]>(scheme?.products.map((p) => ({ id: p.productId, name: p.product?.name ?? p.productId })) ?? []);
  const [buyQty, setBuyQty] = useState(String(scheme?.buyQty ?? 10));
  const [freeQty, setFreeQty] = useState(String(scheme?.freeQty ?? 1));
  const [pct, setPct] = useState(scheme?.pct ? String(n(scheme.pct)) : "");
  const [flat, setFlat] = useState(scheme?.flat ? String(n(scheme.flat)) : "");
  const [from, setFrom] = useState(scheme ? dayOf(scheme.from) : campaign ? dayOf(campaign.from) : today());
  const [to, setTo] = useState(scheme?.to ? dayOf(scheme.to) : !scheme && campaign?.to ? dayOf(campaign.to) : "");
  const [campaignId, setCampaignId] = useState(scheme ? (scheme.campaignId ?? "") : (campaign?.id ?? ""));
  // Campaigns to choose from (only when the form wasn't opened from a campaign)
  // const { data: campaigns } = useApi<Campaign[]>(campaign ? null : "/campaigns"); // Campaigns disabled
  const [claimable, setClaimable] = useState(scheme?.claimable ?? startPurpose === "COMPANY");
  const [isActive, setIsActive] = useState(scheme?.isActive ?? true);
  const [notes, setNotes] = useState(scheme?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (scope === "PRODUCTS" && !products.length) return toast.error("Add at least one product");
    if (scope === "CATEGORIES" && !categoryIds.length) return toast.error("Choose at least one category");
    const body = {
      name: name.trim(),
      type,
      purpose,
      occasion: occasion.trim() || null,
      scope,
      productIds: scope === "PRODUCTS" ? products.map((p) => p.id) : [],
      categoryIds: scope === "CATEGORIES" ? categoryIds : [],
      buyQty: Number(buyQty) || undefined,
      freeQty: Number(freeQty) || undefined,
      pct: Number(pct) || undefined,
      flat: Number(flat) || undefined,
      price: Number(price) || undefined,
      minQty: Number(minQty) || null,
      minBill: Number(minBill) || null,
      maxQty: Number(maxQty) || null,
      excludeSubsidised,
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
      toast.success(scheme ? "Offer updated" : "Offer created — it shows and applies at the counter from the start date");
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
      title={scheme ? `Edit ${scheme.name}` : "New Offer"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="scheme-form" loading={saving}>
            {scheme ? "Save" : "Create Offer"}
          </Button>
        </>
      }
    >
      <form id="scheme-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Purpose" required>
          <Select value={purpose} onChange={(e) => setPurpose(e.target.value as OfferPurpose)}>
            {(Object.keys(PURPOSE_LABEL) as OfferPurpose[]).map((p) => (
              <option key={p} value={p}>
                {PURPOSE_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" required className="sm:col-span-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder={purpose === "FESTIVAL" ? "e.g. Diwali Dhamaka 5% off" : purpose === "STOCK_CLEARANCE" ? "e.g. Hybrid maize clearance" : "e.g. Mancozeb 10+1 (Oct)"}
          />
        </Field>
        {PURPOSE_HINT[purpose] && <p className="-mt-1 text-xs text-slate-500 sm:col-span-3">{PURPOSE_HINT[purpose]}</p>}
        <Field label={purpose === "FESTIVAL" ? "Festival / Occasion" : "Occasion / Tag"} hint="Shown at the counter">
          <Input value={occasion} onChange={(e) => setOccasion(e.target.value)} list="offer-occasions" placeholder={purpose === "FESTIVAL" ? "e.g. Pongal 2027" : "Optional"} maxLength={80} />
          <datalist id="offer-occasions">
            {OCCASIONS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </Field>
        <Field label="Offer Type" required>
          <Select value={type} onChange={(e) => setType(e.target.value as SchemeType)}>
            {(Object.keys(TYPE_LABEL) as SchemeType[]).map((t) => (
              <option key={t} value={t} disabled={t === "BUY_X_GET_Y" && scope !== "PRODUCTS"}>
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
            <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-3">Free units go out of stock at zero price on the bill.</p>
          </>
        ) : type === "PCT_OFF" ? (
          <Field label="Discount %" required>
            <Input type="number" min="0" max="100" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} className="num" required />
          </Field>
        ) : type === "FLAT_OFF" ? (
          <Field label="₹ off per unit" required>
            <Input type="number" min="0" step="0.5" value={flat} onChange={(e) => setFlat(e.target.value)} className="num" required />
          </Field>
        ) : (
          <Field label="Offer price per unit ₹" required hint="GST-inclusive, like the selling rate">
            <Input type="number" min="0" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} className="num" required />
          </Field>
        )}
        <Field label="Applies To" required className="sm:col-span-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SCOPE_LABEL) as SchemeScope[]).map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => {
                  setScope(sc);
                  if (sc !== "PRODUCTS" && type === "BUY_X_GET_Y") setType("PCT_OFF");
                }}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  scope === sc ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand-500",
                )}
              >
                {SCOPE_LABEL[sc]}
              </button>
            ))}
          </div>
        </Field>
        {scope === "PRODUCTS" ? (
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
        ) : scope === "CATEGORIES" ? (
          <Field label="Categories" required className="sm:col-span-3">
            <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-3">
              {(categories ?? []).map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={categoryIds.includes(c.id)}
                  onChange={(on) => setCategoryIds((ids) => (on ? [...ids, c.id] : ids.filter((x) => x !== c.id)))}
                />
              ))}
              {!categories && <span className="text-xs text-slate-400">Loading categories…</span>}
            </div>
          </Field>
        ) : null}
        <Field label="Min Units per Line" hint="Blank = any quantity">
          <Input type="number" min="0" step="any" value={minQty} onChange={(e) => setMinQty(e.target.value)} className="num" placeholder="e.g. 5" />
        </Field>
        <Field label="Only When Bill ≥ ₹" hint="Blank = any bill">
          <Input type="number" min="0" step="100" value={minBill} onChange={(e) => setMinBill(e.target.value)} className="num" placeholder="e.g. 2000" />
        </Field>
        <Field label="Stock Limit (units)" hint={scheme?.usedQty !== undefined ? `${scheme.usedQty} sold so far · blank = no limit` : "Stops after this many units · blank = no limit"}>
          <Input type="number" min="0" step="any" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} className="num" placeholder="e.g. 100" />
        </Field>
        <Field label="From" required>
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To" hint="Blank = until switched off">
          <DateInput value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Checkbox label="Claim Back From the Company" checked={claimable} onChange={setClaimable} />
          <Checkbox label="Switched On" checked={isActive} onChange={setIsActive} />
          {scope !== "PRODUCTS" && <Checkbox label="Leave Out Subsidised Fertiliser" checked={excludeSubsidised} onChange={setExcludeSubsidised} />}
        </div>
        {/* Campaigns disabled
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
        */}
        <Field label="Notes" className="sm:col-span-3">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Company circular no., conditions…" />
        </Field>
      </form>
    </Modal>
  );
}

