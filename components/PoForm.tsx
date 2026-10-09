"use client";

import { AlertTriangle, ListPlus, PackagePlus, Route, Send, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBranchOptions } from "@/components/BranchNotice";
import { useCounts } from "@/components/Notifications";
import { ProductPicker, VendorPicker } from "@/components/pickers";
import { Button, Card, Field, Input, Select, Spinner, Table, Td, Textarea, Th, cx, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useBranch } from "@/lib/branch";
import { placeOfSupply } from "@/lib/gst";
import { inr, inr0, n, qty, round2, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { ApprovalConfig, Product, PurchaseOrder, StoreSettings, Vendor } from "@/lib/types";

interface LowStockRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: string;
  reorderLevel: string;
  purchasePrice: string;
  gstRate: string;
}

interface PoLine {
  key: number;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  stock?: number;
  gstRate: number;
  quantity: string;
  rate: string;
}

let lineSeq = 0;

const lineTaxable = (l: PoLine) => round2((Number(l.quantity) || 0) * (Number(l.rate) || 0));
const lineAmount = (l: PoLine) => round2(lineTaxable(l) * (1 + l.gstRate / 100));

/** Same rule as the backend's chainFor: first band that covers the value, then that many leading steps */
export function chainForValue(config: ApprovalConfig, total: number) {
  const bands = [...config.bands].sort((a, b) => (a.upTo === null ? 1 : b.upTo === null ? -1 : a.upTo - b.upTo));
  const band = bands.find((b) => b.upTo === null || total <= b.upTo) ?? bands[bands.length - 1];
  if (!band) return { band: null, steps: config.steps.slice(0, 1) };
  return { band, steps: config.steps.slice(0, Math.max(1, Math.min(band.steps, config.steps.length))) };
}

/** True when the vendor is registered in another state (from GSTIN, else state), so the PO attracts IGST */
export function isInterState(
  vendor?: { gstin?: string | null; state?: string | null } | null,
  store?: { gstin?: string | null; state?: string | null; stateCode?: string | null } | null,
) {
  return placeOfSupply(vendor, store).interState === true;
}

