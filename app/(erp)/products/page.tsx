"use client";

import { Download, Eye, Pencil, Plus, Tags, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CategoryManager } from "@/components/CategoryManager";
import { ColumnPicker, useColumns, type ColumnDef } from "@/components/ColumnPicker";
import { GenerateBarcodesButton } from "@/components/GenerateBarcodesButton";
import { ProductForm } from "@/components/ProductForm";
import {
  Badge,
  Button,
  Card,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  Table,
  Td,
  Th,
  cx,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { downloadCsv, inr, n, qty } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { PRODUCT_TYPES, TYPE_LABEL, type Category, type Paged, type Product } from "@/lib/types";

/** Margin on the GST-exclusive selling price */
function marginPct(p: Product) {
  const net = n(p.salePrice) / (1 + n(p.gstRate) / 100);
  return net > 0 && n(p.purchasePrice) > 0 ? ((net - n(p.purchasePrice)) / net) * 100 : null;
}

const isLow = (p: Product) => n(p.reorderLevel) > 0 && n(p.stock) <= n(p.reorderLevel);

function StockCell({ p }: { p: Product }) {
  const low = isLow(p);
  return (
    <>
      <span className={low ? "font-semibold text-red-600" : n(p.stock) <= 0 ? "text-slate-400" : "font-medium"}>{qty(p.stock)}</span>{" "}
      <span className="text-xs text-slate-500">{p.unit}</span>
      {/* With a branch selected, `stock` is that branch's; show the all-branch figure when it differs */}
      {p.totalStock !== undefined && Math.abs(n(p.totalStock) - n(p.stock)) > 0.0005 && (
        <p className="num text-[11px] text-slate-400">of {qty(p.totalStock)} total</p>
      )}
      {low && <p className="text-[11px] text-red-600">below reorder level</p>}
    </>
  );
}

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? <span className="text-slate-300">—</span> : String(v));

