"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, inr, n, qty } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Product } from "@/lib/types";
import { ApprovalGate, approvalNeeded, type ApprovalNeed } from "./ApprovalGate";
import { BranchBadge, useNeedBranch } from "./BranchNotice";
import { ProductPicker } from "./pickers";
import { Button, Field, Info, Input, Modal, Select, Textarea, cx, errMsg, useToast } from "./ui";

export type AdjustType = "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "DAMAGED" | "EXPIRED";

const TYPES: { value: AdjustType; label: string; hint: string }[] = [
  { value: "ADJUSTMENT_IN", label: "Add stock", hint: "Found stock, count correction" },
  { value: "ADJUSTMENT_OUT", label: "Remove stock", hint: "Shortage, samples, count correction" },
  { value: "DAMAGED", label: "Damaged", hint: "Torn bags, leaked bottles" },
  { value: "EXPIRED", label: "Expired", hint: "Write off expired batches" },
];

const AUTO = "";
const NEW_BATCH = "__new__";

export interface StockAdjustInitial {
  type?: AdjustType;
  batchId?: string;
  quantity?: number;
  reason?: string;
}

/**
 * Manual stock adjustment (add / remove / damaged / expired) → POST /inventory/adjustments.
 * Pass `product` to fix the product, otherwise a picker is shown. Managers only.
 */
export function StockAdjustModal({
  open,
  onClose,
  onSaved,
  product,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  product?: { id: string; name: string; unit: string } | null;
  initial?: StockAdjustInitial;
}) {
  const { can } = useAuth();
  if (!open || !can("inventory.adjust")) return null;
  // Remount on every open so the form starts from the given defaults
  return <AdjustForm onClose={onClose} onSaved={onSaved} fixed={product ?? null} initial={initial} />;
}

