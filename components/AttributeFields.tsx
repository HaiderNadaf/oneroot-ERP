"use client";

import type { Attributes, FieldDef } from "@/lib/attributes";
import { Checkbox, Field, Input, Select } from "./ui";

/** Inputs for a category's extra fields (see lib/attributes.ts) */
export function AttributeFields({ fields, value, onChange, className }: { fields: FieldDef[]; value: Attributes; onChange: (next: Attributes) => void; className?: string }) {
  if (!fields.length) return null;
  const set = (k: string, v: string | number | boolean | null) => onChange({ ...value, [k]: v });
  return (
    <>
      {fields.map((f) => {
        const v = value[f.key];
        if (f.type === "yesno") {
          return (
            <div key={f.key} className={className ?? "flex items-end pb-2"}>
              <Checkbox label={f.label} checked={v === true || v === "true" || v === "yes"} onChange={(c) => set(f.key, c)} />
            </div>
          );
        }
        return (
          <Field key={f.key} label={f.label} required={f.required} className={className}>
            {f.type === "select" ? (
              <Select value={v === null || v === undefined ? "" : String(v)} onChange={(e) => set(f.key, e.target.value || null)} required={f.required}>
                <option value="">—</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                step={f.type === "number" ? "any" : undefined}
                value={v === null || v === undefined ? "" : String(v)}
                onChange={(e) => set(f.key, e.target.value === "" ? null : f.type === "number" ? Number(e.target.value) : e.target.value)}
                required={f.required}
                className={f.type === "number" ? "num" : undefined}
              />
            )}
          </Field>
        );
      })}
    </>
  );
}

/** Read-only list of a product's attributes, labelled by the category's fields */
export function AttributeList({ fields, value }: { fields: FieldDef[] | null | undefined; value: Attributes | null | undefined }) {
  const rows = (fields ?? []).filter((f) => value?.[f.key] !== undefined && value?.[f.key] !== null && value?.[f.key] !== "");
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {rows.map((f) => (
        <div key={f.key} className="min-w-0">
          <dt className="text-xs text-slate-500">{f.label}</dt>
          <dd className="break-words font-medium text-slate-800">{f.type === "yesno" ? (value?.[f.key] ? "Yes" : "No") : String(value?.[f.key])}</dd>
        </div>
      ))}
    </dl>
  );
}