export default function ProductsPage() {
  const { can } = useAuth();
  // Cost price visibility follows the role's authority limits (Admin → Roles & Limits)
  const { data: limits } = useApi<{ seeCostPrice: boolean }>("/roles/mine");
  const showCost = limits ? limits.seeCostPrice : can("purchases.view");
  const { current, branches, locked } = useBranch();
  // Stock figures are for the selected branch; name it when the store has several
  const branchCode = current && (branches.length > 1 || locked) ? current.code : null;
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("active");
  const [stock, setStock] = useState("");
  const [sort, setSort] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const q = useDebounced(search);

  const { data: categories, reload: reloadCats } = useApi<Category[]>("/categories");
  const filters = { search: q, type, categoryId, status, stock, sort };
  const { data, error, loading, reload } = useApi<Paged<Product>>("/products", { ...filters, page, pageSize });

  const allColumns = useMemo<ColumnDef<Product>[]>(() => {
    const cols: ColumnDef<Product>[] = [
      {
        id: "product",
        label: "Product",
        locked: true,
        render: (p) => (
          <>
            <Link href={`/products/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
              {p.name}
            </Link>
            <p className="text-xs text-slate-500">
              {p.sku}
              {p.packSize && ` · ${p.packSize}`}
            </p>
          </>
        ),
        csv: (p) => p.name,
      },
      { id: "sku", label: "SKU", render: (p) => <span className="font-mono text-xs">{p.sku}</span>, csv: (p) => p.sku },
      { id: "barcode", label: "Barcode", render: (p) => dash(p.barcode), csv: (p) => p.barcode },
      {
        id: "type",
        label: "Type",
        defaultVisible: true,
        render: (p) => <StatusBadge status={p.type} />,
        csv: (p) => TYPE_LABEL[p.type],
      },
      { id: "category", label: "Category", defaultVisible: true, render: (p) => dash(p.category?.name), csv: (p) => p.category?.name },
      { id: "brand", label: "Brand", defaultVisible: true, render: (p) => dash(p.brand), csv: (p) => p.brand },
      { id: "manufacturer", label: "Manufacturer", render: (p) => dash(p.manufacturer), csv: (p) => p.manufacturer },
      {
        id: "technicalName",
        label: "Composition",
        render: (p) => <span className="line-clamp-2 max-w-56 text-xs">{dash(p.technicalName)}</span>,
        csv: (p) => p.technicalName,
      },
      { id: "packSize", label: "Pack size", render: (p) => dash(p.packSize), csv: (p) => p.packSize },
      { id: "hsn", label: "HSN", render: (p) => dash(p.hsnCode), csv: (p) => p.hsnCode },
      { id: "gst", label: "GST %", right: true, defaultVisible: true, render: (p) => `${n(p.gstRate)}%`, csv: (p) => n(p.gstRate) },
      { id: "unit", label: "Unit", render: (p) => p.unit, csv: (p) => p.unit },
    ];
    if (showCost) {
      cols.push({
        id: "purchasePrice",
        label: "Purchase rate",
        right: true,
        render: (p) => (n(p.purchasePrice) ? inr(p.purchasePrice) : dash(null)),
        csv: (p) => n(p.purchasePrice),
      });
    }
    cols.push(
      { id: "salePrice", label: "Sale price", right: true, defaultVisible: true, render: (p) => inr(p.salePrice), csv: (p) => n(p.salePrice) },
      {
        id: "mrp",
        label: "MRP",
        right: true,
        defaultVisible: true,
        render: (p) => <span className="text-slate-500">{n(p.mrp) ? inr(p.mrp) : "—"}</span>,
        csv: (p) => n(p.mrp),
      },
    );
    if (showCost) {
      cols.push({
        id: "margin",
        label: "Margin %",
        right: true,
        render: (p) => {
          const m = marginPct(p);
          return m === null ? dash(null) : <span className={m < 0 ? "text-red-600" : m < 5 ? "text-amber-700" : "text-brand-700"}>{m.toFixed(1)}%</span>;
        },
        csv: (p) => marginPct(p)?.toFixed(1),
      });
    }
    cols.push(
      {
        id: "stock",
        label: branchCode ? `Stock (${branchCode})` : "Stock",
        right: true,
        defaultVisible: true,
        render: (p) => <StockCell p={p} />,
        csv: (p) => n(p.stock),
      },
      { id: "reorderLevel", label: "Reorder level", right: true, render: (p) => (n(p.reorderLevel) ? qty(p.reorderLevel) : dash(null)), csv: (p) => n(p.reorderLevel) },
    );
    if (showCost) {
      cols.push({
        id: "stockValue",
        label: "Stock value",
        right: true,
        render: (p) => inr(n(p.stock) * n(p.purchasePrice)),
        csv: (p) => Math.round(n(p.stock) * n(p.purchasePrice) * 100) / 100,
      });
    }
    cols.push(
      {
        id: "batch",
        label: "Batch tracking",
        render: (p) => (p.trackBatch ? <Badge tone="green">Batch & expiry</Badge> : <span className="text-xs text-slate-400">No</span>),
        csv: (p) => (p.trackBatch ? "Yes" : "No"),
      },
      {
        id: "status",
        label: "Status",
        render: (p) => (p.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>),
        csv: (p) => (p.isActive ? "Active" : "Inactive"),
      },
    );
    return cols;
  }, [showCost, branchCode]);

  const cols = useColumns("products", allColumns);
  const colCount = cols.columns.length + 1;
  const activeFilters = [type, categoryId, stock, status !== "active" ? status : ""].filter(Boolean).length;

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  function clearFilters() {
    setType("");
    setCategoryId("");
    setStock("");
    setStatus("active");
    setSearch("");
    setPage(1);
  }

  /** Exports the visible columns for every product matching the filters */
  async function exportCsv() {
    const all = await api.get<Paged<Product>>("/products", { ...filters, pageSize: 500 });
    const visible = cols.columns.filter((c) => c.csv);
    downloadCsv(
      "products.csv",
      visible.map((c) => (c.id === "product" ? "Product" : c.label)),
      all.items.map((p) => visible.map((c) => c.csv!(p))),
    );
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Seeds, fertilizers, pesticides and equipment you stock"
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>
              Export
            </Button>
            {can("products.manage") && (
              <>
                <GenerateBarcodesButton />
                <Button variant="secondary" icon={<Tags className="size-4" />} onClick={() => setCatsOpen(true)}>
                  Categories
                </Button>
                <Button icon={<Plus className="size-4" />} onClick={openNew}>
                  New product
                </Button>
              </>
            )}
          </>
        }
      />

      <Card bodyClassName="p-0">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search name, SKU, barcode, brand, composition…"
            className="min-w-60 flex-1"
          />
          <Select value={type} onChange={(e) => (setType(e.target.value), setPage(1))} className="w-36" aria-label="Type">
            <option value="">All types</option>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <Select value={categoryId} onChange={(e) => (setCategoryId(e.target.value), setPage(1))} className="w-40" aria-label="Category">
            <option value="">All categories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={stock} onChange={(e) => (setStock(e.target.value), setPage(1))} className="w-36" aria-label="Stock">
            <option value="">Any stock</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-28" aria-label="Status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
          <Select value={sort} onChange={(e) => (setSort(e.target.value), setPage(1))} className="w-40" aria-label="Sort by">
            <option value="">Sort: Name A–Z</option>
            <option value="sku">Sort: SKU</option>
            <option value="stock_asc">Stock: low to high</option>
            <option value="stock_desc">Stock: high to low</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="newest">Newest first</option>
          </Select>
          {(activeFilters > 0 || search) && (
            <Button variant="ghost" size="sm" icon={<X className="size-3.5" />} onClick={clearFilters}>
              Clear
            </Button>
          )}
          <div className="ml-auto">
            <ColumnPicker state={cols} />
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                {cols.columns.map((c) => (
                  <Th key={c.id} right={c.right} className={c.className}>
                    {c.label}
                  </Th>
                ))}
                <Th right className="sticky right-0">
                  Actions
                </Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={colCount} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={colCount}>
                  {activeFilters || search ? (
                    <>
                      No products match these filters.{" "}
                      <button className="font-medium text-brand-700 underline" onClick={clearFilters}>
                        Clear filters
                      </button>
                    </>
                  ) : (
                    <>
                      No products yet.{" "}
                      {can("products.manage") && (
                        <button className="font-medium text-brand-700 underline" onClick={openNew}>
                          Add your first product
                        </button>
                      )}
                    </>
                  )}
                </EmptyRow>
              ) : (
                data.items.map((p) => (
                  <tr key={p.id} className={cx("group hover:bg-slate-50", !p.isActive && "opacity-60")}>
                    {cols.columns.map((c) => (
                      <Td key={c.id} right={c.right} className={cx("whitespace-nowrap", c.className)}>
                        {c.render(p)}
                      </Td>
                    ))}
                    <Td right className="sticky right-0 bg-white group-hover:bg-slate-50">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/products/${p.id}`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="View product, batches and stock history"
                        >
                          <Eye className="size-4" /> View
                        </Link>
                        {can("products.manage") && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(p);
                              setFormOpen(true);
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
                            title="Edit product"
                          >
                            <Pencil className="size-4" /> Edit
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
        {data && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
            <label className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
              Rows per page
              <Select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 w-20"
              >
                {[25, 50, 100].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </label>
          </div>
        )}
      </Card>

      <ProductForm
        open={formOpen}
        product={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
      <CategoryManager
        open={catsOpen}
        onClose={() => {
          setCatsOpen(false);
          void reloadCats();
        }}
      />
    </>
  );
}
