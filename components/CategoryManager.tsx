"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Category } from "@/lib/types";
import { Button, Input, Modal, errMsg, useConfirm, useToast } from "./ui";

const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/**
 * Add/remove product categories (each with a SKU code like FRT → FRT-0001),
 * or expense categories with `kind="expense"`.
 */
export function CategoryManager({
  open,
  onClose,
  kind = "product",
}: {
  open: boolean;
  onClose: () => void;
  kind?: "product" | "expense";
}) {
  const isProduct = kind === "product";
  const path = isProduct ? "/categories" : "/expense-categories";
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useApi<Category[]>(open ? path : null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await api.post<Category>(path, { name: name.trim(), ...(isProduct && code ? { code } : {}) });
      if (isProduct) toast.success(`${created.name} added — SKUs will start ${created.code}-0001`);
      setName("");
      setCode("");
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveCode(c: Category) {
    if (editCode.length < 2) return toast.error("Code needs at least 2 letters or digits");
    try {
      await api.patch(`${path}/${c.id}`, { code: editCode });
      toast.success(`New ${c.name} products will get ${editCode}-… SKUs`);
      setEditId(null);
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  async function remove(c: Category) {
    if (!(await confirm(`Delete category "${c.name}"?`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`${path}/${c.id}`);
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isProduct ? "Product categories" : "Expense categories"} size={isProduct ? "md" : "sm"}>
      {isProduct && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Each category has a short <b>SKU code</b>. New products in it get SKUs like <b className="font-mono">FRT-0001</b>,{" "}
          <b className="font-mono">FRT-0002</b> — search the code to find all of them.
        </p>
      )}
      <form onSubmit={add} className="mb-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
        {isProduct && (
          <Input
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            placeholder="Code (auto)"
            className="w-28 font-mono uppercase"
            aria-label="SKU code"
            title="Leave blank to create one from the name"
          />
        )}
        <Button type="submit" loading={busy}>
          Add
        </Button>
      </form>
      <ul className="divide-y divide-slate-100">
        {data?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
            {isProduct &&
              (editId === c.id ? (
                <span className="flex items-center gap-1">
                  <Input
                    value={editCode}
                    onChange={(e) => setEditCode(cleanCode(e.target.value))}
                    className="h-8 w-24 font-mono uppercase"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveCode(c);
                      } else if (e.key === "Escape") setEditId(null);
                    }}
                    aria-label={`SKU code for ${c.name}`}
                  />
                  <button onClick={() => saveCode(c)} className="rounded p-1 text-brand-700 hover:bg-brand-50" aria-label="Save code">
                    <Check className="size-4" />
                  </button>
                  <button onClick={() => setEditId(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cancel">
                    <X className="size-4" />
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => {
                    setEditId(c.id);
                    setEditCode(c.code ?? "");
                  }}
                  className="group inline-flex w-24 items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                  title="Change SKU code (only affects new products)"
                >
                  {c.code ?? "—"}
                  <Pencil className="ml-auto size-3 opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            <span className="min-w-0 flex-1 truncate">
              {c.name}
              {c._count && <span className="ml-2 text-xs text-slate-400">{c._count.products} products</span>}
            </span>
            <button onClick={() => remove(c)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${c.name}`}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
