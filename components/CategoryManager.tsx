"use client";

import { Check, ListPlus, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { PRODUCT_TYPES, TYPE_LABEL, type Category, type ProductType, type SubCategory } from "@/lib/types";
import { CategoryFieldsEditor } from "./CategoryFieldsEditor";
import { Button, Dropdown, Input, Modal, cx, errMsg, useConfirm, useToast, type DropdownOption } from "./ui";

/** SKU codes are numbers 1–999 */
const cleanCode = (v: string) => v.replace(/\D/g, "").replace(/^0+/, "").slice(0, 3);

const TYPE_OPTIONS: DropdownOption[] = PRODUCT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }));

/**
 * Product categories and their sub-categories (two tables), or expense categories with `kind="expense"`.
 * A product's SKU is ORI + an 11-digit running number; category codes are for lookup and import only.
 */
export function CategoryManager({ open, onClose, kind = "product" }: { open: boolean; onClose: () => void; kind?: "product" | "expense" }) {
  if (kind === "expense") return <ExpenseCategories open={open} onClose={onClose} />;
  return (
    <Modal open={open} onClose={onClose} title="Product categories" size="xl">
      {open && <ProductCategories />}
    </Modal>
  );
}

function ProductCategories() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: categories, reload } = useApi<Category[]>("/categories");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = categories?.find((c) => c.id === pickedId) ?? categories?.[0] ?? null;
  const { data: subs, reload: reloadSubs } = useApi<SubCategory[]>(picked ? `/categories/${picked.id}/sub-categories` : null);

  const [name, setName] = useState("");
  const [type, setType] = useState<ProductType | "">("");
  const [subName, setSubName] = useState("");
  const [busy, setBusy] = useState<"cat" | "sub" | null>(null);
  const [fieldsFor, setFieldsFor] = useState<SubCategory | null>(null);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!type) return toast.error("Pick the tax type (GST / HSN defaults) for this category");
    setBusy("cat");
    try {
      const created = await api.post<Category>("/categories", { name: name.trim(), type });
      toast.success(`${created.name} added with code ${created.code}`);
      setName("");
      setType("");
      setPickedId(created.id);
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(null);
    }
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || !subName.trim()) return;
    setBusy("sub");
    try {
      const created = await api.post<SubCategory>(`/categories/${picked.id}/sub-categories`, { name: subName.trim() });
      toast.success(`${created.name} added to ${picked.name} with code ${created.code}`);
      setSubName("");
      void reloadSubs();
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(null);
    }
  }

  async function patch(path: string, body: Record<string, unknown>, after: () => void) {
    try {
      await api.patch(path, body);
      after();
      return true;
    } catch (err) {
      toast.error(errMsg(err));
      return false;
    }
  }

  async function removeCategory(c: Category) {
    if (!(await confirm(`Delete category "${c.name}"?`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/categories/${c.id}`);
      if (pickedId === c.id) setPickedId(null);
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  async function removeSub(s: SubCategory) {
    if (!(await confirm(`Delete sub-category "${s.name}"?`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/sub-categories/${s.id}`);
      void reloadSubs();
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  return (
    <>
      <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
        Every product sits in a <b>category</b> and one of its <b>sub-categories</b>. Its SKU is{" "}
        <b className="font-mono">ORI</b> + an 11-digit running number, unique across all products. Codes lock once products use them.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Categories</h4>
          <form onSubmit={addCategory} className="mb-2 flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" />
            <Dropdown options={TYPE_OPTIONS} value={type} onChange={(v) => setType(v as ProductType)} placeholder="Tax type" className="w-32 shrink-0" aria-label="Tax type" />
            <Button type="submit" loading={busy === "cat"}>
              Add
            </Button>
          </form>
          <ul className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {categories?.map((c) => (
              <li
                key={c.id}
                className={cx("flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm", picked?.id === c.id ? "bg-brand-50" : "hover:bg-slate-50")}
                onClick={() => setPickedId(c.id)}
              >
                <CodeEdit code={c.code} label={c.name} onSave={(code) => patch(`/categories/${c.id}`, { code }, () => void reload())} />
                <span className="min-w-0 flex-1 truncate">
                  {c.name}
                  <span className="ml-1.5 text-xs text-slate-400">{c._count?.subCategories ?? 0} subs</span>
                </span>
                <div onClick={(e) => e.stopPropagation()}>
                  <Dropdown
                    options={TYPE_OPTIONS}
                    value={c.type ?? ""}
                    onChange={(v) => void patch(`/categories/${c.id}`, { type: v }, () => void reload())}
                    placeholder="Tax type"
                    className="w-28 shrink-0"
                    aria-label={`Tax type for ${c.name}`}
                  />
                </div>
                <button
                  onClick={(e) => (e.stopPropagation(), void removeCategory(c))}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
            {categories && !categories.length && <li className="px-3 py-6 text-center text-sm text-slate-400">No categories yet</li>}
          </ul>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sub-categories{picked ? ` of ${picked.name}` : ""}
          </h4>
          {picked && (
            <form onSubmit={addSub} className="mb-2 flex gap-2">
              <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder={`New sub-category in ${picked.name}`} />
              <Button type="submit" loading={busy === "sub"}>
                Add
              </Button>
            </form>
          )}
          <ul className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {subs?.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <CodeEdit code={s.code} label={s.name} onSave={(code) => patch(`/sub-categories/${s.id}`, { code }, () => void reloadSubs())} />
                <span className="min-w-0 flex-1 truncate">
                  {s.name}
                  {s._count && <span className="ml-1.5 text-xs text-slate-400">{s._count.products} products</span>}
                </span>
                <button
                  onClick={() => setFieldsFor(s)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                  title="Extra fields every product in this sub-category carries (variety, registration no., NPK grade…)"
                >
                  <ListPlus className="size-3.5" /> Fields{s.fields?.length ? ` · ${s.fields.length}` : ""}
                </button>
                <button onClick={() => void removeSub(s)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${s.name}`}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
            {subs && !subs.length && <li className="px-3 py-6 text-center text-sm text-slate-400">No sub-categories yet</li>}
          </ul>
        </section>
      </div>
      {fieldsFor && (
        <CategoryFieldsEditor
          category={fieldsFor}
          onClose={() => setFieldsFor(null)}
          onSaved={() => {
            setFieldsFor(null);
            void reloadSubs();
          }}
        />
      )}
    </>
  );
}

/** Click-to-edit numeric SKU code */
function CodeEdit({ code, label, onSave }: { code?: string | null; label: string; onSave: (code: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const save = async () => {
    if (!value) return;
    if (await onSave(value)) setEditing(false);
  };
  if (editing)
    return (
      <span className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <Input
          value={value}
          onChange={(e) => setValue(cleanCode(e.target.value))}
          className="num h-7 w-14 text-center"
          autoFocus
          inputMode="numeric"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") setEditing(false);
          }}
          aria-label={`SKU code for ${label}`}
        />
        <button onClick={() => void save()} className="rounded p-1 text-brand-700 hover:bg-brand-50" aria-label="Save code">
          <Check className="size-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cancel">
          <X className="size-3.5" />
        </button>
      </span>
    );
  return (
    <button
      onClick={(e) => (e.stopPropagation(), setValue(code ?? ""), setEditing(true))}
      className="group inline-flex w-12 shrink-0 items-center justify-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-1 font-mono text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-800"
      title="Change SKU code (only until products use it)"
    >
      {code ?? "—"}
      <Pencil className="size-2.5 opacity-0 group-hover:opacity-100" />
    </button>
  );
}

function ExpenseCategories({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useApi<{ id: string; name: string }[]>(open ? "/expense-categories" : null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post("/expense-categories", { name: name.trim() });
      setName("");
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: { id: string; name: string }) {
    if (!(await confirm(`Delete category "${c.name}"?`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/expense-categories/${c.id}`);
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Expense categories" size="sm">
      <form onSubmit={add} className="mb-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
        <Button type="submit" loading={busy}>
          Add
        </Button>
      </form>
      <ul className="divide-y divide-slate-100">
        {data?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <button onClick={() => void remove(c)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${c.name}`}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
