"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, DateInput, EmptyRow, ErrorBox, LoadingRow, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { date, downloadCsv, inr, monthStart, n, qty, today } from "@/lib/format";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import type { Paged, SaleReturn } from "@/lib/types";

const itemsSummary = (r: SaleReturn) =>
  r.items.map((i) => `${i.product?.name ?? "Item"} × ${qty(i.quantity)}${i.product?.unit ? ` ${i.product.unit}` : ""}`).join(", ");

export default function SaleReturnsPage() {
  const { can } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const { data: res, error, loading, reload } = useApi<Paged<SaleReturn>>("/sales/returns", { from, to, page, pageSize: 25 });
  const data = res?.items;

  // Total over the whole date range, not just this page
  const total = n(res?.totalAmount);

  async function exportCsv() {
    const all = (await api.get<Paged<SaleReturn>>("/sales/returns", { from, to, pageSize: 500 })).items;
    downloadCsv(
      `sales_returns_${from || "all"}_${to || "all"}.csv`,
      ["Return No", "Date", "Invoice", "Customer", "Items", "Refund Mode", "Reason", "Amount"],
      all.map((r) => [
        r.returnNo,
        date(r.returnDate),
        r.sale?.invoiceNo,
        r.customer?.name ?? r.sale?.customerName ?? "Cash customer",
        itemsSummary(r),
        r.refundMode,
        r.reason,
        n(r.totalAmount),
      ]),
    );
  }

  return (
    <>
      <PageHeader
        title="Sales Returns"
        subtitle="Goods taken back from customers"
        actions={
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!data?.length}>
            Export
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <DateInput value={from} max={to || undefined} onChange={(e) => (setFrom(e.target.value), setPage(1))} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="From date" />
          <span className="text-xs text-slate-400">to</span>
          <DateInput value={to} min={from || undefined} onChange={(e) => (setTo(e.target.value), setPage(1))} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="To date" />
          {can("sales.returns") && (
            <p className="ml-auto text-xs text-slate-500">
              Returns are created from an invoice&apos;s <span className="font-medium">Return items</span> button.
            </p>
          )}
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Return</Th>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th>Refund</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={6} />
              ) : !data?.length ? (
                <EmptyRow colSpan={6}>No returns in this period</EmptyRow>
              ) : (
                data.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <p className="font-medium text-slate-900">{r.returnNo}</p>
                      <p className="text-xs text-slate-500">{date(r.returnDate)}</p>
                    </Td>
                    <Td>
                      {can("sales.view") ? (
                        <Link href={`/sales/${r.saleId}`} className="font-medium text-brand-700 hover:underline">
                          {r.sale?.invoiceNo ?? "View Invoice"}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-700">{r.sale?.invoiceNo ?? "—"}</span>
                      )}
                    </Td>
                    <Td>{r.customer?.name ?? r.sale?.customerName ?? <span className="text-slate-400">Cash customer</span>}</Td>
                    <Td className="max-w-80 text-xs text-slate-600">
                      {itemsSummary(r)}
                      {r.reason && <p className="mt-0.5 italic text-slate-400">{r.reason}</p>}
                    </Td>
                    <Td>
                      <Badge tone={r.refundMode === "CREDIT" ? "violet" : "slate"}>{r.refundMode === "CREDIT" ? "Credit Note" : r.refundMode}</Badge>
                    </Td>
                    <Td right className="font-medium">
                      {inr(r.totalAmount)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            {data && data.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <Td colSpan={5} className="text-xs uppercase tracking-wide text-slate-500">
                    Total ({res?.total} return{res?.total === 1 ? "" : "s"})
                  </Td>
                  <Td right>{inr(total)}</Td>
                </tr>
              </tfoot>
            )}
          </Table>
        )}
        {res && <Pagination page={res.page} totalPages={res.totalPages} total={res.total} onPage={setPage} />}
      </Card>
    </>
  );
}