function AdjustForm({
  onClose,
  onSaved,
  fixed,
  initial,
}: {
  onClose: () => void;
  onSaved?: () => void;
  fixed: { id: string; name: string; unit: string } | null;
  initial?: StockAdjustInitial;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<Product | null>(null);
  const productId = fixed?.id ?? picked?.id ?? null;
  const { data: detail, loading } = useApi<Product>(productId ? `/products/${productId}` : null);

  const [type, setType] = useState<AdjustType>(initial?.type ?? "ADJUSTMENT_OUT");
  const [batchSel, setBatchSel] = useState(initial?.batchId ?? (initial?.type === "ADJUSTMENT_IN" ? NEW_BATCH : AUTO));
  const [batchNo, setBatchNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState(initial?.quantity ? String(initial.quantity) : "");
  const [unitCost, setUnitCost] = useState("");
  const [location, setLocation] = useState("");
  const [serials, setSerials] = useState("");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [saving, setSaving] = useState(false);
  const [need, setNeed] = useState<ApprovalNeed | null>(null);
  const needBranch = useNeedBranch("adjust its stock");

  const isIn = type === "ADJUSTMENT_IN";
  const batches = detail?.batches ?? [];
  const tracksBatch = detail?.trackBatch ?? true;
  const selectedBatch = batches.find((b) => b.id === batchSel) ?? null;
  const name = fixed?.name ?? picked?.name ?? "";
  const unit = detail?.unit ?? fixed?.unit ?? picked?.unit ?? "";
  const available = selectedBatch ? n(selectedBatch.quantity) : n(detail?.stock);
  const q = Number(quantity);
  const overdraw = !isIn && q > 0 && detail && q > available + 1e-9;

  function changeType(t: AdjustType) {
    setType(t);
    // "Auto" makes no sense for stock-in and "new batch" makes no sense for stock-out
    if (t === "ADJUSTMENT_IN" && batchSel === AUTO) setBatchSel(tracksBatch ? NEW_BATCH : AUTO);
    if (t !== "ADJUSTMENT_IN" && batchSel === NEW_BATCH) setBatchSel(AUTO);
  }

  function pickProduct(p: Product) {
    setPicked(p);
    setBatchSel(isIn && p.trackBatch ? NEW_BATCH : AUTO);
    setUnitCost("");
  }

  async function save(e: React.FormEvent | null, approvalId?: string) {
    e?.preventDefault();
    if (needBranch.blocked) return toast.error("Pick a branch in the top bar first");
    if (!productId) return toast.error("Choose a product");
    if (!(q > 0)) return toast.error("Enter a quantity greater than zero");
    if (overdraw) return toast.error(`Only ${qty(available)} ${unit} available`);
    if (!reason.trim()) return toast.error("Give a reason for this adjustment");
    const body: Record<string, unknown> = { productId, type, quantity: q, reason: reason.trim(), approvalId };
    if (isIn) {
      if (batchSel && batchSel !== NEW_BATCH) body.batchId = batchSel;
      else if (tracksBatch) {
        if (batchNo.trim()) body.batchNo = batchNo.trim();
        if (expiry) body.expiryDate = expiry;
      }
      if (unitCost !== "") body.unitCost = Number(unitCost);
      if (location.trim()) body.location = location.trim();
    } else if (batchSel) {
      body.batchId = batchSel;
    }
    const serialNos = serials.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (detail?.trackSerial && serialNos.length) {
      if (serialNos.length !== q) return toast.error(`Give ${qty(q)} serial numbers (${serialNos.length} given), or none`);
      body.serialNos = serialNos;
    }
    setSaving(true);
    try {
      await api.post("/inventory/adjustments", body);
      toast.success(`Stock ${isIn ? "added to" : "removed from"} ${name}`);
      onSaved?.();
      onClose();
    } catch (err) {
      const approval = approvalNeeded(err, { product: name, quantity: q, type, reason: reason.trim() });
      if (approval) setNeed(approval);
      else toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Modal
      open
      onClose={onClose}
      title="Adjust stock"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stock-adjust-form" loading={saving} disabled={needBranch.blocked} variant={isIn ? "primary" : "danger"}>
            {isIn ? "Add stock" : "Remove stock"}
          </Button>
        </>
      }
    >
      <form id="stock-adjust-form" onSubmit={save} className="space-y-4">
        {needBranch.notice ?? <BranchBadge label="Adjusting stock in" />}
        <Field label="Product" required>
          {fixed ? (
            <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
              <span className="truncate">{fixed.name}</span>
            </div>
          ) : picked ? (
            <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-800">{picked.name}</span>
              <button type="button" onClick={() => setPicked(null)} className="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Change product">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <ProductPicker onPick={pickProduct} autoFocus />
          )}
        </Field>

        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">Adjustment type</span>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => changeType(t.value)}
                className={cx(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  type === t.value
                    ? t.value === "ADJUSTMENT_IN"
                      ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20"
                      : "border-red-400 bg-red-50 ring-2 ring-red-500/15"
                    : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <p className="text-sm font-medium text-slate-800">{t.label}</p>
                <p className="text-xs text-slate-500">{t.hint}</p>
              </button>
            ))}
          </div>
        </div>

        {productId && (
          <>
            {detail && (
              <dl className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <Info label="Current stock">
                  <span className="num">
                    {qty(detail.stock)} {unit}
                  </span>
                </Info>
                <Info label="Batches in stock">{batches.length || "None"}</Info>
                <Info label="Purchase rate">{inr(detail.purchasePrice)}</Info>
              </dl>
            )}

            {(tracksBatch || !isIn) && (
              <Field
                label="Batch"
                hint={!isIn && batchSel === AUTO ? "Stock is taken from the earliest-expiring batches first" : undefined}
              >
                <Select value={batchSel} onChange={(e) => setBatchSel(e.target.value)} disabled={loading && !detail}>
                  {isIn ? (
                    <option value={NEW_BATCH}>New batch…</option>
                  ) : (
                    <option value={AUTO}>Auto (earliest expiry)</option>
                  )}
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchNo} · {qty(b.quantity)} {unit}
                      {b.expiryDate ? ` · exp ${date(b.expiryDate)}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {isIn && tracksBatch && batchSel === NEW_BATCH && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Batch no." hint="Leave blank for the default batch">
                  <Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
                </Field>
                <Field label="Expiry date">
                  <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                </Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label={`Quantity${unit ? ` (${unit})` : ""}`} required>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={overdraw ? "border-red-400" : undefined}
                  required
                />
                {!isIn && detail && (
                  <span className={cx("mt-1 block text-xs", overdraw ? "text-red-600" : "text-slate-400")}>
                    {qty(available)} {unit} available
                    {!overdraw && available > 0 && q !== available && (
                      <button type="button" className="ml-1 text-brand-700 hover:underline" onClick={() => setQuantity(String(available))}>
                        · use all
                      </button>
                    )}
                    {overdraw && " — reduce the quantity"}
                  </span>
                )}
              </Field>
              {isIn && (
                <Field label="Unit cost (excl. GST)" hint={detail ? `Defaults to ${inr(selectedBatch?.costPrice ?? detail.purchasePrice)}` : undefined}>
                  <Input type="number" step="0.01" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                </Field>
              )}
            </div>
          </>
        )}

        {isIn && (
          <Field label="Location" hint={detail?.location ? `Usually ${detail.location}` : "Rack / bin (optional)"}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={detail?.location ?? ""} />
          </Field>
        )}
        {detail?.trackSerial && (
          <Field label={isIn ? "Serial numbers of the units added" : "Serial numbers of the units removed"} hint="One per line; optional">
            <Textarea rows={3} value={serials} onChange={(e) => setSerials(e.target.value)} className="font-mono" />
          </Field>
        )}
        <Field label="Reason" required>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isIn ? "e.g. Physical count found 2 extra bags" : "e.g. Bag torn during unloading"}
            required
          />
        </Field>
      </form>
    </Modal>
    <ApprovalGate
      need={need}
      onClose={() => setNeed(null)}
      onApproved={(id, by) => {
        setNeed(null);
        toast.success(`Approved by ${by}`);
        void save(null, id);
      }}
    />
    </>
  );
}
