"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { PURPOSE_COLORS, SCHEME_TYPE_LABEL } from "@/lib/offers";
import type { PurposeColor, SchemeType } from "@/lib/types";
import { Badge, Button, Dropdown, Field, Input, Modal, Select, errMsg, useConfirm, useToast } from "./ui";

/** A row of a managed list: purposes carry a colour, offer types a calculation */
export interface ManagedItem {
  id: string;
  name: string;
  color?: PurposeColor;
  kind?: SchemeType;
  /** Offers using it */
  _count?: { schemes: number };
}

/**
 * Dropdown over a list kept in the database, with add, edit and delete right in the list
 * (pencil / bin on each row, "Add …" under it). `valueFor` picks what is stored: the id, or the name (occasions).
 */
export function ManagedSelect({
  items,
  value,
  onChange,
  noun,
  endpoint,
  extra,
  valueFor = (i) => i.id,
  hintOf,
  isDisabled,
  allowClear,
  placeholder,
  onListChanged,
  "aria-label": ariaLabel,
}: {
  items: ManagedItem[];
  value: string;
  onChange: (value: string) => void;
  /** "purpose", "occasion", "offer type" — used in the buttons and messages */
  noun: string;
  /** e.g. /scheme-options/purposes */
  endpoint: string;
  /** Extra field on the add / edit popup */
  extra?: "color" | "kind";
  valueFor?: (i: ManagedItem) => string;
  hintOf?: (i: ManagedItem) => string | undefined;
  /** Rows that can't be picked right now (still editable) */
  isDisabled?: (i: ManagedItem) => boolean;
  allowClear?: boolean;
  placeholder?: string;
  /** Reload the lists after an add / edit / delete; `picked` is the value to select (a new or renamed row) */
  onListChanged: (picked?: string) => void;
  "aria-label"?: string;
}) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<ManagedItem | "new" | null>(null);
  const title = noun.charAt(0).toUpperCase() + noun.slice(1);

  const options = items.filter((i) => !isDisabled?.(i) || valueFor(i) === value).map((i) => ({ value: valueFor(i), label: i.name, hint: hintOf?.(i) }));
  const byValue = new Map(items.map((i) => [valueFor(i), i]));

  async function remove(item: ManagedItem) {
    const used = item._count?.schemes ?? 0;
    if (used) return toast.error(`"${item.name}" is used by ${used} offer${used === 1 ? "" : "s"} — change them first`);
    if (!(await confirm(`Delete ${noun} "${item.name}"?`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`${endpoint}/${item.id}`);
      toast.success(`${title} deleted`);
      if (valueFor(item) === value) onChange("");
      onListChanged();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <Dropdown
        options={options}
        value={value}
        onChange={onChange}
        allowClear={allowClear}
        placeholder={placeholder}
        isSearch={items.length > 8}
        aria-label={ariaLabel ?? title}
        rowActions={(o) => {
          const item = byValue.get(o.value);
          if (!item) return null;
          return (
            <>
              {can("schemes.edit") && (
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label={`Edit ${item.name}`}
                  title="Edit"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              {can("schemes.delete") && (
                <button
                  type="button"
                  onClick={() => void remove(item)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${item.name}`}
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </>
          );
        }}
        footer={
          can("schemes.create") ? (
                <button
                  type="button"
                  onClick={() => setEditing("new")}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  <Plus className="size-4" /> Add {noun}
                </button>
              ) : undefined
        }
      />
      {editing && (
        <ItemEditor
          item={editing === "new" ? null : editing}
          noun={noun}
          title={title}
          endpoint={endpoint}
          extra={extra}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            const wasSelected = editing !== "new" && valueFor(editing) === value;
            setEditing(null);
            // A new row is picked straight away; a renamed one stays picked
            onListChanged(editing === "new" || wasSelected ? valueFor(saved) : undefined);
          }}
        />
      )}
    </>
  );
}

/** Add / edit popup, above the offer form (its own layer, so Escape closes only this) */
function ItemEditor({
  item,
  noun,
  title,
  endpoint,
  extra,
  onClose,
  onSaved,
}: {
  item: ManagedItem | null;
  noun: string;
  title: string;
  endpoint: string;
  extra?: "color" | "kind";
  onClose: () => void;
  onSaved: (saved: ManagedItem) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? "");
  const [color, setColor] = useState<PurposeColor>(item?.color ?? "slate");
  const [kind, setKind] = useState<SchemeType>(item?.kind ?? "PCT_OFF");
  const [saving, setSaving] = useState(false);
  const used = item?._count?.schemes ?? 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim()) return toast.error(`Enter the ${noun} name`);
    const body = { name: name.trim(), ...(extra === "color" ? { color } : {}), ...(extra === "kind" ? { kind } : {}) };
    setSaving(true);
    try {
      const saved = item ? await api.patch<ManagedItem>(`${endpoint}/${item.id}`, body) : await api.post<ManagedItem>(endpoint, body);
      toast.success(item ? `${title} updated` : `${title} added`);
      onSaved(saved);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    // Escape here closes this popup only, not the offer form underneath (the form's modal skips handled keys)
    <div
      className="relative z-[60]"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <Modal
        open
        onClose={onClose}
        title={item ? `Edit ${title}` : `Add ${title}`}
        size="sm"
        centered
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="managed-item-form" loading={saving}>
              {item ? "Save" : "Add"}
            </Button>
          </>
        }
      >
        <form id="managed-item-form" onSubmit={save} className="space-y-3">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={80} />
          </Field>
          {extra === "color" && (
            <Field label="Badge Colour">
              <div className="flex flex-wrap gap-2">
                {PURPOSE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`rounded-md p-0.5 ring-2 ${color === c.value ? "ring-brand-500" : "ring-transparent"}`}
                    aria-pressed={color === c.value}
                  >
                    <Badge tone={c.value}>{name.trim() || c.label}</Badge>
                  </button>
                ))}
              </div>
            </Field>
          )}
          {extra === "kind" && (
            <Field
              label="How It Calculates"
              required
              hint={used ? `Used by ${used} offer${used === 1 ? "" : "s"}, so the calculation can't change — add a new type instead` : undefined}
            >
              <Select value={kind} onChange={(e) => setKind(e.target.value as SchemeType)} disabled={!!used}>
                {(Object.keys(SCHEME_TYPE_LABEL) as SchemeType[]).map((k) => (
                  <option key={k} value={k}>
                    {SCHEME_TYPE_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {item && noun === "occasion" && <p className="text-xs text-slate-500">Offers using the old name are renamed too.</p>}
        </form>
      </Modal>
    </div>,
    document.body,
  );
}
