"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { BranchCode } from "@/components/BranchNotice";
import { ReportLink } from "@/components/reports/ReportKit";
import { ExpiryBadge, MovementBadge, MovementRef, SignedQty } from "@/components/StockBits";
import { Badge, Card, EmptyRow, ErrorBox, LoadingRow, Modal, Spinner, Table, Td, Th, cx } from "@/components/ui";
import { date, dateTime, inr, n, qty } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Batch, Paged, StockMovement } from "@/lib/types";

/** A batch with where it came from and what has happened to it since (GET /products/:id/batches) */
interface BatchDetail extends Batch {
  source: {
    type: "GRN" | "PURCHASE" | "OPENING" | "TRANSFER" | "OTHER";
    id: string | null;
    no: string | null;
    date: string;
    vendor: { id: string; name: string } | null;
    po: { id: string; poNo: string } | null;
    invoiceNo: string | null;
  };
  received: number;
  transferredIn: number;
  sold: number;
  returnedToVendor: number;
  transferredOut: number;
  adjusted: number;
  writtenOff: number;
  lastMovementAt: string | null;
  serials: { inStock: number; total: number } | null;
}

/** A single batch with its product (GET /products/batches/:id) */
type BatchWithProduct = BatchDetail & { product: NonNullable<Batch["product"]> & { packSize?: string | null } };

const SOURCE_LABEL: Record<BatchDetail["source"]["type"], string> = {
  GRN: "Goods Inward",
  PURCHASE: "Purchase",
  OPENING: "Opening Stock",
  TRANSFER: "Transfer In",
  OTHER: "Adjustment",
};

/**
 * Product page → every batch with all its details: source (GRN / purchase, vendor, PO), rack, dates, prices and
 * what happened to it (received, sold, transferred, adjusted, written off). A row opens that batch's own movements.
 */
