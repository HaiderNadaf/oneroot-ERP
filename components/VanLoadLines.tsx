"use client";

import { Trash2 } from "lucide-react";
import { qty } from "@/lib/format";
import type { Product } from "@/lib/types";
import { ProductPicker } from "./pickers";
import { Input } from "./ui";

export interface LoadLine {
  product: Product;
  quantity: string;
}

/** Product + quantity rows for loading a van */
export function LoadLines({ lines, setLines }: { lines: LoadLine[]; setLines: (fn: (ls: LoadLine[]) => LoadLine[]) => void }) {
  return (
    <div className="space-y-2">
      <ProductPicker onPick={(p: Product) => setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls : [...ls, { product: p, quantity: "" }]))} />
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-400">Search and add what goes on the van</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {lines.map((l) => (
            <li key={l.product.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">{l.product.name}</p>
                <p className="text-xs text-slate-500">
                  {l.product.sku} · {qty(l.product.stock)} {l.product.unit} in branch
                </p>
              </div>
              <Input
                type="number"
                min="0"
                step="any"
                value={l.quantity}
                onChange={(e) => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, quantity: e.target.value } : x)))}
                className="num h-8 w-24 text-right"
                aria-label={`Quantity of ${l.product.name}`}
                placeholder="Qty"
              />
              <span className="w-10 text-xs text-slate-500">{l.product.unit}</span>
              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

