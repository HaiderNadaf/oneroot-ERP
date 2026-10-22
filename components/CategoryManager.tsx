"use client";

import { Check, ChevronRight, ListPlus, Pencil, Receipt, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import type { Category, SubCategory, TaxType } from "@/lib/types";
import { CategoryFieldsEditor } from "./CategoryFieldsEditor";
import { NEW_TAX_TYPE, TaxTypeForm, TaxTypesManager, taxTypeOptions } from "./TaxTypeForm";
import { Button, Dropdown, Input, Modal, RowAction, cx, errMsg, useConfirm, useToast, type DropdownOption } from "./ui";

/** SKU codes are numbers 1–999 */
const cleanCode = (v: string) => v.replace(/\D/g, "").replace(/^0+/, "").slice(0, 3);


/**
 * Product categories and their sub-categories (two tables), or expense categories with `kind="expense"`.
 * A product's SKU is ORI + category code + sub-category code + a number counted per sub-category, 11 digits after ORI in all.
 */
export function CategoryManager({ open, onClose, kind = "product" }: { open: boolean; onClose: () => void; kind?: "product" | "expense" }) {
  if (kind === "expense") return <ExpenseCategories open={open} onClose={onClose} />;
  return (
    <Modal open={open} onClose={onClose} title="Product Categories" size="xl">
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
  // Keep the picked category in view — a new one lands at the end of the list
  useEffect(() => {
    if (picked) document.getElementById(`cat-${picked.id}`)?.scrollIntoView({ block: "nearest" });
  }, [picked]);

  const { can } = useAuth();
  const canManage = can("products.create", "products.edit", "products.delete");
  const { data: taxTypes, reload: reloadTaxTypes } = useApi<TaxType[]>("/tax-types");
  const TYPE_OPTIONS: DropdownOption[] = taxTypeOptions(taxTypes, can("products.create"));
  // A tax type is missing: add it, then put it on the new category or on this category
  const [newTaxFor, setNewTaxFor] = useState<{ categoryId: string | null } | null>(null);
  const [taxTypesOpen, setTaxTypesOpen] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("");
  const [subName, setSubName] = useState("");
  const [busy, setBusy] = useState<"cat" | "sub" | null>(null);
  const [fieldsFor, setFieldsFor] = useState<SubCategory | null>(null);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!type) return toast.error("Pick the tax type (GST / HSN defaults) for this category");
    setBusy("cat");
    try {
      const created = await api.post<Category>("/categories", { name: name.trim(), taxTypeId: type });
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
        <b className="font-mono">ORI</b> + category code + sub-category code + a number counted within that sub-category (e.g. category 1 → sub-category 2:
        the first product is <b className="font-mono">ORI12000000001</b>, the next <b className="font-mono">ORI12000000002</b>). Every SKU is unique. Codes lock once products use them.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categories</h4>
            <button type="button" onClick={() => setTaxTypesOpen(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
              <Receipt className="size-3.5" /> Tax types
            </button>
          </div>
          <p className="mb-2 text-xs text-slate-500">Select a category to see its sub-categories and add new ones to it.</p>
          <form onSubmit={addCategory} className="mb-2 flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" className="min-w-0 flex-1" />
            <Dropdown
              options={TYPE_OPTIONS}
              value={type}
              onChange={(v) => (v === NEW_TAX_TYPE ? setNewTaxFor({ categoryId: null }) : setType(v))}
              placeholder="Tax type"
              className="w-40 shrink-0"
              aria-label="Tax type"
            />
            <Button type="submit" loading={busy === "cat"}>
              Add
            </Button>
          </form>
          <ul className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {categories?.map((c) => (
              <li
                key={c.id}
                id={`cat-${c.id}`}
                aria-current={picked?.id === c.id || undefined}
                className={cx(
                  "flex cursor-pointer items-center gap-2 border-l-[3px] px-2 py-1.5 text-sm",
                  picked?.id === c.id ? "border-brand-600 bg-brand-50" : "border-transparent hover:bg-slate-50",
                )}
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
                    value={c.taxTypeId ?? ""}
                    onChange={(v) => (v === NEW_TAX_TYPE ? setNewTaxFor({ categoryId: c.id }) : void patch(`/categories/${c.id}`, { taxTypeId: v }, () => void reload()))}
                    placeholder="Tax type"
                    className="w-28 shrink-0"
                    aria-label={`Tax type for ${c.name}`}
                  />
                </div>
                <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <RowAction kind="delete" title={`Delete ${c.name}`} onClick={() => void removeCategory(c)} />
                </span>
                <ChevronRight className={cx("size-4 shrink-0", picked?.id === c.id ? "text-brand-600" : "text-slate-300")} />
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
            <form onSubmit={addSub} className="mb-2 flex flex-wrap gap-2">
              {/* The category a new sub-category goes under: the one selected on the left, or pick it here */}
              <Dropdown
                options={(categories ?? []).map((c) => ({ value: c.id, label: c.name, hint: c.code ? `Code ${c.code}` : undefined }))}
                value={picked.id}
                onChange={setPickedId}
                isSearch
                searchPlaceholder="Search categories"
                className="w-full"
                aria-label="Category for the new sub-category"
              />
              <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder={`New sub-category in ${picked.name}`} className="min-w-0 flex-1" />
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
                <RowAction kind="delete" title={`Delete ${s.name}`} onClick={() => void removeSub(s)} />
              </li>
            ))}
            {subs && !subs.length && <li className="px-3 py-6 text-center text-sm text-slate-400">No sub-categories yet</li>}
          </ul>
        </section>
      </div>
      {newTaxFor && (
        <TaxTypeForm
          taxType={null}
          onClose={() => setNewTaxFor(null)}
          onSaved={(t) => {
            const forId = newTaxFor.categoryId;
            setNewTaxFor(null);
            void reloadTaxTypes();
            if (forId) void patch(`/categories/${forId}`, { taxTypeId: t.id }, () => void reload());
            else setType(t.id);
          }}
        />
      )}
      {taxTypesOpen && (
        <TaxTypesManager
          canEdit={canManage}
          onClose={() => {
            setTaxTypesOpen(false);
            void reloadTaxTypes();
            void reload();
          }}
        />
      )}
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
    <Modal open={open} onClose={onClose} title="Expense Categories" size="sm">
      <form onSubmit={add} className="mb-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" className="min-w-0 flex-1" />
        <Button type="submit" loading={busy}>
          Add
        </Button>
      </form>
      <ul className="divide-y divide-slate-100">
        {data?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <RowAction kind="delete" title={`Delete ${c.name}`} onClick={() => void remove(c)} />
          </li>
        ))}
      </ul>
    </Modal>
  );
}
