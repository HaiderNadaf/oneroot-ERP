"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { FIELD_TYPE_LABEL, SUGGESTED_FIELDS, keyFromLabel, type FieldDef, type FieldType } from "@/lib/attributes";
import { PRODUCT_TYPES, TYPE_LABEL, type ProductType, type SubCategory } from "@/lib/types";
import { Button, Checkbox, Input, Modal, Select, errMsg, useToast } from "./ui";

/** Define the extra fields every product in a sub-category carries (variety, CIB reg. no., NPK grade…) */
export function CategoryFieldsEditor({ category, onClose, onSaved }: { category: SubCategory; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [fields, setFields] = useState<FieldDef[]>(() => (category.fields ?? []).map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })));
  const [suggest, setSuggest] = useState<ProductType>("SEED");
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<FieldDef>) => setFields((fs) => fs.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: -1 | 1) =>
    setFields((fs) => {
      const j = i + d;
      if (j < 0 || j >= fs.length) return fs;
      const next = [...fs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const addBlank = () => setFields((fs) => [...fs, { key: "", label: "", type: "text" }]);
  const addSuggested = (f: FieldDef) => setFields((fs) => (fs.some((x) => x.key === f.key) ? fs : [...fs, { ...f }]));

  async function save() {
    const cleaned: FieldDef[] = [];
    for (const f of fields) {
      const label = f.label.trim();
      if (!label) return toast.error("Every field needs a label");
      const key = (f.key || keyFromLabel(label)).trim();
      if (!key) return toast.error(`Give "${label}" a key`);
      if (cleaned.some((x) => x.key === key)) return toast.error(`Two fields share the key "${key}"`);
      const options = f.type === "select" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined;
      if (f.type === "select" && !options?.length) return toast.error(`"${label}" needs at least one choice`);
      cleaned.push({ key, label, type: f.type, ...(options ? { options } : {}), ...(f.required ? { required: true } : {}), ...(f.showOnBill ? { showOnBill: true } : {}) });
    }
    setSaving(true);
    try {
      await api.patch(`/sub-categories/${category.id}`, { fields: cleaned });
      toast.success(`${category.name}: ${cleaned.length} field${cleaned.length === 1 ? "" : "s"} saved`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Fields for ${category.name}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save fields
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">These extra boxes appear on every product in this category and can be filled by the CSV import (column named like the field). Tick &quot;on bill&quot; to print the value next to the product name.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
        <span className="font-medium text-slate-700">Suggested for</span>
        <Select value={suggest} onChange={(e) => setSuggest(e.target.value as ProductType)} className="h-8 w-36 text-xs">
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        {SUGGESTED_FIELDS[suggest].map((f) => (
          <button key={f.key} type="button" onClick={() => addSuggested(f)} disabled={fields.some((x) => x.key === f.key)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 hover:border-brand-500 disabled:opacity-40">
            + {f.label}
          </button>
        ))}
      </div>
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">No fields yet — pick a suggestion above or add your own</p>
      ) : (
        <ul className="space-y-2">
          {fields.map((f, i) => (
            <li key={i} className="grid grid-cols-6 items-start gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-12">
              <div className="col-span-6 sm:col-span-4">
                <Input value={f.label} onChange={(e) => update(i, { label: e.target.value, key: f.key || keyFromLabel(e.target.value) })} placeholder="Label, e.g. Variety" aria-label="Field label" />
                <p className="mt-1 truncate font-mono text-[10px] text-slate-400">key: {f.key || keyFromLabel(f.label) || "…"}</p>
              </div>
              <Select value={f.type} onChange={(e) => update(i, { type: e.target.value as FieldType, options: e.target.value === "select" ? (f.options ?? []) : undefined })} className="col-span-3 sm:col-span-2" aria-label="Field type">
                {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
              <div className="col-span-3">
                {f.type === "select" ? (
                  <Input value={(f.options ?? []).join(", ")} onChange={(e) => update(i, { options: e.target.value.split(",").map((o) => o.trimStart()) })} placeholder="Choices, comma-separated" aria-label="Choices" />
                ) : (
                  <span className="block pt-2 text-xs text-slate-400">—</span>
                )}
              </div>
              <div className="col-span-4 flex flex-col gap-1 pt-1 sm:col-span-2">
                <Checkbox label="Required" checked={!!f.required} onChange={(v) => update(i, { required: v })} />
                <Checkbox label="On bill" checked={!!f.showOnBill} onChange={(v) => update(i, { showOnBill: v })} />
              </div>
              <div className="col-span-2 flex justify-end gap-0.5 sm:col-span-1">
                <button type="button" onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Move up">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Move down">
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" onClick={() => setFields((fs) => fs.filter((_, k) => k !== i))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove field">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" size="sm" className="mt-3" icon={<Plus className="size-4" />} onClick={addBlank}>
        Add a field
      </Button>
    </Modal>
  );
}