/** Create or edit a purchase order; pass `po` to edit */
export function PoForm({ po, presetVendorId }: { po?: PurchaseOrder; presetVendorId?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useCounts();
  const editing = !!po;

  const [vendor, setVendor] = useState<Vendor | null>(po?.vendor ?? null);
  const [orderDate, setOrderDate] = useState(po ? today(new Date(po.orderDate)) : today());
  const [expectedDate, setExpectedDate] = useState(po?.expectedDate ? today(new Date(po.expectedDate)) : "");
  const [lines, setLines] = useState<PoLine[]>(() =>
    // Negative keys for loaded lines so they never clash with lines added later
    (po?.items ?? []).map((i, idx) => ({
      key: -(idx + 1),
      productId: i.productId,
      name: i.product.name,
      sku: i.product.sku,
      unit: i.product.unit,
      gstRate: n(i.gstRate),
      quantity: String(n(i.quantity)),
      rate: String(n(i.rate)),
    })),
  );
  const [notes, setNotes] = useState(po?.notes ?? "");
  // Deliver-to branch: where the goods are received (GRN) and stocked
  const { currentId } = useBranch();
  const { branches: branchOptions, loading: branchesLoading } = useBranchOptions();
  const [branchPick, setBranchPick] = useState(po?.branchId ?? po?.branch?.id ?? (currentId !== "all" ? currentId : ""));
  // A single-branch store needs no choice
  const branchId = branchPick || (branchOptions.length === 1 ? branchOptions[0].id : "");
  const showBranch = branchOptions.length > 1 || !branchId;
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [loadingLow, setLoadingLow] = useState(false);
  const [preloading, setPreloading] = useState(!po && !!presetVendorId);

  const { data: store } = useApi<StoreSettings>("/settings");
  const { data: rules, error: rulesError } = useApi<ApprovalConfig>("/approval-rules");

  useEffect(() => {
    if (po || !presetVendorId) return;
    let cancelled = false;
    api
      .get<Vendor>(`/vendors/${presetVendorId}`)
      .then((v) => !cancelled && setVendor(v))
      .catch((e) => !cancelled && toast.error(errMsg(e)))
      .finally(() => !cancelled && setPreloading(false));
    return () => {
      cancelled = true;
    };
    // toast's identity changes on every toast; only the vendor id should trigger a reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetVendorId]);

  function addProduct(p: Product) {
    setLines((ls) => {
      const existing = ls.find((l) => l.productId === p.id);
      if (existing) {
        return ls.map((l) => (l === existing ? { ...l, quantity: String(round2((Number(l.quantity) || 0) + 1)) } : l));
      }
      return [
        ...ls,
        {
          key: ++lineSeq,
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          stock: n(p.stock),
          gstRate: n(p.gstRate),
          quantity: "1",
          rate: n(p.purchasePrice) ? String(n(p.purchasePrice)) : "",
        },
      ];
    });
  }

  async function addLowStock() {
    setLoadingLow(true);
    try {
      const low = await api.get<LowStockRow[]>("/inventory/low-stock");
      const have = new Set(lines.map((l) => l.productId));
      const todo = low.filter((r) => !have.has(r.id));
      if (!todo.length) {
        toast.success(low.length ? "All low-stock items are already on this order" : "No products are below their reorder level");
        return;
      }
      setLines((ls) => [
        ...ls,
        ...todo.map((r) => ({
          key: ++lineSeq,
          productId: r.id,
          name: r.name,
          sku: r.sku,
          unit: r.unit,
          stock: n(r.stock),
          gstRate: n(r.gstRate),
          quantity: String(Math.ceil(Math.max(n(r.reorderLevel) * 2 - n(r.stock), 1))),
          rate: n(r.purchasePrice) ? String(n(r.purchasePrice)) : "",
        })),
      ]);
      toast.success(`Added ${todo.length} low-stock item${todo.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoadingLow(false);
    }
  }

  const update = (key: number, patch: Partial<PoLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const subtotal = round2(lines.reduce((s, l) => s + lineTaxable(l), 0));
  const total = round2(lines.reduce((s, l) => s + lineAmount(l), 0));
  const tax = round2(total - subtotal);
  const igst = isInterState(vendor, store);
  const pos = placeOfSupply(vendor, store);
  const cgst = round2(tax / 2);
  const route = rules ? chainForValue(rules, total) : null;

  const hadApprovals = !!po && (po.level > 0 || po.status === "APPROVED");
  const resubmit = po?.status === "SENT_BACK";

  async function save(submit: boolean) {
    if (!vendor) return toast.error("Choose the vendor");
    if (!branchId) return toast.error("Choose the branch the goods are delivered to");
    if (!lines.length) return toast.error("Add at least one product");
    for (const l of lines) {
      if (!(Number(l.quantity) > 0)) return toast.error(`Enter a quantity for ${l.name}`);
      if (!(Number(l.rate) > 0)) return toast.error(`Enter the rate for ${l.name}`);
    }
    if (expectedDate && expectedDate < orderDate) return toast.error("Expected delivery is before the PO date");
    setSaving(submit ? "submit" : "draft");
    const body = {
      vendorId: vendor.id,
      branchId,
      orderDate,
      expectedDate: expectedDate || undefined,
      items: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), rate: Number(l.rate) })),
      notes: notes.trim() || undefined,
      submit,
    };
    try {
      const saved = po
        ? await api.put<PurchaseOrder>(`/purchase-orders/${po.id}`, body)
        : await api.post<PurchaseOrder>("/purchase-orders", body);
      toast.success(
        saved.status === "PENDING_APPROVAL"
          ? `${saved.poNo} submitted for approval${saved.round > 1 ? ` (round ${saved.round})` : ""}`
          : saved.status === "APPROVED"
            ? `${saved.poNo} saved — still approved`
            : `${saved.poNo} saved as draft`,
      );
      refresh();
      router.push(`/purchase-orders/${saved.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(null);
    }
  }

  if (preloading) return <Spinner />;

  return (
    <>
      {hadApprovals && (
        <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            This PO already has approvals. Changing items, rates or vendor restarts approval as round {(po?.round ?? 1) + 1}; earlier
            approvals stay in the history.
          </p>
        </div>
      )}
      {resubmit && (
        <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            This PO was sent back. Make the requested changes and submit it again — approval restarts from the first step as round{" "}
            {(po?.round ?? 1) + 1}.
          </p>
        </div>
      )}

      <Card className="mb-4">
        <div className={cx("grid grid-cols-1 gap-3 sm:grid-cols-2", showBranch ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
          <Field label="Vendor" required className="sm:col-span-2">
            <VendorPicker value={vendor} onChange={setVendor} autoFocus={!vendor} />
          </Field>
          <Field label="PO date" required>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
          </Field>
          <Field label="Expected delivery">
            <Input type="date" value={expectedDate} min={orderDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
          {showBranch && (
            <Field label="Deliver to branch" required>
              <Select
                value={branchId}
                onChange={(e) => setBranchPick(e.target.value)}
                className={cx(!branchId && "border-amber-400 bg-amber-50")}
                disabled={branchesLoading && !branchOptions.length}
              >
                <option value="">{branchesLoading && !branchOptions.length ? "Loading branches…" : "Choose branch…"}</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
                {/* Keep an inactive or out-of-scope branch the PO already points to */}
                {branchId && !branchOptions.some((b) => b.id === branchId) && (
                  <option value={branchId}>{po?.branch ? `${po.branch.name} (${po.branch.code})` : branchId}</option>
                )}
              </Select>
            </Field>
          )}
        </div>
        {vendor && (
          <p className="mt-2 text-xs text-slate-500">
            {vendor.gstin ? `GSTIN ${vendor.gstin}` : "Vendor GSTIN not recorded"} · Place of supply:{" "}
            <b className="font-medium text-slate-700">{pos.name ?? "state not recorded"}</b>
            {pos.taxType && ` · ${pos.interState ? "inter-state supply (IGST)" : "intra-state supply (CGST + SGST)"}`}
          </p>
        )}
      </Card>

      <Card
        className="mb-4"
        bodyClassName="p-0"
        title={`Items${lines.length ? ` (${lines.length})` : ""}`}
        actions={
          <Button variant="secondary" size="sm" icon={<ListPlus className="size-4" />} onClick={addLowStock} loading={loadingLow}>
            Add low-stock items
          </Button>
        }
      >
        <div className="border-b border-slate-100 p-3">
          <ProductPicker onPick={addProduct} />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th right>In stock</Th>
              <Th right>Qty</Th>
              <Th right>Rate (excl. GST)</Th>
              <Th right>GST</Th>
              <Th right>Amount (incl. GST)</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {!lines.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-sm text-slate-400">
                  <PackagePlus className="mx-auto mb-2 size-7 text-slate-300" />
                  Search above to add products, or add everything that&apos;s below its reorder level
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.key}>
                  <Td className="min-w-56">
                    <p className="font-medium text-slate-900">{l.name}</p>
                    <p className="text-xs text-slate-500">
                      {l.sku} · {l.unit}
                    </p>
                  </Td>
                  <Td right className={cx("whitespace-nowrap text-slate-500", l.stock !== undefined && l.stock <= 0 && "text-red-600")}>
                    {l.stock === undefined ? "—" : qty(l.stock)}
                  </Td>
                  <Td right>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      className="num ml-auto h-8 w-24 text-right"
                      value={l.quantity}
                      onChange={(e) => update(l.key, { quantity: e.target.value })}
                      aria-label={`Quantity of ${l.name}`}
                    />
                  </Td>
                  <Td right>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="num ml-auto h-8 w-28 text-right"
                      value={l.rate}
                      onChange={(e) => update(l.key, { rate: e.target.value })}
                      aria-label={`Rate of ${l.name}`}
                    />
                  </Td>
                  <Td right className="text-slate-500">
                    {l.gstRate}%
                  </Td>
                  <Td right className="whitespace-nowrap font-medium text-slate-900">
                    {inr(lineAmount(l))}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${l.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <Route className="size-4 text-slate-400" /> Approval route for this value
              </span>
            }
          >
            {rulesError ? (
              <p className="text-sm text-red-600">{rulesError}</p>
            ) : !route ? (
              <p className="text-sm text-slate-400">Loading approval rules…</p>
            ) : (
              <>
                <ol className="flex flex-wrap items-stretch gap-2">
                  {route.steps.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2">
                      {i > 0 && <span className="text-slate-300">›</span>}
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                        <p className="text-xs text-slate-500">Step {i + 1}</p>
                        <p className="text-sm font-medium text-slate-800">{s.title}</p>
                        <p className="text-xs text-slate-500">{s.approver?.name ?? "Any manager"}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-slate-500">
                  {route.band?.upTo != null
                    ? `POs up to ${inr0(route.band.upTo)} need ${route.steps.length} approval${route.steps.length === 1 ? "" : "s"}.`
                    : `POs of this value need ${route.steps.length} approval${route.steps.length === 1 ? "" : "s"}.`}{" "}
                  The route is worked out again from the final value when you submit.
                </p>
              </>
            )}
          </Card>
          <Card title="Notes to approver">
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this order, scheme / discount agreed, delivery instructions…"
            />
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <dl className="space-y-1.5 text-sm">
            <TotalRow label="Taxable value" value={inr(subtotal)} />
            {igst ? (
              <TotalRow label="IGST" value={inr(tax)} />
            ) : (
              <>
                <TotalRow label="CGST" value={inr(cgst)} />
                <TotalRow label="SGST" value={inr(round2(tax - cgst))} />
              </>
            )}
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-900">PO total</dt>
              <dd className="num text-xl font-semibold text-slate-900">{inr(total)}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-2">
            <Button
              className="w-full"
              icon={<Send className="size-4" />}
              onClick={() => save(true)}
              loading={saving === "submit"}
              disabled={!vendor || !lines.length || !!saving}
            >
              Submit for approval
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              icon={<Save className="size-4" />}
              onClick={() => save(false)}
              loading={saving === "draft"}
              disabled={!vendor || !lines.length || !!saving}
            >
              Save draft
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {editing && po?.status === "APPROVED"
              ? "Saving a changed PO as draft takes it out of the approved list until it is submitted again."
              : "Drafts are not sent to anyone until you submit them."}
          </p>
        </Card>
      </div>
    </>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="num text-slate-800">{value}</dd>
    </div>
  );
}
