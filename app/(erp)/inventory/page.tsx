"use client";

import { AlertTriangle, ArrowLeftRight, ArrowRight, Boxes, CalendarClock, ClipboardList, Download, IndianRupee, PackageX, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BranchCode } from "@/components/BranchNotice";
import type { StockAdjustInitial } from "@/components/StockAdjustModal";
import { ExpiryBadge, MOVEMENT_LABEL, MOVEMENT_TYPES, MovementBadge, MovementRef, SignedQty, useSeeCostPrice } from "@/components/StockBits";
import {
  Badge,
  Button,
  Card,
  DateInput,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
  Table,
  Tabs,
  Td,
  Th,
  cx,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { date, dateTime, daysUntil, downloadCsv, inr, inr0, n, qty } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Batch, Paged, StockMovement, StockTransfer } from "@/lib/types";
import { LazyStockAdjustModal, LazyTransferModal } from "@/components/lazy";

type Tab = "batches" | "low" | "movements" | "transfers";
const TABS: Tab[] = ["batches", "low", "movements", "transfers"];

interface LowStockRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: string;
  reorderLevel: string;
}

interface StockReport {
  items: unknown[];
  totals: { costValue: number; saleValue: number };
}

/** Product name, linked to its page when the user can open Products */
function ProductName({ id, name }: { id: string; name: string }) {
  const { can } = useAuth();
  return can("products.view") ? (
    <Link href={`/products/${id}`} className="font-medium text-slate-900 hover:text-brand-700">
      {name}
    </Link>
  ) : (
    <span className="font-medium text-slate-900">{name}</span>
  );
}

type AdjustTarget = { product: { id: string; name: string; unit: string } | null; initial?: StockAdjustInitial };

export default function InventoryPage() {
  const { can } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const initialTab = params.get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(initialTab && TABS.includes(initialTab) ? initialTab : "batches");
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  // Keep the tab in the URL so links like /inventory?tab=transfers (notifications, movement refs) land on it
  function setTab(t: Tab) {
    setTabState(t);
    router.replace(t === "batches" ? "/inventory" : `/inventory?tab=${t}`, { scroll: false });
  }
  const [version, setVersion] = useState(0);

  const canValue = can("reports.view");
  const stockReport = useApi<StockReport>(canValue ? "/reports/stock" : null, { v: version });
  const lowStock = useApi<LowStockRow[]>("/inventory/low-stock", { v: version });
  const inStock = useApi<Paged<Batch>>(canValue ? null : "/inventory/batches", { pageSize: 1, v: version });
  const expiring = useApi<Paged<Batch>>("/inventory/batches", { status: "expiring", pageSize: 1, v: version });
  const expired = useApi<Paged<Batch>>("/inventory/batches", { status: "expired", pageSize: 1, v: version });

  const bump = () => setVersion((v) => v + 1);

  return (
    <>
      <PageHeader
        title="Stock & Batches"
        subtitle="Batch-wise stock, expiry tracking and every stock movement"
        actions={
          can("inventory.adjust") && (
            <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setAdjust({ product: null })}>
              Adjust Stock
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {canValue ? (
          <StatCard
            label="Stock Value (Cost)"
            value={stockReport.data ? inr0(stockReport.data.totals.costValue) : "—"}
            sub={stockReport.data ? `${inr0(stockReport.data.totals.saleValue)} at selling price` : undefined}
            icon={<IndianRupee />}
            tone="green"
          />
        ) : (
          <StatCard label="Batches in Stock" value={inStock.data?.total ?? "—"} sub="with quantity on hand" icon={<Boxes />} tone="green" />
        )}
        <StatCard
          label="Below Reorder Level"
          value={lowStock.data?.length ?? "—"}
          sub="products to reorder"
          icon={<AlertTriangle />}
          tone={lowStock.data?.length ? "red" : "slate"}
        />
        <StatCard
          label="Expiring Soon"
          value={expiring.data?.total ?? "—"}
          sub="batches with stock"
          icon={<CalendarClock />}
          tone={expiring.data?.total ? "amber" : "slate"}
        />
        <StatCard
          label="Expired"
          value={expired.data?.total ?? "—"}
          sub="batches still holding stock"
          icon={<PackageX />}
          tone={expired.data?.total ? "red" : "slate"}
        />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "batches", label: "Batches" },
          { value: "low", label: `Low Stock${lowStock.data?.length ? ` (${lowStock.data.length})` : ""}` },
          { value: "movements", label: "Stock Movements" },
          { value: "transfers", label: "Transfers" },
        ]}
      />

      {tab === "batches" && (
        <BatchesTab
          version={version}
          onWriteOff={(b) =>
            setAdjust({
              product: b.product ? { id: b.product.id, name: b.product.name, unit: b.product.unit } : null,
              initial: { type: "EXPIRED", batchId: b.id, quantity: n(b.quantity), reason: `Batch ${b.batchNo} expired on ${date(b.expiryDate)}` },
            })
          }
        />
      )}
      {tab === "low" && <LowStockTab data={lowStock.data} error={lowStock.error} loading={lowStock.loading} reload={lowStock.reload} />}
      {tab === "movements" && <MovementsTab version={version} />}
      {tab === "transfers" && <TransfersTab version={version} onNew={() => setTransferOpen(true)} />}

      <LazyTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onSaved={() => {
          bump();
          setTab("transfers");
        }}
      />

      <LazyStockAdjustModal
        open={!!adjust}
        onClose={() => setAdjust(null)}
        onSaved={bump}
        product={adjust?.product}
        initial={adjust?.initial}
      />
    </>
  );
}

