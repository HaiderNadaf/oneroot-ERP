"use client";

import { X } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { Button, DateInput, Dropdown, Select } from "./ui";

/** Filters shared by the PO, GRN and debit / credit note lists; empty strings mean "all" */
export interface ListFilterValue {
  from: string;
  to: string;
  vendorId: string;
  userId: string;
  productId: string;
}

export const noListFilters: ListFilterValue = { from: "", to: "", vendorId: "", userId: "", productId: "" };

/** True when any filter narrows the list */
export const hasListFilters = (v: ListFilterValue) => !!(v.from || v.to || v.vendorId || v.userId || v.productId);

interface Options {
  vendors: { id: string; name: string }[];
  users: { id: string; name: string }[];
  products: { id: string; name: string; sku: string }[];
}

/**
 * Date range, vendor, created-by and product filters above a document list. The vendor, user and product
 * options come from `optionsPath` (e.g. /grns/filters): only those that appear on the list's documents.
 */
export function ListFilters({
  value,
  onChange,
  optionsPath,
  userLabel = "Created By",
}: {
  value: ListFilterValue;
  onChange: (v: ListFilterValue) => void;
  optionsPath: string;
  /** What the user filter means on this list, e.g. "Received By" for GRNs */
  userLabel?: string;
}) {
  const { data } = useApi<Options>(optionsPath);
  const set = (patch: Partial<ListFilterValue>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex w-full items-center gap-1.5 sm:w-auto">
        <DateInput
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => set({ from: e.target.value })}
          className="min-w-0 flex-1 sm:w-38 sm:flex-none"
          aria-label="From date"
        />
        <span className="text-xs text-slate-400">to</span>
        <DateInput
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => set({ to: e.target.value })}
          className="min-w-0 flex-1 sm:w-38 sm:flex-none"
          aria-label="To date"
        />
      </div>
      <Select value={value.vendorId} onChange={(e) => set({ vendorId: e.target.value })} className="w-full sm:w-52" aria-label="Vendor" isSearch>
        <option value="">All Vendors</option>
        {data?.vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </Select>
      <Select value={value.userId} onChange={(e) => set({ userId: e.target.value })} className="w-full sm:w-44" aria-label={userLabel}>
        <option value="">{userLabel}: Anyone</option>
        {data?.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <Dropdown
        value={value.productId}
        onChange={(productId) => set({ productId })}
        options={[
          { value: "", label: "All Products" },
          ...(data?.products ?? []).map((p) => ({ value: p.id, label: p.name, detail: p.sku })),
        ]}
        placeholder="All Products"
        isSearch
        searchPlaceholder="Search name or SKU…"
        className="w-full sm:w-56"
        aria-label="Product"
      />
      {hasListFilters(value) && (
        <Button variant="ghost" icon={<X className="size-4" />} onClick={() => onChange(noListFilters)}>
          Clear
        </Button>
      )}
    </div>
  );
}
