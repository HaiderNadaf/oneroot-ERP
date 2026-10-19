"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { n } from "@/lib/format";
import { clearApiCache, useApi } from "@/lib/hooks";
import { GST_RATES, UNITS, type TaxType } from "@/lib/types";
import { Badge, Button, Checkbox, Field, Input, Modal, Select, cx, errMsg, useConfirm, useToast } from "./ui";

/** "+ Add new tax type…" in a tax type dropdown */
export const NEW_TAX_TYPE = "__new_tax_type__";

/** Dropdown options for categories: active tax types with their GST %, then "+ Add new tax type…" */
export function taxTypeOptions(types: TaxType[] | null | undefined, canAdd: boolean) {
  const opts = (types ?? []).filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name, hint: `GST ${n(t.gstRate)}%` }));
  return canAdd ? [...opts, { value: NEW_TAX_TYPE, label: "+ Add new tax type…" }] : opts;
}

/** Create or edit a tax type: its name and the GST %, HSN, unit and batch tracking a new product in its categories starts with */
export function TaxTypeForm({ taxType, onClose, onSaved }: { taxType: TaxType | null; onClose: () => void; onSaved: (t: TaxType) => void }) {
  const toast = useToast();
  const editing = !!taxType;
  const [name, setName] = useState(taxType?.name ?? "");
  const [gstRate, setGstRate] = useState(String(taxType ? n(taxType.gstRate) : 18));
  const [hsnCode, setHsnCode] = useState(taxType?.hsnCode ?? "");
  const [unit, setUnit] = useState(taxType?.unit ?? "NOS");
  const [trackBatch, setTrackBatch] = useState(taxType?.trackBatch ?? false);
  const [isActive, setIsActive] = useState(taxType?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Give the tax type a name");
    if (hsnCode.trim() && !/^\d{4,8}$/.test(hsnCode.trim())) return toast.error("HSN code is 4 to 8 digits");
    setSaving(true);
    try {
      const body = { name: name.trim(), gstRate: Number(gstRate), hsnCode: hsnCode.trim(), unit, trackBatch, isActive };
      const saved = editing
        ? await api.patch<TaxType>(`/tax-types/${taxType.id}`, body)
        : await api.post<TaxType>("/tax-types", { ...body, baseType: "OTHER" });
      clearApiCache("/tax-types");
      clearApiCache("/categories");
      toast.success(editing ? `${saved.name} updated` : `Tax type "${saved.name}" added`);
      onSaved(saved);
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
      title={editing ? `Edit tax type: ${taxType.name}` : "New tax type"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="tax-type-form" loading={saving}>
            {editing ? "Save" : "Add tax type"}
          </Button>
        </>
      }
    >
      <form id="tax-type-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2" hint="e.g. Animal Feed, Organic Manure, Bio-stimulant">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus minLength={2} />
        </Field>
        <Field label="GST %" required>
          <Select value={gstRate} onChange={(e) => setGstRate(e.target.value)} aria-label="GST %">
            {GST_RATES.map((r) => (
              <option key={r} value={String(r)}>
                {r}%
              </option>
            ))}
          </Select>
        </Field>
        <Field label="HSN Code" hint="Starting HSN for new products (4 to 8 digits)">
          <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" className="font-mono" />
        </Field>
        <Field label="Default Unit">
          <Select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Default unit">
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Checkbox label="Track batches and expiry by default" checked={trackBatch} onChange={setTrackBatch} />
          {editing && <Checkbox label="Active — offered when setting a category's tax type" checked={isActive} onChange={setIsActive} />}
        </div>
        <p className="text-xs text-slate-500 sm:col-span-2">These are starting values for new products in its categories. Products already saved keep their GST and HSN.</p>
      </form>
    </Modal>
  );
}

/** List of tax types with edit and delete; opened from Product Categories */
export function TaxTypesManager({ onClose, canEdit }: { onClose: () => void; canEdit: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useApi<TaxType[]>("/tax-types", { all: "true" });
  const [form, setForm] = useState<{ taxType: TaxType | null } | null>(null);

  async function remove(t: TaxType) {
    if (!(await confirm(`Delete the tax type "${t.name}"?`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/tax-types/${t.id}`);
      clearApiCache("/tax-types");
      toast.success(`${t.name} deleted`);
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Tax Types"
      footer={
        <>
          {canEdit && (
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setForm({ taxType: null })} className="mr-auto">
              New tax type
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {(data ?? []).map((t) => {
          const used = t._count?.categories ?? 0;
          return (
            <li key={t.id} className={cx("flex items-center gap-3 px-3 py-2 text-sm", !t.isActive && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {t.name} {!t.isActive && <Badge tone="amber">Off</Badge>}
                </p>
                <p className="text-xs text-slate-500">
                  GST {n(t.gstRate)}% · HSN {t.hsnCode || "—"} · {t.unit}
                  {t.trackBatch ? " · batches" : ""} · {used} categor{used === 1 ? "y" : "ies"}
                </p>
              </div>
              {canEdit && (
                <>
                  <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => setForm({ taxType: t })}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="size-4" />}
                    onClick={() => void remove(t)}
                    disabled={used > 0}
                    title={used > 0 ? "Move its categories to another tax type first" : `Delete ${t.name}`}
                    aria-label={`Delete ${t.name}`}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
      {form && (
        <TaxTypeForm
          taxType={form.taxType}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void reload();
          }}
        />
      )}
    </Modal>
  );
}