function BatchesTab({ version, onWriteOff }: { version: number; onWriteOff: (b: Batch) => void }) {
  const { can } = useAuth();
  const showCost = useSeeCostPrice();
  // Batches from every branch are listed together while viewing All branches
  const showBranch = useBranch().currentId === "all";
  const cols = (showBranch ? 10 : 9) - (showCost ? 0 : 2);
  // ?status=expiring|expired opens the batch list pre-filtered (used by dashboard shortcuts)
  const initialStatus = useSearchParams().get("status");
  const [status, setStatus] = useState(
    initialStatus === "expiring" || initialStatus === "expired" || initialStatus === "all" ? initialStatus : "",
  );
  const [search, setSearch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const query = { status, search: q, expiry };
  const { data, error, loading, reload } = useApi<Paged<Batch>>("/inventory/batches", { ...query, page, pageSize: 25, v: version });

  async function exportCsv() {
    const all = await api.get<Paged<Batch>>("/inventory/batches", { ...query, pageSize: 500 });
    const head = ["Branch", "Product", "SKU", "Batch", "Mfg Date", "Expiry Date", "Days to Expiry", "Qty", "Unit", "Cost", "MRP", "Value"];
    const costCols = new Set(showCost ? [] : [9, 11]);
    downloadCsv(
      "batches.csv",
      head.filter((_, i) => !costCols.has(i)),
      all.items.map((b) =>
        [
          b.branch?.code,
          b.product?.name,
          b.product?.sku,
          b.batchNo,
          b.mfgDate?.slice(0, 10),
          b.expiryDate?.slice(0, 10),
          daysUntil(b.expiryDate),
          n(b.quantity),
          b.product?.unit,
          n(b.costPrice),
          n(b.mrp) || "",
          n(b.quantity) * n(b.costPrice),
        ].filter((_, i) => !costCols.has(i)),
      ),
    );
  }

  return (
    <Card bodyClassName="p-0">
      <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
        <SearchInput
          value={search}
          onChange={(v) => (setSearch(v), setPage(1))}
          placeholder="Search product, SKU or batch no.…"
          className="w-full sm:w-auto sm:min-w-60 sm:flex-1"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            // "Expiring soon" / "Expired" set their own date range
            if (e.target.value === "expiring" || e.target.value === "expired") setExpiry("");
            setPage(1);
          }}
          className="w-[calc(50%-0.25rem)] sm:w-40"
          aria-label="Stock status"
        >
          <option value="">In Stock</option>
          <option value="expiring">Expiring Soon</option>
          <option value="expired">Expired</option>
          <option value="all">All Batches</option>
        </Select>
        <Select
          value={expiry}
          onChange={(e) => {
            setExpiry(e.target.value);
            if (e.target.value && (status === "expiring" || status === "expired")) setStatus("");
            setPage(1);
          }}
          className={cx("w-[calc(50%-0.25rem)] sm:w-48", expiry && "border-brand-500 bg-brand-50")}
          aria-label="Expires in"
        >
          <option value="">Expires in: Any Time</option>
          <option value="0-30">Expires in 0–30 Days</option>
          <option value="30-60">Expires in 30–60 Days</option>
          <option value="60-90">Expires in 60–90 Days</option>
          <option value="90-120">Expires in 90–120 Days</option>
          <option value="120+">Expires in 120+ Days</option>
        </Select>
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>
          Export
        </Button>
      </div>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              {showBranch && <Th>Branch</Th>}
              <Th>Batch</Th>
              <Th className="hidden md:table-cell">Location</Th>
              <Th className="hidden md:table-cell">Mfg Date</Th>
              <Th>Expiry</Th>
              <Th right>Qty</Th>
              {showCost && <Th right className="hidden md:table-cell">Cost</Th>}
              {showCost && <Th right>Value</Th>}
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={cols} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={cols}>
                {expiry
                  ? `No batches expire in ${expiry.replace("-", "–").replace("+", "+ ")} days`
                  : status === "expired"
                    ? "No expired stock — nothing to write off"
                    : status === "expiring"
                      ? "Nothing expiring soon"
                      : "No batches found"}
              </EmptyRow>
            ) : (
              data.items.map((b) => {
                const d = daysUntil(b.expiryDate);
                const isExpired = d !== null && d < 0;
                return (
                  <tr key={b.id} className={cx("hover:bg-slate-50", isExpired && n(b.quantity) > 0 && "bg-red-50/40")}>
                    <Td>
                      {b.product ? (
                        <ProductName id={b.product.id} name={b.product.name} />
                      ) : (
                        "—"
                      )}
                      <p className="text-xs text-slate-500">{b.product?.sku}</p>
                    </Td>
                    {showBranch && (
                      <Td>
                        <BranchCode code={b.branch?.code} title={b.branch?.name} />
                      </Td>
                    )}
                    <Td className="font-medium">{b.batchNo}</Td>
                    <Td className="hidden text-xs text-slate-600 md:table-cell">{b.location ?? b.product?.location ?? "—"}</Td>
                    <Td className="hidden text-xs md:table-cell">{date(b.mfgDate)}</Td>
                    <Td className="whitespace-nowrap">
                      <span className="mr-2 text-xs">{date(b.expiryDate)}</span>
                      <ExpiryBadge expiry={b.expiryDate} />
                    </Td>
                    <Td right className={n(b.quantity) <= 0 ? "text-slate-400" : "font-medium"}>
                      {qty(b.quantity)} <span className="text-xs font-normal text-slate-500">{b.product?.unit}</span>
                    </Td>
                    {showCost && <Td right className="hidden md:table-cell">{inr(b.costPrice)}</Td>}
                    {showCost && <Td right>{inr(n(b.quantity) * n(b.costPrice))}</Td>}
                    <Td right>
                      {isExpired && n(b.quantity) > 0 && can("inventory.adjust") && (
                        <Button variant="secondary" size="sm" className="text-red-700" onClick={() => onWriteOff(b)}>
                          Write Off
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </Card>
  );
}

function LowStockTab({
  data,
  error,
  loading,
  reload,
}: {
  data: LowStockRow[] | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}) {
  const { can } = useAuth();
  return (
    <Card
      title="Products at or Below Reorder Level"
      bodyClassName="p-0"
      actions={
        can("po.create") && (
          <Link href="/purchase-orders/new">
            <Button size="sm" icon={<ClipboardList className="size-4" />}>
              Create PO
            </Button>
          </Link>
        )
      }
    >
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th right>In Stock</Th>
              <Th right>Reorder Level</Th>
              <Th right>Shortfall</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={4} />
            ) : !data?.length ? (
              <EmptyRow colSpan={4}>All products are above their reorder level</EmptyRow>
            ) : (
              data.map((r) => {
                const stock = n(r.stock);
                const short = n(r.reorderLevel) - stock;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <ProductName id={r.id} name={r.name} />
                      <p className="text-xs text-slate-500">{r.sku}</p>
                    </Td>
                    <Td right className={stock <= 0 ? "font-semibold text-red-600" : "font-medium text-amber-700"}>
                      {qty(stock)} <span className="text-xs font-normal text-slate-500">{r.unit}</span>
                      {stock <= 0 && <p className="text-[11px]">out of stock</p>}
                    </Td>
                    <Td right>
                      {qty(r.reorderLevel)} <span className="text-xs text-slate-500">{r.unit}</span>
                    </Td>
                    <Td right className="text-slate-500">
                      {short > 0 ? `${qty(short)} ${r.unit}` : "at level"}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function MovementsTab({ version }: { version: number }) {
  const showCost = useSeeCostPrice();
  const showBranch = useBranch().currentId === "all";
  const cols = showBranch ? 9 : 8;
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const query = { type, from, to };
  const { data, error, loading, reload } = useApi<Paged<StockMovement>>("/inventory/movements", { ...query, page, pageSize: 30, v: version });

  async function exportCsv() {
    const all = await api.get<Paged<StockMovement>>("/inventory/movements", { ...query, pageSize: 500 });
    const head = ["Date", "Branch", "Product", "SKU", "Type", "Reference", "Batch", "Qty", "Balance After", "Unit Cost", "Note"];
    // Column 9 is the unit cost
    const keep = (_: unknown, i: number) => showCost || i !== 9;
    downloadCsv(
      "stock-movements.csv",
      head.filter(keep),
      all.items.map((m) =>
        [
          dateTime(m.createdAt),
          m.branch?.code,
          m.product?.name,
          m.product?.sku,
          MOVEMENT_LABEL[m.type],
          m.refNo,
          m.batch?.batchNo,
          n(m.quantity),
          n(m.balanceAfter),
          m.unitCost == null ? "" : n(m.unitCost),
          m.note,
        ].filter(keep),
      ),
    );
  }

  return (
    <Card bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <Select value={type} onChange={(e) => (setType(e.target.value), setPage(1))} className="w-full sm:w-48">
          <option value="">All Movement Types</option>
          {MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_LABEL[t]}
            </option>
          ))}
        </Select>
        <DateInput value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} className="w-[calc(50%-1.25rem)] sm:w-40" aria-label="From date" />
        <span className="text-sm text-slate-400">to</span>
        <DateInput value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} className="w-[calc(50%-1.25rem)] sm:w-40" aria-label="To date" />
        {(type || from || to) && (
          <Button variant="ghost" size="sm" onClick={() => (setType(""), setFrom(""), setTo(""), setPage(1))}>
            Clear
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>
          Export
        </Button>
      </div>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              {showBranch && <Th>Branch</Th>}
              <Th>Product</Th>
              <Th>Type</Th>
              <Th>Reference</Th>
              <Th className="hidden md:table-cell">Batch</Th>
              <Th right>Qty</Th>
              <Th right className="hidden md:table-cell">Balance</Th>
              <Th className="hidden md:table-cell">Note</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={cols} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={cols}>No stock movements match these filters</EmptyRow>
            ) : (
              data.items.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-xs">{dateTime(m.createdAt)}</Td>
                  {showBranch && (
                    <Td>
                      <BranchCode code={m.branch?.code} title={m.branch?.name} />
                    </Td>
                  )}
                  <Td>
                    <ProductName id={m.productId} name={m.product?.name ?? "—"} />
                  </Td>
                  <Td>
                    <MovementBadge type={m.type} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <MovementRef m={m} />
                  </Td>
                  <Td className="hidden text-xs md:table-cell">{m.batch?.batchNo ?? "—"}</Td>
                  <Td right>
                    <SignedQty value={m.quantity} unit={m.product?.unit} />
                  </Td>
                  <Td right className="hidden md:table-cell">{qty(m.balanceAfter)}</Td>
                  <Td className="hidden max-w-56 truncate text-xs text-slate-500 md:table-cell">{m.note || "—"}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </Card>
  );
}

function TransfersTab({ version, onNew }: { version: number; onNew: () => void }) {
  const { can } = useAuth();
  const { currentId } = useBranch();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<StockTransfer>>("/stock-transfers", { page, pageSize: 25, v: version });

  const itemLabel = (i: StockTransfer["items"][number]) =>
    `${qty(i.quantity)} × ${i.product?.name ?? "Product"}${i.batchNo ? ` (${i.batchNo})` : ""}`;

  return (
    <Card
      title="Stock Sent Between Branches"
      bodyClassName="p-0"
      actions={
        can("inventory.transfer") && (
          <Button size="sm" icon={<ArrowLeftRight className="size-4" />} onClick={onNew}>
            New Transfer
          </Button>
        )
      }
    >
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Transfer</Th>
              <Th>Date</Th>
              <Th>From → To</Th>
              <Th>Items</Th>
              <Th className="hidden md:table-cell">Notes</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={5} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={5}>
                No stock transfers yet{can("inventory.transfer") ? " — use New Transfer to send stock to another branch" : ""}
              </EmptyRow>
            ) : (
              data.items.map((t) => {
                const direction = currentId === "all" ? null : t.fromBranchId === currentId ? "out" : t.toBranchId === currentId ? "in" : null;
                const labels = t.items.map(itemLabel);
                return (
                  <tr key={t.id} className="align-top hover:bg-slate-50">
                    <Td className="whitespace-nowrap">
                      <span className="font-medium text-slate-900">{t.transferNo}</span>
                      {direction && (
                        <p className="mt-0.5">
                          <Badge tone={direction === "in" ? "green" : "amber"}>{direction === "in" ? "Received" : "Sent"}</Badge>
                        </p>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{date(t.transferDate)}</Td>
                    <Td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <BranchCode code={t.fromBranch.code} title={t.fromBranch.name} />
                        <ArrowRight className="size-3.5 text-slate-400" />
                        <BranchCode code={t.toBranch.code} title={t.toBranch.name} />
                      </span>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {t.fromBranch.name} → {t.toBranch.name}
                      </p>
                    </Td>
                    <Td className="min-w-48 max-w-96">
                      <p className="text-sm text-slate-700" title={labels.join("\n")}>
                        {labels.slice(0, 2).join(", ")}
                      </p>
                      {labels.length > 2 && <p className="text-xs text-slate-500">+{labels.length - 2} more</p>}
                    </Td>
                    <Td className="hidden max-w-56 truncate text-xs text-slate-500 md:table-cell">{t.notes || "—"}</Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </Card>
  );
}
