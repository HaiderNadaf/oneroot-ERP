"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { n } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { GST_RATES, PRODUCT_TYPES, TYPE_LABEL, UNITS, type Category, type Product, type ProductType } from "@/lib/types";
import { useBranch } from "@/lib/branch";
import { BranchNotice } from "./BranchNotice";
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, errMsg, useToast } from "./ui";

/** Typical HSN + GST defaults for agri inputs; the user can override */
const TYPE_DEFAULTS: Record<ProductType, { gstRate: number; unit: string; hsnCode: string; trackBatch: boolean }> = {
  SEED: { gstRate: 0, unit: "PKT", hsnCode: "1209", trackBatch: true },
  FERTILIZER: { gstRate: 5, unit: "BAG", hsnCode: "3105", trackBatch: true },
  PESTICIDE: { gstRate: 18, unit: "LTR", hsnCode: "3808", trackBatch: true },
  EQUIPMENT: { gstRate: 12, unit: "NOS", hsnCode: "8424", trackBatch: false },
  OTHER: { gstRate: 18, unit: "NOS", hsnCode: "", trackBatch: false },
};

type FormState = Record<string, string | boolean>;

function toForm(p?: Product | null): FormState {
  return {
    name: p?.name ?? "",
    sku: p?.sku ?? "",
    barcode: p?.barcode ?? "",
    type: p?.type ?? "FERTILIZER",
    categoryId: p?.categoryId ?? "",
    brand: p?.brand ?? "",
    manufacturer: p?.manufacturer ?? "",
    technicalName: p?.technicalName ?? "",
    hsnCode: p?.hsnCode ?? TYPE_DEFAULTS.FERTILIZER.hsnCode,
    gstRate: String(p ? n(p.gstRate) : TYPE_DEFAULTS.FERTILIZER.gstRate),
    unit: p?.unit ?? TYPE_DEFAULTS.FERTILIZER.unit,
    packSize: p?.packSize ?? "",
    mrp: p ? String(n(p.mrp)) : "",
    salePrice: p ? String(n(p.salePrice)) : "",
    purchasePrice: p ? String(n(p.purchasePrice)) : "",
    reorderLevel: p ? String(n(p.reorderLevel)) : "",
    trackBatch: p?.trackBatch ?? true,
    isActive: p?.isActive ?? true,
    description: p?.description ?? "",
    openQty: "",
    openBatch: "",
    openExpiry: "",
  };
}

interface Props {
  open: boolean;
  product?: Product | null;
  onClose: () => void;
  onSaved: (p: Product) => void;
}

/** Create/edit product modal. The form state is re-created every time it opens. */
export function ProductForm(props: Props) {
  return props.open ? <ProductFormBody {...props} /> : null;
}