export function BatchDetails({
  productId,
  unit,
  productLocation,
  allBranches,
  branchName,
  showCost,
  canMoves,
}: {
  productId: string;
  unit: string;
  /** The product's usual rack, used when a batch has none of its own */
  productLocation?: string | null;
  allBranches: boolean;
  /** The selected branch, for the title */
  branchName?: string;
  showCost: boolean;
  canMoves: boolean;
}) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<BatchDetail[]>(`/products/${productId}/batches`, { all: all ? "true" : undefined });
  const rows = data ?? [];
  const inStock = rows.reduce((s, b) => s + n(b.quantity), 0);
  const value = rows.reduce((s, b) => s + n(b.quantity) * n(b.costPrice), 0);
  const cols = 10 + (allBranches ? 1 : 0) + (showCost ? 2 : 0);

  return (
    <Card
      title={`${all ? "All Batches" : "Batches in Stock"}${branchName ? ` at ${branchName}` : ""} (${rows.length})`}
      className="mt-4"
      bodyClassName="p-0"
      actions={
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {[
            { v: false, label: "In Stock" },
            { v: true, label: "All Batches" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                setAll(o.v);
                setOpen(null);
              }}
              className={cx("rounded-md px-2.5 py-1 transition-colors", all === o.v ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
            >
              {o.label}
            </button>
          ))}
        </div>
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
              <Th className="w-8" />
              <Th>Batch</Th>
              {allBranches && <Th>Branch</Th>}
              <Th>Source</Th>
              <Th>Location</Th>
              <Th>Mfg Date</Th>
              <Th>Expiry</Th>
              {showCost && <Th right>Cost</Th>}
              <Th right>MRP</Th>
              <Th right>Received</Th>
              <Th right>Sold</Th>
              <Th right>In Stock</Th>
              {showCost && <Th right>Value</Th>}
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={cols} />
            ) : !rows.length ? (
              <EmptyRow colSpan={cols}>{all ? "No batches yet" : `No stock on hand${branchName ? ` in ${branchName}` : ""}`}</EmptyRow>
            ) : (
              rows.map((b) => {
                const isOpen = open === b.id;
                const empty = n(b.quantity) <= 0;
                return (
                  <Fragment key={b.id}>
                    <tr className={cx("cursor-pointer hover:bg-slate-50", isOpen && "bg-slate-50", empty && "text-slate-400")} onClick={() => setOpen(isOpen ? null : b.id)}>
                      <Td>
                        <button type="button" aria-label={isOpen ? `Hide batch ${b.batchNo}` : `Show batch ${b.batchNo}`} aria-expanded={isOpen} className="text-slate-400">
                          {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      </Td>
                      <Td>
                        <span className={cx("font-medium", empty ? "text-slate-500" : "text-slate-900")}>{b.batchNo}</span>
                        {empty && (
                          <span className="ml-1.5">
                            <Badge tone="slate">Finished</Badge>
                          </span>
                        )}
                        <p className="text-xs text-slate-500">In {date(b.source.date)}</p>
                      </Td>
                      {allBranches && (
                        <Td>
                          <BranchCode code={b.branch?.code} title={b.branch?.name} />
                        </Td>
                      )}
                      <Td className="min-w-40">
                        {/* Its links open the GRN / PO, not the batch */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <SourceCell s={b.source} />
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-sm">
                        {b.location || (productLocation ? <span className="text-slate-500">{productLocation}</span> : <span className="text-slate-300">—</span>)}
                      </Td>
                      <Td className="whitespace-nowrap">{date(b.mfgDate)}</Td>
                      <Td className="whitespace-nowrap">
                        <span className="mr-2">{date(b.expiryDate)}</span>
                        {!empty && <ExpiryBadge expiry={b.expiryDate} />}
                      </Td>
                      {showCost && (
                        <Td right className="num whitespace-nowrap">
                          {inr(b.costPrice)}
                        </Td>
                      )}
                      <Td right className="num whitespace-nowrap text-slate-500">
                        {n(b.mrp) ? inr(b.mrp) : "—"}
                      </Td>
                      <Td right className="num whitespace-nowrap">
                        {qty(b.received + b.transferredIn)}
                      </Td>
                      <Td right className="num whitespace-nowrap">
                        {b.sold ? qty(b.sold) : "—"}
                      </Td>
                      <Td right className="num whitespace-nowrap font-medium">
                        {qty(b.quantity)} <span className="text-xs font-normal text-slate-500">{unit}</span>
                      </Td>
                      {showCost && (
                        <Td right className="num whitespace-nowrap">
                          {inr(n(b.quantity) * n(b.costPrice))}
                        </Td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={cols} className="px-4 pb-4 pt-1">
                          <BatchPanel b={b} unit={unit} canMoves={canMoves} allBranches={allBranches} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={cols - (showCost ? 2 : 1)}>Total</Td>
                <Td right className="num whitespace-nowrap">
                  {qty(inStock)} <span className="text-xs font-normal text-slate-500">{unit}</span>
                </Td>
                {showCost && (
                  <Td right className="num whitespace-nowrap">
                    {inr(value)}
                  </Td>
                )}
              </tr>
            </tfoot>
          )}
        </Table>
      )}
    </Card>
  );
}

/** Where the batch came from: the GRN (with its PO) or purchase bill and the vendor, or how else it was added */
function SourceCell({ s }: { s: BatchDetail["source"] }) {
  if (s.type === "GRN" && s.id)
    return (
      <>
        <ReportLink href={`/goods-inward/${s.id}`} perms={["grn.view", "purchases.receive", "purchases.view"]} className="whitespace-nowrap font-medium text-brand-700 hover:underline">
          {s.no}
        </ReportLink>
        <p className="text-xs text-slate-500">
          {s.vendor?.name}
          {s.po && (
            <>
              {" · "}
              <ReportLink href={`/purchase-orders/${s.po.id}`} perms={["purchases.view", "po.create", "purchases.approve"]} className="hover:text-brand-700 hover:underline">
                {s.po.poNo}
              </ReportLink>
            </>
          )}
        </p>
      </>
    );
  if (s.type === "PURCHASE" && s.id)
    return (
      <>
        <ReportLink href={`/purchases/${s.id}`} perms={["purchases.view"]} className="whitespace-nowrap font-medium text-brand-700 hover:underline">
          {s.no}
        </ReportLink>
        <p className="text-xs text-slate-500">{s.vendor?.name}</p>
      </>
    );
  return <span className="text-sm text-slate-600">{SOURCE_LABEL[s.type]}</span>;
}

/** The opened batch: every count and reference, then its own stock movements */
function BatchPanel({ b, unit, canMoves, allBranches }: { b: BatchDetail; unit: string; canMoves: boolean; allBranches: boolean }) {
  const moves = useApi<Paged<StockMovement>>(canMoves ? "/inventory/movements" : null, { productId: b.productId, batchId: b.id, pageSize: 50 });
  const facts: [string, React.ReactNode][] = [
    ["Source", SOURCE_LABEL[b.source.type]],
    ...(b.source.vendor ? ([["Vendor", b.source.vendor.name]] as [string, React.ReactNode][]) : []),
    ...(b.source.invoiceNo ? ([["Supplier Invoice", b.source.invoiceNo]] as [string, React.ReactNode][]) : []),
    ["Received On", date(b.source.date)],
    ["Received", `${qty(b.received)} ${unit}`],
    ["Transferred In", b.transferredIn ? `${qty(b.transferredIn)} ${unit}` : "—"],
    ["Sold (Net of Returns)", b.sold ? `${qty(b.sold)} ${unit}` : "—"],
    ["Returned to Vendor", b.returnedToVendor ? `${qty(b.returnedToVendor)} ${unit}` : "—"],
    ["Transferred Out", b.transferredOut ? `${qty(b.transferredOut)} ${unit}` : "—"],
    ["Adjusted", b.adjusted ? `${b.adjusted > 0 ? "+" : ""}${qty(b.adjusted)} ${unit}` : "—"],
    ["Expired / Damaged", b.writtenOff ? `${qty(b.writtenOff)} ${unit}` : "—"],
    ["In Stock", `${qty(b.quantity)} ${unit}`],
    ...(b.serials ? ([["Serials", `${b.serials.inStock} in stock of ${b.serials.total}`]] as [string, React.ReactNode][]) : []),
    ["Last Movement", b.lastMovementAt ? dateTime(b.lastMovementAt) : "—"],
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-surface p-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="truncate font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>

      {canMoves && (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-100">
          {moves.error ? (
            <div className="p-3">
              <ErrorBox message={moves.error} onRetry={moves.reload} />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  {allBranches && <Th>Branch</Th>}
                  <Th>Type</Th>
                  <Th>Reference</Th>
                  <Th right>Qty</Th>
                  <Th right>Balance</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {moves.loading && !moves.data ? (
                  <LoadingRow colSpan={allBranches ? 7 : 6} />
                ) : !moves.data?.items.length ? (
                  <EmptyRow colSpan={allBranches ? 7 : 6}>No movements for this batch</EmptyRow>
                ) : (
                  moves.data.items.map((m) => (
                    <tr key={m.id}>
                      <Td className="whitespace-nowrap text-xs">{dateTime(m.createdAt)}</Td>
                      {allBranches && (
                        <Td>
                          <BranchCode code={m.branch?.code} title={m.branch?.name} />
                        </Td>
                      )}
                      <Td>
                        <MovementBadge type={m.type} />
                      </Td>
                      <Td>
                        <MovementRef m={m} />
                      </Td>
                      <Td right>
                        <SignedQty value={m.quantity} />
                      </Td>
                      <Td right>{qty(m.balanceAfter)}</Td>
                      <Td className="max-w-64 truncate text-xs text-slate-500">{m.note || "—"}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Popup for one batch (dashboard batch table): product, rack, dates, prices, source, every count and its movements.
 * Closed while batchId is null.
 */
export function BatchDetailModal({
  batchId,
  onClose,
  showCost,
  canMoves,
  allBranches,
  productHref,
}: {
  batchId: string | null;
  onClose: () => void;
  showCost: boolean;
  canMoves: boolean;
  allBranches: boolean;
  /** Link to the product page when the user may open it */
  productHref?: (productId: string) => string | undefined;
}) {
  const { data, error, loading, reload } = useApi<BatchWithProduct>(batchId ? `/products/batches/${batchId}` : null);
  const b = data && data.id === batchId ? data : null;
  const unit = b?.product.unit ?? "";
  const href = b && productHref?.(b.product.id);

  return (
    <Modal open={!!batchId} onClose={onClose} size="xl" title={b ? `Batch ${b.batchNo}` : "Batch"}>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading || !b ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {href ? (
                <Link href={href} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                  {b.product.name}
                </Link>
              ) : (
                <p className="font-semibold text-slate-900">{b.product.name}</p>
              )}
              <p className="text-xs text-slate-500">
                {b.product.sku}
                {b.product.packSize ? ` · ${b.product.packSize}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {allBranches && <BranchCode code={b.branch?.code} title={b.branch?.name} />}
              {n(b.quantity) <= 0 ? <Badge tone="slate">Finished</Badge> : <ExpiryBadge expiry={b.expiryDate} />}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-slate-200 p-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ["Batch No.", b.batchNo],
                ["Location", b.location || b.product.location || "—"],
                ["Mfg Date", date(b.mfgDate)],
                ["Expiry Date", date(b.expiryDate)],
                ...(showCost ? ([["Cost Price", inr(b.costPrice)]] as [string, React.ReactNode][]) : []),
                ["MRP", n(b.mrp) ? inr(b.mrp) : "—"],
                ["Sale Price", n(b.product.salePrice) ? inr(b.product.salePrice) : "—"],
                ...(showCost ? ([["Stock Value", inr(n(b.quantity) * n(b.costPrice))]] as [string, React.ReactNode][]) : []),
                ["Created", dateTime(b.createdAt)],
                ["Reference", <SourceCell key="s" s={b.source} />],
              ] as [string, React.ReactNode][]
            ).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>

          <BatchPanel b={b} unit={unit} canMoves={canMoves} allBranches={allBranches} />
        </div>
      )}
    </Modal>
  );
}
