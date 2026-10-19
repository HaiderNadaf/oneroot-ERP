"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { date, inr, n, qty } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Dec, PoStatus } from "@/lib/types";
import { Badge, Button, Card, EmptyRow, ErrorBox, LoadingRow, StatusBadge, Table, Td, Th, cx } from "./ui";

/** One earlier PO line for a product (from /purchase-orders/price-history) */
interface PriceRow {
  productId: string;
  poId: string;
  poNo: string;
  orderDate: string;
  status: PoStatus;
  vendorId: string;
  vendorName: string;
  quantity: Dec;
  rate: Dec;
  discountPct: Dec;
  gstRate: Dec;
  /** Rate after the line discount, excl. GST */
  netRate: Dec;
  receivedQty: Dec;
}

interface LineRef {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  rate: string;
}

/**
 * Earlier purchase prices for the products on the PO being raised, one tab per product:
 * supplier, PO date, rate, discount and net rate, newest first. "Use" copies a rate into the line.
 */
export function PoPriceHistory({
  lines,
  vendorId,
  excludePoId,
  onUseRate,
}: {
  lines: LineRef[];
  vendorId?: string | null;
  excludePoId?: string;
  onUseRate: (productId: string, rate: number) => void;
}) {
  // One entry per product, in the order they were added
  const products = useMemo(() => {
    const seen = new Set<string>();
    return lines.filter((l) => (seen.has(l.productId) ? false : (seen.add(l.productId), true)));
  }, [lines]);
  const ids = products.map((p) => p.productId).sort().join(",");
  const { data, error, loading, reload } = useApi<PriceRow[]>(ids ? "/purchase-orders/price-history" : null, { productIds: ids, excludePoId });
  const [picked, setPicked] = useState<string | null>(null);

  if (!products.length) return null;

  const rowsOf = (productId: string) => (data ?? []).filter((r) => r.productId === productId);
  // Default tab: the newest line that has history, else the first product
  const active =
    (picked && products.some((p) => p.productId === picked) ? picked : null) ??
    [...products].reverse().find((p) => rowsOf(p.productId).length)?.productId ??
    products[0].productId;
  const line = products.find((p) => p.productId === active)!;
  const rows = rowsOf(active);
  const last = rows[0];
  const lowest = rows.length ? rows.reduce((m, r) => (n(r.netRate) < n(m.netRate) ? r : m), rows[0]) : null;
  const current = Number(line.rate) || 0;
  const diff = last && current > 0 ? current - n(last.rate) : null;

  return (
    <Card
      className="mb-4"
      bodyClassName="p-0"
      title={
        <span className="inline-flex items-center gap-1.5">
          <History className="size-4 text-slate-400" /> Previous Purchase Prices
        </span>
      }
    >
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2">
        {products.map((p) => {
          const count = rowsOf(p.productId).length;
          return (
            <button
              key={p.productId}
              type="button"
              onClick={() => setPicked(p.productId)}
              className={cx(
                "rounded-md border px-2.5 py-1 text-left text-xs transition-colors",
                p.productId === active ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              <span className="font-medium">{p.name}</span>
              <span className="ml-1.5 font-mono text-[10.5px] text-slate-500">{p.sku}</span>
              <span className="ml-1.5 text-slate-400">{loading && !data ? "…" : count ? `${count} earlier` : "none"}</span>
            </button>
          );
        })}
      </div>

      {last && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-2.5 text-sm text-slate-600">
          <span>
            Last price: <b className="num font-semibold text-slate-900">{inr(last.rate)}</b> from {last.vendorName} on {date(last.orderDate)}
          </span>
          {lowest && (
            <span>
              Lowest net: <b className="num font-semibold text-slate-900">{inr(lowest.netRate)}</b> ({lowest.vendorName})
            </span>
          )}
          {diff !== null && Math.abs(diff) >= 0.005 && (
            <span className={diff > 0 ? "text-red-700" : "text-emerald-700"}>
              This PO: {inr(current)} · {diff > 0 ? "▲" : "▼"} {inr(Math.abs(diff))} vs last
            </span>
          )}
        </div>
      )}

      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>PO No.</Th>
              <Th>PO Date</Th>
              <Th>Supplier</Th>
              <Th right>Qty</Th>
              <Th right>Rate (Excl. GST)</Th>
              <Th right>Disc. %</Th>
              <Th right>Net Rate</Th>
              <Th right>GST</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={10} />
            ) : !rows.length ? (
              <EmptyRow colSpan={10}>No earlier purchase orders for {line.name}</EmptyRow>
            ) : (
              rows.map((r) => (
                <tr key={r.poId + r.rate} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap">
                    <Link href={`/purchase-orders/${r.poId}`} target="_blank" className="font-medium text-brand-700 hover:underline">
                      {r.poNo}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{date(r.orderDate)}</Td>
                  <Td>
                    {r.vendorName}
                    {vendorId && r.vendorId === vendorId && (
                      <span className="ml-1.5">
                        <Badge tone="blue">This supplier</Badge>
                      </span>
                    )}
                  </Td>
                  <Td right className="whitespace-nowrap">
                    {qty(r.quantity)} {line.unit}
                  </Td>
                  <Td right className="num">{inr(r.rate)}</Td>
                  <Td right className="num text-slate-500">{n(r.discountPct) ? `${n(r.discountPct)}%` : "—"}</Td>
                  <Td right className="num font-medium text-slate-900">{inr(r.netRate)}</Td>
                  <Td right className="text-slate-500">{n(r.gstRate)}%</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td right>
                    <Button variant="ghost" size="sm" onClick={() => onUseRate(r.productId, n(r.rate))} title="Copy this rate into the PO line">
                      Use rate
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