function ProductFormBody({ open, product, onClose, onSaved }: Props) {
  const toast = useToast();
  const { data: categories } = useApi<Category[]>("/categories");
  const [f, setF] = useState<FormState>(() => toForm(product));
  const [saving, setSaving] = useState(false);
  const editing = !!product;
  // Preview of the SKU a new product gets: the category's code, else the type's
  const nextSku = useApi<{ prefix: string; sku: string }>(editing ? null : "/products/next-sku", {
    categoryId: String(f.categoryId ?? ""),
    type: String(f.type ?? ""),
  });
  const chosenCategory = categories?.find((c) => c.id === f.categoryId);
  const { currentId, current, branches } = useBranch();
  // Opening stock goes into the branch selected in the top bar; "All branches" can't hold stock
  const hasOpening = !editing && Number(f.openQty ?? 0) > 0;
  const openingBlocked = hasOpening && currentId === "all";

  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const str = (k: string) => String(f[k] ?? "");

  function changeType(type: ProductType) {
    const d = TYPE_DEFAULTS[type];
    setF((s) => ({
      ...s,
      type,
      ...(editing ? {} : { gstRate: String(d.gstRate), unit: d.unit, hsnCode: d.hsnCode, trackBatch: d.trackBatch }),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (openingBlocked) return toast.error("Pick a branch in the top bar to record the opening stock in");
    setSaving(true);
    const numOrUndef = (k: string) => (str(k) === "" ? undefined : Number(str(k)));
    const body: Record<string, unknown> = {
      name: str("name").trim(),
      sku: str("sku").trim() || undefined,
      barcode: str("barcode").trim(),
      type: f.type,
      categoryId: str("categoryId") || undefined,
      brand: str("brand") || undefined,
      manufacturer: str("manufacturer") || undefined,
      technicalName: str("technicalName") || undefined,
      hsnCode: str("hsnCode") || undefined,
      gstRate: Number(str("gstRate")),
      unit: f.unit,
      packSize: str("packSize") || undefined,
      mrp: numOrUndef("mrp"),
      salePrice: numOrUndef("salePrice"),
      purchasePrice: numOrUndef("purchasePrice"),
      reorderLevel: numOrUndef("reorderLevel"),
      trackBatch: f.trackBatch,
      isActive: f.isActive,
      description: str("description") || undefined,
    };
    if (!editing && Number(str("openQty")) > 0) {
      body.openingStock = {
        quantity: Number(str("openQty")),
        batchNo: str("openBatch") || undefined,
        expiryDate: str("openExpiry") || undefined,
      };
    }
    try {
      const saved = editing
        ? await api.patch<Product>(`/products/${product!.id}`, body)
        : await api.post<Product>("/products", body);
      toast.success(editing ? "Product updated" : `Product ${saved.sku} created`);
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
      title={editing ? `Edit ${product?.name}` : "New product"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" loading={saving} disabled={openingBlocked}>
            {editing ? "Save changes" : "Create product"}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Product name" required className="sm:col-span-2">
          <Input value={str("name")} onChange={(e) => set("name", e.target.value)} required autoFocus placeholder="e.g. Urea 45 kg" />
        </Field>
        <Field label="Type" required>
          <Select value={str("type")} onChange={(e) => changeType(e.target.value as ProductType)}>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={str("categoryId")} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">—</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.code ? ` (${c.code})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Brand">
          <Input value={str("brand")} onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Manufacturer">
          <Input value={str("manufacturer")} onChange={(e) => set("manufacturer", e.target.value)} />
        </Field>
        <Field label="Technical name / composition" className="sm:col-span-2" hint="e.g. Imidacloprid 17.8% SL, NPK 19:19:19">
          <Input value={str("technicalName")} onChange={(e) => set("technicalName", e.target.value)} />
        </Field>
        <Field label="Pack size" hint="e.g. 50 kg bag, 250 ml">
          <Input value={str("packSize")} onChange={(e) => set("packSize", e.target.value)} />
        </Field>
        <Field
          label="SKU"
          hint={
            editing
              ? "Changing a SKU doesn't affect past bills"
              : str("sku").trim()
                ? "Custom SKU — clear it to use the automatic one"
                : nextSku.data
                  ? `Auto: ${nextSku.data.sku} ${chosenCategory ? `from ${chosenCategory.name}` : `from type ${TYPE_LABEL[str("type") as ProductType] ?? ""}`}`
                  : "Generated from the category"
          }
        >
          <Input
            value={str("sku")}
            onChange={(e) => set("sku", e.target.value.toUpperCase())}
            placeholder={editing ? undefined : nextSku.data?.sku}
            className="font-mono"
          />
        </Field>
        <Field label="Barcode">
          <Input value={str("barcode")} onChange={(e) => set("barcode", e.target.value)} />
        </Field>
        <Field label="Unit" required>
          <Select value={str("unit")} onChange={(e) => set("unit", e.target.value)}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="HSN code">
          <Input value={str("hsnCode")} onChange={(e) => set("hsnCode", e.target.value)} />
        </Field>
        <Field label="GST %" required>
          <Select value={str("gstRate")} onChange={(e) => set("gstRate", e.target.value)}>
            {GST_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reorder level" hint="Alert when stock falls to this">
          <Input type="number" step="any" min="0" value={str("reorderLevel")} onChange={(e) => set("reorderLevel", e.target.value)} />
        </Field>
        <Field label="Purchase rate (excl. GST)">
          <Input type="number" step="0.01" min="0" value={str("purchasePrice")} onChange={(e) => set("purchasePrice", e.target.value)} />
        </Field>
        <Field label="Selling price (incl. GST)" required>
          <Input type="number" step="0.01" min="0" value={str("salePrice")} onChange={(e) => set("salePrice", e.target.value)} required />
        </Field>
        <Field label="MRP">
          <Input type="number" step="0.01" min="0" value={str("mrp")} onChange={(e) => set("mrp", e.target.value)} />
        </Field>
        <Field label="Notes" className="sm:col-span-3">
          <Textarea rows={2} value={str("description")} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-5 sm:col-span-3">
          <Checkbox label="Track batches & expiry" checked={!!f.trackBatch} onChange={(v) => set("trackBatch", v)} />
          {editing && <Checkbox label="Active" checked={!!f.isActive} onChange={(v) => set("isActive", v)} />}
        </div>

        {!editing && (
          <fieldset className="rounded-lg border border-dashed border-slate-300 p-3 sm:col-span-3">
            <legend className="px-1 text-xs font-medium text-slate-600">
              Opening stock (optional){current && branches.length > 1 ? ` · goes into ${current.name}` : ""}
            </legend>
            {openingBlocked && <BranchNotice action="record opening stock in it, or leave the quantity empty" className="mb-3" />}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Quantity">
                <Input type="number" step="any" min="0" value={str("openQty")} onChange={(e) => set("openQty", e.target.value)} />
              </Field>
              {f.trackBatch && (
                <>
                  <Field label="Batch no.">
                    <Input value={str("openBatch")} onChange={(e) => set("openBatch", e.target.value)} />
                  </Field>
                  <Field label="Expiry date">
                    <Input type="date" value={str("openExpiry")} onChange={(e) => set("openExpiry", e.target.value)} />
                  </Field>
                </>
              )}
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
