"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { n } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { GST_RATES, UNITS, type Category, type Paged, type Product, type ProductType, type SubCategory, type Vendor } from "@/lib/types";
import { validateAttributes, type Attributes } from "@/lib/attributes";
import { AttributeFields } from "./AttributeFields";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { BranchNotice } from "./BranchNotice";
import { Button, Checkbox, Dropdown, Field, Input, Modal, Select, Textarea, errMsg, useToast, type DropdownOption } from "./ui";

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
    // Top-level category id; the product itself is filed under the sub-category
    category: p?.categoryId ?? "",
    subCategoryId: p?.subCategoryId ?? "",
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
    isSubsidised: p?.isSubsidised ?? false,
    trackSerial: p?.trackSerial ?? false,
    location: p?.location ?? "",
    isActive: p?.isActive ?? true,
    description: p?.description ?? "",
    openQty: "",
    openBatch: "",
    openExpiry: "",
    openSerials: "",
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
  const { can } = useAuth();
  const { data: categories } = useApi<Category[]>("/categories");
  // Brand and manufacturer are picked from the vendor list
  const { data: vendors } = useApi<Paged<Vendor>>(can("vendors.view") ? "/vendors" : null, { pageSize: 500 });
  const [f, setF] = useState<FormState>(() => toForm(product));
  const [attrs, setAttrs] = useState<Attributes>(() => ({ ...(product?.attributes ?? {}) }));
  const [saving, setSaving] = useState(false);
  const editing = !!product;
  // Preview of the SKU a new product will get: ORI + an 11-digit running number shared by all products
  // Sub-categories are fetched for the chosen category only
  const { data: subCategories, loading: subsLoading } = useApi<SubCategory[]>(f.category ? `/categories/${f.category}/sub-categories` : null);
  const nextSku = useApi<{ sku: string | null }>(editing || !f.subCategoryId ? null : "/products/next-sku", {
    subCategoryId: String(f.subCategoryId ?? ""),
  });
  const chosenSubCategory = subCategories?.find((c) => c.id === f.subCategoryId);
  const { currentId, current, branches } = useBranch();
  // Opening stock goes into the branch selected in the top bar; "All branches" can't hold stock
  const hasOpening = !editing && Number(f.openQty ?? 0) > 0;
  const openingBlocked = hasOpening && currentId === "all";

  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const str = (k: string) => String(f[k] ?? "");

  const chosenCategory = categories?.find((c) => c.id === f.category);
  const categoryOptions: DropdownOption[] = (categories ?? []).map((c) => ({ value: c.id, label: c.name, hint: c.code ?? undefined }));

  // Only the sub-categories of the chosen category, as loaded from the API
  const subCategoryOptions: DropdownOption[] = (subCategories ?? [])
    .filter((c) => c.categoryId === f.category)
    .map((c) => ({ value: c.id, label: c.name, hint: chosenCategory?.code && c.code ? `${chosenCategory.code}${c.code}` : undefined }));

  const vendorOptions = useMemo<DropdownOption[]>(() => {
    const names = [...new Set((vendors?.items ?? []).map((v) => v.name.trim()).filter(Boolean))];
    return names.map((name) => ({ value: name, label: name }));
  }, [vendors]);

  function changeCategory(categoryId: string) {
    const type = categories?.find((c) => c.id === categoryId)?.type;
    const d = type ? TYPE_DEFAULTS[type] : null;
    setF((s) => ({
      ...s,
      category: categoryId,
      // A sub-category belongs to one category, so a new category starts with none picked
      subCategoryId: categoryId === s.category ? s.subCategoryId : "",
      ...(editing || !d ? {} : { gstRate: String(d.gstRate), unit: d.unit, hsnCode: d.hsnCode, trackBatch: d.trackBatch }),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (openingBlocked) return toast.error("Pick a branch in the top bar to record the opening stock in");
    if (!f.category) return toast.error("Choose the category");
    if (!f.subCategoryId) return toast.error("Choose the sub-category — the SKU is generated from it");
    const attrProblem = validateAttributes(chosenSubCategory?.fields, attrs)[0];
    if (attrProblem) return toast.error(attrProblem);
    const openSerials = str("openSerials").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!editing && f.trackSerial && Number(str("openQty")) > 0 && openSerials.length && openSerials.length !== Number(str("openQty"))) {
      return toast.error(`Enter ${str("openQty")} serial numbers for the opening stock (${openSerials.length} given), or leave them to register later`);
    }
    setSaving(true);
    const numOrUndef = (k: string) => (str(k) === "" ? undefined : Number(str(k)));
    const body: Record<string, unknown> = {
      name: str("name").trim(),
      barcode: str("barcode").trim(),
      categoryId: str("category"),
      subCategoryId: str("subCategoryId"),
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
      isSubsidised: !!f.isSubsidised,
      trackSerial: !!f.trackSerial,
      location: str("location").trim() || (editing ? "" : undefined),
      attributes: attrs,
      isActive: f.isActive,
      description: str("description") || undefined,
    };
    if (!editing && Number(str("openQty")) > 0) {
      body.openingStock = {
        quantity: Number(str("openQty")),
        batchNo: str("openBatch") || undefined,
        expiryDate: str("openExpiry") || undefined,
        serialNos: f.trackSerial && openSerials.length ? openSerials : undefined,
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
      title={editing ? `Edit ${product?.name}` : "New Product"}
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
        <Field label="Category" required>
          <Dropdown
            options={categoryOptions}
            value={str("category")}
            onChange={changeCategory}
            placeholder="Select category"
            isSearch={categoryOptions.length > 10}
            aria-label="Category"
          />
        </Field>
        <Field label="Sub-Category" required>
          <Dropdown
            options={subCategoryOptions}
            value={str("subCategoryId")}
            onChange={(v) => set("subCategoryId", v)}
            placeholder={!f.category ? "Choose a category first" : subsLoading && !subCategories ? "Loading…" : "Select sub-category"}
            isSearch
            disabled={!f.category}
            emptyText={`No sub-categories in ${chosenCategory?.name ?? "this category"} — add one under Categories`}
            aria-label="Sub-Category"
          />
        </Field>
        <Field label="Brand">
          <Dropdown
            options={vendorOptions}
            value={str("brand")}
            onChange={(v) => set("brand", v)}
            placeholder="Select brand"
            isSearch
            searchPlaceholder="Search vendors…"
            allowClear
            emptyText="No vendors yet — add them under Vendors"
            aria-label="Brand"
          />
        </Field>
        <Field label="Manufacturer">
          <Dropdown
            options={vendorOptions}
            value={str("manufacturer")}
            onChange={(v) => set("manufacturer", v)}
            placeholder="Select manufacturer"
            isSearch
            searchPlaceholder="Search vendors…"
            allowClear
            emptyText="No vendors yet — add them under Vendors"
            aria-label="Manufacturer"
          />
        </Field>
        <Field label="Technical name / composition" className="sm:col-span-2" hint="e.g. Imidacloprid 17.8% SL, NPK 19:19:19">
          <Input value={str("technicalName")} onChange={(e) => set("technicalName", e.target.value)} />
        </Field>
        <Field label="Pack size" hint="e.g. 50 kg bag, 250 ml">
          <Input value={str("packSize")} onChange={(e) => set("packSize", e.target.value)} />
        </Field>
        <Field label="Location in store" hint="Rack / bin / shelf, e.g. Rack A3">
          <Input value={str("location")} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field
          label="SKU"
          hint={
            editing
              ? "Locked — a SKU never changes once assigned"
              : nextSku.data?.sku
                ? "Assigned when you save (the next free number)"
                : "Generated automatically from the category and sub-category"
          }
        >
          {/* Never typed: generated on save and locked afterwards */}
          <Input
            value={editing ? str("sku") : (nextSku.data?.sku ?? "")}
            readOnly
            tabIndex={-1}
            placeholder={editing ? undefined : "ORI…"}
            className="cursor-not-allowed bg-slate-50 font-mono text-slate-600"
            aria-label="SKU (generated automatically)"
          />
        </Field>
        <Field label="Barcode" hint={editing && !str("barcode") ? "Blank — click Generate for an in-store EAN-13" : "From the pack, or generated in-store"}>
          <div className="flex gap-2">
            <Input value={str("barcode")} onChange={(e) => set("barcode", e.target.value)} className="font-mono" />
            {editing && !str("barcode") && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 shrink-0"
                onClick={async () => {
                  try {
                    const p = await api.post<Product>(`/products/${product!.id}/barcode`);
                    set("barcode", p.barcode ?? "");
                    toast.success(`Barcode ${p.barcode} assigned`);
                  } catch (e) {
                    toast.error(errMsg(e));
                  }
                }}
              >
                Generate
              </Button>
            )}
          </div>
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
        {chosenSubCategory?.fields && chosenSubCategory.fields.length > 0 && (
          <fieldset className="rounded-lg border border-brand-200 bg-brand-50/40 p-3 sm:col-span-3">
            <legend className="px-1 text-xs font-medium text-brand-800">{chosenSubCategory.name} details</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <AttributeFields fields={chosenSubCategory.fields} value={attrs} onChange={setAttrs} />
            </div>
          </fieldset>
        )}
        <Field label="Notes" className="sm:col-span-3">
          <Textarea rows={2} value={str("description")} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-5 sm:col-span-3">
          <Checkbox label="Track batches & expiry" checked={!!f.trackBatch} onChange={(v) => set("trackBatch", v)} />
          <Checkbox label="Track serial numbers (each unit, e.g. sprayers and pumps)" checked={!!f.trackSerial} onChange={(v) => set("trackSerial", v)} />
          <Checkbox label="Govt-subsidised fertiliser (bills need the govt POS receipt no.)" checked={!!f.isSubsidised} onChange={(v) => set("isSubsidised", v)} />
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
              {f.trackSerial && (
                <Field label="Serial numbers" className="sm:col-span-3" hint="One per unit, one per line — or register them later on the product page">
                  <Textarea rows={3} value={str("openSerials")} onChange={(e) => set("openSerials", e.target.value)} className="font-mono" />
                </Field>
              )}
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
